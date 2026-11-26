-- AutoResposta: rotação da chave de cifragem com recifragem, registro dos pedidos de
-- exclusão da Meta (página de acompanhamento) e dados extras para os alertas da
-- administração (specs/019-autoresposta, ADR 0017). Append-only.
begin;

-- 1. A conexão grava a versão da chave usada na cifra.
drop function if exists public.service_save_channel_connection(
  uuid, uuid, text, text, text, text, text, text[], text, timestamptz, boolean
);

create or replace function public.service_save_channel_connection(
  target_site uuid, actor uuid, target_provider text, target_account_id text, target_business_id text,
  target_username text, target_display_name text, target_scopes text[], target_token_ciphertext text,
  target_expires_at timestamptz, target_webhook_subscribed boolean, target_key_version integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing private.channel_connections%rowtype;
  other_site uuid;
  conn_id uuid;
begin
  select cc.site_id into other_site from private.channel_connections cc
  where cc.provider = target_provider and cc.provider_account_id = target_account_id and cc.site_id <> target_site;
  if other_site is not null then
    raise exception using errcode = 'P0001', message = 'CHANNEL_ACCOUNT_IN_USE';
  end if;
  select * into existing from private.channel_connections
  where site_id = target_site and provider = target_provider for update;
  if found and existing.provider_account_id <> target_account_id then
    raise exception using errcode = 'P0001', message = 'CHANNEL_ACCOUNT_MISMATCH';
  end if;
  insert into private.channel_connections (
    site_id, provider, provider_account_id, provider_business_id, username, display_name, status,
    status_reason, scopes, webhook_subscribed, connected_by, connected_at, last_verified_at, expires_at
  ) values (
    target_site, target_provider, target_account_id, target_business_id, target_username, target_display_name,
    'connected', null, coalesce(target_scopes, '{}'), coalesce(target_webhook_subscribed, false), actor, now(), now(),
    target_expires_at
  )
  on conflict (site_id, provider) do update set
    provider_business_id = excluded.provider_business_id,
    username = excluded.username,
    display_name = excluded.display_name,
    status = 'connected',
    status_reason = null,
    scopes = excluded.scopes,
    webhook_subscribed = excluded.webhook_subscribed,
    connected_by = excluded.connected_by,
    last_verified_at = now(),
    expires_at = excluded.expires_at,
    updated_at = now()
  returning id into conn_id;
  insert into private.channel_credentials (connection_id, token_ciphertext, expires_at, key_version)
  values (conn_id, target_token_ciphertext, target_expires_at, coalesce(target_key_version, 1))
  on conflict (connection_id) do update set
    token_ciphertext = excluded.token_ciphertext,
    expires_at = excluded.expires_at,
    key_version = excluded.key_version,
    refreshed_at = now();
  perform private.auto_reply_audit(
    target_site, actor, case when existing.id is null then 'channel_connect' else 'channel_reconnect' end,
    conn_id::text, jsonb_build_object('provider', target_provider, 'username', target_username)
  );
  return private.auto_reply_status(target_site);
end;
$$;
revoke all on function public.service_save_channel_connection(
  uuid, uuid, text, text, text, text, text, text[], text, timestamptz, boolean, integer
) from public, anon, authenticated;

-- 2. Recifragem: lote de credenciais com versão antiga e troca condicional (só se a cifra
-- não mudou desde a leitura, para não sobrescrever uma reconexão concorrente).
create or replace function public.service_auto_reply_credentials_to_rotate(current_version integer, batch integer default 10)
returns table (connection_id uuid, site_id uuid, provider text, provider_account_id text, token_ciphertext text, key_version integer)
language sql
stable
security definer
set search_path = ''
as $$
  select cc.id, cc.site_id, cc.provider, cc.provider_account_id, cr.token_ciphertext, cr.key_version
  from private.channel_credentials cr
  join private.channel_connections cc on cc.id = cr.connection_id
  where cr.key_version < current_version
  order by cr.refreshed_at
  limit least(greatest(batch, 1), 50);
$$;
revoke all on function public.service_auto_reply_credentials_to_rotate(integer, integer) from public, anon, authenticated;

create or replace function public.service_rotate_channel_credential(
  target_connection uuid, old_ciphertext text, new_ciphertext text, new_version integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.channel_credentials
  set token_ciphertext = new_ciphertext, key_version = new_version, refreshed_at = now()
  where connection_id = target_connection and token_ciphertext = old_ciphertext and key_version < new_version;
  return found;
end;
$$;
revoke all on function public.service_rotate_channel_credential(uuid, text, text, integer) from public, anon, authenticated;

-- 3. Pedidos de exclusão da Meta: só o hash do código de confirmação, situação e datas.
create table if not exists private.data_deletion_requests (
  code_hash text primary key check (code_hash ~ '^[a-f0-9]{64}$'),
  provider text not null check (provider in ('instagram')),
  status text not null check (status in ('completed', 'pending_review')),
  connections_removed integer not null default 0 check (connections_removed between 0 and 100),
  received_at timestamptz not null default now(),
  completed_at timestamptz null
);
alter table private.data_deletion_requests enable row level security;
revoke all on table private.data_deletion_requests from public, anon, authenticated;

create or replace function public.service_record_data_deletion(
  target_code_hash text, target_provider text, target_removed integer
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.data_deletion_requests (code_hash, provider, status, connections_removed, completed_at)
  values (target_code_hash, target_provider,
          case when target_removed > 0 then 'completed' else 'pending_review' end,
          greatest(target_removed, 0), case when target_removed > 0 then now() end)
  on conflict (code_hash) do nothing;
$$;
revoke all on function public.service_record_data_deletion(text, text, integer) from public, anon, authenticated;

create or replace function public.service_read_data_deletion(target_code_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('status', r.status, 'receivedAt', r.received_at, 'completedAt', r.completed_at)
  from private.data_deletion_requests r where r.code_hash = target_code_hash;
$$;
revoke all on function public.service_read_data_deletion(text) from public, anon, authenticated;

-- 4. Manutenção: mesma assinatura, agora apaga pedidos de exclusão com mais de 1 ano.
create or replace function public.service_auto_reply_maintenance(
  stale_minutes integer default 15, retention_days integer default 90, verify_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale_count integer;
  purged_count integer;
  windows_count integer;
  to_verify jsonb;
begin
  update private.auto_reply_deliveries set status = 'uncertain', reason = 'processing_interrupted', processed_at = now()
  where status = 'processing' and received_at < now() - make_interval(mins => greatest(stale_minutes, 5));
  get diagnostics stale_count = row_count;
  delete from private.auto_reply_deliveries where received_at < now() - make_interval(days => greatest(retention_days, 7));
  get diagnostics purged_count = row_count;
  delete from private.auto_reply_recipient_windows w
  using private.channel_connections cc
  left join private.auto_reply_settings st on st.site_id = cc.site_id
  where w.connection_id = cc.id and coalesce(st.frequency, 'daily') <> 'once'
    and w.last_sent_at < now() - interval '37 days';
  get diagnostics windows_count = row_count;
  delete from private.channel_oauth_states where expires_at < now() - interval '1 day';
  delete from private.data_deletion_requests where received_at < now() - interval '365 days';
  select coalesce(jsonb_agg(jsonb_build_object('connectionId', x.id, 'siteId', x.site_id, 'provider', x.provider,
                                               'accountId', x.provider_account_id,
                                               'tokenCiphertext', x.token_ciphertext)), '[]'::jsonb)
  into to_verify
  from (
    select cc.id, cc.site_id, cc.provider, cc.provider_account_id, cr.token_ciphertext
    from private.channel_connections cc join private.channel_credentials cr on cr.connection_id = cc.id
    where cc.status = 'connected' and (cc.last_verified_at is null or cc.last_verified_at < now() - interval '24 hours')
    order by cc.last_verified_at nulls first
    limit least(greatest(verify_limit, 0), 20)
  ) x;
  return jsonb_build_object('stale', stale_count, 'purged', purged_count, 'windows', windows_count,
                            'verify', to_verify);
end;
$$;
revoke all on function public.service_auto_reply_maintenance(integer, integer, integer) from public, anon, authenticated;

-- 5. Leitura da administração com dados para os alertas (sem tokens nem consumidores).
create or replace function public.admin_read_auto_reply()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return jsonb_build_object(
    'controls', (select jsonb_build_object('enabled', c.enabled, 'instagramEnabled', c.instagram_enabled,
                                           'updatedAt', c.updated_at) from private.auto_reply_controls c where c.id),
    'allowedSites', coalesce((select jsonb_agg(jsonb_build_object('siteId', s.id, 'slug', s.slug) order by s.slug)
                              from private.auto_reply_site_access a join public.sites s on s.id = a.site_id
                              where a.allowed), '[]'::jsonb),
    'connections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'connectionId', cc.id, 'siteId', cc.site_id, 'slug', s.slug, 'provider', cc.provider,
        'username', cc.username, 'status', cc.status, 'statusReason', cc.status_reason,
        'enabled', coalesce(st.enabled, false), 'connectedAt', cc.connected_at,
        'lastEventAt', cc.last_event_at, 'expiresAt', cc.expires_at,
        'webhookSubscribed', cc.webhook_subscribed, 'keyVersion', cr.key_version
      ) order by s.slug)
      from private.channel_connections cc
      join public.sites s on s.id = cc.site_id
      left join private.channel_credentials cr on cr.connection_id = cc.id
      left join private.auto_reply_settings st on st.site_id = cc.site_id
    ), '[]'::jsonb),
    'last7Days', (
      select jsonb_build_object(
        'received', count(*),
        'sent', count(*) filter (where d.status = 'sent'),
        'skippedFrequency', count(*) filter (where d.reason = 'frequency'),
        'skipped', count(*) filter (where d.status = 'skipped'),
        'failed', count(*) filter (where d.status = 'failed'),
        'authFailures', count(*) filter (where d.reason in ('token_invalid', 'permission_missing')),
        'uncertain', count(*) filter (where d.status = 'uncertain'),
        'cancelled', count(*) filter (where d.status = 'cancelled'),
        'processing', count(*) filter (where d.status = 'processing')
      )
      from private.auto_reply_deliveries d where d.received_at > now() - interval '7 days'
    ),
    'deletionRequests', (
      select jsonb_build_object(
        'pendingReview', count(*) filter (where r.status = 'pending_review'),
        'completed', count(*) filter (where r.status = 'completed')
      )
      from private.data_deletion_requests r where r.received_at > now() - interval '30 days'
    )
  );
end;
$$;
revoke all on function public.admin_read_auto_reply() from public, anon;
grant execute on function public.admin_read_auto_reply() to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.service_save_channel_connection(
      uuid, uuid, text, text, text, text, text, text[], text, timestamptz, boolean, integer) to service_role;
    grant execute on function public.service_auto_reply_credentials_to_rotate(integer, integer) to service_role;
    grant execute on function public.service_rotate_channel_credential(uuid, text, text, integer) to service_role;
    grant execute on function public.service_record_data_deletion(text, text, integer) to service_role;
    grant execute on function public.service_read_data_deletion(text) to service_role;
    grant execute on function public.service_auto_reply_maintenance(integer, integer, integer) to service_role;
  end if;
end;
$$;

commit;
