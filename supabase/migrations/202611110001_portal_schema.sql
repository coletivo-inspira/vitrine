-- Incremental portal schema constraints and helpers (Phase 3).
-- Append-only migration: never modify 202611070001_site_access.sql.
begin;

alter table public.sites
  add column if not exists updated_at timestamptz not null default now();

alter table public.sites
  drop constraint if exists sites_portal_slug_check;

alter table public.sites
  add constraint sites_portal_slug_check check (
    length(slug) between 3 and 40
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and slug not in (
      'admin', 'api', 'www', 'app', 'auth',
      'portal', 'assets', 'data', 'login', 'logout'
    )
  );

create or replace function private.touch_site_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_site_updated_at() from public, anon, authenticated;

drop trigger if exists sites_touch_updated_at on public.sites;
create trigger sites_touch_updated_at
before update on public.sites
for each row execute function private.touch_site_updated_at();

alter table public.drafts
  drop constraint if exists drafts_portal_content_check;

alter table public.drafts
  add constraint drafts_portal_content_check check (
    jsonb_typeof(content) = 'object'
    and octet_length(content::text) <= 262144
    and (not (content ? 'template') or content->>'template' = 'pizzeria-v1')
    and (not (content ? 'schemaVersion') or content->'schemaVersion' = '1'::jsonb)
    and (not (content ? 'categories') or jsonb_typeof(content->'categories') = 'array')
    and (not (content ? 'items') or (
      jsonb_typeof(content->'items') = 'array'
      and jsonb_array_length(content->'items') <= 100
    ))
  );

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
    ) then 'member'
    else null
  end;
$$;

revoke all on function private.user_site_role(uuid) from public, anon;
grant execute on function private.user_site_role(uuid) to authenticated;

alter table public.sites enable row level security;
alter table public.site_memberships enable row level security;
alter table public.drafts enable row level security;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

revoke all on public.sites, public.site_memberships, public.drafts from public, anon;

commit;
