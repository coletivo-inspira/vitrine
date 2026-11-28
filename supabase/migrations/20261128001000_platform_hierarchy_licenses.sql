-- Spec 022 (ADR 0018, proposta): hierarquia da administração, licenças, cupons e limites por vitrine.
-- Papéis: platform_owner (um só), platform_admin, license_manager, support_operator, sponsor.
-- A matriz de capacidades espelha src/admin/platform-roles.mjs; o teste de banco compara as duas.
-- Funções que leem colunas de auth.users além de id são plpgsql: as colunas são resolvidas na
-- execução, o que mantém a migração aplicável nos testes com auth.users mínimo.
-- Append-only: migrações anteriores não são alteradas.
begin;

-- 1. Papéis e capacidades
alter table public.platform_operators
  drop constraint if exists platform_operators_role_check;
alter table public.platform_operators
  add constraint platform_operators_role_check
  check (role in ('platform_owner', 'platform_admin', 'license_manager', 'support_operator', 'sponsor'));

alter table public.platform_operators
  add column if not exists granted_by uuid null references auth.users(id) on delete set null;

create unique index if not exists platform_operators_single_owner
  on public.platform_operators ((true)) where role = 'platform_owner';

create or replace function private.is_platform_admin()
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
      and po.role in ('platform_owner', 'platform_admin')
  );
$$;

revoke all on function private.is_platform_admin() from public;
grant execute on function private.is_platform_admin() to anon, authenticated;

create or replace function private.platform_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select po.role from public.platform_operators po where po.user_id = (select auth.uid());
$$;

revoke all on function private.platform_role() from public, anon;
grant execute on function private.platform_role() to authenticated;

