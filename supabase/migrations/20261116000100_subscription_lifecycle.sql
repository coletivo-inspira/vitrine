-- Migração 20261116000100_subscription_lifecycle.sql
-- Ciclo da assinatura (issue #114, ADR 0013 Cobrança item 6): tolerância de 7 dias,
-- suspensão só dos recursos pagos, reativação pelo webhook e aviso ao dono. Nada em
-- sites, drafts, publications ou site_memberships é apagado ou alterado aqui.
-- Migração append-only: nunca modifique migrações anteriores.
begin;

-- 1. Auditoria com a origem da mudança. O Cron e o cancelamento pelo dono marcam a
-- transação com vitrine.subscription_source; qualquer outro valor é ignorado.
create or replace function private.audit_subscription_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := coalesce((select auth.uid()), case when tg_op = 'DELETE' then old.updated_by else new.updated_by end);
  marked text := current_setting('vitrine.subscription_source', true);
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
        when marked in ('lifecycle', 'owner_cancel') then marked
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

-- 2. Direitos: igual à migração 20261115000100, mais a decisão da issue #114 de manter
-- o plano de uma assinatura cancelada até o fim do período já pago.
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
          or (sub.status = 'canceled' and sub.current_period_end > now())
        )
    ), 'free') as code
  )
  select p.code, p.name, p.max_vitrines, p.max_active_items, p.max_item_blocks, p.features
  from effective e
  join public.plans p on p.code = e.code
  where exists (select 1 from public.sites s where s.id = target_site);
$$;

revoke all on function private.site_entitlements(uuid) from public, anon, authenticated;

-- 3. Verificação do Cron, em lote e numa única chamada:
--   active ou past_due com vencimento passado -> grace (grace_until = vencimento + 7 dias)
--   grace com grace_until passado (ou atrasada além da tolerância) -> suspended
-- A reativação vem de public.billing_apply_event (pagamento confirmado -> active).
create or replace function public.billing_lifecycle_tick(max_rows integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch integer := least(greatest(coalesce(max_rows, 200), 1), 1000);
  moved_grace integer := 0;
  moved_suspended integer := 0;
  has_more boolean := false;
begin
  perform set_config('vitrine.subscription_source', 'lifecycle', true);

  with due as (
    select s.id, coalesce(s.grace_until, s.current_period_end + interval '7 days') as until
    from public.subscriptions s
    where (s.status in ('active', 'past_due') and s.current_period_end <= now())
      or (
        s.status = 'grace'
        and coalesce(s.grace_until, s.current_period_end + interval '7 days') <= now()
      )
    order by s.current_period_end nulls last, s.id
    limit batch
    for update skip locked
  ),
  changed as (
    update public.subscriptions s set
      status = case when d.until <= now() then 'suspended' else 'grace' end,
      grace_until = d.until,
      updated_by = null
    from due d
    where s.id = d.id
    returning s.status
  )
  select
    count(*) filter (where status = 'grace'),
    count(*) filter (where status = 'suspended')
  into moved_grace, moved_suspended
  from changed;

  select exists (
    select 1 from public.subscriptions s
    where (s.status in ('active', 'past_due') and s.current_period_end <= now())
      or (
        s.status = 'grace'
        and coalesce(s.grace_until, s.current_period_end + interval '7 days') <= now()
      )
  ) into has_more;

  perform set_config('vitrine.subscription_source', '', true);
  return jsonb_build_object('grace', moved_grace, 'suspended', moved_suspended, 'hasMore', has_more);
end;
$$;

-- 4. Cancelamento a pedido do dono, depois de cancelar no provedor. O período pago
-- continua valendo (item 2); a assinatura não volta por evento (billing_apply_event).
create or replace function public.billing_cancel_by_owner(target_tenant uuid, target_user uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.subscriptions;
begin
  if not exists (
    select 1 from public.tenants t where t.id = target_tenant and t.owner_user_id = target_user
  ) then
    raise exception 'BILLING_TENANT_FORBIDDEN' using errcode = '42501';
  end if;
  perform set_config('vitrine.subscription_source', 'owner_cancel', true);
  update public.subscriptions s set status = 'canceled', updated_by = target_user
  where s.tenant_id = target_tenant and s.status <> 'canceled'
  returning * into result;
  perform set_config('vitrine.subscription_source', '', true);
  if result.id is null then
    raise exception 'SUBSCRIPTION_NOT_CANCELABLE' using errcode = '22023';
  end if;
  return result;
end;
$$;

-- 5. Aviso no painel: só a pessoa dona da organização lê vencimento e tolerância.
create or replace function public.read_subscription_notices()
returns table (
  tenant_id uuid,
  plan_code text,
  plan_name text,
  status text,
  current_period_end timestamptz,
  grace_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.tenant_id, s.plan_code, p.name, s.status, s.current_period_end, s.grace_until
  from public.subscriptions s
  join public.tenants t on t.id = s.tenant_id
  join public.plans p on p.code = s.plan_code
  where t.owner_user_id = (select auth.uid())
    and s.status in ('active', 'past_due', 'grace', 'suspended');
$$;

-- 6. Domínio próprio canônico só enquanto a vitrine tem o recurso custom_domain.
-- Suspensa, a vitrine volta a ser canônica em vitrine.inspira.dev.br/<endereço>;
-- o registro do domínio e o hostname na Cloudflare continuam (nada é apagado).
create or replace function public.resolve_showcase_host(requested_hostname text)
returns table (slug text, canonical boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.slug, coalesce('custom_domain' = any(e.features), false)
  from public.custom_domains d
  join public.sites s on s.id = d.site_id
  left join lateral private.site_entitlements(s.id) e on true
  where d.hostname = requested_hostname and d.status = 'active' and d.ssl_status = 'active'
    and d.cf_hostname_id is not null;
$$;

revoke all on function public.billing_lifecycle_tick(integer) from public, anon, authenticated;
revoke all on function public.billing_cancel_by_owner(uuid, uuid) from public, anon, authenticated;
revoke all on function public.read_subscription_notices() from public, anon;
grant execute on function public.read_subscription_notices() to authenticated;
revoke all on function public.resolve_showcase_host(text) from public;
grant execute on function public.resolve_showcase_host(text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.billing_lifecycle_tick(integer) to service_role;
    grant execute on function public.billing_cancel_by_owner(uuid, uuid) to service_role;
    grant execute on function public.resolve_showcase_host(text) to service_role;
  end if;
end;
$$;

commit;
