-- Persistent public storefront snapshots and immutable release history.
-- Append-only migration: never modify previous migrations.
begin;

create table if not exists public.publications (
  site_id uuid primary key references public.sites(id) on delete cascade,
  slug text not null unique check (
    length(slug) between 3 and 40
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and slug not in (
      'admin', 'api', 'www', 'app', 'auth',
      'portal', 'assets', 'data', 'login', 'logout'
    )
  ),
  revision integer not null check (revision > 0),
  status text not null default 'active' check (status in ('active')),
  artifact_hash text not null check (artifact_hash ~ '^[a-f0-9]{64}$'),
  menu jsonb not null check (
    jsonb_typeof(menu) = 'object'
    and octet_length(menu::text) <= 262144
    and menu->>'slug' = slug
    and menu->>'template' = 'pizzeria-v1'
    and menu->'schemaVersion' = '1'::jsonb
    and menu->>'currency' = 'BRL'
    and jsonb_typeof(menu->'items') = 'array'
    and jsonb_array_length(menu->'items') between 1 and 20
    and jsonb_typeof(menu->'categories') = 'array'
    and not (menu ?| array[
      'owner_user_id', 'ownerUserId', 'ownerEmail', 'email',
      'userId', 'user_id', 'siteId', 'site_id',
      'session', 'token', 'accessToken', 'refreshToken',
      'service_role', 'serviceRoleKey', 'internalCost', 'internalNotes',
      'active', 'available', 'password', 'secret'
    ])
  ),
  published_at timestamptz not null default now()
);

create index if not exists publications_slug_status_idx
  on public.publications(slug, status);

