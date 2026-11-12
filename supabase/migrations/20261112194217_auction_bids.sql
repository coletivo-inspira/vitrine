-- Leilão de itens no modo lance (Spec 013): lotes, lances e bloqueios com RLS por
-- vitrine (owner/admin), canal Worker -> banco autenticado por segredo dedicado e
-- funções SECURITY DEFINER para lance, quadro público e desconsideração.
-- Os limites abaixo espelham web/assets/auction-rules.mjs.
-- Append-only migration: never modify previous migrations.
begin;

create table if not exists private.auction_settings (
  id boolean primary key default true check (id),
  bid_key_sha256 text not null check (bid_key_sha256 ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now()
);

revoke all on private.auction_settings from public, anon, authenticated;

create table if not exists public.auction_lots (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  item_id text not null check (length(item_id) between 1 and 64),
  item_name text not null check (length(item_name) between 1 and 160),
  start_cents bigint not null check (start_cents between 100 and 100000000),
  increment_cents bigint not null check (increment_cents between 100 and 1000000),
  scheduled_ends_at timestamptz not null,
  ends_at timestamptz not null,
  highest_bid_id uuid null,
  highest_cents bigint null check (highest_cents is null or highest_cents between 100 and 100000000),
  bid_count integer not null default 0 check (bid_count >= 0),
  personal_data_purged_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auction_lots_unique_term unique (site_id, item_id, scheduled_ends_at),
  constraint auction_lots_extension_check check (
    ends_at >= scheduled_ends_at
    and ends_at <= scheduled_ends_at + interval '60 minutes'
  )
);

create index if not exists auction_lots_site_item_idx
  on public.auction_lots(site_id, item_id, ends_at desc);

create table if not exists public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.auction_lots(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  amount_cents bigint not null check (amount_cents between 100 and 100000000),
  bidder_name text not null check (length(bidder_name) between 2 and 60),
  bidder_whatsapp text not null check (bidder_whatsapp ~ '^[1-9][0-9]{7,14}$'),
  visitor_key text not null check (visitor_key ~ '^[a-f0-9]{32,64}$'),
  status text not null default 'valid' check (status in ('valid', 'void')),
  void_reason text null check (void_reason is null or length(void_reason) between 3 and 200),
  voided_at timestamptz null,
  voided_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint auction_bids_void_check check (
    (status = 'valid' and void_reason is null and voided_at is null)
    or (status = 'void' and void_reason is not null and voided_at is not null)
  )
);

create index if not exists auction_bids_lot_idx
  on public.auction_bids(lot_id, created_at desc);
create index if not exists auction_bids_site_visitor_idx
  on public.auction_bids(site_id, visitor_key, created_at desc);

create table if not exists public.auction_blocks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  bidder_whatsapp text null check (bidder_whatsapp is null or bidder_whatsapp ~ '^[1-9][0-9]{7,14}$'),
  visitor_key text null check (visitor_key is null or visitor_key ~ '^[a-f0-9]{32,64}$'),
  reason text not null check (length(reason) between 3 and 200),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint auction_blocks_target_check check (bidder_whatsapp is not null or visitor_key is not null)
);

create index if not exists auction_blocks_site_idx
  on public.auction_blocks(site_id, bidder_whatsapp);

alter table public.auction_lots enable row level security;
alter table public.auction_bids enable row level security;
alter table public.auction_blocks enable row level security;

revoke all on public.auction_lots, public.auction_bids, public.auction_blocks
  from public, anon, authenticated;

grant select (
  id, site_id, item_id, item_name, start_cents, increment_cents, scheduled_ends_at,
  ends_at, highest_bid_id, highest_cents, bid_count, personal_data_purged_at,
  created_at, updated_at
) on public.auction_lots to authenticated;

grant select (
  id, lot_id, site_id, amount_cents, bidder_name, bidder_whatsapp, status,
  void_reason, voided_at, created_at
) on public.auction_bids to authenticated;

grant select (id, site_id, bidder_whatsapp, reason, created_at)
  on public.auction_blocks to authenticated;

drop policy if exists auction_lots_team_select on public.auction_lots;
create policy auction_lots_team_select
  on public.auction_lots
  for select
  to authenticated
  using (private.has_site_role(site_id, array['owner', 'admin']));

