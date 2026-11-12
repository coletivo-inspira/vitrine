-- Portal redesign foundation (Phase 2 / PR a):
-- profiles, profile_interests, customization_requests, sites.storefront_type,
-- component catalog templates/constraints, legacy pizzeria-v1 migration and catalog-images Storage RLS.
-- Append-only migration: never modify previous migrations.
begin;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_updated_at() from public, anon, authenticated;

-- 1. User profiles (1:1 with auth.uid())
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(trim(display_name)) <= 120),
  business_name text not null default '' check (length(trim(business_name)) <= 160),
  city text not null default '' check (length(trim(city)) <= 120),
  whatsapp text not null default '' check (whatsapp = '' or whatsapp ~ '^[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_updated_at();

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (user_id, display_name, business_name, city, whatsapp) on public.profiles to authenticated;
grant update (display_name, business_name, city, whatsapp) on public.profiles to authenticated;

drop policy if exists profiles_owner_select on public.profiles;
create policy profiles_owner_select on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists profiles_owner_insert on public.profiles;
create policy profiles_owner_insert on public.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 2. Profile interests (multi-select chips)
create table if not exists public.profile_interests (
  user_id uuid not null references auth.users(id) on delete cascade,
  interest text not null check (
    interest in (
      'cardapio-digital',
      'agendamento',
      'orcamento-whatsapp',
      'dominio-proprio',
      'identidade-visual',
      'fotografia-conteudo',
      'automacao-atendimento',
      'design-sob-medida'
    )
  ),
  created_at timestamptz not null default now(),
  primary key (user_id, interest)
);

alter table public.profile_interests enable row level security;
revoke all on public.profile_interests from public, anon, authenticated;
grant select, delete on public.profile_interests to authenticated;
grant insert (user_id, interest) on public.profile_interests to authenticated;

drop policy if exists profile_interests_owner_select on public.profile_interests;
create policy profile_interests_owner_select on public.profile_interests
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists profile_interests_owner_insert on public.profile_interests;
create policy profile_interests_owner_insert on public.profile_interests
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists profile_interests_owner_delete on public.profile_interests;
create policy profile_interests_owner_delete on public.profile_interests
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- 3. Customization requests
create table if not exists public.customization_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid null references public.sites(id) on delete set null,
  storefront_type text not null check (storefront_type in ('food', 'art', 'photo', 'health', 'tech')),
  template_interest text not null check (length(trim(template_interest)) between 1 and 120),
  goal text not null check (length(trim(goal)) between 10 and 2000),
  reference_urls jsonb not null default '[]'::jsonb check (
    jsonb_typeof(reference_urls) = 'array'
    and jsonb_array_length(reference_urls) <= 10
  ),
  desired_deadline text not null default '' check (length(trim(desired_deadline)) <= 120),
  status text not null default 'novo' check (status in ('novo', 'em_analise', 'respondido', 'encerrado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customization_requests_user_idx
  on public.customization_requests(user_id, created_at desc);

drop trigger if exists customization_requests_touch_updated_at on public.customization_requests;
create trigger customization_requests_touch_updated_at
before update on public.customization_requests
for each row execute function private.touch_updated_at();

alter table public.customization_requests enable row level security;
revoke all on public.customization_requests from public, anon, authenticated;
grant select on public.customization_requests to authenticated;
grant insert (user_id, site_id, storefront_type, template_interest, goal, reference_urls, desired_deadline)
  on public.customization_requests to authenticated;

drop policy if exists customization_requests_owner_select on public.customization_requests;
create policy customization_requests_owner_select on public.customization_requests
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists customization_requests_owner_insert on public.customization_requests;
create policy customization_requests_owner_insert on public.customization_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'novo'
    and (site_id is null or site_id in (select private.accessible_site_ids()))
  );

-- 4. Extend public.sites with storefront_type and expanded template list
alter table public.sites
  add column if not exists storefront_type text not null default 'food';

alter table public.sites
  drop constraint if exists sites_storefront_type_check;

alter table public.sites
  add constraint sites_storefront_type_check check (
    storefront_type in ('food', 'art', 'photo', 'health', 'tech')
  );

alter table public.sites
  drop constraint if exists sites_template_check;

alter table public.sites
  add constraint sites_template_check check (
    template in ('pizzeria-v1', 'products-v1', 'booking-v1', 'quote-v1')
  );

grant insert (owner_user_id, slug, name, template, storefront_type) on public.sites to authenticated;

-- 5. Expand public.drafts constraint for component catalog
alter table public.drafts
  drop constraint if exists drafts_portal_content_check;

alter table public.drafts
  add constraint drafts_portal_content_check check (
    jsonb_typeof(content) = 'object'
    and octet_length(content::text) <= 262144
    and (
      not (content ? 'template')
      or content->>'template' in ('pizzeria-v1', 'products-v1', 'booking-v1', 'quote-v1')
    )
    and (
      not (content ? 'catalogType')
      or content->>'catalogType' in ('products', 'booking', 'quote')
    )
    and (
      not (content ? 'storefrontType')
      or content->>'storefrontType' in ('food', 'art', 'photo', 'health', 'tech')
    )
    and (
      not (content ? 'components')
      or jsonb_typeof(content->'components') = 'object'
    )
    and (
      not (content ? 'orderFields')
      or jsonb_typeof(content->'orderFields') = 'object'
    )
    and (
      not (content ? 'messages')
      or jsonb_typeof(content->'messages') = 'object'
    )
    and (not (content ? 'schemaVersion') or content->'schemaVersion' = '1'::jsonb)
    and (not (content ? 'categories') or jsonb_typeof(content->'categories') = 'array')
    and (not (content ? 'items') or (
      jsonb_typeof(content->'items') = 'array'
      and jsonb_array_length(content->'items') <= 100
    ))
  );

-- 6. Helper to migrate legacy pizzeria-v1 draft content without data loss
create or replace function private.migrate_legacy_draft_content(
  draft_content jsonb,
  site_storefront_type text default 'food',
  site_name text default ''
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb;
  v_template text;
  v_storefront_type text;
  v_catalog_type text;
  v_business_name text;
begin
  if draft_content is null or jsonb_typeof(draft_content) <> 'object' then
    return draft_content;
  end if;

  v_result := draft_content;
  v_template := coalesce(nullif(trim(v_result->>'template'), ''), 'pizzeria-v1');
  v_storefront_type := coalesce(
    nullif(trim(v_result->>'storefrontType'), ''),
    nullif(trim(site_storefront_type), ''),
    'food'
  );
  if v_storefront_type not in ('food', 'art', 'photo', 'health', 'tech') then
    v_storefront_type := 'food';
  end if;

  v_catalog_type := coalesce(
    nullif(trim(v_result->>'catalogType'), ''),
    case
      when v_template = 'booking-v1' then 'booking'
      when v_template = 'quote-v1' then 'quote'
      else 'products'
    end
  );
  if v_catalog_type not in ('products', 'booking', 'quote') then
    v_catalog_type := 'products';
  end if;

  v_business_name := coalesce(
    nullif(trim(v_result->>'businessName'), ''),
    nullif(trim(v_result->>'name'), ''),
    nullif(trim(site_name), ''),
    'Vitrine'
  );

  if not (v_result ? 'storefrontType') then
    v_result := jsonb_set(v_result, '{storefrontType}', to_jsonb(v_storefront_type), true);
  end if;

  if not (v_result ? 'catalogType') then
    v_result := jsonb_set(v_result, '{catalogType}', to_jsonb(v_catalog_type), true);
  end if;

  if not (v_result ? 'components') or jsonb_typeof(v_result->'components') <> 'object' then
    v_result := jsonb_set(
      v_result,
      '{components}',
      jsonb_build_object(
        'name', true,
        'description', true,
        'photo', case when v_template = 'pizzeria-v1' then false else true end,
        'price', case when v_catalog_type = 'quote' then false else true end,
        'minQuantity', false,
        'quantitySelector', case when v_catalog_type = 'booking' then false else true end,
        'durationMinutes', case when v_catalog_type = 'booking' then true else false end
      ),
      true
    );
  end if;

  if not (v_result ? 'orderFields') or jsonb_typeof(v_result->'orderFields') <> 'object' then
    v_result := jsonb_set(
      v_result,
      '{orderFields}',
      jsonb_build_object(
        'date', case when v_catalog_type = 'booking' then true else false end,
        'timeSlots', case
          when v_catalog_type = 'booking' then '["09:00","10:00","11:00","14:00","15:00","16:00","17:00"]'::jsonb
          else '[]'::jsonb
        end,
        'deliveryOrPickup', case when v_catalog_type = 'products' then true else false end,
        'customerName', true,
        'notes', true
      ),
      true
    );
  end if;

  if not (v_result ? 'messages') or jsonb_typeof(v_result->'messages') <> 'object' then
    v_result := jsonb_set(
      v_result,
      '{messages}',
      jsonb_build_object(
        'heroTitle', v_business_name,
        'welcomeText', case
          when v_catalog_type = 'booking' then 'Escolha o serviço desejado, selecione a data e o horário de preferência e confirme pelo WhatsApp.'
          when v_catalog_type = 'quote' then 'Selecione os itens de seu interesse e envie sua solicitação de orçamento pelo WhatsApp.'
          else 'Escolha seus itens abaixo, revise os dados do pedido e envie pelo WhatsApp.'
        end,
        'ctaLabel', case
          when v_catalog_type = 'booking' then 'Confirmar agendamento no WhatsApp'
          when v_catalog_type = 'quote' then 'Solicitar orçamento no WhatsApp'
          else 'Enviar pedido no WhatsApp'
        end,
        'whatsappTemplate', case
          when v_catalog_type = 'booking' then E'Olá! Meu nome é {nome}. Gostaria de agendar:\n{itens}\nData: {data} às {horario}\nTotal estimado: {total}'
          when v_catalog_type = 'quote' then E'Olá! Meu nome é {nome}. Tenho interesse em solicitar orçamento para:\n{itens}'
          else E'Olá! Tenho interesse nestes produtos:\n{itens}\nTotal estimado: {total}'
        end
      ),
      true
    );
  end if;

  return v_result;
end;
$$;

revoke all on function private.migrate_legacy_draft_content(jsonb, text, text) from public, anon, authenticated;

-- Migrate existing pizzeria-v1 drafts in place without bumping revision or losing data
alter table public.drafts disable trigger drafts_revision;

update public.drafts d
set content = private.migrate_legacy_draft_content(d.content, s.storefront_type, s.name)
from public.sites s
where s.id = d.site_id
  and (d.content ? 'whatsapp')
  and not (d.content ? 'catalogType');

alter table public.drafts enable trigger drafts_revision;

-- 7. Expand public.publications and public.publication_releases constraints and projection function
alter table public.publications
  drop constraint if exists publications_menu_check;

alter table public.publications
  add constraint publications_menu_check check (
    jsonb_typeof(menu) = 'object'
    and octet_length(menu::text) <= 262144
    and menu->>'slug' = slug
    and menu->>'template' in ('pizzeria-v1', 'products-v1', 'booking-v1', 'quote-v1')
    and (
      not (menu ? 'catalogType')
      or menu->>'catalogType' in ('products', 'booking', 'quote')
    )
    and (
      not (menu ? 'storefrontType')
      or menu->>'storefrontType' in ('food', 'art', 'photo', 'health', 'tech')
    )
    and (
      not (menu ? 'components')
      or jsonb_typeof(menu->'components') = 'object'
    )
    and (
      not (menu ? 'orderFields')
      or jsonb_typeof(menu->'orderFields') = 'object'
    )
    and (
      not (menu ? 'messages')
      or jsonb_typeof(menu->'messages') = 'object'
    )
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
  );

alter table public.publication_releases
  drop constraint if exists publication_releases_menu_check;

alter table public.publication_releases
  add constraint publication_releases_menu_check check (
    jsonb_typeof(menu) = 'object'
    and octet_length(menu::text) <= 262144
    and menu->>'slug' = slug
    and menu->>'template' in ('pizzeria-v1', 'products-v1', 'booking-v1', 'quote-v1')
    and (
      not (menu ? 'catalogType')
      or menu->>'catalogType' in ('products', 'booking', 'quote')
    )
    and (
      not (menu ? 'storefrontType')
      or menu->>'storefrontType' in ('food', 'art', 'photo', 'health', 'tech')
    )
    and (
      not (menu ? 'components')
      or jsonb_typeof(menu->'components') = 'object'
    )
    and (
      not (menu ? 'orderFields')
      or jsonb_typeof(menu->'orderFields') = 'object'
    )
    and (
      not (menu ? 'messages')
      or jsonb_typeof(menu->'messages') = 'object'
    )
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
  );

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
  v_migrated jsonb;
  v_whatsapp text;
  v_name text;
  v_template text;
  v_storefront_type text;
  v_catalog_type text;
  v_price_optional boolean := false;
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
  v_item_img text;
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
  if v_template not in ('pizzeria-v1', 'products-v1', 'booking-v1', 'quote-v1') then
    return null;
  end if;

  v_migrated := private.migrate_legacy_draft_content(
    jsonb_set(draft_content, '{template}', to_jsonb(v_template), true),
    coalesce(draft_content->>'storefrontType', 'food'),
    site_name
  );

  v_storefront_type := v_migrated->>'storefrontType';
  v_catalog_type := v_migrated->>'catalogType';
  v_price_optional := (
    v_catalog_type = 'quote'
    or coalesce((v_migrated->'components'->>'price')::boolean, true) is false
  );

  v_whatsapp := trim(coalesce(v_migrated->>'whatsapp', ''));
  if v_whatsapp !~ '^[1-9][0-9]{7,14}$' then
    return null;
  end if;

  v_name := trim(coalesce(
    nullif(trim(v_migrated->>'businessName'), ''),
    nullif(trim(v_migrated->>'name'), ''),
    nullif(trim(site_name), '')
  ));
  if v_name is null or length(v_name) < 1 or length(v_name) > 160 then
    return null;
  end if;

  if jsonb_typeof(v_migrated->'items') = 'array' then
    for v_item in select value from jsonb_array_elements(v_migrated->'items')
    loop
      if jsonb_typeof(v_item) <> 'object' then
        continue;
      end if;
      v_item_idx := v_item_idx + 1;
      if coalesce((v_item->>'active')::boolean, true) is not true
         or coalesce((v_item->>'available')::boolean, true) is not true then
        continue;
      end if;
      if v_price_optional and (v_item->'priceCents' is null or v_item->>'priceCents' = '0') then
        v_item_price := 0;
      elsif jsonb_typeof(v_item->'priceCents') = 'number'
            and (v_item->>'priceCents') ~ '^[1-9][0-9]*$' then
        v_item_price := (v_item->>'priceCents')::bigint;
      else
        return null;
      end if;
      v_item_id := coalesce(nullif(trim(v_item->>'id'), ''), 'item-' || v_item_idx::text);
      if v_item_id = any(v_seen_item_ids) then
        continue;
      end if;
      v_item_name := coalesce(nullif(trim(v_item->>'name'), ''), 'Item ' || v_item_idx::text);
      v_public_item := jsonb_build_object(
        'id', v_item_id,
        'name', v_item_name,
        'priceCents', v_item_price
      );
      v_item_desc := nullif(trim(coalesce(v_item->>'description', '')), '');
      if v_item_desc is not null and length(v_item_desc) <= 280 then
        v_public_item := jsonb_set(v_public_item, '{description}', to_jsonb(v_item_desc), true);
      end if;
      v_item_img := nullif(trim(coalesce(v_item->>'imageUrl', '')), '');
      if v_item_img is not null and v_item_img ~ '^https://[^\s:@]+$' then
        v_public_item := jsonb_set(v_public_item, '{imageUrl}', to_jsonb(v_item_img), true);
      end if;
      if jsonb_typeof(v_item->'minQuantity') = 'number'
         and (v_item->>'minQuantity') ~ '^[1-9][0-9]?$' then
        v_public_item := jsonb_set(v_public_item, '{minQuantity}', v_item->'minQuantity', true);
      end if;
      if jsonb_typeof(v_item->'durationMinutes') = 'number'
         and (v_item->>'durationMinutes') ~ '^[1-9][0-9]{0,2}$' then
        v_public_item := jsonb_set(v_public_item, '{durationMinutes}', v_item->'durationMinutes', true);
      end if;
      v_seen_item_ids := array_append(v_seen_item_ids, v_item_id);
      v_flat_items := v_flat_items || jsonb_build_array(v_public_item);
      v_unassigned_items := v_unassigned_items || jsonb_build_array(v_public_item);
    end loop;
  end if;

  if jsonb_typeof(v_migrated->'categories') = 'array' then
    for v_cat in select value from jsonb_array_elements(v_migrated->'categories')
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
          if v_price_optional and (v_item->'priceCents' is null or v_item->>'priceCents' = '0') then
            v_item_price := 0;
          elsif jsonb_typeof(v_item->'priceCents') = 'number'
                and (v_item->>'priceCents') ~ '^[1-9][0-9]*$' then
            v_item_price := (v_item->>'priceCents')::bigint;
          else
            return null;
          end if;
          v_item_id := coalesce(nullif(trim(v_item->>'id'), ''), 'item-' || v_item_idx::text);
          if v_item_id = any(v_seen_item_ids) then
            continue;
          end if;
          v_item_name := coalesce(nullif(trim(v_item->>'name'), ''), 'Item ' || v_item_idx::text);
          v_public_item := jsonb_build_object(
            'id', v_item_id,
            'name', v_item_name,
            'priceCents', v_item_price
          );
          v_item_desc := nullif(trim(coalesce(v_item->>'description', '')), '');
          if v_item_desc is not null and length(v_item_desc) <= 280 then
            v_public_item := jsonb_set(v_public_item, '{description}', to_jsonb(v_item_desc), true);
          end if;
          v_item_img := nullif(trim(coalesce(v_item->>'imageUrl', '')), '');
          if v_item_img is not null and v_item_img ~ '^https://[^\s:@]+$' then
            v_public_item := jsonb_set(v_public_item, '{imageUrl}', to_jsonb(v_item_img), true);
          end if;
          if jsonb_typeof(v_item->'minQuantity') = 'number'
             and (v_item->>'minQuantity') ~ '^[1-9][0-9]?$' then
            v_public_item := jsonb_set(v_public_item, '{minQuantity}', v_item->'minQuantity', true);
          end if;
          if jsonb_typeof(v_item->'durationMinutes') = 'number'
             and (v_item->>'durationMinutes') ~ '^[1-9][0-9]{0,2}$' then
            v_public_item := jsonb_set(v_public_item, '{durationMinutes}', v_item->'durationMinutes', true);
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
    'storefrontType', v_storefront_type,
    'catalogType', v_catalog_type,
    'slug', site_slug,
    'name', v_name,
    'whatsapp', v_whatsapp,
    'currency', 'BRL',
    'components', v_migrated->'components',
    'orderFields', v_migrated->'orderFields',
    'messages', v_migrated->'messages',
    'items', v_flat_items,
    'categories', v_categories
  );
end;
$$;

revoke all on function private.project_public_menu(text, text, text, jsonb) from public, anon, authenticated;

-- Migrate existing pizzeria-v1 publications and release snapshots without data loss
update public.publications p
set menu = private.migrate_legacy_draft_content(p.menu, coalesce(s.storefront_type, 'food'), p.menu->>'name')
from public.sites s
where s.id = p.site_id
  and not (p.menu ? 'catalogType');

update public.publication_releases pr
set menu = private.migrate_legacy_draft_content(pr.menu, coalesce(s.storefront_type, 'food'), pr.menu->>'name')
from public.sites s
where s.id = pr.site_id
  and not (pr.menu ? 'catalogType');

-- 8. Supabase Storage bucket catalog-images (Free 1 GB) with member-only write RLS
create schema if not exists storage;
grant usage on schema storage to anon, authenticated;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid null,
  public boolean not null default false,
  file_size_limit bigint null,
  allowed_mime_types text[] null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text null references storage.buckets(id),
  name text null,
  owner uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  metadata jsonb null,
  unique (bucket_id, name)
);

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'storage' and p.proname = 'foldername'
  ) then
    execute $fn$
      create function storage.foldername(name text)
      returns text[]
      language sql
      immutable
      set search_path = ''
      as $body$
        select string_to_array(coalesce(name, ''), '/');
      $body$;
    $fn$;
  end if;