create table if not exists public.publication_releases (
  slug text not null check (
    length(slug) between 3 and 40
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  artifact_hash text not null check (artifact_hash ~ '^[a-f0-9]{64}$'),
  site_id uuid not null references public.sites(id) on delete cascade,
  revision integer not null check (revision > 0),
  menu jsonb not null check (
    jsonb_typeof(menu) = 'object'
    and octet_length(menu::text) <= 262144
    and menu->>'slug' = slug
    and menu->>'template' = 'pizzeria-v1'
    and menu->'schemaVersion' = '1'::jsonb
    and menu->>'currency' = 'BRL'
    and jsonb_typeof(menu->'items') = 'array'
    and jsonb_array_length(menu->'items') between 1 and 20
    and jsonb_typeof(menu->'categories') = 'array'
    and not (menu ?| array[
      'owner_user_id', 'ownerUserId', 'ownerEmail', 'email',
      'userId', 'user_id', 'siteId', 'site_id',
      'session', 'token', 'accessToken', 'refreshToken',
      'service_role', 'serviceRoleKey', 'internalCost', 'internalNotes',
      'active', 'available', 'password', 'secret'
    ])
  ),
  published_at timestamptz not null default now(),
  primary key (slug, artifact_hash)
);

create or replace function private.archive_publication_release()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.publication_releases (
    slug,
    artifact_hash,
    site_id,
    revision,
    menu,
    published_at
  )
  values (
    new.slug,
    new.artifact_hash,
    new.site_id,
    new.revision,
    new.menu,
    new.published_at
  )
  on conflict (slug, artifact_hash) do update
    set revision = excluded.revision,
        menu = excluded.menu,
        published_at = excluded.published_at;
  return new;
end;
$$;

revoke all on function private.archive_publication_release() from public, anon, authenticated;

drop trigger if exists publications_archive_release on public.publications;
create trigger publications_archive_release
after insert or update on public.publications
for each row execute function private.archive_publication_release();

create or replace function private.project_public_menu(
  site_slug text,
  site_name text,
  site_template text,
  draft_content jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_whatsapp text;
  v_name text;
  v_template text;
  v_flat_items jsonb := '[]'::jsonb;
  v_categories jsonb := '[]'::jsonb;
  v_unassigned_items jsonb := '[]'::jsonb;
  v_cat jsonb;
  v_cat_idx integer := 0;
  v_cat_name text;
  v_cat_id text;
  v_cat_items jsonb;
  v_item jsonb;
  v_item_idx integer := 0;
  v_item_id text;
  v_item_name text;
  v_item_desc text;
  v_item_price bigint;
  v_public_item jsonb;
  v_seen_item_ids text[] := array[]::text[];
  v_seen_cat_ids text[] := array[]::text[];
begin
  if draft_content is null or jsonb_typeof(draft_content) <> 'object' then
    return null;
  end if;

  v_template := coalesce(
    nullif(trim(draft_content->>'template'), ''),
    nullif(trim(site_template), ''),
    'pizzeria-v1'
  );
  if v_template <> 'pizzeria-v1' then
    return null;
  end if;

  v_whatsapp := trim(coalesce(draft_content->>'whatsapp', ''));
  if v_whatsapp !~ '^[1-9][0-9]{7,14}$' then
    return null;
  end if;

  v_name := trim(coalesce(
    nullif(trim(draft_content->>'businessName'), ''),
    nullif(trim(draft_content->>'name'), ''),
    nullif(trim(site_name), '')
  ));
  if v_name is null or length(v_name) < 1 or length(v_name) > 160 then
    return null;
  end if;

  if jsonb_typeof(draft_content->'items') = 'array' then
    for v_item in select value from jsonb_array_elements(draft_content->'items')
    loop
      if jsonb_typeof(v_item) <> 'object' then
        continue;
      end if;
      v_item_idx := v_item_idx + 1;
      if coalesce((v_item->>'active')::boolean, true) is not true
         or coalesce((v_item->>'available')::boolean, true) is not true then
        continue;
      end if;
      if jsonb_typeof(v_item->'priceCents') <> 'number'
         or (v_item->>'priceCents') !~ '^[1-9][0-9]*$' then
        return null;
      end if;
      v_item_price := (v_item->>'priceCents')::bigint;
      v_item_id := coalesce(nullif(trim(v_item->>'id'), ''), 'item-' || v_item_idx::text);
      if v_item_id = any(v_seen_item_ids) then
        continue;
      end if;
      v_item_name := coalesce(nullif(trim(v_item->>'name'), ''), 'Item ' || v_item_idx::text);
      v_item_desc := nullif(trim(coalesce(v_item->>'description', '')), '');
      if v_item_desc is not null and length(v_item_desc) <= 280 then
        v_public_item := jsonb_build_object(
          'id', v_item_id,
          'name', v_item_name,
          'description', v_item_desc,
          'priceCents', v_item_price
        );
      else
        v_public_item := jsonb_build_object(
          'id', v_item_id,
          'name', v_item_name,
          'priceCents', v_item_price
        );
      end if;
      v_seen_item_ids := array_append(v_seen_item_ids, v_item_id);
      v_flat_items := v_flat_items || jsonb_build_array(v_public_item);
      v_unassigned_items := v_unassigned_items || jsonb_build_array(v_public_item);
    end loop;
  end if;

  if jsonb_typeof(draft_content->'categories') = 'array' then
    for v_cat in select value from jsonb_array_elements(draft_content->'categories')
    loop
      v_cat_idx := v_cat_idx + 1;
      if jsonb_typeof(v_cat) <> 'object' then
        continue;
      end if;
      v_cat_name := coalesce(nullif(trim(v_cat->>'name'), ''), 'Categoria ' || v_cat_idx::text);
      v_cat_id := regexp_replace(
        lower(coalesce(nullif(trim(v_cat->>'id'), ''), v_cat_name)),
        '[^a-z0-9]+',
        '-',
        'g'
      );
      v_cat_id := regexp_replace(v_cat_id, '^-+|-+$', '', 'g');
      if v_cat_id = '' then
        v_cat_id := 'categoria-' || v_cat_idx::text;
      end if;
      if v_cat_id = any(v_seen_cat_ids) then
        v_cat_id := v_cat_id || '-' || v_cat_idx::text;
      end if;

      v_cat_items := '[]'::jsonb;
      if jsonb_typeof(v_cat->'items') = 'array' then
        for v_item in select value from jsonb_array_elements(v_cat->'items')
        loop
          if jsonb_typeof(v_item) <> 'object' then
            continue;
          end if;
          v_item_idx := v_item_idx + 1;
          if coalesce((v_item->>'active')::boolean, true) is not true
             or coalesce((v_item->>'available')::boolean, true) is not true then
            continue;
          end if;
          if jsonb_typeof(v_item->'priceCents') <> 'number'
             or (v_item->>'priceCents') !~ '^[1-9][0-9]*$' then
            return null;
          end if;
          v_item_price := (v_item->>'priceCents')::bigint;
          v_item_id := coalesce(nullif(trim(v_item->>'id'), ''), 'item-' || v_item_idx::text);
          if v_item_id = any(v_seen_item_ids) then
            continue;
          end if;
          v_item_name := coalesce(nullif(trim(v_item->>'name'), ''), 'Item ' || v_item_idx::text);
          v_item_desc := nullif(trim(coalesce(v_item->>'description', '')), '');
          if v_item_desc is not null and length(v_item_desc) <= 280 then
            v_public_item := jsonb_build_object(
              'id', v_item_id,
              'name', v_item_name,
              'description', v_item_desc,
              'priceCents', v_item_price
            );
          else
            v_public_item := jsonb_build_object(
              'id', v_item_id,
              'name', v_item_name,
              'priceCents', v_item_price
            );
          end if;
          v_seen_item_ids := array_append(v_seen_item_ids, v_item_id);
          v_flat_items := v_flat_items || jsonb_build_array(v_public_item);
          v_cat_items := v_cat_items || jsonb_build_array(v_public_item);
        end loop;
      end if;

      if jsonb_array_length(v_cat_items) > 0 then
        v_seen_cat_ids := array_append(v_seen_cat_ids, v_cat_id);
        v_categories := v_categories || jsonb_build_array(
          jsonb_build_object(
            'id', v_cat_id,
            'name', v_cat_name,
            'items', v_cat_items
          )
        );
      end if;
    end loop;
  end if;

  if jsonb_array_length(v_unassigned_items) > 0 then
    v_categories := v_categories || jsonb_build_array(
      jsonb_build_object(
        'id', case when jsonb_array_length(v_categories) = 0 then 'cardapio' else 'outros-itens' end,
        'name', case when jsonb_array_length(v_categories) = 0 then 'Cardápio' else 'Outros Itens' end,
        'items', v_unassigned_items
      )
    );
  end if;

  if jsonb_array_length(v_flat_items) < 1 or jsonb_array_length(v_flat_items) > 20 then
    return null;
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'template', v_template,
    'slug', site_slug,
    'name', v_name,
    'whatsapp', v_whatsapp,
    'currency', 'BRL',
    'items', v_flat_items,
    'categories', v_categories
  );
end;
$$;

revoke all on function private.project_public_menu(text, text, text, jsonb) from public, anon, authenticated;

-- Backfill existing published storefronts already present in sites + drafts when migration runs.
insert into public.publications (site_id, slug, revision, status, artifact_hash, menu, published_at)
select
  s.id,
  s.slug,
  d.revision,
  'active',
  encode(pg_catalog.sha256(convert_to(projected.menu::text, 'UTF8')), 'hex'),
  projected.menu,
  coalesce(d.updated_at, s.updated_at, s.created_at, now())
from public.sites s
join public.drafts d on d.site_id = s.id
cross join lateral (
  select private.project_public_menu(s.slug, s.name, s.template, d.content) as menu
) projected
where projected.menu is not null
on conflict (site_id) do nothing;

alter table public.publications enable row level security;
alter table public.publication_releases enable row level security;

revoke all on public.publications, public.publication_releases from public, anon, authenticated;

grant select (slug, revision, status, artifact_hash, menu, published_at)
  on public.publications to anon;
grant select (slug, revision, artifact_hash, menu, published_at)
  on public.publication_releases to anon;

grant select (site_id, slug, revision, status, artifact_hash, menu, published_at)
  on public.publications to authenticated;
grant select (site_id, slug, revision, artifact_hash, menu, published_at)
  on public.publication_releases to authenticated;
grant insert (site_id, slug, revision, status, artifact_hash, menu, published_at)
  on public.publications to authenticated;
grant update (slug, revision, status, artifact_hash, menu, published_at)
  on public.publications to authenticated;

drop policy if exists publications_public_read on public.publications;
create policy publications_public_read
  on public.publications
  for select
  to anon, authenticated
  using (status = 'active');

drop policy if exists publication_releases_public_read on public.publication_releases;
create policy publication_releases_public_read
  on public.publication_releases
  for select
  to anon, authenticated
  using (true);

drop policy if exists publications_owner_insert on public.publications;
create policy publications_owner_insert
  on public.publications
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.sites s
      where s.id = site_id
        and s.owner_user_id = (select auth.uid())
        and s.slug = slug
    )
  );

drop policy if exists publications_owner_update on public.publications;
create policy publications_owner_update
  on public.publications
  for update
  to authenticated
  using (
    exists (
      select 1 from public.sites s
      where s.id = site_id
        and s.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.sites s
      where s.id = site_id
        and s.owner_user_id = (select auth.uid())
        and s.slug = slug
    )
  );

commit;
