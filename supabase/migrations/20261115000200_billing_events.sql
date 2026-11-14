-- Migração 20261115000200_billing_events.sql
-- Eventos de webhook do provedor de cobrança (issue #113, ADR 0013). Guarda só
-- identificadores do provedor: nenhum CPF, CNPJ, e-mail de cobrança, cartão ou corpo
-- do evento. Migração append-only: nunca modifique migrações anteriores.
begin;

-- 1. Registro de eventos já recebidos. A chave (provider, event_id) torna o webhook
-- idempotente: o mesmo evento entregue duas vezes só é aplicado uma vez.
create table if not exists private.billing_events (
  provider text not null check (provider in ('asaas', 'stripe')),
  event_id text not null check (event_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  event_type text not null check (event_type ~ '^[A-Za-z0-9_.]{1,64}$'),
  provider_subscription_id text null check (
    provider_subscription_id is null or provider_subscription_id ~ '^[A-Za-z0-9_-]{1,128}$'
  ),
  provider_payment_id text null check (
    provider_payment_id is null or provider_payment_id ~ '^[A-Za-z0-9_-]{1,128}$'
  ),
  tenant_id uuid null references public.tenants(id) on delete set null,
  outcome text not null default 'ignored' check (outcome in ('applied', 'ignored', 'unmatched')),
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create index if not exists billing_events_tenant_idx
  on private.billing_events(tenant_id, received_at desc)
  where tenant_id is not null;

alter table private.billing_events enable row level security;
revoke all on private.billing_events from public, anon, authenticated;

-- 2. Aplicação de um evento, atômica: grava o id e muda a assinatura na mesma
-- transação. Devolve 'duplicate', 'unmatched', 'ignored' ou 'applied'.
-- period_mode: extend (max), clamp (min) ou keep, como em src/billing/provider.mjs.
create or replace function public.billing_apply_event(
  target_provider text,
  target_event_id text,
  target_event_type text,
  target_subscription text,
  target_payment text,
  next_status text,
  next_period_end timestamptz,
  period_mode text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub public.subscriptions;
begin
  if next_status is not null and next_status not in ('active', 'past_due', 'canceled') then
    raise exception 'BILLING_EVENT_INVALID_STATUS' using errcode = '22023';
  end if;
  if coalesce(period_mode, 'keep') not in ('extend', 'clamp', 'keep') then
    raise exception 'BILLING_EVENT_INVALID_PERIOD_MODE' using errcode = '22023';
  end if;

  insert into private.billing_events (
    provider, event_id, event_type, provider_subscription_id, provider_payment_id
  )
  values (target_provider, target_event_id, target_event_type, target_subscription, target_payment)
  on conflict (provider, event_id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  if target_subscription is not null then
    select s.* into sub
    from public.subscriptions s
    where s.provider = target_provider and s.provider_subscription_id = target_subscription
    for update;
  end if;

  if sub.id is null then
    update private.billing_events set outcome = 'unmatched'
    where provider = target_provider and event_id = target_event_id;
    return 'unmatched';
  end if;

  update private.billing_events set tenant_id = sub.tenant_id
  where provider = target_provider and event_id = target_event_id;

  -- Cancelada é final para este identificador (uma nova contratação gera outro), e
  -- atraso ou estorno não se aplicam a uma assinatura que ainda não foi paga.
  if next_status is null
    or sub.status = 'canceled'
    or (next_status = 'past_due' and sub.status = 'pending') then
    return 'ignored';
  end if;

  update public.subscriptions set
    status = next_status,
    current_period_end = case coalesce(period_mode, 'keep')
      when 'extend' then greatest(sub.current_period_end, next_period_end)
      when 'clamp' then least(sub.current_period_end, next_period_end)
      else sub.current_period_end
    end,
    grace_until = case when next_status = 'active' then null else sub.grace_until end,
    updated_by = null
  where id = sub.id;

  update private.billing_events set outcome = 'applied'
  where provider = target_provider and event_id = target_event_id;
  return 'applied';
end;
$$;

-- 3. Início da contratação: grava os identificadores do provedor e deixa a
-- assinatura em 'pending' (direitos de free) até o provedor confirmar o pagamento.
-- Devolve o identificador da assinatura anterior do mesmo provedor, para cancelar.
create or replace function public.billing_attach_checkout(
  target_tenant uuid,
  target_user uuid,
  target_plan text,
  target_provider text,
  target_customer text,
  target_subscription text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.subscriptions;
begin
  if target_plan = 'free' or not exists (select 1 from public.plans p where p.code = target_plan) then
    raise exception 'BILLING_PLAN_INVALID' using errcode = '22023';
  end if;
  if target_provider not in ('asaas', 'stripe')
    or target_customer !~ '^[A-Za-z0-9_-]{1,128}$'
    or target_subscription !~ '^[A-Za-z0-9_-]{1,128}$' then
    raise exception 'BILLING_PROVIDER_IDS_INVALID' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.tenants t where t.id = target_tenant and t.owner_user_id = target_user
  ) then
    raise exception 'BILLING_TENANT_FORBIDDEN' using errcode = '42501';
  end if;

  select s.* into previous from public.subscriptions s where s.tenant_id = target_tenant for update;
  if previous.id is not null and previous.status in ('active', 'past_due', 'grace') then
    raise exception 'SUBSCRIPTION_ALREADY_ACTIVE' using errcode = '23505';
  end if;

  insert into public.subscriptions (
    tenant_id, plan_code, status, provider, provider_customer_id, provider_subscription_id,
    current_period_end, grace_until, updated_by
  )
  values (
    target_tenant, target_plan, 'pending', target_provider, target_customer, target_subscription,
    null, null, target_user
  )
  on conflict (tenant_id) do update set
    plan_code = excluded.plan_code,
    status = excluded.status,
    provider = excluded.provider,
    provider_customer_id = excluded.provider_customer_id,
    provider_subscription_id = excluded.provider_subscription_id,
    current_period_end = null,
    grace_until = null,
    updated_by = excluded.updated_by;

  return case
    when previous.provider = target_provider and previous.provider_subscription_id <> target_subscription
      then previous.provider_subscription_id
  end;
end;
$$;

revoke all on function public.billing_apply_event(text, text, text, text, text, text, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.billing_attach_checkout(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.billing_apply_event(text, text, text, text, text, text, timestamptz, text)
      to service_role;
    grant execute on function public.billing_attach_checkout(uuid, uuid, text, text, text, text)
      to service_role;
  end if;
end;
$$;

commit;
