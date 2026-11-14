-- Migração 20261115000900_linktree_demo.sql
-- Demonstrações importadas do Linktree (issue #123): vitrine sem dono, só rascunho,
-- nunca publicada antes do aceite do dono e apagada após 30 dias sem aceite.
-- Migração append-only: nunca modifique migrações anteriores.
begin;

alter table public.sites alter column owner_user_id drop not null;

alter table public.sites
  add column if not exists demo_source text null check (demo_source in ('linktree')),
  add column if not exists demo_expires_at timestamptz null,
  add column if not exists demo_invited_user_id uuid null references auth.users(id) on delete set null;

-- Toda vitrine sem dono é uma demonstração com prazo; nenhuma demonstração tem dono.
alter table public.sites
  drop constraint if exists sites_owner_or_demo;

alter table public.sites
  add constraint sites_owner_or_demo check (
    (owner_user_id is null) = (demo_expires_at is not null)
    and (demo_expires_at is null or demo_source is not null)
    and (demo_invited_user_id is null or demo_expires_at is not null)
  );

create index if not exists sites_demo_expires_idx
  on public.sites(demo_expires_at) where demo_expires_at is not null;
create index if not exists sites_demo_invited_idx
  on public.sites(demo_invited_user_id) where demo_invited_user_id is not null;

-- Defesa em profundidade: demonstração nunca vira publicação, nem por chamada direta.
create or replace function private.block_demo_publication()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.sites s where s.id = new.site_id and s.demo_expires_at is not null
  ) then
    raise exception using errcode = '42501', message = 'DEMO_NOT_PUBLISHABLE';
  end if;
  return new;
end;
$$;
revoke all on function private.block_demo_publication() from public, anon, authenticated;

drop trigger if exists publications_block_demo on public.publications;
create trigger publications_block_demo
before insert or update on public.publications
for each row execute function private.block_demo_publication();

-- Importação: site, rascunho e auditoria na mesma transação (sem rascunho pela metade).
-- A auditoria fica com site_id nulo para sobreviver à limpeza da demonstração.
create or replace function public.import_linktree_demo(
  target_slug text,
  target_name text,
  target_storefront_type text,
  target_template text,
  target_content jsonb,
  target_username text,
  target_summary jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  created public.sites;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ADMIN';
  end if;
  if target_username is null or target_username !~ '^[A-Za-z0-9_.]{1,30}$' or position('..' in target_username) > 0 then
    raise exception using errcode = '22023', message = 'INVALID_LINKTREE_USERNAME';
  end if;
  insert into public.sites (owner_user_id, slug, name, template, storefront_type, demo_source, demo_expires_at)
  values (null, target_slug, target_name, target_template, target_storefront_type, 'linktree', now() + interval '30 days')
  returning * into created;
  insert into public.drafts (site_id, content) values (created.id, target_content);
  perform private.record_audit_log(
    null, 'linktree_imported', 'site', created.id::text,
    coalesce(target_summary, '{}'::jsonb) || jsonb_build_object('username', target_username, 'slug', created.slug)
  );
  return jsonb_build_object(
    'id', created.id, 'slug', created.slug, 'name', created.name, 'demo_expires_at', created.demo_expires_at
  );
end;
$$;
revoke all on function public.import_linktree_demo(text, text, text, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.import_linktree_demo(text, text, text, text, jsonb, text, jsonb) to authenticated;

-- Convite ao dono: só platform_admin, só demonstração vigente e ainda sem dono.
create or replace function public.invite_linktree_demo_owner(target_site_id uuid, target_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  invited public.sites;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ADMIN';
  end if;
  update public.sites
  set demo_invited_user_id = target_user_id
  where id = target_site_id and owner_user_id is null and demo_expires_at > now()
    and exists (select 1 from auth.users u where u.id = target_user_id)
  returning * into invited;
  if invited.id is null then
    return null;
  end if;
  perform private.record_audit_log(
    invited.id, 'linktree_demo_invited', 'site', invited.id::text,
    jsonb_build_object('invited_user_id', target_user_id)
  );
  return jsonb_build_object(
    'id', invited.id, 'invited_user_id', invited.demo_invited_user_id, 'demo_expires_at', invited.demo_expires_at
  );
end;
$$;
revoke all on function public.invite_linktree_demo_owner(uuid, uuid) from public, anon;
grant execute on function public.invite_linktree_demo_owner(uuid, uuid) to authenticated;

create or replace function public.list_my_linktree_demo_invitations()
returns table (id uuid, slug text, name text, demo_expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.slug, s.name, s.demo_expires_at
  from public.sites s
  where s.demo_invited_user_id = (select auth.uid())
    and s.owner_user_id is null and s.demo_expires_at > now()
  order by s.demo_expires_at;
$$;
revoke all on function public.list_my_linktree_demo_invitations() from public, anon;
grant execute on function public.list_my_linktree_demo_invitations() to authenticated;

-- Aceite: o convidado vira dono; a partir daí publica pelo fluxo normal.
create or replace function public.accept_linktree_demo(target_site_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  accepted public.sites;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;
  update public.sites
  set owner_user_id = (select auth.uid()), demo_source = null, demo_expires_at = null, demo_invited_user_id = null
  where id = target_site_id and owner_user_id is null
    and demo_invited_user_id = (select auth.uid()) and demo_expires_at > now()
  returning * into accepted;
  if accepted.id is null then
    return null;
  end if;
  perform private.record_audit_log(accepted.id, 'linktree_demo_accepted', 'site', accepted.id::text, '{}'::jsonb);
  return jsonb_build_object('id', accepted.id, 'slug', accepted.slug, 'name', accepted.name);
end;
$$;
revoke all on function public.accept_linktree_demo(uuid) from public, anon;
grant execute on function public.accept_linktree_demo(uuid) to authenticated;

-- Limpeza: chamada pelo Worker agendado com a chave de serviço, no máximo 50 por execução.
create or replace function public.purge_expired_linktree_demos()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  purged integer;
begin
  with expired as (
    select s.id from public.sites s
    where s.owner_user_id is null and s.demo_expires_at is not null and s.demo_expires_at <= now()
      and not exists (select 1 from public.publications p where p.site_id = s.id)
    order by s.demo_expires_at
    limit 50
  )
  delete from public.sites s using expired where s.id = expired.id;
  get diagnostics purged = row_count;
  return purged;
end;
$$;
revoke all on function public.purge_expired_linktree_demos() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.purge_expired_linktree_demos() to service_role;
  end if;
end;
$$;

commit;
