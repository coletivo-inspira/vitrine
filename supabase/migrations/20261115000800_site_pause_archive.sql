-- Pausar, arquivar e excluir vitrines; quarentena ao desconectar domínio (issue #126).
-- Append-only: não altera migrações anteriores.
begin;

-- 1. Estado de ciclo de vida da vitrine. Só as funções abaixo alteram estas colunas.
alter table public.sites
  add column if not exists paused_at timestamptz null;

alter table public.sites
  add column if not exists archived_at timestamptz null;

alter table public.sites
  drop constraint if exists sites_archived_requires_pause;

alter table public.sites
  add constraint sites_archived_requires_pause check (archived_at is null or paused_at is not null);

create index if not exists sites_owner_not_archived_idx
  on public.sites(owner_user_id) where archived_at is null;

-- 2. Critério único de "vitrine que ocupa vaga do plano": archived_at is null.
create or replace function private.count_plan_sites(target_owner uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.sites s
  where s.owner_user_id = target_owner and s.archived_at is null;
$$;

revoke all on function private.count_plan_sites(uuid) from public, anon, authenticated;

-- 3. Visibilidade pública: vitrine pausada ou arquivada some das leituras anônimas.
create or replace function public.site_is_live(target_site uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.sites s
    where s.id = target_site and s.paused_at is not null
  );
$$;

revoke all on function public.site_is_live(uuid) from public;
grant execute on function public.site_is_live(uuid) to anon, authenticated;

create or replace function public.public_site_state(target_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'paused'::text
  from public.sites s
  where s.slug = target_slug
    and s.paused_at is not null
    and exists (select 1 from public.publications p where p.site_id = s.id);
$$;

revoke all on function public.public_site_state(text) from public;
grant execute on function public.public_site_state(text) to anon, authenticated;

drop policy if exists publications_public_read on public.publications;
create policy publications_public_read
  on public.publications
  for select
  to anon, authenticated
  using (status = 'active' and public.site_is_live(site_id));

drop policy if exists publications_member_read on public.publications;
create policy publications_member_read
  on public.publications
  for select
  to authenticated
  using (site_id in (select private.accessible_site_ids()));

drop policy if exists publication_releases_public_read on public.publication_releases;
create policy publication_releases_public_read
  on public.publication_releases
  for select
  to anon, authenticated
  using (public.site_is_live(site_id));

drop policy if exists publication_releases_member_read on public.publication_releases;
create policy publication_releases_member_read
  on public.publication_releases
  for select
  to authenticated
  using (site_id in (select private.accessible_site_ids()));

drop policy if exists city_listings_public_read on public.city_listings;
create policy city_listings_public_read
  on public.city_listings
  for select
  to anon, authenticated
  using (public.site_is_live(site_id));

-- 4. Publicação congelada durante a pausa: "Retomar" volta ao mesmo artifact_hash.
create or replace function private.block_paused_publication_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.sites s
    where s.id = new.site_id and s.paused_at is not null
  ) then
    raise exception using errcode = '55000', message = 'SITE_PAUSED';
  end if;
  return new;
end;
$$;

revoke all on function private.block_paused_publication_write() from public, anon, authenticated;

drop trigger if exists publications_block_paused on public.publications;
create trigger publications_block_paused
before insert or update on public.publications
for each row execute function private.block_paused_publication_write();

-- 5. Resumo do impacto mostrado no diálogo de confirmação.
create or replace function private.site_lifecycle_snapshot(target_site uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', s.slug,
    'pausedAt', s.paused_at,
    'archivedAt', s.archived_at,
    'restorableUntil', s.archived_at + interval '90 days',
    'draftRevision', (select d.revision from public.drafts d where d.site_id = s.id),
    'publication', (
      select jsonb_build_object(
        'revision', p.revision,
        'artifactHash', p.artifact_hash,
        'publishedAt', p.published_at,
        'itemCount', jsonb_array_length(p.menu->'items')
      )
      from public.publications p where p.site_id = s.id
    ),
    'releaseCount', (select count(*) from public.publication_releases r where r.site_id = s.id),
    'memberCount', (select count(*) from public.site_memberships m where m.site_id = s.id),
    'domains', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', cd.id, 'hostname', cd.hostname, 'status', cd.status)
        order by cd.hostname
      )
      from public.custom_domains cd where cd.site_id = s.id
    ), '[]'::jsonb)
  )
  from public.sites s
  where s.id = target_site;
$$;

revoke all on function private.site_lifecycle_snapshot(uuid) from public, anon, authenticated;

create or replace function public.read_site_lifecycle(target_site uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.user_site_role(target_site) is null then
    raise exception using errcode = '42501', message = 'SITE_NOT_FOUND';
  end if;
  return private.site_lifecycle_snapshot(target_site);
end;
$$;

revoke all on function public.read_site_lifecycle(uuid) from public, anon;
grant execute on function public.read_site_lifecycle(uuid) to authenticated;

-- 6. Ações. Dono ou admin pausam e retomam; só o dono arquiva, restaura e exclui.
create or replace function private.lifecycle_audit_summary(snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'slug', snapshot->>'slug',
    'artifactHash', snapshot#>>'{publication,artifactHash}',
    'publicationRevision', snapshot#>'{publication,revision}',
    'draftRevision', snapshot->'draftRevision',
    'releaseCount', snapshot->'releaseCount',
    'domainCount', jsonb_array_length(coalesce(snapshot->'domains', '[]'::jsonb))
  ));
