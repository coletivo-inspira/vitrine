-- AutoResposta (specs/019-autoresposta, ADR 0017 proposto).
-- Append-only. Conexão de canal social por vitrine, credencial cifrada pelo Worker
-- (AES-GCM com AUTO_REPLY_ENCRYPTION_KEY; o banco nunca vê o token em claro),
-- configuração da resposta automática, execuções sem conteúdo, janela de frequência
-- por consumidor (hash HMAC da conexão), estados OAuth de uso único e controles da
-- plataforma. Nenhum texto de mensagem, anexo ou identificador de consumidor em claro.
begin;

-- 1. Controles da plataforma (interruptores) e vitrines liberadas para o piloto.
create table if not exists private.auto_reply_controls (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  instagram_enabled boolean not null default false,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into private.auto_reply_controls (id) values (true) on conflict (id) do nothing;

create table if not exists private.auto_reply_site_access (
  site_id uuid primary key references public.sites(id) on delete cascade,
  allowed boolean not null default true,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 2. Conexão de canal: uma por vitrine e canal; uma conta social responde por uma vitrine.
create table if not exists private.channel_connections (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  provider text not null check (provider in ('instagram')),
  provider_account_id text not null check (provider_account_id ~ '^[0-9]{1,32}$'),
  provider_business_id text null check (provider_business_id is null or provider_business_id ~ '^[0-9]{1,32}$'),
  username text null check (username is null or username ~ '^[A-Za-z0-9._]{1,30}$'),
  display_name text null check (display_name is null or length(display_name) <= 120),
  status text not null default 'connected' check (
    status in ('connected', 'reconnect_required', 'suspended')
  ),
  status_reason text null check (status_reason is null or status_reason ~ '^[a-z_]{1,48}$'),
  scopes text[] not null default '{}'::text[],
  webhook_subscribed boolean not null default false,
  connected_by uuid null references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_verified_at timestamptz null,
  expires_at timestamptz null,
  last_event_at timestamptz null,
  updated_at timestamptz not null default now(),
  unique (site_id, provider),
  unique (provider, provider_account_id)
);

create table if not exists private.channel_credentials (
  connection_id uuid primary key references private.channel_connections(id) on delete cascade,
  token_ciphertext text not null check (
    token_ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' and length(token_ciphertext) <= 8192
  ),
  token_type text not null default 'business_system_user' check (token_type in ('business_system_user')),
  expires_at timestamptz null,
  refreshed_at timestamptz not null default now(),
  key_version integer not null default 1 check (key_version between 1 and 32767)
);

-- 3. Configuração por vitrine. Ativar exige conexão e liberação (validado nas funções).
create table if not exists private.auto_reply_settings (
  site_id uuid primary key references public.sites(id) on delete cascade,
  enabled boolean not null default false,
  message text not null check (
    length(trim(message)) between 1 and 1000 and octet_length(message) <= 1000
    and message !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
  ),
  frequency text not null default 'daily' check (frequency in ('once', 'daily', 'weekly')),
  version integer not null default 1 check (version >= 1),
  enabled_at timestamptz null,
  last_sent_at timestamptz null,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 4. Execuções (sem conteúdo). Idempotência pelo id da mensagem no provedor.
create table if not exists private.auto_reply_deliveries (
  id uuid primary key default gen_random_uuid(),
  site_id uuid null references public.sites(id) on delete set null,
  connection_id uuid null references private.channel_connections(id) on delete set null,
  provider text not null check (provider in ('instagram')),
  provider_event_id text not null check (length(provider_event_id) between 1 and 256),
  recipient_hash text null check (recipient_hash is null or recipient_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'processing' check (
    status in ('processing', 'sent', 'skipped', 'failed', 'uncertain', 'cancelled')
  ),
  reason text null check (reason is null or reason ~ '^[a-z_]{1,48}$'),
  error_code text null check (error_code is null or error_code ~ '^[A-Za-z0-9_.:-]{1,48}$'),
  attempts integer not null default 0 check (attempts between 0 and 10),
  provider_message_id text null check (provider_message_id is null or length(provider_message_id) <= 256),
  correlation_id text null check (correlation_id is null or correlation_id ~ '^[A-Za-z0-9-]{8,64}$'),
  event_at timestamptz null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  sent_at timestamptz null,
  unique (provider, provider_event_id)
);
create index if not exists idx_auto_reply_deliveries_site on private.auto_reply_deliveries(site_id, received_at desc);
create index if not exists idx_auto_reply_deliveries_processing on private.auto_reply_deliveries(received_at)
  where status = 'processing';

-- 5. Janela de frequência por consumidor (hash) e conexão.
create table if not exists private.auto_reply_recipient_windows (
  connection_id uuid not null references private.channel_connections(id) on delete cascade,
  recipient_hash text not null check (recipient_hash ~ '^[a-f0-9]{64}$'),
  last_sent_at timestamptz not null,
  primary key (connection_id, recipient_hash)
);

-- 6. Estados OAuth de uso único (só o hash do nonce).
create table if not exists private.channel_oauth_states (
  nonce_hash text primary key check (nonce_hash ~ '^[a-f0-9]{64}$'),
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('instagram')),
  purpose text not null check (purpose in ('auto_reply')),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);

alter table private.auto_reply_controls enable row level security;
alter table private.auto_reply_site_access enable row level security;
alter table private.channel_connections enable row level security;
alter table private.channel_credentials enable row level security;
alter table private.auto_reply_settings enable row level security;
alter table private.auto_reply_deliveries enable row level security;
alter table private.auto_reply_recipient_windows enable row level security;
alter table private.channel_oauth_states enable row level security;
revoke all on table private.auto_reply_controls, private.auto_reply_site_access, private.channel_connections,
  private.channel_credentials, private.auto_reply_settings, private.auto_reply_deliveries,
  private.auto_reply_recipient_windows, private.channel_oauth_states
  from public, anon, authenticated;

-- Auditoria com autor explícito (rotas de serviço não têm auth.uid()).
create or replace function private.auto_reply_audit(
  target_site uuid, actor uuid, target_action text, target_entity_id text, target_summary jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor is null then return; end if;
  insert into public.audit_logs (site_id, actor_user_id, action, entity_type, entity_id, summary)
  values (target_site, actor, target_action, 'auto_reply', target_entity_id, coalesce(target_summary, '{}'::jsonb));
end;
$$;
revoke all on function private.auto_reply_audit(uuid, uuid, text, text, jsonb) from public, anon, authenticated;

-- Situação da publicação usada pela ativação e pelo envio.
create or replace function private.auto_reply_site_state(target_site uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'siteId', s.id,
    'slug', s.slug,
    'name', s.name,
    'published', exists (select 1 from public.publications p where p.site_id = s.id and p.status = 'active'),
    'paused', s.paused_at is not null,
    'archived', s.archived_at is not null,
    'demo', s.owner_user_id is null,
    'customDomainAllowed', coalesce('custom_domain' = any(e.features), false),
    'domains', coalesce((
      select jsonb_agg(jsonb_build_object('hostname', d.hostname, 'status', d.status, 'ssl_status', d.ssl_status))
      from public.custom_domains d where d.site_id = s.id and d.status = 'active' and d.ssl_status = 'active'
    ), '[]'::jsonb)
  )
  from public.sites s
  left join lateral private.site_entitlements(s.id) e on true
  where s.id = target_site;
$$;
revoke all on function private.auto_reply_site_state(uuid) from public, anon, authenticated;

create or replace function private.auto_reply_site_allowed(target_site uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.allowed from private.auto_reply_site_access a where a.site_id = target_site), false);
$$;
revoke all on function private.auto_reply_site_allowed(uuid) from public, anon, authenticated;

create or replace function private.auto_reply_status(target_site uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'controls', (select jsonb_build_object('enabled', c.enabled, 'instagramEnabled', c.instagram_enabled)
                 from private.auto_reply_controls c where c.id),
    'siteAllowed', private.auto_reply_site_allowed(target_site),
    'site', private.auto_reply_site_state(target_site),
    'connection', (
      select jsonb_build_object(
        'provider', cc.provider, 'accountId', cc.provider_account_id, 'username', cc.username,
        'displayName', cc.display_name, 'status', cc.status, 'statusReason', cc.status_reason,
        'scopes', to_jsonb(cc.scopes), 'webhookSubscribed', cc.webhook_subscribed,
        'connectedAt', cc.connected_at, 'lastVerifiedAt', cc.last_verified_at, 'expiresAt', cc.expires_at,
        'lastEventAt', cc.last_event_at
      )
      from private.channel_connections cc where cc.site_id = target_site and cc.provider = 'instagram'
    ),
    'settings', (
      select jsonb_build_object(
        'enabled', st.enabled, 'message', st.message, 'frequency', st.frequency, 'version', st.version,
        'enabledAt', st.enabled_at, 'lastSentAt', st.last_sent_at, 'updatedAt', st.updated_at
      )
      from private.auto_reply_settings st where st.site_id = target_site
    )
  );
$$;
revoke all on function private.auto_reply_status(uuid) from public, anon, authenticated;

-- Leitura para toda a equipe da vitrine (editor e leitor só veem).
create or replace function public.read_auto_reply(target_site uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_site_role(target_site, array['owner', 'admin', 'editor', 'viewer']) then
    raise exception using errcode = '42501', message = 'SITE_NOT_FOUND';
  end if;
  return private.auto_reply_status(target_site);
end;
$$;
revoke all on function public.read_auto_reply(uuid) from public, anon;
grant execute on function public.read_auto_reply(uuid) to authenticated;

-- Salvar a configuração. Ativar exige tudo pronto; versão antiga recebe AUTO_REPLY_VERSION_CONFLICT.
create or replace function public.save_auto_reply_settings(
  target_site uuid, target_enabled boolean, target_message text, target_frequency text, expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row private.auto_reply_settings%rowtype;
  conn private.channel_connections%rowtype;
  site_state jsonb;
  controls private.auto_reply_controls%rowtype;
begin
  if not private.has_site_role(target_site, array['owner', 'admin']) then
    raise exception using errcode = '42501', message = 'SITE_NOT_FOUND';
  end if;
  select * into current_row from private.auto_reply_settings where site_id = target_site for update;
  if found and coalesce(expected_version, 0) <> current_row.version then
    raise exception using errcode = 'P0001', message = 'AUTO_REPLY_VERSION_CONFLICT';
  end if;
  if not found and coalesce(expected_version, 0) not in (0, 1) then
    raise exception using errcode = 'P0001', message = 'AUTO_REPLY_VERSION_CONFLICT';
  end if;
  if target_enabled then
    select * into controls from private.auto_reply_controls where id;
    if not (controls.enabled and controls.instagram_enabled) or not private.auto_reply_site_allowed(target_site) then
      raise exception using errcode = 'P0001', message = 'AUTO_REPLY_NOT_AVAILABLE';
    end if;
    select * into conn from private.channel_connections where site_id = target_site and provider = 'instagram';
    if not found or conn.status <> 'connected' or not ('instagram_manage_messages' = any(conn.scopes)) then
      raise exception using errcode = 'P0001', message = 'AUTO_REPLY_CONNECTION_REQUIRED';
    end if;
    site_state := private.auto_reply_site_state(target_site);
    if not (site_state->>'published')::boolean or (site_state->>'paused')::boolean
       or (site_state->>'archived')::boolean or (site_state->>'demo')::boolean then
      raise exception using errcode = 'P0001', message = 'AUTO_REPLY_SITE_NOT_PUBLISHED';
    end if;
  end if;
  insert into private.auto_reply_settings (site_id, enabled, message, frequency, enabled_at, updated_by)
  values (target_site, target_enabled, target_message, coalesce(target_frequency, 'daily'),
          case when target_enabled then now() end, (select auth.uid()))
  on conflict (site_id) do update set
    enabled = excluded.enabled,
    message = excluded.message,
    frequency = excluded.frequency,
    enabled_at = case
      when excluded.enabled and not private.auto_reply_settings.enabled then now()
      when excluded.enabled then private.auto_reply_settings.enabled_at
      else null end,
    version = private.auto_reply_settings.version + 1,
    updated_by = excluded.updated_by,
    updated_at = now();
  perform private.record_audit_log(
    target_site, 'auto_reply_settings', 'auto_reply', target_site::text,
    jsonb_build_object('enabled', target_enabled, 'frequency', coalesce(target_frequency, 'daily'),
                       'messageBytes', octet_length(target_message))
  );
  return private.auto_reply_status(target_site);
end;
$$;
revoke all on function public.save_auto_reply_settings(uuid, boolean, text, text, integer) from public, anon;
grant execute on function public.save_auto_reply_settings(uuid, boolean, text, text, integer) to authenticated;

-- Estado OAuth: criado e consumido só pelo Worker (service_role).
create or replace function public.service_create_channel_oauth_state(
  target_nonce_hash text, target_site uuid, target_user uuid, target_provider text, target_purpose text,
  ttl_seconds integer default 600
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.channel_oauth_states where expires_at < now() - interval '1 day';
  insert into private.channel_oauth_states (nonce_hash, site_id, user_id, provider, purpose, expires_at)
  values (target_nonce_hash, target_site, target_user, target_provider, target_purpose,
          now() + make_interval(secs => least(greatest(ttl_seconds, 60), 900)));
$$;
revoke all on function public.service_create_channel_oauth_state(text, uuid, uuid, text, text, integer)
  from public, anon, authenticated;

create or replace function public.service_consume_channel_oauth_state(target_nonce_hash text)
returns table (site_id uuid, user_id uuid, provider text, purpose text)
language sql
security definer
set search_path = ''
as $$
  update private.channel_oauth_states s
  set consumed_at = now()
  where s.nonce_hash = target_nonce_hash and s.consumed_at is null and s.expires_at > now()
  returning s.site_id, s.user_id, s.provider, s.purpose;
$$;
revoke all on function public.service_consume_channel_oauth_state(text) from public, anon, authenticated;

-- Grava a conexão (primeira vez ou reconexão da mesma conta).
create or replace function public.service_save_channel_connection(
  target_site uuid, actor uuid, target_provider text, target_account_id text, target_business_id text,
  target_username text, target_display_name text, target_scopes text[], target_token_ciphertext text,
  target_expires_at timestamptz, target_webhook_subscribed boolean
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
  insert into private.channel_credentials (connection_id, token_ciphertext, expires_at)
  values (conn_id, target_token_ciphertext, target_expires_at)
  on conflict (connection_id) do update set
    token_ciphertext = excluded.token_ciphertext,
    expires_at = excluded.expires_at,
    refreshed_at = now();
  perform private.auto_reply_audit(
    target_site, actor, case when existing.id is null then 'channel_connect' else 'channel_reconnect' end,
    conn_id::text, jsonb_build_object('provider', target_provider, 'username', target_username)
  );
  return private.auto_reply_status(target_site);
end;
$$;
revoke all on function public.service_save_channel_connection(
  uuid, uuid, text, text, text, text, text, text[], text, timestamptz, boolean
) from public, anon, authenticated;

-- Credencial para desconectar ou verificar (Worker decifra).
create or replace function public.service_channel_credential(target_site uuid, target_provider text)
returns table (connection_id uuid, provider_account_id text, token_ciphertext text)
language sql
stable
security definer
set search_path = ''
as $$
  select cc.id, cc.provider_account_id, cr.token_ciphertext
  from private.channel_connections cc
  join private.channel_credentials cr on cr.connection_id = cc.id
  where cc.site_id = target_site and cc.provider = target_provider;
$$;
revoke all on function public.service_channel_credential(uuid, text) from public, anon, authenticated;

-- Desconexão: apaga credencial e janelas, desliga, cancela pendentes, audita.
create or replace function public.service_disconnect_channel(
  target_site uuid, target_provider text, actor uuid, target_reason text default 'owner_disconnect'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conn private.channel_connections%rowtype;
begin
  select * into conn from private.channel_connections where site_id = target_site and provider = target_provider for update;
  if found then
    update private.auto_reply_deliveries set status = 'cancelled', reason = 'disconnected', processed_at = now()
    where connection_id = conn.id and status = 'processing';
    delete from private.channel_connections where id = conn.id;
    perform private.auto_reply_audit(target_site, actor, 'channel_disconnect', conn.id::text,
      jsonb_build_object('provider', target_provider, 'reason', target_reason));
  end if;
  update private.auto_reply_settings set enabled = false, enabled_at = null, version = version + 1, updated_at = now()
  where site_id = target_site and enabled;
  return private.auto_reply_status(target_site);
end;
$$;
revoke all on function public.service_disconnect_channel(uuid, text, uuid, text) from public, anon, authenticated;

-- Contexto do envio, relido antes de cada envio (RN-010).
create or replace function public.service_auto_reply_target(target_provider text, target_account_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'connectionId', cc.id,
    'siteId', cc.site_id,
    'accountId', cc.provider_account_id,
    'status', cc.status,
    'scopes', to_jsonb(cc.scopes),
    'tokenCiphertext', cr.token_ciphertext,
    'controls', (select jsonb_build_object('enabled', c.enabled, 'instagramEnabled', c.instagram_enabled)
                 from private.auto_reply_controls c where c.id),
    'siteAllowed', private.auto_reply_site_allowed(cc.site_id),
    'site', private.auto_reply_site_state(cc.site_id),
    'settings', (select jsonb_build_object('enabled', st.enabled, 'message', st.message, 'frequency', st.frequency,
                                           'version', st.version, 'enabledAt', st.enabled_at)
                 from private.auto_reply_settings st where st.site_id = cc.site_id)
  )
  from private.channel_connections cc
  left join private.channel_credentials cr on cr.connection_id = cc.id
  where cc.provider = target_provider and cc.provider_account_id = target_account_id;
$$;
revoke all on function public.service_auto_reply_target(text, text) from public, anon, authenticated;

-- Idempotência: só a primeira chegada do evento devolve o id.
create or replace function public.service_claim_auto_reply_event(
  target_provider text, target_event_id text, target_site uuid, target_connection uuid,
  target_recipient_hash text, target_event_at timestamptz, target_correlation_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed uuid;
begin
  insert into private.auto_reply_deliveries (
    provider, provider_event_id, site_id, connection_id, recipient_hash, event_at, correlation_id
  ) values (
    target_provider, target_event_id, target_site, target_connection, target_recipient_hash, target_event_at,
    target_correlation_id
  )
  on conflict (provider, provider_event_id) do nothing
  returning id into claimed;
  if claimed is not null and target_connection is not null then
    update private.channel_connections set last_event_at = now() where id = target_connection;
  end if;
  return claimed;
end;
$$;
revoke all on function public.service_claim_auto_reply_event(text, text, uuid, uuid, text, timestamptz, text)
  from public, anon, authenticated;

-- Reserva atômica da vaga de frequência. Devolve claimed e o envio anterior (para liberar).
create or replace function public.service_claim_recipient_window(
  target_connection uuid, target_recipient_hash text, target_frequency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous timestamptz;
  min_gap interval := case target_frequency when 'weekly' then interval '7 days' when 'daily' then interval '24 hours'
                           else null end;
  won boolean := false;
begin
  select w.last_sent_at into previous from private.auto_reply_recipient_windows w
  where w.connection_id = target_connection and w.recipient_hash = target_recipient_hash for update;
  if not found then
    insert into private.auto_reply_recipient_windows (connection_id, recipient_hash, last_sent_at)
    values (target_connection, target_recipient_hash, now())
    on conflict do nothing;
    won := found;
  elsif min_gap is not null and previous <= now() - min_gap then
    update private.auto_reply_recipient_windows set last_sent_at = now()
    where connection_id = target_connection and recipient_hash = target_recipient_hash;
    won := true;
  end if;
  return jsonb_build_object('claimed', won, 'previous', previous);
end;
$$;
revoke all on function public.service_claim_recipient_window(uuid, text, text) from public, anon, authenticated;

create or replace function public.service_release_recipient_window(
  target_connection uuid, target_recipient_hash text, previous_sent_at timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.auto_reply_recipient_windows
  where connection_id = target_connection and recipient_hash = target_recipient_hash and previous_sent_at is null;
  update private.auto_reply_recipient_windows set last_sent_at = previous_sent_at
  where connection_id = target_connection and recipient_hash = target_recipient_hash and previous_sent_at is not null;
$$;
revoke all on function public.service_release_recipient_window(uuid, text, timestamptz) from public, anon, authenticated;

create or replace function public.service_finish_auto_reply_delivery(
  target_delivery uuid, target_status text, target_reason text, target_error_code text, target_attempts integer,
  target_provider_message_id text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.auto_reply_deliveries set
    status = target_status, reason = target_reason, error_code = target_error_code,
    attempts = coalesce(target_attempts, attempts), provider_message_id = target_provider_message_id,
    processed_at = now(), sent_at = case when target_status = 'sent' then now() else sent_at end
  where id = target_delivery and status = 'processing';
  update private.auto_reply_settings st set last_sent_at = now()
  from private.auto_reply_deliveries d
  where d.id = target_delivery and target_status = 'sent' and st.site_id = d.site_id;
$$;
revoke all on function public.service_finish_auto_reply_delivery(uuid, text, text, text, integer, text)
  from public, anon, authenticated;

-- Token inválido, revogado ou sem permissão: reconexão necessária e resposta desligada.
create or replace function public.service_mark_channel_connection(
  target_connection uuid, target_status text, target_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conn_site uuid;
begin
  update private.channel_connections set status = target_status, status_reason = target_reason, updated_at = now()
  where id = target_connection
  returning site_id into conn_site;
  if conn_site is not null and target_status <> 'connected' then
    update private.auto_reply_settings set enabled = false, enabled_at = null, version = version + 1, updated_at = now()
    where site_id = conn_site and enabled;
  end if;
end;
$$;
revoke all on function public.service_mark_channel_connection(uuid, text, text) from public, anon, authenticated;

create or replace function public.service_touch_channel_connection(
  target_connection uuid, target_expires_at timestamptz, target_scopes text[]
)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.channel_connections set last_verified_at = now(), expires_at = target_expires_at,
    scopes = coalesce(target_scopes, scopes), updated_at = now()
  where id = target_connection;
$$;
revoke all on function public.service_touch_channel_connection(uuid, timestamptz, text[]) from public, anon, authenticated;

create or replace function public.service_find_channel_connection(target_provider text, target_external_id text)
returns table (site_id uuid, connection_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select cc.site_id, cc.id from private.channel_connections cc
  where cc.provider = target_provider
    and (cc.provider_account_id = target_external_id or cc.provider_business_id = target_external_id);
$$;
revoke all on function public.service_find_channel_connection(text, text) from public, anon, authenticated;

-- Manutenção do Cron: execuções presas viram inconclusivas; retenção de 90 dias;
-- janelas de 24 h/7 dias vencidas há mais de 30 dias; conexões a verificar.
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

-- Administração da plataforma (platform_admin). Sem tokens nem consumidores.
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
        'lastEventAt', cc.last_event_at, 'expiresAt', cc.expires_at
      ) order by s.slug)
      from private.channel_connections cc
      join public.sites s on s.id = cc.site_id
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
        'cancelled', count(*) filter (where d.status = 'cancelled')
      )
      from private.auto_reply_deliveries d where d.received_at > now() - interval '7 days'
    )
  );
end;
$$;
revoke all on function public.admin_read_auto_reply() from public, anon;
grant execute on function public.admin_read_auto_reply() to authenticated;

create or replace function public.admin_set_auto_reply_controls(target_enabled boolean, target_instagram_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  update private.auto_reply_controls set enabled = coalesce(target_enabled, enabled),
    instagram_enabled = coalesce(target_instagram_enabled, instagram_enabled),
    updated_by = (select auth.uid()), updated_at = now()
  where id;
  insert into public.audit_logs (site_id, actor_user_id, action, entity_type, entity_id, summary)
  values (null, (select auth.uid()), 'auto_reply_controls', 'auto_reply', 'controls',
          jsonb_build_object('enabled', target_enabled, 'instagramEnabled', target_instagram_enabled));
  return public.admin_read_auto_reply();
end;
$$;
revoke all on function public.admin_set_auto_reply_controls(boolean, boolean) from public, anon;
grant execute on function public.admin_set_auto_reply_controls(boolean, boolean) to authenticated;

create or replace function public.admin_set_auto_reply_site_access(target_site uuid, target_allowed boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  insert into private.auto_reply_site_access (site_id, allowed, updated_by)
  values (target_site, target_allowed, (select auth.uid()))
  on conflict (site_id) do update set allowed = excluded.allowed, updated_by = excluded.updated_by, updated_at = now();
  if not target_allowed then
    update private.auto_reply_settings set enabled = false, enabled_at = null, version = version + 1, updated_at = now()
    where site_id = target_site and enabled;
  end if;
  perform private.record_audit_log(target_site, 'auto_reply_site_access', 'auto_reply', target_site::text,
    jsonb_build_object('allowed', target_allowed));
  return public.admin_read_auto_reply();
end;
$$;
revoke all on function public.admin_set_auto_reply_site_access(uuid, boolean) from public, anon;
grant execute on function public.admin_set_auto_reply_site_access(uuid, boolean) to authenticated;

create or replace function public.admin_suspend_channel_connection(target_connection uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conn_site uuid;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select site_id into conn_site from private.channel_connections where id = target_connection;
  if conn_site is null then
    raise exception using errcode = 'P0001', message = 'CHANNEL_CONNECTION_NOT_FOUND';
  end if;
  perform public.service_mark_channel_connection(target_connection, 'suspended', 'platform_suspended');
  perform private.record_audit_log(conn_site, 'channel_suspend', 'auto_reply', target_connection::text, '{}'::jsonb);
  return public.admin_read_auto_reply();
end;
$$;
revoke all on function public.admin_suspend_channel_connection(uuid) from public, anon;
grant execute on function public.admin_suspend_channel_connection(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.service_create_channel_oauth_state(text, uuid, uuid, text, text, integer) to service_role;
    grant execute on function public.service_consume_channel_oauth_state(text) to service_role;
    grant execute on function public.service_save_channel_connection(
      uuid, uuid, text, text, text, text, text, text[], text, timestamptz, boolean) to service_role;
    grant execute on function public.service_channel_credential(uuid, text) to service_role;
    grant execute on function public.service_disconnect_channel(uuid, text, uuid, text) to service_role;
    grant execute on function public.service_auto_reply_target(text, text) to service_role;
    grant execute on function public.service_claim_auto_reply_event(text, text, uuid, uuid, text, timestamptz, text)
      to service_role;
    grant execute on function public.service_claim_recipient_window(uuid, text, text) to service_role;
    grant execute on function public.service_release_recipient_window(uuid, text, timestamptz) to service_role;
    grant execute on function public.service_finish_auto_reply_delivery(uuid, text, text, text, integer, text)
      to service_role;
    grant execute on function public.service_mark_channel_connection(uuid, text, text) to service_role;
    grant execute on function public.service_touch_channel_connection(uuid, timestamptz, text[]) to service_role;
    grant execute on function public.service_find_channel_connection(text, text) to service_role;
    grant execute on function public.service_auto_reply_maintenance(integer, integer, integer) to service_role;
  end if;
end;
$$;

commit;
