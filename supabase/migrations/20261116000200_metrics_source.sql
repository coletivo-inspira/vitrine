-- Insights por origem (issue #119): métricas route_click e qr_visit e as dimensões
-- source e campaign em public.site_metrics_daily, derivadas só de utm_source e
-- utm_campaign. Nada de IP, user-agent, cookie ou texto livre do visitante.
-- A lista de métricas fica em private.site_metric_names() e
-- private.site_item_metric_names(), espelho de ALLOWED_METRIC_EVENT_TYPES e
-- ITEM_METRIC_EVENT_TYPES em src/portal-validation.mjs: um nome novo (por exemplo
-- notify_click ou payment_link_click) entra recriando essas funções numa migração
-- nova. A lista de origens espelha METRIC_SOURCES em web/assets/metrics-source.mjs.
-- Append-only: migrações anteriores não são alteradas.
begin;

create or replace function private.site_metric_names()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array['visit', 'item_view', 'item_select', 'whatsapp_order', 'route_click', 'qr_visit']::text[];
$$;

create or replace function private.site_item_metric_names()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array['item_view', 'item_select']::text[];
$$;

create or replace function private.site_metric_sources()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array[
    'direto', 'qr', 'ig_comment', 'ig_bio', 'ig_story', 'instagram',
    'whatsapp', 'facebook', 'google', 'tiktok', 'outro'
  ]::text[];
$$;

-- Sem valor: 'direto'. Fora da lista, acima de 32 caracteres ou com outros
-- caracteres (e-mail, espaço, acento): 'outro'.
create or replace function private.normalize_metric_source(raw text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when raw is null or btrim(raw) = '' then 'direto'
    when lower(btrim(raw)) ~ '^[a-z0-9][a-z0-9_-]{0,31}$'
      and lower(btrim(raw)) = any(private.site_metric_sources()) then lower(btrim(raw))
    else 'outro'
  end;
$$;

-- Campanha só acompanha origem conhecida; seis dígitos seguidos (telefone, CPF,
-- CEP) ou formato fora do padrão descartam a campanha.
create or replace function private.normalize_metric_campaign(raw text, normalized_source text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when raw is null or normalized_source is null
      or normalized_source in ('', 'direto', 'outro') then ''
    when lower(btrim(raw)) ~ '^[a-z0-9][a-z0-9_-]{0,31}$'
      and lower(btrim(raw)) !~ '[0-9]{6}' then lower(btrim(raw))
    else ''
  end;
$$;

revoke all on function private.site_metric_names() from public;
revoke all on function private.site_item_metric_names() from public;
revoke all on function private.site_metric_sources() from public;
revoke all on function private.normalize_metric_source(text) from public;
revoke all on function private.normalize_metric_campaign(text, text) from public;

alter table public.site_metrics_daily
  add column if not exists source text not null default '',
  add column if not exists campaign text not null default '';

alter table public.site_metrics_daily
  drop constraint if exists site_metrics_daily_metric_name_check,
  drop constraint if exists site_metrics_daily_item_key_valid_check,
  drop constraint if exists site_metrics_daily_pkey;

alter table public.site_metrics_daily
  add constraint site_metrics_daily_metric_name_check
    check (metric_name = any(private.site_metric_names())),
  add constraint site_metrics_daily_item_key_valid_check check (
    (metric_name = any(private.site_item_metric_names()) and length(trim(item_key)) between 1 and 64)
    or (not (metric_name = any(private.site_item_metric_names())) and item_key = '')
  ),
  add constraint site_metrics_daily_source_valid_check check (
    source = '' or source = any(private.site_metric_sources())
  ),
  add constraint site_metrics_daily_campaign_valid_check check (
    campaign = ''
    or (campaign ~ '^[a-z0-9][a-z0-9_-]{0,31}$' and campaign !~ '[0-9]{6}'
        and source not in ('', 'direto', 'outro'))
  ),
  add constraint site_metrics_daily_item_origin_check check (
    not (metric_name = any(private.site_item_metric_names())) or (source = '' and campaign = '')
  ),
  add constraint site_metrics_daily_pkey
    primary key (site_id, metric_date, metric_hour, item_key, metric_name, source, campaign);

grant select (source, campaign) on public.site_metrics_daily to authenticated;

create or replace function private.record_site_metric_batch(
  target_slug text,
  events jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site_id uuid;
  v_menu jsonb;
  v_event jsonb;
  v_type text;
  v_item_key text;
  v_source text;
  v_campaign text;
  v_hour smallint;
  v_date date;
  v_count bigint;
  v_cents bigint;
  v_accepted integer := 0;
  v_valid_items text[] := array[]::text[];
  v_menu_item jsonb;
begin
  if target_slug is null or length(trim(target_slug)) < 3 or length(trim(target_slug)) > 40 then
    raise exception 'PUBLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if events is null or jsonb_typeof(events) <> 'array' then
    raise exception 'INVALID_EVENTS_BATCH' using errcode = '22023';
  end if;

  if jsonb_array_length(events) < 1 or jsonb_array_length(events) > 25 then
    raise exception 'INVALID_EVENTS_BATCH' using errcode = '22023';
  end if;

  select p.site_id, p.menu
    into v_site_id, v_menu
    from public.publications p
   where p.slug = lower(trim(target_slug))
     and p.status = 'active'
   limit 1;

  if v_site_id is null or v_menu is null then
    raise exception 'PUBLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if jsonb_typeof(v_menu->'items') = 'array' then
    for v_menu_item in select value from jsonb_array_elements(v_menu->'items')
    loop
      if jsonb_typeof(v_menu_item) = 'object' and nullif(trim(v_menu_item->>'id'), '') is not null then
        v_valid_items := array_append(v_valid_items, trim(v_menu_item->>'id'));
      end if;
    end loop;
  end if;

  -- Retenção de 13 meses para esta vitrine.
  delete from public.site_metrics_daily
   where site_id = v_site_id
     and metric_date < (current_date - interval '13 months')::date;

  for v_event in select value from jsonb_array_elements(events)
  loop
    if jsonb_typeof(v_event) <> 'object' then
      raise exception 'INVALID_EVENTS_BATCH' using errcode = '22023';
    end if;

    v_type := coalesce(trim(v_event->>'type'), '');
    if not (v_type = any(private.site_metric_names())) then
      raise exception 'INVALID_EVENTS_BATCH' using errcode = '22023';
    end if;

    if v_event ? 'hour' and jsonb_typeof(v_event->'hour') = 'number'
       and (v_event->>'hour') ~ '^[0-9]{1,2}$' then
      v_hour := (v_event->>'hour')::smallint;
      if v_hour < 0 or v_hour > 23 then
        raise exception 'INVALID_EVENTS_BATCH' using errcode = '22023';
      end if;
    else
      v_hour := extract(hour from (now() at time zone 'UTC'))::smallint;
    end if;

    if v_event ? 'date' and jsonb_typeof(v_event->'date') = 'string'
       and (v_event->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      v_date := (v_event->>'date')::date;
    else
      v_date := (now() at time zone 'UTC')::date;
    end if;

    if v_date < (current_date - interval '13 months')::date
       or v_date > (current_date + interval '1 day')::date then
      continue;
    end if;

    v_count := 1;
    if v_event ? 'count' and jsonb_typeof(v_event->'count') = 'number'
       and (v_event->>'count') ~ '^[1-9][0-9]*$' then
      v_count := least((v_event->>'count')::bigint, 99);
    end if;

    v_cents := 0;
    v_item_key := '';
    v_source := '';
    v_campaign := '';

    if v_type = any(private.site_item_metric_names()) then
      v_item_key := coalesce(trim(v_event->>'itemId'), '');
      if v_item_key = '' or not (v_item_key = any(v_valid_items)) then
        raise exception 'INVALID_EVENT_ITEM' using errcode = '23514';
      end if;
    else
      if v_event ? 'source' and jsonb_typeof(v_event->'source') <> 'null' then
        v_source := private.normalize_metric_source(v_event->>'source');
        v_campaign := private.normalize_metric_campaign(v_event->>'campaign', v_source);
      end if;
      if v_type = 'whatsapp_order'
         and v_event ? 'estimatedCents' and jsonb_typeof(v_event->'estimatedCents') = 'number'
         and (v_event->>'estimatedCents') ~ '^[0-9]+$' then
        v_cents := least((v_event->>'estimatedCents')::bigint, 100000000);
      end if;
    end if;

    insert into public.site_metrics_daily (
      site_id,
      metric_date,
      metric_hour,
      item_key,
      metric_name,
      source,
      campaign,
      count_value,
      estimated_cents,
      updated_at
    )
    values (
      v_site_id,
      v_date,
      v_hour,
      v_item_key,
      v_type,
      v_source,
      v_campaign,
      v_count,
      v_cents,
      now()
    )
    on conflict (site_id, metric_date, metric_hour, item_key, metric_name, source, campaign)
    do update set
      count_value = public.site_metrics_daily.count_value + excluded.count_value,
      estimated_cents = public.site_metrics_daily.estimated_cents + excluded.estimated_cents,
      updated_at = now();

    v_accepted := v_accepted + 1;
  end loop;

  return v_accepted;
end;
$$;

revoke all on function private.record_site_metric_batch(text, jsonb) from public;
grant execute on function private.record_site_metric_batch(text, jsonb) to anon, authenticated;

commit;
