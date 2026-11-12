-- Migração 202611120007_assets_sandbox_domains.sql
-- Ativos WebP com controle de cota, componentes em sandbox opaco e domínios próprios com trava de 95 ativos.
-- Migração append-only: nunca modifique migrações anteriores.
begin;

-- 1. Tabela public.assets (máximo 100 ativos ou 20 MB por vitrine)
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  storage_provider text not null default 'supabase' check (storage_provider in ('supabase', 'r2')),
  object_key text not null unique check (length(trim(object_key)) between 3 and 512),
  public_url text not null check (length(trim(public_url)) between 8 and 1024 and public_url ~ '^https?://'),
  mime_type text not null check (mime_type = 'image/webp'),
  byte_size integer not null check (byte_size > 0 and byte_size <= 262144),
  upload_state text not null default 'pending' check (upload_state in ('pending', 'ready')),
  sha256_hex text not null check (sha256_hex ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists assets_site_idx on public.assets(site_id, created_at desc);

create or replace function private.enforce_site_asset_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_bytes bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.site_id::text, 509));
  select count(*), coalesce(sum(byte_size), 0)
  into v_count, v_bytes
  from public.assets
  where site_id = new.site_id;

  if v_count >= 100 or (v_bytes + new.byte_size) > 20971520 then
    raise exception 'ASSET_QUOTA_EXCEEDED: Limite gratuito de 100 ativos ou 20 MB por vitrine atingido.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_site_asset_quota() from public, anon, authenticated;

drop trigger if exists assets_quota_check on public.assets;
create trigger assets_quota_check
before insert on public.assets
for each row execute function private.enforce_site_asset_quota();