create or replace function private.platform_capabilities(target_role text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case target_role
    when 'platform_owner' then array['platform.operate', 'users.read', 'licenses.manage', 'staff.manage', 'admins.manage']
    when 'platform_admin' then array['platform.operate', 'users.read', 'licenses.manage', 'staff.manage']
    when 'license_manager' then array['users.read', 'licenses.manage']
    else array[]::text[]
  end;
$$;

revoke all on function private.platform_capabilities(text) from public, anon;
grant execute on function private.platform_capabilities(text) to authenticated;

create or replace function private.has_platform_capability(target_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(target_capability = any(private.platform_capabilities(private.platform_role())), false);
$$;

revoke all on function private.has_platform_capability(text) from public, anon;
grant execute on function private.has_platform_capability(text) to authenticated;

create or replace function public.read_my_platform_access()
returns table (role text, capabilities text[])
language sql
stable
security definer
set search_path = ''
as $$
  select private.platform_role(), private.platform_capabilities(private.platform_role());
$$;

revoke all on function public.read_my_platform_access() from public, anon;
grant execute on function public.read_my_platform_access() to authenticated;

-- 2. Dono da plataforma: só pelo SQL Editor (sem sessão) e só quando ainda não há Dono.
create or replace function private.bootstrap_platform_owner(target_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if exists (select 1 from public.platform_operators where role = 'platform_owner') then
    raise exception using errcode = '23505', message = 'PLATFORM_OWNER_EXISTS';
  end if;
  select u.id into v_user
  from auth.users u
  where lower(u.email) = lower(btrim(coalesce(target_email, '')))
  limit 1;
  if v_user is null then
    raise exception using errcode = 'P0002', message = 'PLATFORM_USER_NOT_FOUND';
  end if;
  insert into public.platform_operators (user_id, role)
  values (v_user, 'platform_owner')
  on conflict (user_id) do update set role = 'platform_owner';
  perform private.record_audit_log(null, 'platform_owner_bootstrapped', 'platform_operator', v_user::text, '{}'::jsonb);
  return v_user;
end;
$$;

revoke all on function private.bootstrap_platform_owner(text) from public, anon, authenticated;

-- 3. Equipe da plataforma
create or replace function public.list_platform_operators()
returns table (user_id uuid, role text, email text, display_name text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_platform_capability('staff.manage') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ROLE';
  end if;
  return query
    select po.user_id, po.role, u.email::text, coalesce(pr.display_name, ''), po.created_at
    from public.platform_operators po
    join auth.users u on u.id = po.user_id
    left join public.profiles pr on pr.user_id = po.user_id
    where po.role <> 'sponsor'
    order by array_position(array['platform_owner', 'platform_admin', 'license_manager', 'support_operator'], po.role),
      po.created_at, po.user_id;
end;
$$;

revoke all on function public.list_platform_operators() from public, anon;
grant execute on function public.list_platform_operators() to authenticated;

create or replace function private.assert_can_manage_role(target_role text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_role = 'platform_admin' then
    if not private.has_platform_capability('admins.manage') then
      if private.has_platform_capability('staff.manage') then
        raise exception using errcode = '42501', message = 'ADMINS_MANAGED_BY_OWNER';
      end if;
      raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ROLE';
    end if;
  elsif target_role in ('license_manager', 'support_operator') then
    if not private.has_platform_capability('staff.manage') then
      raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ROLE';
    end if;
  else
    raise exception using errcode = '23514', message = 'INVALID_PLATFORM_ROLE';
  end if;
end;
$$;

revoke all on function private.assert_can_manage_role(text) from public, anon, authenticated;

create or replace function public.grant_platform_role(target_user uuid, target_role text)
returns table (user_id uuid, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if not private.has_platform_capability('staff.manage') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ROLE';
  end if;
  perform private.assert_can_manage_role(target_role);
  if target_user is null or not exists (select 1 from auth.users u where u.id = target_user) then
    raise exception using errcode = 'P0002', message = 'PLATFORM_USER_NOT_FOUND';
  end if;
  if target_user = (select auth.uid()) then
    raise exception using errcode = '23514', message = 'CANNOT_CHANGE_OWN_ROLE';
  end if;
  select po.role into v_current from public.platform_operators po where po.user_id = target_user for update;
  if v_current in ('platform_owner', 'sponsor') then
    raise exception using errcode = '23505', message = 'OPERATOR_ROLE_CONFLICT';
  end if;
  if v_current is not null then
    perform private.assert_can_manage_role(v_current);
  end if;
  if v_current is distinct from target_role then
    insert into public.platform_operators (user_id, role, granted_by)
    values (target_user, target_role, (select auth.uid()))
    on conflict on constraint platform_operators_pkey
    do update set role = excluded.role, granted_by = excluded.granted_by;
    perform private.record_audit_log(null, 'platform_role_granted', 'platform_operator', target_user::text,
      jsonb_build_object('role', target_role, 'previous', v_current));
  end if;
  return query
    select po.user_id, po.role, po.created_at from public.platform_operators po where po.user_id = target_user;
end;
$$;

revoke all on function public.grant_platform_role(uuid, text) from public, anon;
grant execute on function public.grant_platform_role(uuid, text) to authenticated;

create or replace function public.revoke_platform_role(target_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if not private.has_platform_capability('staff.manage') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ROLE';
  end if;
  if target_user = (select auth.uid()) then
    raise exception using errcode = '23514', message = 'CANNOT_CHANGE_OWN_ROLE';
  end if;
  select po.role into v_current from public.platform_operators po where po.user_id = target_user for update;
  if v_current is null then
    return false;
  end if;
  if v_current in ('platform_owner', 'sponsor') then
    raise exception using errcode = '23505', message = 'OPERATOR_ROLE_CONFLICT';
  end if;
  perform private.assert_can_manage_role(v_current);
  delete from public.platform_operators po where po.user_id = target_user;
  perform private.record_audit_log(null, 'platform_role_revoked', 'platform_operator', target_user::text,
    jsonb_build_object('role', v_current));
  return true;
end;
$$;

revoke all on function public.revoke_platform_role(uuid) from public, anon;
grant execute on function public.revoke_platform_role(uuid) to authenticated;

-- 4. Licenças: concessão de plano pago por período, separada da assinatura.
create table if not exists public.license_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_code text not null references public.plans(code) check (plan_code <> 'free'),
  source text not null check (source in ('manual', 'coupon', 'courtesy')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  note text not null default '' check (length(note) <= 280),
  granted_by uuid null references auth.users(id) on delete set null,
  revoked_at timestamptz null,
  revoked_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists license_grants_tenant_idx on public.license_grants(tenant_id, ends_at desc);

alter table public.license_grants enable row level security;
revoke all on public.license_grants from public, anon, authenticated;
grant select on public.license_grants to authenticated;

drop policy if exists license_grants_read on public.license_grants;
create policy license_grants_read
  on public.license_grants
  for select
  to authenticated
  using (
    exists (select 1 from public.tenants t where t.id = license_grants.tenant_id and t.owner_user_id = (select auth.uid()))
    or private.has_platform_capability('licenses.manage')
  );

-- Organização cliente da vitrine; criada para a proprietária quando falta.
create or replace function private.ensure_site_tenant(target_site uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site record;
  v_tenant uuid;
  v_slug text;
begin
  select s.id, s.owner_user_id, s.slug, s.name, s.tenant_id into v_site
  from public.sites s where s.id = target_site for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SITE_NOT_FOUND';
  end if;
  if v_site.tenant_id is not null then
    return v_site.tenant_id;
  end if;
  if v_site.owner_user_id is null then
    raise exception using errcode = '23514', message = 'SITE_WITHOUT_OWNER';
  end if;
  v_slug := v_site.slug;
  if exists (select 1 from public.tenants t where t.slug = v_slug) then
    v_slug := left(v_site.slug, 50) || '-' || left(replace(v_site.id::text, '-', ''), 8);
  end if;
  insert into public.tenants (owner_user_id, slug, name)
  values (v_site.owner_user_id, v_slug, left(v_site.name, 160))
  returning id into v_tenant;
  update public.sites set tenant_id = v_tenant where id = target_site;
  return v_tenant;
end;
$$;

revoke all on function private.ensure_site_tenant(uuid) from public, anon, authenticated;

-- Licença nova do mesmo plano começa quando a vigente termina: os meses somam.
create or replace function private.insert_license(
  target_tenant uuid,
  target_plan text,
  target_months integer,
  target_source text,
  target_note text
)
returns public.license_grants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_row public.license_grants;
begin
  select greatest(now(), coalesce(max(g.ends_at), now())) into v_start
  from public.license_grants g
  where g.tenant_id = target_tenant and g.plan_code = target_plan
    and g.revoked_at is null and g.ends_at > now();
  insert into public.license_grants (tenant_id, plan_code, source, starts_at, ends_at, note, granted_by)
  values (
    target_tenant, target_plan, target_source, v_start,
    v_start + make_interval(months => target_months), coalesce(btrim(target_note), ''), (select auth.uid())
  )
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function private.insert_license(uuid, text, integer, text, text) from public, anon, authenticated;

create or replace function private.assert_paid_plan(target_plan text, target_months integer)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_plan is null or target_plan = 'free' or not exists (select 1 from public.plans p where p.code = target_plan) then
    raise exception using errcode = '23514', message = 'INVALID_LICENSE_PLAN';
  end if;
  if target_months is null or target_months not between 1 and 36 then
    raise exception using errcode = '23514', message = 'INVALID_LICENSE_MONTHS';
  end if;
end;
$$;

revoke all on function private.assert_paid_plan(text, integer) from public, anon, authenticated;

create or replace function public.grant_license(
  target_site uuid,
  target_plan text,
  target_months integer,
  target_note text default ''
)
returns public.license_grants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.license_grants;
begin
  if not private.has_platform_capability('licenses.manage') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ROLE';
  end if;
  perform private.assert_paid_plan(target_plan, target_months);
  if length(coalesce(target_note, '')) > 280 then
    raise exception using errcode = '23514', message = 'INVALID_LICENSE_NOTE';
  end if;
  v_row := private.insert_license(private.ensure_site_tenant(target_site), target_plan, target_months, 'manual', target_note);
  perform private.record_audit_log(target_site, 'license_granted', 'license_grant', v_row.id::text,
    jsonb_build_object('plan', target_plan, 'months', target_months, 'source', 'manual', 'endsAt', v_row.ends_at));
  return v_row;
end;
$$;

revoke all on function public.grant_license(uuid, text, integer, text) from public, anon;
grant execute on function public.grant_license(uuid, text, integer, text) to authenticated;

create or replace function public.revoke_license(target_grant uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.license_grants;
begin
  if not private.has_platform_capability('licenses.manage') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ROLE';
  end if;
  update public.license_grants g
  set revoked_at = now(), revoked_by = (select auth.uid())
  where g.id = target_grant and g.revoked_at is null
  returning * into v_row;
  if v_row.id is null then
    return false;
  end if;
  perform private.record_audit_log(
    (select s.id from public.sites s where s.tenant_id = v_row.tenant_id order by s.created_at limit 1),
    'license_revoked', 'license_grant', v_row.id::text,
    jsonb_build_object('plan', v_row.plan_code, 'source', v_row.source)
  );
  return true;
end;
$$;

revoke all on function public.revoke_license(uuid) from public, anon;
grant execute on function public.revoke_license(uuid) to authenticated;

-- 5. Cupons
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{4,22}[A-Z0-9]$'),
  plan_code text not null references public.plans(code) check (plan_code <> 'free'),
  duration_months integer not null check (duration_months between 1 and 36),
  max_redemptions integer not null default 1 check (max_redemptions between 1 and 1000),
  redemption_count integer not null default 0,
  expires_at timestamptz null,
  note text not null default '' check (length(note) <= 280),
  created_by uuid null references auth.users(id) on delete set null,
  disabled_at timestamptz null,
  created_at timestamptz not null default now(),
  check (redemption_count between 0 and max_redemptions)
);

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  site_id uuid null references public.sites(id) on delete set null,
  redeemed_by uuid null references auth.users(id) on delete set null,
  license_grant_id uuid not null references public.license_grants(id) on delete cascade,
  plan_code text not null,
  duration_months integer not null,
  value_cents integer not null check (value_cents >= 0),
  redeemed_at timestamptz not null default now(),
  unique (coupon_id, tenant_id)
);

create table if not exists private.coupon_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists coupon_attempts_user_idx on private.coupon_attempts(user_id, attempted_at desc);

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
revoke all on public.coupons, public.coupon_redemptions from public, anon, authenticated;
revoke all on private.coupon_attempts from public, anon, authenticated;

-- 12 caracteres de um alfabeto de 32 símbolos sem 0/O/1/I: 60 bits de gen_random_uuid().
create or replace function private.generate_coupon_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_code text := '';
begin
  for i in 0..11 loop
    if i in (4, 8) then
      v_code := v_code || '-';
    end if;
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

revoke all on function private.generate_coupon_code() from public, anon, authenticated;

create or replace function public.create_coupon(
  target_plan text,
  target_months integer,
  target_max integer default 1,
  target_expires timestamptz default null,
  target_note text default '',
  target_code text default null
)
returns public.coupons
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.coupons;
  v_code text := nullif(upper(btrim(coalesce(target_code, ''))), '');
  v_try integer := 0;
begin
  if not private.has_platform_capability('licenses.manage') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ROLE';
  end if;
  perform private.assert_paid_plan(target_plan, target_months);
  if coalesce(target_max, 0) not between 1 and 1000
    or length(coalesce(target_note, '')) > 280
    or (target_expires is not null and target_expires <= now())
    or (v_code is not null and v_code !~ '^[A-Z0-9][A-Z0-9-]{4,22}[A-Z0-9]$') then
    raise exception using errcode = '23514', message = 'INVALID_COUPON';
  end if;
  if v_code is not null and exists (select 1 from public.coupons c where c.code = v_code) then
    raise exception using errcode = '23505', message = 'COUPON_CODE_TAKEN';
  end if;
  loop
    v_try := v_try + 1;
    begin
      insert into public.coupons (code, plan_code, duration_months, max_redemptions, expires_at, note, created_by)
      values (
        coalesce(v_code, private.generate_coupon_code()), target_plan, target_months, target_max,
        target_expires, coalesce(btrim(target_note), ''), (select auth.uid())
      )
      returning * into v_row;
      exit;
    exception when unique_violation then
      if v_code is not null then
        raise exception using errcode = '23505', message = 'COUPON_CODE_TAKEN';
      end if;
      if v_try >= 5 then
        raise;
      end if;
    end;
  end loop;
  perform private.record_audit_log(null, 'coupon_created', 'coupon', v_row.id::text,
    jsonb_build_object('plan', target_plan, 'months', target_months, 'maxRedemptions', target_max, 'codeEnd', right(v_row.code, 4)));
  return v_row;
end;
$$;

revoke all on function public.create_coupon(text, integer, integer, timestamptz, text, text) from public, anon;
grant execute on function public.create_coupon(text, integer, integer, timestamptz, text, text) to authenticated;

create or replace function public.set_coupon_disabled(target_coupon uuid, target_disabled boolean)
returns public.coupons
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.coupons;
begin
  if not private.has_platform_capability('licenses.manage') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ROLE';
  end if;
  update public.coupons c
  set disabled_at = case when target_disabled then coalesce(c.disabled_at, now()) else null end
  where c.id = target_coupon
  returning * into v_row;
  if v_row.id is null then
    raise exception using errcode = 'P0002', message = 'COUPON_NOT_FOUND';
  end if;
  perform private.record_audit_log(null, case when target_disabled then 'coupon_disabled' else 'coupon_enabled' end,
    'coupon', v_row.id::text, jsonb_build_object('codeEnd', right(v_row.code, 4)));
  return v_row;
end;
$$;

revoke all on function public.set_coupon_disabled(uuid, boolean) from public, anon;
grant execute on function public.set_coupon_disabled(uuid, boolean) to authenticated;

create or replace function public.list_coupons()
returns table (
  id uuid, code text, plan_code text, duration_months integer, max_redemptions integer,
  redemption_count integer, expires_at timestamptz, note text, disabled_at timestamptz,
  created_at timestamptz, value_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_platform_capability('licenses.manage') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ROLE';
  end if;
  return query
    select c.id, c.code, c.plan_code, c.duration_months, c.max_redemptions, c.redemption_count,
      c.expires_at, c.note, c.disabled_at, c.created_at,
      coalesce((select sum(r.value_cents) from public.coupon_redemptions r where r.coupon_id = c.id), 0)::bigint
    from public.coupons c
    order by c.created_at desc, c.id
    limit 200;
end;
$$;

revoke all on function public.list_coupons() from public, anon;
grant execute on function public.list_coupons() to authenticated;

create or replace function public.read_coupon_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_platform_capability('licenses.manage') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ROLE';
  end if;
  return jsonb_build_object(
    'coupons', (select count(*) from public.coupons),
    'activeCoupons', (
      select count(*) from public.coupons c
      where c.disabled_at is null and (c.expires_at is null or c.expires_at > now())
        and c.redemption_count < c.max_redemptions
    ),
    'redemptions', (select count(*) from public.coupon_redemptions),
    'monthsGranted', (select coalesce(sum(duration_months), 0) from public.coupon_redemptions),
    'valueCents', (select coalesce(sum(value_cents), 0) from public.coupon_redemptions),
    'byPlan', coalesce((
      select jsonb_agg(jsonb_build_object(
        'planCode', x.plan_code, 'redemptions', x.n, 'monthsGranted', x.months, 'valueCents', x.value
      ) order by x.value desc, x.plan_code)
      from (
        select r.plan_code, count(*) as n, sum(r.duration_months) as months, sum(r.value_cents) as value
        from public.coupon_redemptions r group by r.plan_code
      ) x
    ), '[]'::jsonb),
    'activeLicenses', coalesce((
      select jsonb_object_agg(x.source, x.n)
      from (
        select g.source, count(*) as n from public.license_grants g
        where g.revoked_at is null and g.starts_at <= now() and g.ends_at > now()
        group by g.source
      ) x
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.read_coupon_report() from public, anon;
grant execute on function public.read_coupon_report() to authenticated;

-- Resgate pela proprietária. Devolve o resultado em vez de lançar exceção para que a
-- tentativa fique gravada mesmo com código inválido (a exceção desfaria o registro).
create or replace function public.redeem_coupon(target_site uuid, target_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_code text := upper(btrim(coalesce(target_code, '')));
  v_coupon public.coupons;
  v_tenant uuid;
  v_grant public.license_grants;
  v_plan public.plans;
begin
  if v_user is null or not exists (
    select 1 from public.sites s where s.id = target_site and s.owner_user_id = v_user
  ) then
    raise exception using errcode = 'P0002', message = 'SITE_NOT_FOUND';
  end if;
  delete from private.coupon_attempts a where a.user_id = v_user and a.attempted_at < now() - interval '1 day';
  if (select count(*) from private.coupon_attempts a
      where a.user_id = v_user and a.attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into private.coupon_attempts (user_id) values (v_user);

  select * into v_coupon from public.coupons c where c.code = v_code for update;
  if v_coupon.id is null or v_coupon.disabled_at is not null then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_coupon.expires_at is not null and v_coupon.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  if v_coupon.redemption_count >= v_coupon.max_redemptions then
    return jsonb_build_object('status', 'exhausted');
  end if;
  v_tenant := private.ensure_site_tenant(target_site);
  if exists (select 1 from public.coupon_redemptions r where r.coupon_id = v_coupon.id and r.tenant_id = v_tenant) then
    return jsonb_build_object('status', 'already_redeemed');
  end if;

  select * into v_plan from public.plans p where p.code = v_coupon.plan_code;
  v_grant := private.insert_license(v_tenant, v_coupon.plan_code, v_coupon.duration_months, 'coupon', 'Cupom ' || right(v_coupon.code, 4));
  insert into public.coupon_redemptions (
    coupon_id, tenant_id, site_id, redeemed_by, license_grant_id, plan_code, duration_months, value_cents
  ) values (
    v_coupon.id, v_tenant, target_site, v_user, v_grant.id, v_coupon.plan_code, v_coupon.duration_months,
    v_plan.monthly_price_cents * v_coupon.duration_months
  );
  update public.coupons set redemption_count = redemption_count + 1 where id = v_coupon.id;
  perform private.record_audit_log(target_site, 'coupon_redeemed', 'coupon', v_coupon.id::text,
    jsonb_build_object('plan', v_coupon.plan_code, 'months', v_coupon.duration_months, 'licenseId', v_grant.id));
  return jsonb_build_object(
    'status', 'redeemed', 'planCode', v_plan.code, 'planName', v_plan.name,
    'months', v_coupon.duration_months, 'endsAt', v_grant.ends_at
  );
end;
$$;

revoke all on function public.redeem_coupon(uuid, text) from public, anon;
grant execute on function public.redeem_coupon(uuid, text) to authenticated;

-- 6. Limites por vitrine, por cima do plano.
create table if not exists public.site_limit_overrides (
  site_id uuid primary key references public.sites(id) on delete cascade,
  max_active_items integer null check (max_active_items between 1 and 100),
  max_item_blocks integer null check (max_item_blocks between 1 and 5),
  note text not null default '' check (length(note) <= 280),
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (max_active_items is not null or max_item_blocks is not null)
);

alter table public.site_limit_overrides enable row level security;
revoke all on public.site_limit_overrides from public, anon, authenticated;
grant select on public.site_limit_overrides to authenticated;

drop policy if exists site_limit_overrides_read on public.site_limit_overrides;
create policy site_limit_overrides_read
  on public.site_limit_overrides
  for select
  to authenticated
  using (private.has_platform_capability('licenses.manage'));

create or replace function public.set_site_limits(
  target_site uuid,
  target_items integer,
  target_blocks integer,
  target_note text default ''
)
returns public.site_limit_overrides
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.site_limit_overrides;
begin
  if not private.has_platform_capability('licenses.manage') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ROLE';
  end if;
  if not exists (select 1 from public.sites s where s.id = target_site) then
    raise exception using errcode = 'P0002', message = 'SITE_NOT_FOUND';
  end if;
  if (target_items is null and target_blocks is null)
    or (target_items is not null and target_items not between 1 and 100)
    or (target_blocks is not null and target_blocks not between 1 and 5)
    or length(coalesce(target_note, '')) > 280 then
    raise exception using errcode = '23514', message = 'INVALID_SITE_LIMITS';
  end if;
  insert into public.site_limit_overrides (site_id, max_active_items, max_item_blocks, note, updated_by, updated_at)
  values (target_site, target_items, target_blocks, coalesce(btrim(target_note), ''), (select auth.uid()), now())
  on conflict (site_id) do update set
    max_active_items = excluded.max_active_items,
    max_item_blocks = excluded.max_item_blocks,
    note = excluded.note,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into v_row;
  perform private.record_audit_log(target_site, 'site_limits_set', 'site', target_site::text,
    jsonb_build_object('maxActiveItems', target_items, 'maxItemBlocks', target_blocks));
  return v_row;
end;
$$;

revoke all on function public.set_site_limits(uuid, integer, integer, text) from public, anon;
grant execute on function public.set_site_limits(uuid, integer, integer, text) to authenticated;

create or replace function public.clear_site_limits(target_site uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed integer;
begin
  if not private.has_platform_capability('licenses.manage') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ROLE';
  end if;
  delete from public.site_limit_overrides o where o.site_id = target_site;
  get diagnostics v_removed = row_count;
  if v_removed > 0 then
    perform private.record_audit_log(target_site, 'site_limits_cleared', 'site', target_site::text, '{}'::jsonb);
  end if;
  return v_removed > 0;
end;
$$;

revoke all on function public.clear_site_limits(uuid) from public, anon;
grant execute on function public.clear_site_limits(uuid) to authenticated;

-- 7. Direitos: maior plano entre a assinatura válida (regras de 20261116000100) e as
-- licenças vigentes; senão free; depois os limites próprios da vitrine.
create or replace function private.site_entitlements(target_site uuid)
returns table (
  plan_code text,
  plan_name text,
  max_vitrines integer,
  max_active_items integer,
  max_item_blocks integer,
  features text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with site as (
    select s.id, s.tenant_id from public.sites s where s.id = target_site
  ),
  candidates as (
    select sub.plan_code as code
    from site
    join public.subscriptions sub on sub.tenant_id = site.tenant_id
    where sub.status = 'active'
      or (
        sub.status in ('past_due', 'grace')
        and coalesce(sub.grace_until, sub.current_period_end + interval '7 days') > now()
      )
      or (sub.status = 'canceled' and sub.current_period_end > now())
    union all
    select g.plan_code
    from site
    join public.license_grants g on g.tenant_id = site.tenant_id
    where g.revoked_at is null and g.starts_at <= now() and g.ends_at > now()
  ),
  effective as (
    select coalesce((
      select c.code from candidates c
      join public.plans p on p.code = c.code
      order by p.monthly_price_cents desc, p.code
      limit 1
    ), 'free') as code
  )
  select p.code, p.name, p.max_vitrines,
    coalesce(o.max_active_items, p.max_active_items),
    coalesce(o.max_item_blocks, p.max_item_blocks),
    p.features
  from effective e
  join public.plans p on p.code = e.code
  left join public.site_limit_overrides o on o.site_id = target_site
  where exists (select 1 from site);
$$;

revoke all on function private.site_entitlements(uuid) from public, anon, authenticated;

-- 8. Usuários
create or replace function public.admin_list_users(
  search text default '',
  page_size integer default 25,
  page_offset integer default 0
)
returns table (
  user_id uuid, email text, display_name text, business_name text, city text,
  platform_role text, site_count integer, created_at timestamptz, last_sign_in_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_term text := btrim(coalesce(search, ''));
  v_like text := '%' || replace(replace(replace(btrim(coalesce(search, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_size integer := least(greatest(coalesce(page_size, 25), 1), 100);
  v_offset integer := greatest(coalesce(page_offset, 0), 0);
begin
  if not private.has_platform_capability('users.read') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ROLE';
  end if;
  return query
    with matched as (
      select u.id, u.email::text as email, u.created_at, u.last_sign_in_at,
        coalesce(pr.display_name, '') as display_name,
        coalesce(pr.business_name, '') as business_name,
        coalesce(pr.city, '') as city,
        po.role
      from auth.users u
      left join public.profiles pr on pr.user_id = u.id
      left join public.platform_operators po on po.user_id = u.id
      where v_term = ''
        or u.id::text = lower(v_term)
        or u.email ilike v_like
        or pr.display_name ilike v_like
        or pr.business_name ilike v_like
        or exists (
          select 1 from public.sites s
          where s.owner_user_id = u.id and (s.slug ilike v_like or s.name ilike v_like)
        )
    )
    select m.id, m.email, m.display_name, m.business_name, m.city, m.role,
      (select count(*) from public.sites s where s.owner_user_id = m.id)::integer,
      m.created_at, m.last_sign_in_at,
      count(*) over ()
    from matched m
    order by m.created_at desc nulls last, m.id
    limit v_size offset v_offset;
end;
$$;

revoke all on function public.admin_list_users(text, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;

create or replace function public.admin_user_detail(target_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user jsonb;
begin
  if not private.has_platform_capability('users.read') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ROLE';
  end if;
  select jsonb_build_object(
    'id', u.id, 'email', u.email, 'createdAt', u.created_at, 'lastSignInAt', u.last_sign_in_at,
    'displayName', coalesce(pr.display_name, ''), 'businessName', coalesce(pr.business_name, ''),
    'city', coalesce(pr.city, ''), 'platformRole', po.role
  ) into v_user
  from auth.users u
  left join public.profiles pr on pr.user_id = u.id
  left join public.platform_operators po on po.user_id = u.id
  where u.id = target_user;
  if v_user is null then
    raise exception using errcode = 'P0002', message = 'PLATFORM_USER_NOT_FOUND';
  end if;
  return jsonb_build_object(
    'user', v_user,
    'sites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'slug', s.slug, 'name', s.name, 'role', x.role,
        'pausedAt', s.paused_at, 'archivedAt', s.archived_at, 'tenantId', s.tenant_id,
        'entitlements', (
          select jsonb_build_object(
            'planCode', e.plan_code, 'planName', e.plan_name,
            'maxActiveItems', e.max_active_items, 'maxItemBlocks', e.max_item_blocks
          ) from private.site_entitlements(s.id) e
        ),
        'limits', (
          select jsonb_build_object(
            'maxActiveItems', o.max_active_items, 'maxItemBlocks', o.max_item_blocks,
            'note', o.note, 'updatedAt', o.updated_at
          ) from public.site_limit_overrides o where o.site_id = s.id
        ),
        'subscription', (
          select jsonb_build_object('planCode', sub.plan_code, 'status', sub.status, 'currentPeriodEnd', sub.current_period_end)
          from public.subscriptions sub where sub.tenant_id = s.tenant_id
        ),
        'licenses', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', g.id, 'planCode', g.plan_code, 'source', g.source, 'startsAt', g.starts_at,
            'endsAt', g.ends_at, 'revokedAt', g.revoked_at, 'note', g.note
          ) order by g.ends_at desc)
          from public.license_grants g where g.tenant_id = s.tenant_id
        ), '[]'::jsonb)
      ) order by s.created_at)
      from (
        select s2.id, 'owner'::text as role from public.sites s2 where s2.owner_user_id = target_user
        union all
        select m.site_id, m.role from public.site_memberships m where m.user_id = target_user
      ) x
      join public.sites s on s.id = x.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_user_detail(uuid) from public, anon;
grant execute on function public.admin_user_detail(uuid) to authenticated;

commit;