$$;

revoke all on function private.lifecycle_audit_summary(jsonb) from public, anon, authenticated;

create or replace function public.pause_site(target_site uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
begin
  if not private.has_site_role(target_site, array['owner', 'admin']) then
    raise exception using errcode = '42501', message = 'FORBIDDEN_SITE_ROLE';
  end if;
  update public.sites set paused_at = now()
  where id = target_site and paused_at is null;
  if not found then
    raise exception using errcode = '55000', message = 'SITE_ALREADY_PAUSED';
  end if;
  snapshot := private.site_lifecycle_snapshot(target_site);
  perform private.record_audit_log(
    target_site, 'pause', 'site', target_site::text, private.lifecycle_audit_summary(snapshot)
  );
  return snapshot;
end;
$$;

create or replace function public.resume_site(target_site uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
begin
  if not private.has_site_role(target_site, array['owner', 'admin']) then
    raise exception using errcode = '42501', message = 'FORBIDDEN_SITE_ROLE';
  end if;
  if exists (select 1 from public.sites where id = target_site and archived_at is not null) then
    raise exception using errcode = '55000', message = 'SITE_ARCHIVED';
  end if;
  update public.sites set paused_at = null
  where id = target_site and paused_at is not null;
  if not found then
    raise exception using errcode = '55000', message = 'SITE_NOT_PAUSED';
  end if;
  snapshot := private.site_lifecycle_snapshot(target_site);
  perform private.record_audit_log(
    target_site, 'resume', 'site', target_site::text, private.lifecycle_audit_summary(snapshot)
  );
  return snapshot;
end;
$$;

create or replace function public.archive_site(target_site uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
begin
  if not private.has_site_role(target_site, array['owner']) then
    raise exception using errcode = '42501', message = 'FORBIDDEN_SITE_ROLE';
  end if;
  update public.sites set archived_at = now(), paused_at = coalesce(paused_at, now())
  where id = target_site and archived_at is null;
  if not found then
    raise exception using errcode = '55000', message = 'SITE_ALREADY_ARCHIVED';
  end if;
  snapshot := private.site_lifecycle_snapshot(target_site);
  perform private.record_audit_log(
    target_site, 'archive', 'site', target_site::text, private.lifecycle_audit_summary(snapshot)
  );
  return snapshot;
end;
$$;

create or replace function public.restore_site(target_site uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
begin
  if not private.has_site_role(target_site, array['owner']) then
    raise exception using errcode = '42501', message = 'FORBIDDEN_SITE_ROLE';
  end if;
  if not exists (select 1 from public.sites where id = target_site and archived_at is not null) then
    raise exception using errcode = '55000', message = 'SITE_NOT_ARCHIVED';
  end if;
  update public.sites set archived_at = null
  where id = target_site and archived_at > now() - interval '90 days';
  if not found then
    raise exception using errcode = '55000', message = 'RESTORE_WINDOW_EXPIRED';
  end if;
  snapshot := private.site_lifecycle_snapshot(target_site);
  perform private.record_audit_log(
    target_site, 'restore', 'site', target_site::text, private.lifecycle_audit_summary(snapshot)
  );
  return snapshot;
end;
$$;

-- A exclusão apaga a vitrine em cascata; o registro fica com site_id nulo para sobreviver.
create or replace function public.delete_archived_site(target_site uuid, confirm_slug text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.sites;
  snapshot jsonb;
begin
  if not private.has_site_role(target_site, array['owner']) then
    raise exception using errcode = '42501', message = 'FORBIDDEN_SITE_ROLE';
  end if;
  select * into target from public.sites where id = target_site for update;
  if target.archived_at is null then
    raise exception using errcode = '55000', message = 'SITE_NOT_ARCHIVED';
  end if;
  if confirm_slug is distinct from target.slug then
    raise exception using errcode = '22023', message = 'CONFIRMATION_MISMATCH';
  end if;
  if exists (select 1 from public.custom_domains where site_id = target_site) then
    raise exception using errcode = '55000', message = 'DOMAINS_CONNECTED';
  end if;
  snapshot := private.site_lifecycle_snapshot(target_site);
  perform private.record_audit_log(
    null, 'delete', 'site', target_site::text,
    private.lifecycle_audit_summary(snapshot) || jsonb_build_object('archivedAt', target.archived_at)
  );
  perform set_config('vitrine.deleting_site', target_site::text, true);
  delete from public.sites where id = target_site;
  perform set_config('vitrine.deleting_site', '', true);
  return true;
end;
$$;

revoke all on function public.pause_site(uuid) from public, anon;
revoke all on function public.resume_site(uuid) from public, anon;
revoke all on function public.archive_site(uuid) from public, anon;
revoke all on function public.restore_site(uuid) from public, anon;
revoke all on function public.delete_archived_site(uuid, text) from public, anon;
grant execute on function public.pause_site(uuid) to authenticated;
grant execute on function public.resume_site(uuid) to authenticated;
grant execute on function public.archive_site(uuid) to authenticated;
grant execute on function public.restore_site(uuid) to authenticated;
grant execute on function public.delete_archived_site(uuid, text) to authenticated;

-- A exclusão em cascata remove também vínculos legados com papel owner.
create or replace function private.protect_site_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.role = 'owner'
    and current_setting('vitrine.deleting_site', true) is distinct from old.site_id::text then
    raise exception 'CANNOT_MODIFY_OWNER';
  end if;
  if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then
    raise exception 'CANNOT_MODIFY_OWNER';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function private.protect_site_owner() from public, anon, authenticated;

create or replace function private.audit_membership_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  membership public.site_memberships := coalesce(new, old);
begin
  if auth.uid() is not null
    and current_setting('vitrine.deleting_site', true) is distinct from membership.site_id::text
    and exists (select 1 from public.sites where id = membership.site_id) then
    perform private.record_audit_log(
      membership.site_id, lower(tg_op), 'membership', membership.user_id::text,
      jsonb_build_object('role', membership.role)
    );
  end if;
  return membership;
end;
$$;

revoke all on function private.audit_membership_change() from public, anon, authenticated;

-- 7. Quarentena do endereço desconectado: outra vitrine não o reivindica por 30 dias.
create table if not exists private.custom_domain_quarantine (
  hostname text primary key,
  site_id uuid not null,
  released_at timestamptz not null default now(),
  quarantined_until timestamptz not null,
  audit_log_id uuid null
);

revoke all on private.custom_domain_quarantine from public, anon, authenticated;

create or replace function private.quarantine_released_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.custom_domain_quarantine (hostname, site_id, released_at, quarantined_until)
  values (old.hostname, old.site_id, now(), now() + interval '30 days')
  on conflict (hostname) do update set
    site_id = excluded.site_id,
    released_at = excluded.released_at,
    quarantined_until = excluded.quarantined_until,
    audit_log_id = null;
  return old;
end;
$$;

revoke all on function private.quarantine_released_domain() from public, anon, authenticated;

drop trigger if exists custom_domains_quarantine_release on public.custom_domains;
create trigger custom_domains_quarantine_release
after delete on public.custom_domains
for each row execute function private.quarantine_released_domain();

create or replace function private.enforce_domain_quarantine()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from private.custom_domain_quarantine q
    where q.hostname = new.hostname
      and q.site_id <> new.site_id
      and q.quarantined_until > now()
  ) then
    raise exception using errcode = '55000', message = 'HOSTNAME_QUARANTINED';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_domain_quarantine() from public, anon, authenticated;

drop trigger if exists custom_domains_enforce_quarantine on public.custom_domains;
create trigger custom_domains_enforce_quarantine
before insert on public.custom_domains
for each row execute function private.enforce_domain_quarantine();

-- O Worker remove o domínio com a chave de serviço; a auditoria usa a sessão de quem pediu.
create or replace function public.record_domain_disconnect(target_site uuid, target_hostname text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  released private.custom_domain_quarantine;
  log_id uuid;
begin
  if not private.has_site_role(target_site, array['owner', 'admin']) then
    raise exception using errcode = '42501', message = 'FORBIDDEN_SITE_ROLE';
  end if;
  select * into released from private.custom_domain_quarantine q
  where q.hostname = target_hostname and q.site_id = target_site
    and q.audit_log_id is null and q.released_at > now() - interval '10 minutes'
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'DOMAIN_NOT_RELEASED';
  end if;
  log_id := private.record_audit_log(
    target_site, 'domain_disconnect', 'custom_domain', target_hostname,
    jsonb_build_object('hostname', target_hostname, 'quarantinedUntil', released.quarantined_until)
  );
  update private.custom_domain_quarantine set audit_log_id = log_id where hostname = target_hostname;
  return jsonb_build_object('hostname', target_hostname, 'quarantinedUntil', released.quarantined_until);
end;
$$;

revoke all on function public.record_domain_disconnect(uuid, text) from public, anon;
grant execute on function public.record_domain_disconnect(uuid, text) to authenticated;

-- 8. Visão geral da plataforma: vitrines arquivadas saem da contagem principal.
create or replace function public.read_platform_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ADMIN';
  end if;
  return jsonb_build_object(
    'databaseBytes', pg_database_size(current_database()),
    'databaseLimitBytes', 500000000,
    'siteCount', (select count(*) from public.sites where archived_at is null),
    'pausedSiteCount', (select count(*) from public.sites where paused_at is not null and archived_at is null),
    'archivedSiteCount', (select count(*) from public.sites where archived_at is not null),
    'assetCount', (select count(*) from public.assets where upload_state = 'ready'),
    'activeDomainCount', (select count(*) from public.custom_domains where status = 'active'),
    'reservedDomainCount', (select reserved from private.custom_domain_quota),
    'domainLimit', 95
  );
end;
$$;

revoke all on function public.read_platform_overview() from public, anon;
grant execute on function public.read_platform_overview() to authenticated;

commit;
