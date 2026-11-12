-- Spec 012 (Vitrine por cidade): public, derived listing of offer/donation/trade
-- items from active publications whose public manifest carries an opted-in
-- `locality`. Rows are rebuilt by trigger on every publish, rollback or quick
-- toggle, and vanish with the site (on delete cascade).
-- No backfill: `locality` did not exist in any manifest before this migration.
-- Append-only migration: never modify previous migrations.
begin;

alter table public.sites
  drop constraint if exists sites_slug_not_por_cidade;
alter table public.sites
  add constraint sites_slug_not_por_cidade check (slug <> 'por-cidade') not valid;

create table if not exists public.city_listings (
  site_id uuid not null references public.sites(id) on delete cascade,
  item_position smallint not null check (item_position between 1 and 999),
  city_slug text not null check (
    length(city_slug) between 4 and 80
    and city_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*-(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)$'
  ),
  city text not null check (length(city) between 2 and 60),
  uf text not null check (uf in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
    'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  )),
  site_slug text not null check (site_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  site_name text not null check (length(site_name) between 1 and 160),
  item_id text not null check (length(item_id) between 1 and 64),
  item_name text not null check (length(item_name) between 1 and 160),
  price_mode text not null check (price_mode in ('offer', 'donation', 'trade')),
  price_cents bigint not null default 0 check (price_cents >= 0),
  description text check (description is null or length(description) <= 280),
  conditions text check (conditions is null or length(conditions) <= 240),
  trade_for text check (trade_for is null or length(trade_for) <= 240),
  image_url text check (image_url is null or (length(image_url) <= 2048 and image_url ~ '^https://')),
  published_at timestamptz not null,
  sort_key text not null unique check (sort_key ~ '^[0-9]{16}~[a-z0-9]+(-[a-z0-9]+)*~[0-9]{3}$'),
  primary key (site_id, item_position),
  constraint city_listings_slug_matches_uf check (right(city_slug, 3) = '-' || lower(uf))
);

create index if not exists city_listings_city_sort_idx
  on public.city_listings (city_slug, sort_key desc);
create index if not exists city_listings_city_mode_sort_idx
  on public.city_listings (city_slug, price_mode, sort_key desc);

create or replace function private.refresh_city_listings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locality jsonb;
  v_city text;
  v_uf text;
  v_city_slug text;
  v_site_name text;
  v_epoch text;
begin
  delete from public.city_listings where site_id = new.site_id;

  if new.status <> 'active' then
    return new;
  end if;

  v_locality := new.menu->'locality';
  if v_locality is null or jsonb_typeof(v_locality) <> 'object' then
    return new;
  end if;

  v_city := btrim(coalesce(v_locality->>'city', ''));
  v_uf := upper(btrim(coalesce(v_locality->>'uf', '')));
  v_city_slug := coalesce(v_locality->>'citySlug', '');
  v_site_name := left(btrim(coalesce(new.menu->>'name', '')), 160);

  -- Invalid data never blocks a publication: the site is simply not listed.
  if length(v_city) not between 2 and 60
     or v_city ~ '[<>"&]'
     or v_uf not in (
       'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
       'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
     )
     or length(v_city_slug) not between 4 and 80
     or v_city_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or right(v_city_slug, 3) <> '-' || lower(v_uf)
     or v_site_name = '' then
    return new;
  end if;

  v_epoch := lpad(floor(extract(epoch from new.published_at) * 1000000)::bigint::text, 16, '0');

  insert into public.city_listings (
    site_id, item_position, city_slug, city, uf, site_slug, site_name,
    item_id, item_name, price_mode, price_cents, description, conditions,
    trade_for, image_url, published_at, sort_key
  )
  select
    new.site_id,
    e.ord::smallint,
    v_city_slug,
    v_city,
    v_uf,
    new.slug,
    v_site_name,
    btrim(e.item->>'id'),
    left(btrim(e.item->>'name'), 160),
    e.item->>'priceMode',
    case
      when jsonb_typeof(e.item->'priceCents') = 'number' and (e.item->>'priceCents') ~ '^[0-9]{1,12}$'
        then (e.item->>'priceCents')::bigint
      else 0
    end,
    nullif(left(btrim(coalesce(e.item->>'description', '')), 280), ''),
    nullif(left(btrim(coalesce(e.item->>'conditions', '')), 240), ''),
    nullif(left(btrim(coalesce(e.item->>'tradeFor', '')), 240), ''),
    case
      when (e.item->>'imageUrl') ~ '^https://' and length(e.item->>'imageUrl') <= 2048
        then e.item->>'imageUrl'
    end,
    new.published_at,
    v_epoch || '~' || new.slug || '~' || lpad((999 - e.ord)::text, 3, '0')
  from jsonb_array_elements(
    case when jsonb_typeof(new.menu->'items') = 'array' then new.menu->'items' else '[]'::jsonb end
  ) with ordinality as e(item, ord)
  where jsonb_typeof(e.item) = 'object'
    and e.ord <= 999
    and e.item->>'priceMode' in ('offer', 'donation', 'trade')
    and length(btrim(coalesce(e.item->>'id', ''))) between 1 and 64
    and length(btrim(coalesce(e.item->>'name', ''))) >= 1;

  return new;
end;
$$;

revoke all on function private.refresh_city_listings() from public, anon, authenticated;

drop trigger if exists publications_refresh_city_listings on public.publications;
create trigger publications_refresh_city_listings
after insert or update on public.publications
for each row execute function private.refresh_city_listings();

create or replace view public.city_listing_cities
with (security_invoker = true)
as
select
  city_slug,
  (array_agg(city order by sort_key desc))[1] as city,
  min(uf) as uf,
  count(*) filter (where price_mode = 'offer') as offer_count,
  count(*) filter (where price_mode = 'donation') as donation_count,
  count(*) filter (where price_mode = 'trade') as trade_count,
  count(*) as total_count
from public.city_listings
group by city_slug;

alter table public.city_listings enable row level security;

revoke all on public.city_listings from public, anon, authenticated;
revoke all on public.city_listing_cities from public, anon, authenticated;

-- site_id stays private: anon/authenticated only read the public projection.
grant select (
  city_slug, city, uf, site_slug, site_name, item_id, item_position, item_name,
  price_mode, price_cents, description, conditions, trade_for, image_url,
  published_at, sort_key
) on public.city_listings to anon, authenticated;
grant select on public.city_listing_cities to anon, authenticated;

drop policy if exists city_listings_public_read on public.city_listings;
create policy city_listings_public_read
  on public.city_listings
  for select
  to anon, authenticated
  using (true);

commit;