drop policy if exists auction_bids_team_select on public.auction_bids;
create policy auction_bids_team_select
  on public.auction_bids
  for select
  to authenticated
  using (private.has_site_role(site_id, array['owner', 'admin']));

drop policy if exists auction_blocks_team_select on public.auction_blocks;
create policy auction_blocks_team_select
  on public.auction_blocks
  for select
  to authenticated
  using (private.has_site_role(site_id, array['owner', 'admin']));

create or replace function private.auction_iso(value timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

revoke all on function private.auction_iso(timestamptz) from public, anon, authenticated;

create or replace function private.auction_item_terms(
  item jsonb,
  out is_auction boolean,
  out start_cents bigint,
  out increment_cents bigint,
  out scheduled_ends_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
begin
  is_auction := false;
  if item is null
     or jsonb_typeof(item) is distinct from 'object'
     or (item->>'priceMode') is distinct from 'offer'
     or jsonb_typeof(item->'auctionEndsAt') is distinct from 'string'
     or (item->>'auctionEndsAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,3})?)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    return;
  end if;

  begin
    scheduled_ends_at := (item->>'auctionEndsAt')::timestamptz;
  exception when others then
    return;
  end;

  start_cents := 0;
  if jsonb_typeof(item->'priceCents') = 'number' and (item->>'priceCents') ~ '^[0-9]{1,12}$' then
    start_cents := (item->>'priceCents')::bigint;
  end if;
  start_cents := least(greatest(start_cents, 100), 100000000);

  increment_cents := 100;
  if jsonb_typeof(item->'bidIncrementCents') = 'number'
     and (item->>'bidIncrementCents') ~ '^[0-9]{1,12}$'
     and (item->>'bidIncrementCents')::bigint between 100 and 1000000 then
    increment_cents := (item->>'bidIncrementCents')::bigint;
  end if;

  is_auction := true;
end;
$$;

revoke all on function private.auction_item_terms(jsonb) from public, anon, authenticated;

create or replace function private.auction_lot_public_json(lot public.auction_lots)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'itemId', lot.item_id,
    'status', case when lot.ends_at > now() then 'open' else 'closed' end,
    'endsAt', private.auction_iso(lot.ends_at),
    'scheduledEndsAt', private.auction_iso(lot.scheduled_ends_at),
    'startCents', lot.start_cents,
    'incrementCents', lot.increment_cents,
    'currentCents', lot.highest_cents,
    'nextMinCents', case
      when lot.highest_cents is null then lot.start_cents
      else lot.highest_cents + lot.increment_cents
    end,
    'bidCount', lot.bid_count,
    'leadingRef', case
      when lot.highest_bid_id is null then null
      else left(replace(lot.highest_bid_id::text, '-', ''), 8)
    end,
    'recentBids', coalesce((
      select jsonb_agg(
        jsonb_build_object('amountCents', recent.amount_cents, 'placedAt', private.auction_iso(recent.created_at))
        order by recent.created_at desc
      )
      from (
        select b.amount_cents, b.created_at
        from public.auction_bids b
        where b.lot_id = lot.id and b.status = 'valid'
        order by b.created_at desc
        limit 5
      ) recent
    ), '[]'::jsonb)
  );
$$;

revoke all on function private.auction_lot_public_json(public.auction_lots) from public, anon, authenticated;

create or replace function private.purge_auction_personal_data(target_site uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  with expired as (
    update public.auction_lots l
       set personal_data_purged_at = now(),
           highest_bid_id = null,
           updated_at = now()
     where l.site_id = target_site
       and l.personal_data_purged_at is null
       and l.ends_at < now() - interval '90 days'
    returning l.id
  )
  delete from public.auction_bids b
   using expired e
   where b.lot_id = e.id;

  delete from public.auction_blocks k
   where k.site_id = target_site
     and k.created_at < now() - interval '180 days';
end;
$$;

revoke all on function private.purge_auction_personal_data(uuid) from public, anon, authenticated;

create or replace function private.read_auction_board(target_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_site uuid;
  v_menu jsonb;
  v_item jsonb;
  v_terms record;
  v_lot public.auction_lots;
  v_lots jsonb := '[]'::jsonb;
begin
  select p.site_id, p.menu
    into v_site, v_menu
    from public.publications p
   where p.slug = lower(trim(coalesce(target_slug, '')))
     and p.status = 'active'
   limit 1;

  if v_site is null then
    raise exception 'PUBLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if jsonb_typeof(v_menu->'items') is distinct from 'array' then
    return jsonb_build_object('serverNow', private.auction_iso(now()), 'lots', v_lots);
  end if;

  for v_item in select value from jsonb_array_elements(v_menu->'items')
  loop
    select * into v_terms from private.auction_item_terms(v_item);
    continue when not coalesce(v_terms.is_auction, false);

    select * into v_lot
      from public.auction_lots l
     where l.site_id = v_site
       and l.item_id = v_item->>'id'
       and l.ends_at > now()
     order by l.ends_at desc
     limit 1;
    if not found then
      select * into v_lot
        from public.auction_lots l
       where l.site_id = v_site
         and l.item_id = v_item->>'id'
         and l.scheduled_ends_at = v_terms.scheduled_ends_at;
    end if;

    if found then
      v_lots := v_lots || jsonb_build_array(private.auction_lot_public_json(v_lot));
    else
      v_lots := v_lots || jsonb_build_array(jsonb_build_object(
        'itemId', v_item->>'id',
        'status', case when v_terms.scheduled_ends_at > now() then 'open' else 'closed' end,
        'endsAt', private.auction_iso(v_terms.scheduled_ends_at),
        'scheduledEndsAt', private.auction_iso(v_terms.scheduled_ends_at),
        'startCents', v_terms.start_cents,
        'incrementCents', v_terms.increment_cents,
        'currentCents', null,
        'nextMinCents', v_terms.start_cents,
        'bidCount', 0,
        'leadingRef', null,
        'recentBids', '[]'::jsonb
      ));
    end if;
  end loop;

  return jsonb_build_object('serverNow', private.auction_iso(now()), 'lots', v_lots);
end;
$$;

revoke all on function private.read_auction_board(text) from public, anon, authenticated;

create or replace function private.place_auction_bid(
  p_slug text,
  p_item_id text,
  p_name text,
  p_whatsapp text,
  p_amount_cents bigint,
  p_visitor_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected text;
  v_headers jsonb;
  v_channel_key text;
  v_name text;
  v_item_id text;
  v_site uuid;
  v_menu jsonb;
  v_item jsonb;
  v_terms record;
  v_lot public.auction_lots;
  v_required bigint;
  v_leader_whatsapp text;
  v_bid_id uuid;
  v_new_ends timestamptz;
  v_last timestamptz;
  v_count integer;
  v_now timestamptz := now();
begin
  select s.bid_key_sha256 into v_expected from private.auction_settings s where s.id;
  if v_expected is null then
    raise exception 'AUCTIONS_UNAVAILABLE' using errcode = 'P0001';
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_channel_key := v_headers->>'x-vitrine-bid-key';
  if v_channel_key is null
     or encode(pg_catalog.sha256(convert_to(v_channel_key, 'UTF8')), 'hex') <> v_expected then
    raise exception 'BID_CHANNEL_FORBIDDEN' using errcode = '42501';
  end if;

  v_name := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_item_id := trim(coalesce(p_item_id, ''));
  if length(v_name) < 2 or length(v_name) > 60 or v_name ~ '[<>]'
     or coalesce(p_whatsapp, '') !~ '^[1-9][0-9]{7,14}$'
     or p_amount_cents is null or p_amount_cents < 100 or p_amount_cents > 100000000
     or coalesce(p_visitor_key, '') !~ '^[a-f0-9]{32,64}$'
     or length(v_item_id) < 1 or length(v_item_id) > 64 then
    raise exception 'INVALID_BID' using errcode = '22023';
  end if;

  select p.site_id, p.menu
    into v_site, v_menu
    from public.publications p
   where p.slug = lower(trim(coalesce(p_slug, '')))
     and p.status = 'active'
   limit 1;
  if v_site is null then
    raise exception 'PUBLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if jsonb_typeof(v_menu->'items') = 'array' then
    select e.value into v_item
      from jsonb_array_elements(v_menu->'items') e
     where e.value->>'id' = v_item_id
     limit 1;
  end if;
  select * into v_terms from private.auction_item_terms(v_item);
  if not coalesce(v_terms.is_auction, false) then
    raise exception 'AUCTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_whatsapp = coalesce(v_menu->>'whatsapp', '') then
    raise exception 'BIDDER_IS_OWNER' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.auction_blocks k
     where k.site_id = v_site
       and (k.bidder_whatsapp = p_whatsapp or k.visitor_key = p_visitor_key)
  ) then
    raise exception 'BIDDER_BLOCKED' using errcode = '42501';
  end if;

  select * into v_lot
    from public.auction_lots l
   where l.site_id = v_site
     and l.item_id = v_item_id
     and l.ends_at > v_now
   order by l.ends_at desc
   limit 1
   for update;

  if not found then
    perform 1
      from public.auction_lots l
     where l.site_id = v_site
       and l.item_id = v_item_id
       and l.scheduled_ends_at = v_terms.scheduled_ends_at;
    if found or v_terms.scheduled_ends_at <= v_now then
      raise exception 'AUCTION_CLOSED' using errcode = 'P0001';
    end if;

    insert into public.auction_lots (
      site_id, item_id, item_name, start_cents, increment_cents, scheduled_ends_at, ends_at
    )
    values (
      v_site,
      v_item_id,
      left(coalesce(nullif(trim(v_item->>'name'), ''), 'Item'), 160),
      v_terms.start_cents,
      v_terms.increment_cents,
      v_terms.scheduled_ends_at,
      v_terms.scheduled_ends_at
    )
    on conflict (site_id, item_id, scheduled_ends_at) do nothing;

    select * into v_lot
      from public.auction_lots l
     where l.site_id = v_site
       and l.item_id = v_item_id
       and l.scheduled_ends_at = v_terms.scheduled_ends_at
     for update;
    if v_lot.ends_at <= v_now then
      raise exception 'AUCTION_CLOSED' using errcode = 'P0001';
    end if;
  end if;

  select max(b.created_at) into v_last
    from public.auction_bids b
   where b.site_id = v_site and b.visitor_key = p_visitor_key;
  if v_last is not null and v_last > v_now - interval '15 seconds' then
    raise exception 'BID_RATE_LIMITED' using errcode = 'P0001';
  end if;

  select count(*) into v_count
    from public.auction_bids b
   where b.lot_id = v_lot.id
     and b.visitor_key = p_visitor_key
     and b.created_at > v_now - interval '1 hour';
  if v_count >= 10 then
    raise exception 'BID_RATE_LIMITED' using errcode = 'P0001';
  end if;

  select count(*) into v_count
    from public.auction_bids b
   where b.site_id = v_site
     and b.visitor_key = p_visitor_key
     and b.created_at > v_now - interval '24 hours';
  if v_count >= 40 then
    raise exception 'BID_RATE_LIMITED' using errcode = 'P0001';
  end if;

  select count(distinct b.bidder_whatsapp) into v_count
    from public.auction_bids b
   where b.lot_id = v_lot.id
     and b.visitor_key = p_visitor_key
     and b.bidder_whatsapp <> p_whatsapp;
  if v_count >= 3 then
    raise exception 'TOO_MANY_IDENTITIES' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.auction_bids b where b.lot_id = v_lot.id;
  if v_count >= 300 then
    raise exception 'AUCTION_BID_LIMIT' using errcode = 'P0001';
  end if;

  if v_lot.highest_bid_id is not null then
    select b.bidder_whatsapp into v_leader_whatsapp
      from public.auction_bids b
     where b.id = v_lot.highest_bid_id;
    if v_leader_whatsapp = p_whatsapp then
      raise exception 'ALREADY_LEADING' using errcode = 'P0001';
    end if;
  end if;

  v_required := case
    when v_lot.highest_cents is null then v_lot.start_cents
    else v_lot.highest_cents + v_lot.increment_cents
  end;
  if p_amount_cents < v_required then
    raise exception 'BID_TOO_LOW' using errcode = 'P0001', detail = v_required::text;
  end if;
  if p_amount_cents > least(v_required * 10, 100000000) then
    raise exception 'BID_TOO_HIGH' using errcode = 'P0001';
  end if;

  insert into public.auction_bids (lot_id, site_id, amount_cents, bidder_name, bidder_whatsapp, visitor_key)
  values (v_lot.id, v_site, p_amount_cents, v_name, p_whatsapp, p_visitor_key)
  returning id into v_bid_id;

  v_new_ends := v_lot.ends_at;
  if v_lot.ends_at - v_now < interval '3 minutes' then
    v_new_ends := least(
      greatest(v_lot.ends_at, v_now + interval '3 minutes'),
      v_lot.scheduled_ends_at + interval '60 minutes'
    );
  end if;

  update public.auction_lots l
     set highest_bid_id = v_bid_id,
         highest_cents = p_amount_cents,
         bid_count = l.bid_count + 1,
         ends_at = v_new_ends,
         updated_at = v_now
   where l.id = v_lot.id
  returning * into v_lot;

  perform private.purge_auction_personal_data(v_site);

  return jsonb_build_object(
    'bid', jsonb_build_object(
      'ref', left(replace(v_bid_id::text, '-', ''), 8),
      'amountCents', p_amount_cents,
      'placedAt', private.auction_iso(v_now)
    ),
    'lot', private.auction_lot_public_json(v_lot)
  );
end;
$$;

revoke all on function private.place_auction_bid(text, text, text, text, bigint, text) from public, anon, authenticated;

create or replace function private.void_auction_bid(
  p_bid uuid,
  p_reason text,
  p_block boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bid public.auction_bids;
  v_lot public.auction_lots;
  v_top public.auction_bids;
  v_reason text;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  select * into v_bid from public.auction_bids b where b.id = p_bid;
  if not found or not private.has_site_role(v_bid.site_id, array['owner', 'admin']) then
    raise exception 'BID_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_reason := regexp_replace(trim(coalesce(p_reason, '')), '\s+', ' ', 'g');
  if length(v_reason) < 3 or length(v_reason) > 200 then
    raise exception 'INVALID_VOID_REASON' using errcode = '22023';
  end if;

  select * into v_lot from public.auction_lots l where l.id = v_bid.lot_id for update;
  select * into v_bid from public.auction_bids b where b.id = p_bid;
  if v_bid.status = 'void' then
    raise exception 'BID_ALREADY_VOID' using errcode = 'P0001';
  end if;

  update public.auction_bids b
     set status = 'void',
         void_reason = v_reason,
         voided_at = now(),
         voided_by = (select auth.uid())
   where b.id = p_bid;

  select * into v_top
    from public.auction_bids b
   where b.lot_id = v_lot.id and b.status = 'valid'
   order by b.amount_cents desc, b.created_at asc
   limit 1;

  update public.auction_lots l
     set highest_bid_id = v_top.id,
         highest_cents = v_top.amount_cents,
         bid_count = (
           select count(*) from public.auction_bids b
            where b.lot_id = v_lot.id and b.status = 'valid'
         ),
         updated_at = now()
   where l.id = v_lot.id;

  if coalesce(p_block, false) then
    insert into public.auction_blocks (site_id, bidder_whatsapp, visitor_key, reason, created_by)
    values (v_bid.site_id, v_bid.bidder_whatsapp, v_bid.visitor_key, v_reason, (select auth.uid()));
  end if;

  perform private.record_audit_log(
    v_bid.site_id,
    'auction.bid_void',
    'auction_bid',
    p_bid::text,
    jsonb_build_object(
      'lotId', v_lot.id,
      'itemId', v_lot.item_id,
      'amountCents', v_bid.amount_cents,
      'blocked', coalesce(p_block, false)
    )
  );

  return jsonb_build_object('lotId', v_lot.id, 'siteId', v_bid.site_id);
end;
$$;

revoke all on function private.void_auction_bid(uuid, text, boolean) from public, anon, authenticated;

create or replace function public.read_auction_board(target_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.read_auction_board(target_slug);
$$;

revoke all on function public.read_auction_board(text) from public;
grant execute on function public.read_auction_board(text) to anon, authenticated;

create or replace function public.place_auction_bid(
  target_slug text,
  target_item_id text,
  bidder_name text,
  bidder_whatsapp text,
  amount_cents bigint,
  visitor_key text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.place_auction_bid(target_slug, target_item_id, bidder_name, bidder_whatsapp, amount_cents, visitor_key);
$$;

revoke all on function public.place_auction_bid(text, text, text, text, bigint, text) from public;
grant execute on function public.place_auction_bid(text, text, text, text, bigint, text) to anon, authenticated;

create or replace function public.void_auction_bid(target_bid uuid, void_reason text, block_bidder boolean default false)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.void_auction_bid(target_bid, void_reason, block_bidder);
$$;

revoke all on function public.void_auction_bid(uuid, text, boolean) from public, anon;
grant execute on function public.void_auction_bid(uuid, text, boolean) to authenticated;

commit;