-- 2. Tabela public.custom_components (widgets em sandbox opaco aprovados por platform_admin)
create table if not exists public.custom_components (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  slug text not null check (length(slug) between 2 and 64 and slug ~ '^[a-z0-9_-]+$'),
  name text not null check (length(trim(name)) between 1 and 120),
  source_type text not null check (source_type in ('inline_bundle', 'github_release')),
  source_repo text null check (source_repo is null or length(source_repo) <= 256),
  version_tag text not null check (length(trim(version_tag)) between 1 and 32),
  bundle_hash_sha256 text not null check (bundle_hash_sha256 ~ '^[a-f0-9]{64}$'),
  bundle_html text not null check (octet_length(bundle_html) between 1 and 65536),
  sandbox_url text not null check (length(trim(sandbox_url)) between 8 and 1024 and sandbox_url ~ '^https?://'),
  allowed_events jsonb not null default '["resize"]'::jsonb check (jsonb_typeof(allowed_events) = 'array'),
  approved_by uuid not null references auth.users(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (site_id, slug, version_tag)
);

-- 3. Tabela public.custom_domains com trava rígida de 95 domínios ativos
create table if not exists public.custom_domains (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  hostname text not null unique check (
    length(hostname) between 3 and 237
    and hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    and hostname !~ '(^|\.)inspira\.dev\.br$'
  ),
  is_apex boolean not null default false,
  status text not null default 'pending_dns' check (
    status in ('pending_dns', 'verifying', 'active', 'failed', 'suspended')
  ),
  verification_txt_name text not null check (length(trim(verification_txt_name)) between 1 and 255),
  verification_txt_value text not null check (length(trim(verification_txt_value)) between 1 and 255),
  cname_target text not null default 'vitrine.inspira.dev.br',
  cf_hostname_id text null,
  lease_until timestamptz not null default '-infinity',
  ssl_status text not null default 'pending' check (ssl_status in ('pending', 'active', 'failed')),
  verified_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists custom_domains_site_idx on public.custom_domains(site_id);
create index if not exists custom_domains_hostname_idx on public.custom_domains(hostname);

create table private.custom_domain_quota (
  singleton boolean primary key default true check (singleton),
  reserved integer not null default 0 check (reserved between 0 and 95)
);
insert into private.custom_domain_quota default values;
revoke all on private.custom_domain_quota from public, anon, authenticated;

create function private.issue_custom_domain_challenge()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.verification_txt_name := '_vitrine-verify.' || new.hostname;
  new.verification_txt_value := 'vitrine=' || gen_random_uuid();
  return new;
end;
$$;
revoke all on function private.issue_custom_domain_challenge() from public, anon, authenticated;
create trigger custom_domains_issue_challenge
before insert on public.custom_domains
for each row execute function private.issue_custom_domain_challenge();

create function private.enforce_free_custom_domain_quota()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  was_reserved boolean := tg_op <> 'INSERT' and old.status in ('verifying', 'active');
  is_reserved boolean := tg_op <> 'DELETE' and new.status in ('verifying', 'active');
begin
  if is_reserved and not was_reserved then
    update private.custom_domain_quota set reserved = reserved + 1
      where singleton and reserved < 95;
    if not found then
      raise exception 'DOMAIN_QUOTA_REACHED: O limite gratuito de 95 domínios ativos foi atingido.';
    end if;
  elsif was_reserved and not is_reserved then
    update private.custom_domain_quota set reserved = reserved - 1 where singleton;
  end if;
  return null;
end;
$$;
revoke all on function private.enforce_free_custom_domain_quota() from public, anon, authenticated;
create trigger custom_domains_quota
after insert or update or delete on public.custom_domains
for each row execute function private.enforce_free_custom_domain_quota();

-- 4. RLS e Privilégios
alter table public.assets enable row level security;
alter table public.custom_components enable row level security;
alter table public.custom_domains enable row level security;

revoke all on public.assets, public.custom_components, public.custom_domains from public, anon, authenticated;

grant select, insert, delete on public.assets to authenticated;
grant update (upload_state) on public.assets to authenticated;
grant select on public.custom_components to authenticated;
grant insert, update, delete on public.custom_components to authenticated;
grant select on public.custom_domains to authenticated;
grant insert (site_id, hostname, is_apex, cname_target)
  on public.custom_domains to authenticated;

drop policy if exists assets_select on public.assets;
create policy assets_select
  on public.assets
  for select
  to authenticated
  using (site_id in (select private.accessible_site_ids()) or private.is_platform_admin());

drop policy if exists assets_mutate on public.assets;
create policy assets_mutate
  on public.assets
  for all
  to authenticated
  using (private.has_site_role(site_id, array['owner', 'admin', 'editor']))
  with check (private.has_site_role(site_id, array['owner', 'admin', 'editor']));

drop policy if exists custom_components_select on public.custom_components;
create policy custom_components_select
  on public.custom_components
  for select
  to authenticated
  using (private.is_platform_admin() or (active and site_id in (select private.accessible_site_ids())));

drop policy if exists custom_components_admin_mutate on public.custom_components;
create policy custom_components_admin_mutate
  on public.custom_components
  for all
  to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

drop policy if exists custom_domains_select on public.custom_domains;
create policy custom_domains_select
  on public.custom_domains
  for select
  to authenticated
  using (site_id in (select private.accessible_site_ids()) or private.is_platform_admin());

drop policy if exists custom_domains_mutate on public.custom_domains;
create policy custom_domains_mutate
  on public.custom_domains
  for all
  to authenticated
  using (private.has_site_role(site_id, array['owner', 'admin']))
  with check (private.has_site_role(site_id, array['owner', 'admin']));

create function public.resolve_showcase_hostname(requested_hostname text)
returns text language sql stable security definer set search_path = ''
as $$
  select s.slug from public.custom_domains d
  join public.sites s on s.id = d.site_id
  where d.hostname = requested_hostname and d.status = 'active' and d.ssl_status = 'active'
    and d.cf_hostname_id is not null;
$$;
revoke all on function public.resolve_showcase_hostname(text) from public;
grant execute on function public.resolve_showcase_hostname(text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, update, delete on public.custom_domains to service_role;
  end if;
end;
$$;

-- Um componente aprovado é um artefato imutável. Revogar e aprovar outra versão é explícito.
revoke update, delete on public.custom_components from authenticated;
grant update (active) on public.custom_components to authenticated;
revoke select on public.custom_components from authenticated;
grant select (id, site_id, slug, name, source_type, source_repo, version_tag, bundle_hash_sha256,
  sandbox_url, allowed_events, active, created_at) on public.custom_components to authenticated;

create function public.read_sandbox_bundle(widget_id uuid, bundle_hash text)
returns text language sql stable security definer set search_path = ''
as $$
  select widget.bundle_html from public.custom_components widget
  where widget.id = widget_id and widget.bundle_hash_sha256 = bundle_hash and widget.active;
$$;

revoke all on function public.read_sandbox_bundle(uuid, text) from public;
grant execute on function public.read_sandbox_bundle(uuid, text) to anon, authenticated;

commit;
