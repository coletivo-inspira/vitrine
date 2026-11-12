-- Migração 202611120006_cms_pages_sections_releases.sql
-- CMS Institucional da plataforma, catálogo de modelos/módulos, páginas/seções/menus e retenção de 5 releases.
-- Migração append-only: nunca modifique migrações anteriores.
begin;

-- 1. Tabela public.platform_cms
create table if not exists public.platform_cms (
  section_key text primary key check (
    length(section_key) between 1 and 64 and section_key ~ '^[a-z0-9_-]+$'
  ),
  draft_content jsonb not null default '{}'::jsonb check (
    jsonb_typeof(draft_content) = 'object' and octet_length(draft_content::text) <= 65536
  ),
  published_content jsonb not null default '{}'::jsonb check (
    jsonb_typeof(published_content) = 'object' and octet_length(published_content::text) <= 65536
  ),
  artifact_hash text not null default '' check (
    artifact_hash = '' or artifact_hash ~ '^[a-f0-9]{64}$'
  ),
  draft_visible boolean not null default true,
  draft_order integer not null default 0,
  visible boolean not null default true,
  display_order integer not null default 0,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  published_at timestamptz null
);

-- Seed inicial das 10 seções institucionais
insert into public.platform_cms (section_key, draft_content, published_content, visible, display_order)
values
  ('hero', '{"headline":"Sua vitrine pronta para receber pedidos pelo WhatsApp.","subtitle":"Crie cardápios, agendas e catálogos rápidos a custo zero."}'::jsonb, '{"headline":"Sua vitrine pronta para receber pedidos pelo WhatsApp.","subtitle":"Crie cardápios, agendas e catálogos rápidos a custo zero."}'::jsonb, true, 1),
  ('value_props', '{"title":"Por que escolher a Vitrine Inspira","items":["Custo operacional zero","Fluxo em 3 etapas para WhatsApp","Sem aplicativos pesados"]}'::jsonb, '{"title":"Por que escolher a Vitrine Inspira","items":["Custo operacional zero","Fluxo em 3 etapas para WhatsApp","Sem aplicativos pesados"]}'::jsonb, true, 2),
  ('areas_showcase', '{"title":"Soluções por área de atuação","areas":["food","art","photo","health","tech"]}'::jsonb, '{"title":"Soluções por área de atuação","areas":["food","art","photo","health","tech"]}'::jsonb, true, 3),
  ('templates_catalog', '{"title":"Modelos prontos para publicar"}'::jsonb, '{"title":"Modelos prontos para publicar"}'::jsonb, true, 4),
  ('featured_cases', '{"title":"Exemplos no ar"}'::jsonb, '{"title":"Exemplos no ar"}'::jsonb, true, 5),
  ('commercial_offer', '{"title":"Planos transparentes","freePlanTitle":"Plano Básico Gratuito"}'::jsonb, '{"title":"Planos transparentes","freePlanTitle":"Plano Básico Gratuito"}'::jsonb, true, 6),
  ('faq', '{"title":"Perguntas frequentes","items":[{"q":"É gratuito mesmo?","a":"Sim, até 20 itens ativos por vitrine sem mensalidade."}]}'::jsonb, '{"title":"Perguntas frequentes","items":[{"q":"É gratuito mesmo?","a":"Sim, até 20 itens ativos por vitrine sem mensalidade."}]}'::jsonb, true, 7),
  ('announcements', '{"bannerText":"Novo editor modular disponível no portal!"}'::jsonb, '{"bannerText":"Novo editor modular disponível no portal!"}'::jsonb, false, 0),
  ('header_nav', '{"links":[{"label":"Soluções","href":"#solucoes"},{"label":"Exemplos","href":"#exemplos"},{"label":"Planos","href":"#planos"}]}'::jsonb, '{"links":[{"label":"Soluções","href":"#solucoes"},{"label":"Exemplos","href":"#exemplos"},{"label":"Planos","href":"#planos"}]}'::jsonb, true, 8),
  ('footer', '{"copyright":"Coletivo Inspira — Vitrines Digitais"}'::jsonb, '{"copyright":"Coletivo Inspira — Vitrines Digitais"}'::jsonb, true, 9)
