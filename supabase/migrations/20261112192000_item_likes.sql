-- Spec 011: curtidas por item da vitrine pública.
-- One row per (site, item, anonymous visitor hash); counts are computed server-side.
-- No IP or personal data: visitor_hash is the SHA-256 of a random HttpOnly cookie token.
-- Append-only migration: never modify previous migrations.
begin;

create table if not exists public.item_likes (
  site_id uuid not null references public.sites(id) on delete cascade,
  item_key text not null check (length(trim(item_key)) between 1 and 64),
  visitor_hash text not null check (visitor_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (site_id, item_key, visitor_hash)
);

create index if not exists item_likes_site_created_idx
  on public.item_likes(site_id, created_at desc);

alter table public.item_likes enable row level security;
revoke all on public.item_likes from public, anon, authenticated;

create or replace function private.item_like_publication(target_slug text)
returns table (site_id uuid, item_ids text[])
language sql
stable
security definer
set search_path = ''
as $$
  select p.site_id,
         coalesce(
           array(
             select trim(i->>'id')
               from jsonb_array_elements(
                 case when jsonb_typeof(p.menu->'items') = 'array' then p.menu->'items' else '[]'::jsonb end
               ) as i
              where jsonb_typeof(i) = 'object'
                and nullif(trim(i->>'id'), '') is not null
           ),
           array[]::text[]
         )
    from public.publications p
   where target_slug is not null
     and p.slug = lower(trim(target_slug))
     and p.status = 'active'
   limit 1;
$$;

revoke all on function private.item_like_publication(text) from public, anon, authenticated;

create or replace function private.get_item_likes(target_slug text, visitor_key text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_site_id uuid;
  v_item_ids text[];
  v_hash text := lower(trim(coalesce(visitor_key, '')));
  v_counts jsonb;
  v_liked jsonb := '[]'::jsonb;
begin
  select l.site_id, l.item_ids
    into v_site_id, v_item_ids
    from private.item_like_publication(target_slug) l;

  if v_site_id is null then
    raise exception 'PUBLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_object_agg(c.item_key, c.total), '{}'::jsonb)
    into v_counts
    from (
      select il.item_key, count(*) as total
        from public.item_likes il
       where il.site_id = v_site_id
         and il.item_key = any(v_item_ids)
       group by il.item_key
    ) c;

  if v_hash ~ '^[a-f0-9]{64}$' then
    select coalesce(jsonb_agg(il.item_key order by il.item_key), '[]'::jsonb)
      into v_liked
      from public.item_likes il
     where il.site_id = v_site_id
       and il.visitor_hash = v_hash
       and il.item_key = any(v_item_ids);
  end if;

  return jsonb_build_object('counts', v_counts, 'liked', v_liked);
end;
$$;

revoke all on function private.get_item_likes(text, text) from public, anon, authenticated;

-- Hourly ceilings (30 per item, 150 per site) must match ITEM_LIKE_LIMITS in src/portal-validation.mjs.
create or replace function private.set_item_like(
  target_slug text,
  target_item text,
  visitor_key text,
  liked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site_id uuid;
  v_item_ids text[];
  v_item text := trim(coalesce(target_item, ''));
  v_hash text := lower(trim(coalesce(visitor_key, '')));
  v_count bigint;
begin
  if liked is null or v_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_LIKE_REQUEST' using errcode = '22023';
  end if;

  select l.site_id, l.item_ids
    into v_site_id, v_item_ids
    from private.item_like_publication(target_slug) l;

  if v_site_id is null then
    raise exception 'PUBLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_item = '' or length(v_item) > 64 or not (v_item = any(v_item_ids)) then
    raise exception 'INVALID_LIKE_ITEM' using errcode = '23514';
  end if;

  if liked then
    if not exists (
      select 1 from public.item_likes il
       where il.site_id = v_site_id and il.item_key = v_item and il.visitor_hash = v_hash
    ) then
      if (
        select count(*) from public.item_likes il
         where il.site_id = v_site_id and il.item_key = v_item
           and il.created_at > now() - interval '1 hour'
      ) >= 30 or (
        select count(*) from public.item_likes il
         where il.site_id = v_site_id
           and il.created_at > now() - interval '1 hour'
      ) >= 150 then
        raise exception 'LIKE_RATE_LIMITED' using errcode = 'PT429';
      end if;

      insert into public.item_likes (site_id, item_key, visitor_hash)
      values (v_site_id, v_item, v_hash)
      on conflict do nothing;
    end if;
  else
    delete from public.item_likes il
     where il.site_id = v_site_id and il.item_key = v_item and il.visitor_hash = v_hash;
  end if;

  select count(*) into v_count
    from public.item_likes il
   where il.site_id = v_site_id and il.item_key = v_item;

  return jsonb_build_object('itemId', v_item, 'liked', liked, 'count', v_count);
end;
$$;

revoke all on function private.set_item_like(text, text, text, boolean) from public, anon, authenticated;

create or replace function private.site_item_like_stats(target_site_id uuid, since timestamptz)
returns table (item_key text, total_likes bigint, period_likes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select il.item_key,
         count(*)::bigint,
         count(*) filter (where il.created_at >= since)::bigint
    from public.item_likes il
   where il.site_id = target_site_id
     and target_site_id in (select private.accessible_site_ids())
   group by il.item_key;
$$;

revoke all on function private.site_item_like_stats(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.get_item_likes(target_slug text, visitor_key text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_item_likes(target_slug, visitor_key);
$$;

revoke all on function public.get_item_likes(text, text) from public;
grant execute on function public.get_item_likes(text, text) to anon, authenticated;

create or replace function public.set_item_like(
  target_slug text,
  target_item text,
  visitor_key text,
  liked boolean
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.set_item_like(target_slug, target_item, visitor_key, liked);
$$;

revoke all on function public.set_item_like(text, text, text, boolean) from public;
grant execute on function public.set_item_like(text, text, text, boolean) to anon, authenticated;

create or replace function public.site_item_like_stats(target_site_id uuid, since timestamptz)
returns table (item_key text, total_likes bigint, period_likes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select s.item_key, s.total_likes, s.period_likes
    from private.site_item_like_stats(target_site_id, since) s;
$$;

revoke all on function public.site_item_like_stats(uuid, timestamptz) from public, anon;
grant execute on function public.site_item_like_stats(uuid, timestamptz) to authenticated;

commit;
