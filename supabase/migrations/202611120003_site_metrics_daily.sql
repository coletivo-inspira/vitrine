-- Aggregated storefront metrics without personal data (Phase 5 / PR e):
-- public.site_metrics_daily with 13-month retention, member-only SELECT RLS,
-- and private.record_site_metric_batch(text, jsonb) SECURITY DEFINER upsert.
-- Append-only migration: never modify previous migrations.
begin;

alter table public.publications
  drop constraint if exists publications_check;

alter table public.publication_releases
  drop constraint if exists publication_releases_check;

create table if not exists public.site_metrics_daily (
  site_id uuid not null references public.sites(id) on delete cascade,
  metric_date date not null,
  metric_hour smallint not null check (metric_hour between 0 and 23),
  item_key text not null default '' check (length(item_key) <= 64),
  metric_name text not null check (
    metric_name in ('visit', 'item_view', 'item_select', 'whatsapp_order')
  ),
  count_value bigint not null default 0 check (count_value >= 0),
  estimated_cents bigint not null default 0 check (estimated_cents >= 0),
  updated_at timestamptz not null default now(),
  primary key (site_id, metric_date, metric_hour, item_key, metric_name),
  constraint site_metrics_daily_item_key_valid_check check (
    (metric_name in ('visit', 'whatsapp_order') and item_key = '')
    or (metric_name in ('item_view', 'item_select') and length(trim(item_key)) between 1 and 64)
  ),
  constraint site_metrics_daily_estimated_cents_valid_check check (
    metric_name = 'whatsapp_order' or estimated_cents = 0
  )
);

create index if not exists site_metrics_daily_site_date_idx
  on public.site_metrics_daily(site_id, metric_date desc);

alter table public.site_metrics_daily enable row level security;

revoke all on public.site_metrics_daily from public, anon, authenticated;
grant select (site_id, metric_date, metric_hour, item_key, metric_name, count_value, estimated_cents, updated_at)
  on public.site_metrics_daily to authenticated;

drop policy if exists site_metrics_daily_member_select on public.site_metrics_daily;
create policy site_metrics_daily_member_select
  on public.site_metrics_daily
  for select
  to authenticated
  using (site_id in (select private.accessible_site_ids()));

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

  -- 13-month retention purge for this storefront
  delete from public.site_metrics_daily
   where site_id = v_site_id
     and metric_date < (current_date - interval '13 months')::date;

  for v_event in select value from jsonb_array_elements(events)
  loop
    if jsonb_typeof(v_event) <> 'object' then
      raise exception 'INVALID_EVENTS_BATCH' using errcode = '22023';
    end if;

    v_type := coalesce(trim(v_event->>'type'), '');
    if v_type not in ('visit', 'item_view', 'item_select', 'whatsapp_order') then
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

    if v_type in ('item_view', 'item_select') then
      v_item_key := coalesce(trim(v_event->>'itemId'), '');
      if v_item_key = '' or not (v_item_key = any(v_valid_items)) then
        raise exception 'INVALID_EVENT_ITEM' using errcode = '23514';
      end if;
    elsif v_type = 'whatsapp_order' then
      if v_event ? 'estimatedCents' and jsonb_typeof(v_event->'estimatedCents') = 'number'
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
      v_count,
      v_cents,
      now()
    )
    on conflict (site_id, metric_date, metric_hour, item_key, metric_name)
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

create or replace function public.record_site_metric_batch(
  target_slug text,
  events jsonb
)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.record_site_metric_batch(target_slug, events);
$$;

revoke all on function public.record_site_metric_batch(text, jsonb) from public;
grant execute on function public.record_site_metric_batch(text, jsonb) to anon, authenticated;

commit;