end
$$;

grant execute on function storage.foldername(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-images', 'catalog-images', true, 262144, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      updated_at = now();

create or replace function private.can_access_catalog_image_object(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_first_segment text;
begin
  if object_name is null or position('..' in object_name) > 0 then
    return false;
  end if;
  v_first_segment := (storage.foldername(object_name))[1];
  if v_first_segment is null
     or v_first_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return (v_first_segment::uuid) in (select private.accessible_site_ids());
end;
$$;

revoke all on function private.can_access_catalog_image_object(text) from public, anon;
grant execute on function private.can_access_catalog_image_object(text) to authenticated;

alter table storage.objects enable row level security;

grant select on storage.buckets, storage.objects to anon, authenticated;
grant insert (bucket_id, name, owner, metadata), update (name, metadata), delete on storage.objects to authenticated;

drop policy if exists catalog_images_public_select on storage.objects;
create policy catalog_images_public_select
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'catalog-images');

drop policy if exists catalog_images_member_insert on storage.objects;
create policy catalog_images_member_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'catalog-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9][a-z0-9._-]*\.webp$'
    and private.can_access_catalog_image_object(name)
  );

drop policy if exists catalog_images_member_update on storage.objects;
create policy catalog_images_member_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'catalog-images'
    and private.can_access_catalog_image_object(name)
  )
  with check (
    bucket_id = 'catalog-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9][a-z0-9._-]*\.webp$'
    and private.can_access_catalog_image_object(name)
  );

drop policy if exists catalog_images_member_delete on storage.objects;
create policy catalog_images_member_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'catalog-images'
    and private.can_access_catalog_image_object(name)
  );

commit;
