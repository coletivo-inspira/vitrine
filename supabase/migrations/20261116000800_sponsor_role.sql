-- Issue #127: papel de plataforma `sponsor` com leitura só de métricas agregadas.
-- O patrocinador não ganha nenhuma política de leitura: sites, drafts, publications
-- e site_metrics_daily continuam fechados para ele pelas políticas existentes. A única
-- leitura é public.read_sponsor_impact(), security definer, que devolve somas por mês
-- e por cidade das vitrines sociais (plano free em private.site_entitlements) não
-- arquivadas, sem nome, endereço, slug ou itens.
-- Supressão: cidade com menos de 5 vitrines (ou sem cidade) entra em "Outras cidades";
-- se "Outras cidades" ficaria com 1 a 4 vitrines, as menores cidades visíveis entram
-- nela até chegar a 5, para que o total menos as cidades visíveis não revele um grupo
-- pequeno. Com menos de 5 vitrines no total, nada sai.
-- Só platform_admin atribui ou retira o papel, com registro em audit_logs.
-- Append-only: migrações anteriores não são alteradas.
begin;

alter table public.platform_operators
  drop constraint if exists platform_operators_role_check;
alter table public.platform_operators
  add constraint platform_operators_role_check
  check (role in ('platform_admin', 'support_operator', 'sponsor'));

create or replace function private.is_sponsor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_operators po
    where po.user_id = (select auth.uid())
      and po.role = 'sponsor'
  );
$$;

revoke all on function private.is_sponsor() from public, anon, authenticated;

create or replace function private.sponsor_impact_min_group()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 5;
$$;

revoke all on function private.sponsor_impact_min_group() from public, anon, authenticated;

