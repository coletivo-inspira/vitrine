-- Migração 202611120005_multi_tenant_rbac_audit.sql
-- Fundação multi-inquilino (tenants), operadores da plataforma, RBAC granular e trilha de auditoria imutável.
-- Migração append-only: nunca modifique migrações anteriores.
begin;

-- 1. Tabela public.tenants
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (
    length(slug) between 3 and 63 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  name text not null check (length(trim(name)) between 1 and 160),
  plan text not null default 'free' check (plan in ('free', 'custom_domain', 'bespoke')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  settings jsonb not null default '{}'::jsonb check (
    jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 16384
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenants_owner_idx on public.tenants(owner_user_id);

-- 2. Tabela public.platform_operators
create table if not exists public.platform_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'platform_admin' check (role in ('platform_admin', 'support_operator')),
  created_at timestamptz not null default now()
);

-- 3. Função private.is_platform_admin()
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
      and po.role = 'platform_admin'
  );
$$;

revoke all on function private.is_platform_admin() from public;
grant execute on function private.is_platform_admin() to anon, authenticated;

-- Trigger para impedir que usuários não operadores alterem plan ou status do tenant
create or replace function private.enforce_tenant_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    if new.plan <> old.plan then
      raise exception 'CANNOT_CHANGE_TENANT_PLAN';
    end if;
    if new.status <> old.status then
      raise exception 'CANNOT_CHANGE_TENANT_STATUS';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.enforce_tenant_immutability() from public, anon, authenticated;

drop trigger if exists trg_enforce_tenant_immutability on public.tenants;
create trigger trg_enforce_tenant_immutability
before update on public.tenants
for each row execute function private.enforce_tenant_immutability();

-- 4. Extensão de public.sites com tenant_id e theme_overrides
alter table public.sites
  add column if not exists tenant_id uuid null references public.tenants(id) on delete set null;

alter table public.sites
  add column if not exists theme_overrides jsonb not null default '{}'::jsonb check (
    jsonb_typeof(theme_overrides) = 'object' and octet_length(theme_overrides::text) <= 16384
  );

grant insert (tenant_id, theme_overrides) on public.sites to authenticated;
grant update (theme_overrides) on public.sites to authenticated;

-- 5. Expansão de public.site_memberships para papéis granulares (owner, admin, editor, viewer)
alter table public.site_memberships
  add column if not exists role text not null default 'editor';

alter table public.site_memberships
  add column if not exists created_at timestamptz not null default now();

alter table public.site_memberships
  drop constraint if exists site_memberships_role_check;

alter table public.site_memberships
  add constraint site_memberships_role_check check (
    role in ('owner', 'admin', 'editor', 'viewer', 'collaborator')
  );

-- Proteção contra remoção ou rebaixamento do papel owner
create or replace function private.protect_site_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.role = 'owner' then
    raise exception 'CANNOT_MODIFY_OWNER';
  end if;
  if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then
    raise exception 'CANNOT_MODIFY_OWNER';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function private.protect_site_owner() from public, anon, authenticated;

drop trigger if exists trg_protect_site_owner on public.site_memberships;
create trigger trg_protect_site_owner
before update or delete on public.site_memberships
for each row execute function private.protect_site_owner();

-- 6. Funções de autorização por vitrine
create or replace function private.has_site_role(
  target_site_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.site_memberships m
    where m.site_id = target_site_id
      and m.user_id = (select auth.uid())
      and m.role = any(allowed_roles)
  ) or exists (
    select 1
    from public.sites s
    where s.id = target_site_id
      and s.owner_user_id = (select auth.uid())
      and 'owner' = any(allowed_roles)
  );
$$;

revoke all on function private.has_site_role(uuid, text[]) from public;
grant execute on function private.has_site_role(uuid, text[]) to anon, authenticated;

create or replace function private.user_site_role(target_site_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.sites s
      where s.id = target_site_id and s.owner_user_id = (select auth.uid())
    ) then 'owner'
    when exists (
      select 1 from public.site_memberships m
      where m.site_id = target_site_id and m.user_id = (select auth.uid())
    ) then (
      select m.role from public.site_memberships m
      where m.site_id = target_site_id and m.user_id = (select auth.uid())
      limit 1
    )
    else null
  end;
$$;

revoke all on function private.user_site_role(uuid) from public, anon;
grant execute on function private.user_site_role(uuid) to authenticated;

-- Atualiza política de atualização de sites para permitir owner e admin da vitrine
drop policy if exists sites_update on public.sites;
create policy sites_update
  on public.sites
  for update
  to authenticated
  using (owner_user_id = (select auth.uid()) or private.has_site_role(id, array['owner', 'admin']))
  with check (owner_user_id = (select auth.uid()) or private.has_site_role(id, array['owner', 'admin']));

-- Atualiza política de leitura de site_memberships para membros ou admin/owner da vitrine
drop policy if exists memberships_read on public.site_memberships;
create policy memberships_read
  on public.site_memberships
  for select
  to authenticated
  using (user_id = (select auth.uid()) or private.has_site_role(site_id, array['owner', 'admin']));

-- Atualiza política de publications para permitir owner e admin
drop policy if exists publications_owner_insert on public.publications;
create policy publications_owner_insert
  on public.publications
  for insert
  to authenticated
  with check (
    private.has_site_role(site_id, array['owner', 'admin'])
    and exists (
      select 1 from public.sites s
      where s.id = publications.site_id and s.slug = publications.slug
    )
  );

drop policy if exists publications_owner_update on public.publications;
create policy publications_owner_update
  on public.publications
  for update
  to authenticated
  using (private.has_site_role(site_id, array['owner', 'admin']))
  with check (
    private.has_site_role(site_id, array['owner', 'admin'])
    and exists (
      select 1 from public.sites s
      where s.id = publications.site_id and s.slug = publications.slug
    )
  );

-- Permite que platform_admin gerencie customization_requests
grant update (status, updated_at) on public.customization_requests to authenticated;

drop policy if exists customization_requests_owner_select on public.customization_requests;
create policy customization_requests_owner_select
  on public.customization_requests
  for select
  to authenticated
  using (user_id = (select auth.uid()) or private.is_platform_admin());

drop policy if exists customization_requests_admin_update on public.customization_requests;
create policy customization_requests_admin_update
  on public.customization_requests
  for update
  to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

-- 7. Tabela public.audit_logs (imutável)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid null references public.sites(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (length(trim(action)) between 1 and 80),
  entity_type text not null check (length(trim(entity_type)) between 1 and 80),
  entity_id text not null check (length(trim(entity_id)) between 1 and 128),
  summary jsonb not null default '{}'::jsonb check (
    jsonb_typeof(summary) = 'object' and octet_length(summary::text) <= 16384
  ),
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_site_id on public.audit_logs(site_id, created_at desc);
create index if not exists idx_audit_logs_actor on public.audit_logs(actor_user_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at);

create or replace function private.record_audit_log(
  target_site_id uuid,
  target_action text,
  target_entity_type text,
  target_entity_id text,
  target_summary jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  log_id uuid;
begin
  insert into public.audit_logs (site_id, actor_user_id, action, entity_type, entity_id, summary)
  values (
    target_site_id,
    (select auth.uid()),
    target_action,
    target_entity_type,
    target_entity_id,
    coalesce(target_summary, '{}'::jsonb)
  )
  returning id into log_id;
  return log_id;
end;
$$;

revoke all on function private.record_audit_log(uuid, text, text, text, jsonb) from public, anon, authenticated;

create or replace function private.purge_audit_logs_older_than(days integer default 180)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged_count integer;
begin
  delete from public.audit_logs
  where created_at < now() - (days || ' days')::interval;
  get diagnostics purged_count = row_count;
  return purged_count;
end;
$$;

revoke all on function private.purge_audit_logs_older_than(integer) from public, anon, authenticated;

-- 8. RLS e Privilégios para tenants, platform_operators e audit_logs
alter table public.tenants enable row level security;
alter table public.platform_operators enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.tenants, public.platform_operators, public.audit_logs from public, anon, authenticated;

grant select, insert, update on public.tenants to authenticated;
grant select on public.platform_operators to authenticated;
grant select on public.audit_logs to authenticated;

drop policy if exists tenants_select_policy on public.tenants;
create policy tenants_select_policy
  on public.tenants
  for select
  to authenticated
  using (owner_user_id = (select auth.uid()) or private.is_platform_admin());

drop policy if exists tenants_insert_policy on public.tenants;
create policy tenants_insert_policy
  on public.tenants
  for insert
  to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and (plan = 'free' or private.is_platform_admin())
    and (status = 'active' or private.is_platform_admin())
  );

drop policy if exists tenants_update_policy on public.tenants;
create policy tenants_update_policy
  on public.tenants
  for update
  to authenticated
  using (owner_user_id = (select auth.uid()) or private.is_platform_admin())
  with check (owner_user_id = (select auth.uid()) or private.is_platform_admin());

drop policy if exists platform_operators_select on public.platform_operators;
create policy platform_operators_select
  on public.platform_operators
  for select
  to authenticated
  using (user_id = (select auth.uid()) or private.is_platform_admin());

drop policy if exists audit_logs_select_policy on public.audit_logs;
create policy audit_logs_select_policy
  on public.audit_logs
  for select
  to authenticated
  using (
    (site_id is not null and site_id in (select private.accessible_site_ids()))
    or private.is_platform_admin()
  );

-- O proprietário é representado por sites.owner_user_id.
alter table public.site_memberships
  add constraint site_memberships_no_additional_owner check (role <> 'owner') not valid;

grant insert (site_id, user_id, role), update (role), delete on public.site_memberships to authenticated;

create policy memberships_add on public.site_memberships for insert to authenticated
with check (
  role in ('admin', 'editor', 'viewer')
  and not exists (select 1 from public.sites where id = site_id and owner_user_id = user_id)
  and private.has_site_role(site_id, array['owner', 'admin'])
  and (role <> 'admin' or private.has_site_role(site_id, array['owner']))
);

create policy memberships_change on public.site_memberships for update to authenticated
using (
  role <> 'owner' and private.has_site_role(site_id, array['owner', 'admin'])
  and (role <> 'admin' or private.has_site_role(site_id, array['owner']))
)
with check (
  role in ('admin', 'editor', 'viewer')
  and not exists (select 1 from public.sites where id = site_id and owner_user_id = user_id)
  and private.has_site_role(site_id, array['owner', 'admin'])
  and (role <> 'admin' or private.has_site_role(site_id, array['owner']))
);

create policy memberships_remove on public.site_memberships for delete to authenticated
using (
  role <> 'owner' and private.has_site_role(site_id, array['owner', 'admin'])
  and (role <> 'admin' or private.has_site_role(site_id, array['owner']))
);

drop policy sites_create on public.sites;
create policy sites_create on public.sites for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  and (tenant_id is null or exists (
    select 1 from public.tenants t where t.id = sites.tenant_id
      and t.owner_user_id = (select auth.uid()) and t.status = 'active'
  ))
);

drop policy drafts_update on public.drafts;
create policy drafts_update on public.drafts for update to authenticated
using (private.has_site_role(site_id, array['owner', 'admin', 'editor']))
with check (private.has_site_role(site_id, array['owner', 'admin', 'editor']));

create function private.audit_membership_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  membership public.site_memberships := coalesce(new, old);
begin
  if auth.uid() is not null and exists (select 1 from public.sites where id = membership.site_id) then
    perform private.record_audit_log(
      membership.site_id, lower(tg_op), 'membership', membership.user_id::text,
      jsonb_build_object('role', membership.role)
    );
  end if;
  return membership;
end;
$$;

revoke all on function private.audit_membership_change() from public, anon, authenticated;

create trigger membership_audit
after insert or update or delete on public.site_memberships
for each row execute function private.audit_membership_change();

create function public.set_showcase_member(target_site uuid, target_user uuid, target_role text)
returns void
language sql security invoker set search_path = ''
as $$
  insert into public.site_memberships (site_id, user_id, role)
  values (target_site, target_user, target_role)
  on conflict (site_id, user_id) do update set role = excluded.role;
$$;
revoke all on function public.set_showcase_member(uuid, uuid, text) from public, anon;
grant execute on function public.set_showcase_member(uuid, uuid, text) to authenticated;

commit;
