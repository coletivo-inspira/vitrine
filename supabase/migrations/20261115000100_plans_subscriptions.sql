-- Migração 20261115000100_plans_subscriptions.sql
-- Planos (ADR 0013), assinatura por organização cliente e direitos por vitrine
-- decididos no servidor. Migração append-only: nunca modifique migrações anteriores.
begin;

-- 1. Tabela public.plans, semeada a partir de content/plans.json.
-- test/database/plans-subscriptions.test.mjs falha se a semente divergir do JSON.
create table if not exists public.plans (
  code text primary key check (code in ('free', 'essencial', 'profissional', 'equipe')),
  name text not null check (length(trim(name)) between 1 and 80),
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  max_vitrines integer not null check (max_vitrines between 1 and 5),
  max_active_items integer not null check (max_active_items between 1 and 100),
  max_item_blocks integer not null check (max_item_blocks between 1 and 5),
  features text[] not null default '{}'::text[] check (
    features <@ array[
      'custom_domain', 'inspira_subdomain', 'local_seo', 'public_json',
      'quote_webhook', 'conversion_reports', 'multi_vitrine', 'support_badge_optional'
    ]::text[]
  ),
  updated_at timestamptz not null default now()
);

insert into public.plans (code, name, monthly_price_cents, max_vitrines, max_active_items, max_item_blocks, features)
values
  ('free', 'Gratuito/Social', 0, 1, 20, 1, '{}'::text[]),
  ('essencial', 'Essencial', 3900, 1, 100, 1,
    array['custom_domain', 'inspira_subdomain', 'local_seo', 'support_badge_optional']),
  ('profissional', 'Profissional', 8900, 1, 100, 5,
    array['custom_domain', 'inspira_subdomain', 'local_seo', 'support_badge_optional',
      'public_json', 'quote_webhook', 'conversion_reports']),
  ('equipe', 'Equipe/Multi-Vitrine', 16900, 5, 100, 5,
    array['custom_domain', 'inspira_subdomain', 'local_seo', 'support_badge_optional',
      'public_json', 'quote_webhook', 'conversion_reports', 'multi_vitrine'])
on conflict (code) do update set
  name = excluded.name,
  monthly_price_cents = excluded.monthly_price_cents,
  max_vitrines = excluded.max_vitrines,
  max_active_items = excluded.max_active_items,
  max_item_blocks = excluded.max_item_blocks,
  features = excluded.features,
  updated_at = now();

-- 2. Tabela public.subscriptions: uma por organização cliente (tenant).
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  plan_code text not null references public.plans(code),
  status text not null default 'pending' check (
    status in ('pending', 'active', 'past_due', 'grace', 'suspended', 'canceled')
  ),
  provider text not null default 'manual' check (provider in ('manual', 'asaas', 'stripe')),
  provider_customer_id text null check (
    provider_customer_id is null or length(provider_customer_id) between 1 and 128
  ),
  provider_subscription_id text null check (
    provider_subscription_id is null or length(provider_subscription_id) between 1 and 128
  ),
  current_period_end timestamptz null,
  grace_until timestamptz null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_provider_subscription_idx
  on public.subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;

create or replace function private.touch_subscription()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_subscription() from public, anon, authenticated;

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch
before update on public.subscriptions
for each row execute function private.touch_subscription();

-- 3. Auditoria: toda mudança de assinatura vai para audit_logs com valores antigo e novo.
-- O webhook do provedor grava como service_role, sem auth.uid(); nesse caso o autor
-- fica nulo e a origem aparece em summary.source.
alter table public.audit_logs alter column actor_user_id drop not null;

create or replace function private.audit_subscription_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := coalesce((select auth.uid()), case when tg_op = 'DELETE' then old.updated_by else new.updated_by end);
  snapshot_old jsonb := case when tg_op = 'INSERT' then null else jsonb_build_object(
    'plan_code', old.plan_code, 'status', old.status, 'provider', old.provider,
    'current_period_end', old.current_period_end, 'grace_until', old.grace_until
  ) end;
  snapshot_new jsonb := case when tg_op = 'DELETE' then null else jsonb_build_object(
    'plan_code', new.plan_code, 'status', new.status, 'provider', new.provider,
    'current_period_end', new.current_period_end, 'grace_until', new.grace_until
  ) end;