on conflict (section_key) do nothing;

update public.platform_cms set draft_visible = visible, draft_order = display_order;

-- 2. Tabela public.templates
create table if not exists public.templates (
  code text primary key check (length(code) between 1 and 64 and code ~ '^[a-z0-9_-]+$'),
  name text not null check (length(trim(name)) between 1 and 120),
  storefront_type text not null check (storefront_type in ('food', 'art', 'photo', 'health', 'tech')),
  catalog_type text not null check (catalog_type in ('products', 'booking', 'quote', 'links_bio')),
  schema_version integer not null default 1 check (schema_version > 0),
  default_tokens jsonb not null default '{}'::jsonb check (jsonb_typeof(default_tokens) = 'object'),
  default_sections jsonb not null default '[]'::jsonb check (jsonb_typeof(default_sections) = 'array'),
  is_custom_only boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.templates (code, name, storefront_type, catalog_type, schema_version, default_tokens, default_sections, is_custom_only, active)
values
  ('pizzeria-v1', 'Pizzaria & Gastronomia Clássica', 'food', 'products', 1, '{"accentColor":"#C74414","fontPair":"editorial-syne","buttonStyle":"pill"}'::jsonb, '[{"id":"sec-hero","moduleCode":"hero","config":{}},{"id":"sec-catalog","moduleCode":"catalog_grid","config":{"columns":2}}]'::jsonb, false, true),
  ('products-v1', 'Cardápio & Produtos por Componentes', 'food', 'products', 2, '{"accentColor":"#C74414","fontPair":"editorial-syne","buttonStyle":"pill"}'::jsonb, '[{"id":"sec-hero","moduleCode":"hero","config":{}},{"id":"sec-catalog","moduleCode":"catalog_grid","config":{"columns":2}},{"id":"sec-hours","moduleCode":"hours_location","config":{}}]'::jsonb, false, true),
  ('booking-v1', 'Agenda de Serviços & Atendimento', 'health', 'booking', 2, '{"accentColor":"#0F766E","fontPair":"modern-inter","buttonStyle":"pill"}'::jsonb, '[{"id":"sec-hero","moduleCode":"hero","config":{}},{"id":"sec-booking","moduleCode":"service_booking","config":{}},{"id":"sec-faq","moduleCode":"faq","config":{}}]'::jsonb, false, true),
  ('quote-v1', 'Portfólio & Solicitação de Orçamento', 'tech', 'quote', 2, '{"accentColor":"#1E3A8A","fontPair":"modern-inter","buttonStyle":"rounded"}'::jsonb, '[{"id":"sec-hero","moduleCode":"hero","config":{}},{"id":"sec-quote","moduleCode":"quote_request","config":{}},{"id":"sec-about","moduleCode":"about_story","config":{}}]'::jsonb, false, true),
  ('catalog-bio-v1', 'Catálogo & Links na Bio', 'art', 'links_bio', 2, '{"accentColor":"#9D174D","fontPair":"playful-poppins","buttonStyle":"pill"}'::jsonb, '[{"id":"sec-hero","moduleCode":"hero","config":{}},{"id":"sec-links","moduleCode":"links_bio","config":{}}]'::jsonb, false, true),
  ('portfolio-v1', 'Portfólio Visual Fotografia & Mídia', 'photo', 'quote', 2, '{"accentColor":"#1F2937","fontPair":"classic-garamond","buttonStyle":"rounded"}'::jsonb, '[{"id":"sec-hero","moduleCode":"hero","config":{}},{"id":"sec-catalog","moduleCode":"catalog_grid","config":{"columns":2}},{"id":"sec-testimonials","moduleCode":"testimonials","config":{}}]'::jsonb, false, true)
on conflict (code) do nothing;

-- 3. Tabela public.modules
create table if not exists public.modules (
  code text primary key check (length(code) between 1 and 64 and code ~ '^[a-z0-9_-]+$'),
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null check (length(trim(category)) between 1 and 64),
  config_schema jsonb not null default '{}'::jsonb check (jsonb_typeof(config_schema) = 'object'),
  default_config jsonb not null default '{}'::jsonb check (jsonb_typeof(default_config) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.modules (code, name, category, config_schema, default_config, active)
values
  ('hero', 'Cabeçalho de Destaque', 'presentation', '{"headline":"string","subtitle":"string"}'::jsonb, '{"headline":"Bem-vindo","subtitle":"Atendimento rápido pelo WhatsApp"}'::jsonb, true),
  ('catalog_grid', 'Grade de Catálogo', 'catalog', '{"columns":"number"}'::jsonb, '{"columns":2}'::jsonb, true),
  ('service_booking', 'Agendamento de Serviços', 'catalog', '{"showDuration":"boolean"}'::jsonb, '{"showDuration":true}'::jsonb, true),
  ('quote_request', 'Lista de Orçamento', 'catalog', '{"allowNotes":"boolean"}'::jsonb, '{"allowNotes":true}'::jsonb, true),
  ('about_story', 'Sobre & História', 'institutional', '{"bio":"string"}'::jsonb, '{"bio":""}'::jsonb, true),
  ('testimonials', 'Depoimentos de Clientes', 'social_proof', '{"items":"array"}'::jsonb, '{"items":[]}'::jsonb, true),
  ('faq', 'Perguntas Frequentes', 'institutional', '{"items":"array"}'::jsonb, '{"items":[]}'::jsonb, true),
  ('hours_location', 'Horários e Localização', 'operations', '{"scheduleText":"string","addressText":"string"}'::jsonb, '{"scheduleText":"","addressText":""}'::jsonb, true),
  ('links_bio', 'Links Rápidos (Bio)', 'navigation', '{"links":"array"}'::jsonb, '{"links":[]}'::jsonb, true),
  ('custom_sandbox', 'Componente em Sandbox Isolado', 'extension', '{"widgetId":"string"}'::jsonb, '{"widgetId":""}'::jsonb, true)
on conflict (code) do nothing;

-- 4. Tabela public.pages (máximo 6 páginas por vitrine: home + 5 extras)
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  slug text not null check (length(slug) between 1 and 40 and slug ~ '^[a-z0-9_-]+$'),
  title text not null check (length(trim(title)) between 1 and 120),
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (site_id, slug)
);

create or replace function private.enforce_site_page_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if tg_op = 'INSERT' then
    select count(*) into v_count
    from public.pages
    where site_id = new.site_id;
    if v_count >= 6 then
      raise exception 'PAGE_LIMIT_EXCEEDED: O plano gratuito permite até 6 páginas por vitrine (home + 5 adicionais).';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_site_page_quota() from public, anon, authenticated;

drop trigger if exists pages_quota_check on public.pages;
create trigger pages_quota_check
before insert on public.pages
for each row execute function private.enforce_site_page_quota();

-- 5. Tabela public.sections (máximo 15 seções por página)
create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  module_code text not null references public.modules(code),
  display_order integer not null default 0,
  config jsonb not null default '{}'::jsonb check (
    jsonb_typeof(config) = 'object' and octet_length(config::text) <= 32768
  ),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function private.enforce_page_section_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if tg_op = 'INSERT' then
    select count(*) into v_count
    from public.sections
    where page_id = new.page_id;
    if v_count >= 15 then
      raise exception 'SECTION_LIMIT_EXCEEDED: Cada página permite no máximo 15 seções.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_page_section_quota() from public, anon, authenticated;

drop trigger if exists sections_quota_check on public.sections;
create trigger sections_quota_check
before insert on public.sections
for each row execute function private.enforce_page_section_quota();

-- 6. Tabela public.navigation_menus
create table if not exists public.navigation_menus (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  location text not null check (location in ('header', 'footer', 'quick_links')),
  items jsonb not null default '[]'::jsonb check (
    jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 10
  ),
  created_at timestamptz not null default now(),
  unique (site_id, location)
);

-- 7. Trigger de retenção das 5 últimas versões publicadas por vitrine em public.publication_releases
create or replace function private.prune_publication_releases()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.publication_releases
  where site_id = new.site_id
    and (slug, artifact_hash) not in (
      select slug, artifact_hash
      from public.publication_releases
      where site_id = new.site_id
      order by published_at desc, revision desc
      limit 5
    );
  return new;
end;
$$;

revoke all on function private.prune_publication_releases() from public, anon, authenticated;

drop trigger if exists publication_releases_prune on public.publication_releases;
create trigger publication_releases_prune
after insert on public.publication_releases
for each row execute function private.prune_publication_releases();

-- 8. RLS e Privilégios
alter table public.platform_cms enable row level security;
alter table public.templates enable row level security;
alter table public.modules enable row level security;
alter table public.pages enable row level security;
alter table public.sections enable row level security;
alter table public.navigation_menus enable row level security;

revoke all on
  public.platform_cms,
  public.templates,
  public.modules,
  public.pages,
  public.sections,
  public.navigation_menus
from public, anon, authenticated;

grant select on public.platform_cms to authenticated;
grant update (draft_content, draft_visible, draft_order, updated_by, updated_at) on public.platform_cms to authenticated;

grant select on public.templates to anon, authenticated;
grant insert, update, delete on public.templates to authenticated;

grant select on public.modules to anon, authenticated;
grant insert, update, delete on public.modules to authenticated;

grant select, insert, update, delete on public.pages to authenticated;
grant select, insert, update, delete on public.sections to authenticated;
grant select, insert, update, delete on public.navigation_menus to authenticated;

-- O manifesto público expõe apenas conteúdo publicado e metadados de exibição.
create function public.read_platform_cms()
returns table(section_key text, content jsonb, display_order integer, visible boolean)
language sql stable security definer set search_path = ''
as $$
  select cms.section_key, case when cms.visible then cms.published_content else '{}'::jsonb end, cms.display_order, cms.visible
  from public.platform_cms cms
  where cms.published_at is not null
  order by cms.display_order, cms.section_key;
$$;

revoke all on function public.read_platform_cms() from public;
grant execute on function public.read_platform_cms() to anon, authenticated;

drop policy if exists platform_cms_admin_mutate on public.platform_cms;
create policy platform_cms_admin_mutate
  on public.platform_cms
  for all
  to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

drop policy if exists templates_read on public.templates;
create policy templates_read
  on public.templates
  for select
  to anon, authenticated
  using (active = true or private.is_platform_admin());

drop policy if exists templates_admin_mutate on public.templates;
create policy templates_admin_mutate
  on public.templates
  for all
  to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

drop policy if exists modules_read on public.modules;
create policy modules_read
  on public.modules
  for select
  to anon, authenticated
  using (active = true or private.is_platform_admin());

drop policy if exists modules_admin_mutate on public.modules;
create policy modules_admin_mutate
  on public.modules
  for all
  to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

drop policy if exists pages_select on public.pages;
create policy pages_select
  on public.pages
  for select
  to authenticated
  using (site_id in (select private.accessible_site_ids()) or private.is_platform_admin());

drop policy if exists pages_mutate on public.pages;
create policy pages_mutate
  on public.pages
  for all
  to authenticated
  using (private.has_site_role(site_id, array['owner', 'admin', 'editor']))
  with check (private.has_site_role(site_id, array['owner', 'admin', 'editor']));

drop policy if exists sections_select on public.sections;
create policy sections_select
  on public.sections
  for select
  to authenticated
  using (site_id in (select private.accessible_site_ids()) or private.is_platform_admin());

drop policy if exists sections_mutate on public.sections;
create policy sections_mutate
  on public.sections
  for all
  to authenticated
  using (private.has_site_role(site_id, array['owner', 'admin', 'editor']))
  with check (private.has_site_role(site_id, array['owner', 'admin', 'editor']));

drop policy if exists navigation_menus_select on public.navigation_menus;
create policy navigation_menus_select
  on public.navigation_menus
  for select
  to authenticated
  using (site_id in (select private.accessible_site_ids()) or private.is_platform_admin());

drop policy if exists navigation_menus_mutate on public.navigation_menus;
create policy navigation_menus_mutate
  on public.navigation_menus
  for all
  to authenticated
  using (private.has_site_role(site_id, array['owner', 'admin', 'editor']))
  with check (private.has_site_role(site_id, array['owner', 'admin', 'editor']));

-- Restaura o manifesto arquivado, sem aceitar conteúdo fornecido pelo cliente.
create function public.rollback_showcase(target_site uuid, target_revision integer, target_hash text)
returns public.publications
language plpgsql security definer set search_path = ''
as $$
declare
  selected_release public.publication_releases;
  restored public.publications;
begin
  if not private.has_site_role(target_site, array['owner', 'admin']) then
    raise exception using errcode = '42501', message = 'SITE_NOT_FOUND';
  end if;

  perform 1 from public.publications where site_id = target_site for update;
  if not found then return null; end if;

  select * into selected_release from public.publication_releases
  where site_id = target_site and revision = target_revision and artifact_hash = target_hash;
  if not found then return null; end if;

  update public.publications set
    revision = selected_release.revision,
    artifact_hash = selected_release.artifact_hash,
    menu = selected_release.menu,
    published_at = selected_release.published_at
  where site_id = target_site
  returning * into restored;

  perform private.record_audit_log(
    target_site, 'rollback', 'publication', target_revision::text,
    jsonb_build_object('artifactHash', target_hash)
  );
  return restored;
end;
$$;

revoke all on function public.rollback_showcase(uuid, integer, text) from public, anon;
grant execute on function public.rollback_showcase(uuid, integer, text) to authenticated;

create function public.publish_platform_cms(expected_sections jsonb)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  section_record record;
  expected jsonb;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ADMIN';
  end if;

  for section_record in select * from public.platform_cms order by section_key for update loop
    expected := expected_sections -> section_record.section_key;
    if exists (
      select 1 from jsonb_object_keys(section_record.draft_content) key
      where not key = any(case section_record.section_key
        when 'hero' then array['headline', 'subtitle']
        when 'value_props' then array['title', 'items']
        when 'areas_showcase' then array['title', 'areas']
        when 'templates_catalog' then array['title']
        when 'featured_cases' then array['title']
        when 'commercial_offer' then array['title', 'freePlanTitle']
        when 'faq' then array['title', 'items']
        when 'announcements' then array['bannerText']
        when 'header_nav' then array['links']
        when 'footer' then array['copyright']
        else array[]::text[] end)
    ) then return false; end if;
    if expected is null or expected->'content' is distinct from section_record.draft_content
       or expected->'visible' is distinct from to_jsonb(section_record.draft_visible)
       or expected->'displayOrder' is distinct from to_jsonb(section_record.draft_order) then
      return false;
    end if;
  end loop;

  update public.platform_cms set
    published_content = draft_content,
    visible = draft_visible,
    display_order = draft_order,
    artifact_hash = encode(sha256(convert_to(draft_content::text, 'UTF8')), 'hex'),
    published_at = now();

  perform private.record_audit_log(null, 'publish', 'platform_cms', 'institutional', '{}'::jsonb);
  return true;
end;
$$;
revoke all on function public.publish_platform_cms(jsonb) from public, anon;
grant execute on function public.publish_platform_cms(jsonb) to authenticated;

commit;
