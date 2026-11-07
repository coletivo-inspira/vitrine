-- Apply as the migration administrator, never from a browser or public endpoint.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  slug text not null unique check (
    length(slug) between 1 and 63 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and slug not in ('admin','api','www','app','auth')
  ),
  name text not null check (length(trim(name)) between 1 and 160),
  template text not null default 'pizzeria-v1' check (template = 'pizzeria-v1'),
  created_at timestamptz not null default now()
);
create index sites_owner_idx on public.sites(owner_user_id);

create table public.site_memberships (
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  primary key (site_id, user_id)
);
create index memberships_user_idx on public.site_memberships(user_id, site_id);

create table public.drafts (
  site_id uuid primary key references public.sites(id) on delete cascade,
  content jsonb not null default '{}' check (
    jsonb_typeof(content) = 'object' and octet_length(content::text) <= 262144
  ),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

-- Migration owner must bypass RLS; fixed path and session identity avoid policy cycles.
create function private.accessible_site_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select s.id from public.sites s where s.owner_user_id = (select auth.uid())
  union
  select m.site_id from public.site_memberships m where m.user_id = (select auth.uid());
$$;
revoke all on function private.accessible_site_ids() from public, anon;
grant execute on function private.accessible_site_ids() to authenticated;

create function private.bump_draft_revision()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.bump_draft_revision() from public, anon, authenticated;
create trigger drafts_revision before update on public.drafts
for each row execute function private.bump_draft_revision();

alter table public.sites enable row level security;
alter table public.site_memberships enable row level security;
alter table public.drafts enable row level security;

-- Reset default Supabase table privileges. Membership mutations stay administrative.
revoke all on public.sites, public.site_memberships, public.drafts from public, anon, authenticated;
grant select on public.sites, public.site_memberships, public.drafts to authenticated;
grant insert (owner_user_id,slug,name,template) on public.sites to authenticated;
grant update (name) on public.sites to authenticated;
grant insert (site_id,content) on public.drafts to authenticated;
grant update (content) on public.drafts to authenticated;

create policy sites_read on public.sites for select to authenticated
using (owner_user_id = (select auth.uid()) or id in (select private.accessible_site_ids()));
create policy sites_create on public.sites for insert to authenticated
with check (owner_user_id = (select auth.uid()));
create policy sites_update on public.sites for update to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

-- No ownership lookup in this policy: avoids cycles with sites_read.
create policy memberships_read on public.site_memberships for select to authenticated
using (user_id = (select auth.uid()));

create policy drafts_read on public.drafts for select to authenticated
using (site_id in (select private.accessible_site_ids()));
create policy drafts_create on public.drafts for insert to authenticated
with check (exists (
  select 1 from public.sites s where s.id = site_id and s.owner_user_id = (select auth.uid())
));
create policy drafts_update on public.drafts for update to authenticated
using (exists (
  select 1 from public.sites s where s.id = site_id and s.owner_user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.sites s where s.id = site_id and s.owner_user_id = (select auth.uid())
));

commit;