begin
  if tg_op = 'UPDATE' and snapshot_old = snapshot_new then
    return new;
  end if;
  insert into public.audit_logs (site_id, actor_user_id, action, entity_type, entity_id, summary)
  values (
    null,
    actor,
    'subscription.' || lower(tg_op),
    'subscription',
    coalesce(new.tenant_id, old.tenant_id)::text,
    jsonb_build_object(
      'old', snapshot_old,
      'new', snapshot_new,
      'source', case
        when (select auth.uid()) is not null then 'platform_admin'
        when current_setting('role', true) = 'service_role' then 'service_role'
        else 'migration'
      end
    )
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.audit_subscription_change() from public, anon, authenticated;

drop trigger if exists subscriptions_audit on public.subscriptions;
create trigger subscriptions_audit
after insert or update or delete on public.subscriptions
for each row execute function private.audit_subscription_change();

-- 4. RLS: o dono do tenant lê a própria assinatura; só platform_admin (pela RPC
-- auditada) e o service_role do webhook escrevem; anon não lê nada.
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;

revoke all on public.plans, public.subscriptions from public, anon, authenticated;
grant select on public.plans to authenticated;
grant select on public.subscriptions to authenticated;

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select to authenticated using (true);

drop policy if exists subscriptions_owner_read on public.subscriptions;
create policy subscriptions_owner_read
  on public.subscriptions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = subscriptions.tenant_id and t.owner_user_id = (select auth.uid())
    )
    or private.is_platform_admin()
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.plans to service_role;
    grant select, insert, update on public.subscriptions to service_role;
  end if;
end;
$$;