create or replace function public.read_sponsor_impact(month_count integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_min integer := private.sponsor_impact_min_group();
  v_months integer := least(greatest(coalesce(month_count, 12), 1), 13);
  v_last date := date_trunc('month', current_date)::date;
  v_first date := (date_trunc('month', current_date) - make_interval(months => v_months - 1))::date;
  v_result jsonb;
begin
  if not (private.is_sponsor() or private.is_platform_admin()) then
    raise exception using errcode = '42501', message = 'FORBIDDEN_SPONSOR';
  end if;

  with raw as (
    select
      s.id as site_id,
      case
        when length(btrim(coalesce(p.menu->'publicAddress'->>'city', ''))) >= 2
          then p.menu->'publicAddress'
        when length(btrim(coalesce(p.menu->'locality'->>'city', ''))) >= 2
          then p.menu->'locality'
      end as place,
      btrim(coalesce(pr.city, '')) as profile_city
    from public.sites s
    left join public.publications p on p.site_id = s.id
    left join public.profiles pr on pr.user_id = s.owner_user_id
    cross join lateral private.site_entitlements(s.id) e
    where s.archived_at is null
      and e.plan_code = 'free'
  ),
  social as (
    select
      site_id,
      left(regexp_replace(coalesce(btrim(place->>'city'), profile_city), '\s+', ' ', 'g'), 60) as city,
      case when place is null then '' else upper(left(btrim(coalesce(place->>'uf', '')), 2)) end as uf
    from raw
  ),
  keyed as (
    select
      site_id,
      case when length(city) < 2 then '' else lower(city) || '|' || uf end as city_key,
      case when length(city) < 2 then ''
        when uf = '' then city
        else city || ' (' || uf || ')' end as city_label
    from social
  ),
  sizes as (
    select city_key, count(*)::integer as n
    from keyed
    where city_key <> ''
    group by city_key
  ),
  pool as (
    select
      (select count(*) from keyed where city_key = '')::integer
        + coalesce((select sum(n) from sizes where n < v_min), 0)::integer as small
  ),
  ranked as (
    select city_key,
      (sum(n) over (order by n, city_key rows between unbounded preceding and current row) - n)::integer as before
    from sizes
    where n >= v_min
  ),
  visible as (
    select r.city_key
    from ranked r cross join pool
    where not (pool.small > 0 and pool.small + r.before < v_min)
  ),
  assigned as (
    select k.site_id, k.city_label,
      case when k.city_key in (select city_key from visible) then k.city_key else '' end as group_key
    from keyed k
  ),
  groups as (
    select
      group_key,
      count(*)::integer as sites,
      case when group_key = '' then 'Outras cidades' else min(city_label) end as label
    from assigned
    group by group_key
  ),
  series as (
    select generate_series(v_first, v_last, interval '1 month')::date as month
  ),
  sums as (
    select
      a.group_key,
      date_trunc('month', m.metric_date)::date as month,
      coalesce(sum(m.count_value) filter (where m.metric_name = 'visit'), 0)::bigint as visits,
      coalesce(sum(m.count_value) filter (where m.metric_name = 'whatsapp_order'), 0)::bigint as clicks
    from public.site_metrics_daily m
    join assigned a on a.site_id = m.site_id
    where m.metric_date >= v_first
      and m.metric_date < (v_last + interval '1 month')::date
      and m.metric_name in ('visit', 'whatsapp_order')
    group by a.group_key, date_trunc('month', m.metric_date)
  ),
  grid as (
    select g.group_key, g.label, g.sites, s.month,
      coalesce(x.visits, 0)::bigint as visits, coalesce(x.clicks, 0)::bigint as clicks
    from groups g
    cross join series s
    left join sums x on x.group_key = g.group_key and x.month = s.month
  ),
  per_group as (
    select
      group_key, label, sites,
      sum(visits)::bigint as visits,
      sum(clicks)::bigint as clicks,
      jsonb_agg(jsonb_build_object(
        'month', to_char(month, 'YYYY-MM'), 'visits', visits, 'whatsappClicks', clicks
      ) order by month) as months
    from grid
    group by group_key, label, sites
  ),
  per_month as (
    select month, sum(visits)::bigint as visits, sum(clicks)::bigint as clicks
    from grid
    group by month
  ),
  total as (
    select count(*)::integer as n from keyed
  )
  select case when total.n < v_min then
    jsonb_build_object(
      'minGroupSize', v_min,
      'firstMonth', to_char(v_first, 'YYYY-MM'),
      'lastMonth', to_char(v_last, 'YYYY-MM'),
      'suppressed', true,
      'activeSites', null,
      'months', '[]'::jsonb,
      'cities', '[]'::jsonb
    )
  else
    jsonb_build_object(
      'minGroupSize', v_min,
      'firstMonth', to_char(v_first, 'YYYY-MM'),
      'lastMonth', to_char(v_last, 'YYYY-MM'),
      'suppressed', false,
      'activeSites', total.n,
      'months', coalesce((
        select jsonb_agg(jsonb_build_object(
          'month', to_char(month, 'YYYY-MM'), 'visits', visits, 'whatsappClicks', clicks
        ) order by month)
        from per_month
      ), '[]'::jsonb),
      'cities', coalesce((
        select jsonb_agg(jsonb_build_object(
          'city', label,
          'others', group_key = '',
          'sites', sites,
          'visits', visits,
          'whatsappClicks', clicks,
          'months', months
        ) order by (group_key = ''), sites desc, label)
        from per_group
      ), '[]'::jsonb)
    )
  end
  into v_result
  from total;

  return v_result;
end;
$$;

revoke all on function public.read_sponsor_impact(integer) from public, anon;
grant execute on function public.read_sponsor_impact(integer) to authenticated;

create or replace function public.list_sponsors()
returns table (user_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ADMIN';
  end if;
  return query
    select po.user_id, po.created_at
    from public.platform_operators po
    where po.role = 'sponsor'
    order by po.created_at desc, po.user_id;
end;
$$;

revoke all on function public.list_sponsors() from public, anon;
grant execute on function public.list_sponsors() to authenticated;

create or replace function public.grant_sponsor_role(target_user uuid)
returns table (user_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ADMIN';
  end if;
  if target_user is null or not exists (select 1 from auth.users u where u.id = target_user) then
    raise exception using errcode = 'P0002', message = 'SPONSOR_USER_NOT_FOUND';
  end if;
  select po.role into v_role from public.platform_operators po where po.user_id = target_user for update;
  if v_role is not null and v_role <> 'sponsor' then
    raise exception using errcode = '23505', message = 'OPERATOR_ROLE_CONFLICT';
  end if;
  if v_role is null then
    insert into public.platform_operators (user_id, role) values (target_user, 'sponsor');
    perform private.record_audit_log(null, 'sponsor_granted', 'platform_operator', target_user::text, '{}'::jsonb);
  end if;
  return query
    select po.user_id, po.created_at from public.platform_operators po where po.user_id = target_user;
end;
$$;

revoke all on function public.grant_sponsor_role(uuid) from public, anon;
grant execute on function public.grant_sponsor_role(uuid) to authenticated;

create or replace function public.revoke_sponsor_role(target_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed integer;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ADMIN';
  end if;
  delete from public.platform_operators po
  where po.user_id = target_user and po.role = 'sponsor';
  get diagnostics v_removed = row_count;
  if v_removed > 0 then
    perform private.record_audit_log(null, 'sponsor_revoked', 'platform_operator', target_user::text, '{}'::jsonb);
  end if;
  return v_removed > 0;
end;
$$;

revoke all on function public.revoke_sponsor_role(uuid) from public, anon;
grant execute on function public.revoke_sponsor_role(uuid) to authenticated;

commit;