-- 5. Direitos de uma vitrine. Sem tenant, ou sem assinatura que valha, recebe free.
-- Em atraso (past_due/grace) os recursos continuam até grace_until; sem grace_until,
-- até 7 dias depois de current_period_end (tolerância do ADR 0013).
create or replace function private.site_entitlements(target_site uuid)
returns table (
  plan_code text,
  plan_name text,
  max_vitrines integer,
  max_active_items integer,
  max_item_blocks integer,
  features text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with effective as (
    select coalesce((
      select sub.plan_code
      from public.sites s
      join public.subscriptions sub on sub.tenant_id = s.tenant_id
      where s.id = target_site
        and (
          sub.status = 'active'
          or (
            sub.status in ('past_due', 'grace')
            and coalesce(sub.grace_until, sub.current_period_end + interval '7 days') > now()
          )
        )
    ), 'free') as code
  )
  select p.code, p.name, p.max_vitrines, p.max_active_items, p.max_item_blocks, p.features
  from effective e
  join public.plans p on p.code = e.code
  where exists (select 1 from public.sites s where s.id = target_site);
$$;

revoke all on function private.site_entitlements(uuid) from public, anon, authenticated;

-- Leitura pela equipe da vitrine (Worker com o token do usuário).
create or replace function public.read_site_entitlements(target_site uuid)
returns table (
  plan_code text,
  plan_name text,
  max_vitrines integer,
  max_active_items integer,
  max_item_blocks integer,
  features text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.*
  from private.site_entitlements(target_site) e
  where private.is_platform_admin()
    or private.has_site_role(target_site, array['owner', 'admin', 'editor', 'viewer', 'collaborator']);
$$;

revoke all on function public.read_site_entitlements(uuid) from public, anon;
grant execute on function public.read_site_entitlements(uuid) to authenticated;

-- Leitura sem sessão (rotas públicas como vitrine.json e webhook de pré-orçamento):
-- só o service_role executa.
create or replace function public.service_site_entitlements(target_site uuid)
returns table (
  plan_code text,
  plan_name text,
  max_vitrines integer,
  max_active_items integer,
  max_item_blocks integer,
  features text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.site_entitlements(target_site);
$$;

revoke all on function public.service_site_entitlements(uuid) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.service_site_entitlements(uuid) to service_role;
  end if;
end;
$$;

-- 6. Caminho do operador: platform_admin altera a assinatura com auditoria.
create or replace function public.set_tenant_subscription(
  target_tenant uuid,
  target_plan text,
  target_status text,
  target_current_period_end timestamptz default null,
  target_grace_until timestamptz default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.subscriptions;
begin
  if not private.is_platform_admin() then
    raise exception 'SUBSCRIPTION_WRITE_FORBIDDEN' using errcode = '42501';
  end if;
  insert into public.subscriptions (
    tenant_id, plan_code, status, provider, current_period_end, grace_until, updated_by
  )
  values (
    target_tenant, target_plan, target_status, 'manual',
    target_current_period_end, target_grace_until, (select auth.uid())
  )
  on conflict (tenant_id) do update set
    plan_code = excluded.plan_code,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    grace_until = excluded.grace_until,
    updated_by = excluded.updated_by
  returning * into result;
  return result;
end;
$$;

revoke all on function public.set_tenant_subscription(uuid, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.set_tenant_subscription(uuid, text, text, timestamptz, timestamptz) to authenticated;

-- 7. Teto do plano também no banco: a publicação não passa dos itens ativos do plano.
create or replace function private.enforce_publication_plan_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed integer;
begin
  select e.max_active_items into allowed from private.site_entitlements(new.site_id) e;
  if jsonb_array_length(new.menu->'items') > coalesce(allowed, 20) then
    raise exception 'ACTIVE_ITEMS_LIMIT_EXCEEDED' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_publication_plan_items() from public, anon, authenticated;

drop trigger if exists publications_plan_items on public.publications;
create trigger publications_plan_items
before insert or update of menu on public.publications
for each row execute function private.enforce_publication_plan_items();

-- O teto fixo de 20 itens sai da constraint (agora vale o do plano, até 100) e
-- plano, situação de pagamento e identificadores do provedor nunca entram no artefato.
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
    and jsonb_array_length(menu->'items') between 1 and 100
    and jsonb_typeof(menu->'categories') = 'array'
    and not (menu ?| array[
      'owner_user_id', 'ownerUserId', 'ownerEmail', 'email',
      'userId', 'user_id', 'siteId', 'site_id',
      'session', 'token', 'accessToken', 'refreshToken',
      'service_role', 'serviceRoleKey', 'internalCost', 'internalNotes',
      'active', 'available', 'password', 'secret',
      'plan', 'planCode', 'plan_code', 'subscription', 'subscriptionStatus',
      'subscription_status', 'paymentStatus', 'payment_status', 'billing',
      'provider', 'providerCustomerId', 'provider_customer_id',
      'providerSubscriptionId', 'provider_subscription_id',
      'currentPeriodEnd', 'current_period_end', 'graceUntil', 'grace_until', 'entitlements'
    ])
  ) not valid;

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
    and jsonb_array_length(menu->'items') between 1 and 100
    and jsonb_typeof(menu->'categories') = 'array'
    and not (menu ?| array[
      'owner_user_id', 'ownerUserId', 'ownerEmail', 'email',
      'userId', 'user_id', 'siteId', 'site_id',
      'session', 'token', 'accessToken', 'refreshToken',
      'service_role', 'serviceRoleKey', 'internalCost', 'internalNotes',
      'active', 'available', 'password', 'secret',
      'plan', 'planCode', 'plan_code', 'subscription', 'subscriptionStatus',
      'subscription_status', 'paymentStatus', 'payment_status', 'billing',
      'provider', 'providerCustomerId', 'provider_customer_id',
      'providerSubscriptionId', 'provider_subscription_id',
      'currentPeriodEnd', 'current_period_end', 'graceUntil', 'grace_until', 'entitlements'
    ])
  ) not valid;

-- 8. Migração do campo legado tenants.plan (ADR 0013): custom_domain passa a
-- essencial; bespoke recebe direitos de profissional até revisão manual.
insert into public.subscriptions (tenant_id, plan_code, status, provider)
select t.id, case t.plan when 'custom_domain' then 'essencial' else 'profissional' end, 'active', 'manual'
from public.tenants t
where t.plan in ('custom_domain', 'bespoke')
on conflict (tenant_id) do nothing;

commit;
