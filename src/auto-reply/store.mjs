// Adaptadores de armazenamento da AutoResposta: PostgREST (migração
// 20261126001000_auto_reply.sql) e memória (testes e ambiente sem Supabase), com as
// mesmas regras: uma conta por vitrine, idempotência, vaga de frequência atômica.
import { PortalValidationError } from '../portal-validation.mjs';
import { frequencyAllows } from './rules.mjs';

const DOMAIN_ERRORS = Object.freeze({
  AUTO_REPLY_VERSION_CONFLICT: [409, 'A configuração mudou em outra aba ou por outra pessoa. Recarregue para ver a versão atual.'],
  AUTO_REPLY_NOT_AVAILABLE: [409, 'A resposta automática ainda não está liberada para esta vitrine.'],
  AUTO_REPLY_CONNECTION_REQUIRED: [409, 'Conecte o Instagram com a permissão de mensagens antes de ligar.'],
  AUTO_REPLY_SITE_NOT_PUBLISHED: [409, 'Publique a vitrine para ligar a resposta automática.'],
  CHANNEL_ACCOUNT_IN_USE: [409, 'Esta conta já responde por outra vitrine. Desconecte lá primeiro.'],
  CHANNEL_ACCOUNT_MISMATCH: [409, 'A conta autorizada é diferente da conectada. Desconecte a atual antes de trocar.'],
  CHANNEL_CONNECTION_NOT_FOUND: [404, 'Conexão não encontrada.']
});

export function autoReplyDomainError(code) {
  const [status, message] = DOMAIN_ERRORS[code] ?? [];
  return status ? new PortalValidationError(status, code, message) : null;
}

export function autoReplyUnavailableError() {
  return new PortalValidationError(503, 'AUTO_REPLY_UNAVAILABLE', 'A resposta automática ainda não está disponível neste ambiente.');
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : value ?? null;
}

/** Adaptador em memória. `sites` é o Map do createMemoryStore. */
export function createMemoryAutoReply({ sites, publicationsBySlug = new Map(), memberships = [], now = () => Date.now() }) {
  const state = {
    controls: { enabled: false, instagramEnabled: false },
    siteAccess: new Map(),
    connections: new Map(),
    credentials: new Map(),
    settings: new Map(),
    deliveries: new Map(),
    windows: new Map(),
    oauthStates: new Map(),
    customDomains: new Map(),
    deletionRequests: new Map(),
    audit: []
  };
  let sequence = 0;
  const nextId = (prefix) => `${prefix}-${String(++sequence).padStart(8, '0')}-0000-4000-8000-000000000000`.slice(0, 36);

  const roleOf = (siteId, userId) => {
    const site = sites.get(siteId);
    if (!site) return null;
    if ((site.owner_user_id ?? site.ownerUserId) === userId) return 'owner';
    return memberships.find((m) => m.siteId === siteId && m.userId === userId)?.role ?? null;
  };
  const requireRole = (siteId, userId, roles) => {
    if (!roles.includes(roleOf(siteId, userId))) throw new PortalValidationError(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
  };
  const connectionOf = (siteId, provider = 'instagram') =>
    [...state.connections.values()].find((c) => c.siteId === siteId && c.provider === provider) ?? null;

  function siteState(siteId) {
    const site = sites.get(siteId);
    if (!site) return null;
    const domains = state.customDomains.get(siteId) ?? [];
    return {
      siteId,
      slug: site.slug,
      name: site.name ?? site.slug,
      published: publicationsBySlug.has(site.slug) || site.published === true,
      paused: Boolean(site.paused_at ?? site.pausedAt),
      archived: Boolean(site.archived_at ?? site.archivedAt),
      demo: !(site.owner_user_id ?? site.ownerUserId),
      customDomainAllowed: site.customDomainAllowed === true,
      domains: domains.filter((d) => d.status === 'active' && d.ssl_status === 'active')
    };
  }

  function status(siteId) {
    const conn = connectionOf(siteId);
    const settings = state.settings.get(siteId);
    return structuredClone({
      controls: { ...state.controls },
      siteAllowed: state.siteAccess.get(siteId) === true,
      site: siteState(siteId),
      connection: conn ? {
        provider: conn.provider, accountId: conn.accountId, username: conn.username, displayName: conn.displayName,
        status: conn.status, statusReason: conn.statusReason, scopes: [...conn.scopes],
        webhookSubscribed: conn.webhookSubscribed, connectedAt: conn.connectedAt, lastVerifiedAt: conn.lastVerifiedAt,
        expiresAt: conn.expiresAt, lastEventAt: conn.lastEventAt
      } : null,
      settings: settings ? { ...settings } : null
    });
  }

  function disable(siteId) {
    const settings = state.settings.get(siteId);
    if (settings?.enabled) Object.assign(settings, { enabled: false, enabledAt: null, version: settings.version + 1 });
  }

  function target(provider, accountId) {
    const conn = [...state.connections.values()].find((c) => c.provider === provider && c.accountId === accountId);
    if (!conn) return null;
    const settings = state.settings.get(conn.siteId);
    return structuredClone({
      connectionId: conn.id, siteId: conn.siteId, accountId: conn.accountId, status: conn.status,
      scopes: [...conn.scopes], tokenCiphertext: state.credentials.get(conn.id)?.tokenCiphertext ?? null,
      controls: { ...state.controls }, siteAllowed: state.siteAccess.get(conn.siteId) === true,
      site: siteState(conn.siteId),
      settings: settings ? {
        enabled: settings.enabled, message: settings.message, frequency: settings.frequency,
        version: settings.version, enabledAt: settings.enabledAt
      } : null
    });
  }

  return {
    autoReply: state,

    async readAutoReply(siteId, { userId } = {}) {
      requireRole(siteId, userId, ['owner', 'admin', 'editor', 'viewer']);
      return status(siteId);
    },

    async saveAutoReplySettings(siteId, { enabled, message, frequency, expectedVersion }, { userId } = {}) {
      requireRole(siteId, userId, ['owner', 'admin']);
      const current = state.settings.get(siteId);
      if ((current && (expectedVersion ?? 0) !== current.version) || (!current && ![0, 1].includes(expectedVersion ?? 0))) {
        throw autoReplyDomainError('AUTO_REPLY_VERSION_CONFLICT');
      }
      if (enabled) {
        if (!(state.controls.enabled && state.controls.instagramEnabled) || state.siteAccess.get(siteId) !== true) {
          throw autoReplyDomainError('AUTO_REPLY_NOT_AVAILABLE');
        }
        const conn = connectionOf(siteId);
        if (!conn || conn.status !== 'connected' || !conn.scopes.includes('instagram_manage_messages')) {
          throw autoReplyDomainError('AUTO_REPLY_CONNECTION_REQUIRED');
        }
        const site = siteState(siteId);
        if (!site.published || site.paused || site.archived || site.demo) throw autoReplyDomainError('AUTO_REPLY_SITE_NOT_PUBLISHED');
      }
      const at = new Date(now()).toISOString();
      state.settings.set(siteId, {
        enabled: Boolean(enabled), message, frequency: frequency ?? 'daily',
        version: current ? current.version + 1 : 1,
        enabledAt: enabled ? (current?.enabled ? current.enabledAt : at) : null,
        lastSentAt: current?.lastSentAt ?? null, updatedAt: at
      });
      state.audit.push({ siteId, actor: userId, action: 'auto_reply_settings' });
      return status(siteId);
    },

    async createOAuthState({ nonceHash, siteId, userId, provider, purpose, ttlSeconds = 600 }) {
      state.oauthStates.set(nonceHash, { siteId, userId, provider, purpose, expiresAt: now() + ttlSeconds * 1000, consumed: false });
    },

    async consumeOAuthState(nonceHash) {
      const row = state.oauthStates.get(nonceHash);
      if (!row || row.consumed || row.expiresAt <= now()) return null;
      row.consumed = true;
      return { siteId: row.siteId, userId: row.userId, provider: row.provider, purpose: row.purpose };
    },

    async saveChannelConnection({ siteId, actor, provider, accountId, businessId, username, displayName, scopes,
      tokenCiphertext, expiresAt, webhookSubscribed, keyVersion = 1 }) {
      const other = [...state.connections.values()].find((c) => c.provider === provider && c.accountId === accountId && c.siteId !== siteId);
      if (other) throw autoReplyDomainError('CHANNEL_ACCOUNT_IN_USE');
      const existing = connectionOf(siteId, provider);
      if (existing && existing.accountId !== accountId) throw autoReplyDomainError('CHANNEL_ACCOUNT_MISMATCH');
      const at = new Date(now()).toISOString();
      const conn = existing ?? { id: nextId('conn'), siteId, provider, accountId, connectedAt: at, lastEventAt: null };
      Object.assign(conn, {
        businessId: businessId ?? null, username: username ?? null, displayName: displayName ?? null, status: 'connected',
        statusReason: null, scopes: [...(scopes ?? [])], webhookSubscribed: Boolean(webhookSubscribed),
        connectedBy: actor, lastVerifiedAt: at, expiresAt: iso(expiresAt)
      });
      state.connections.set(conn.id, conn);
      state.credentials.set(conn.id, { tokenCiphertext, expiresAt: iso(expiresAt), keyVersion });
      state.audit.push({ siteId, actor, action: existing ? 'channel_reconnect' : 'channel_connect' });
      return status(siteId);
    },

    async getChannelCredential(siteId, provider) {
      const conn = connectionOf(siteId, provider);
      const cred = conn && state.credentials.get(conn.id);
      return cred ? { connectionId: conn.id, accountId: conn.accountId, tokenCiphertext: cred.tokenCiphertext } : null;
    },

    async disconnectChannel(siteId, provider, actor, reason = 'owner_disconnect') {
      const conn = connectionOf(siteId, provider);
      if (conn) {
        for (const delivery of state.deliveries.values()) {
          if (delivery.connectionId === conn.id && delivery.status === 'processing') {
            Object.assign(delivery, { status: 'cancelled', reason: 'disconnected' });
          }
        }
        for (const key of [...state.windows.keys()]) if (key.startsWith(`${conn.id}:`)) state.windows.delete(key);
        state.credentials.delete(conn.id);
        state.connections.delete(conn.id);
        state.audit.push({ siteId, actor, action: 'channel_disconnect', reason });
      }
      disable(siteId);
      return status(siteId);
    },

    async getAutoReplyTarget(provider, accountId) {
      return target(provider, accountId);
    },

    async claimAutoReplyEvent({ provider, eventId, siteId, connectionId, recipientHash, eventAt, correlationId }) {
      const key = `${provider}:${eventId}`;
      if ([...state.deliveries.values()].some((d) => d.key === key)) return null;
      const id = nextId('dlv');
      state.deliveries.set(id, {
        id, key, provider, eventId, siteId, connectionId, recipientHash, eventAt, correlationId,
        status: 'processing', reason: null, errorCode: null, attempts: 0, providerMessageId: null
      });
      const conn = state.connections.get(connectionId);
      if (conn) conn.lastEventAt = new Date(now()).toISOString();
      return id;
    },

    async claimRecipientWindow(connectionId, recipientHash, frequency) {
      const key = `${connectionId}:${recipientHash}`;
      const previous = state.windows.has(key) ? state.windows.get(key) : null;
      if (!frequencyAllows(frequency, previous, now())) return { claimed: false, previous: iso(previous && new Date(previous)) };
      state.windows.set(key, now());
      return { claimed: true, previous: previous === null ? null : new Date(previous).toISOString() };
    },

    async releaseRecipientWindow(connectionId, recipientHash, previous) {
      const key = `${connectionId}:${recipientHash}`;
      if (previous === null || previous === undefined) state.windows.delete(key);
      else state.windows.set(key, Date.parse(previous));
    },

    async finishAutoReplyDelivery(deliveryId, { status: next, reason = null, errorCode = null, attempts = 0, providerMessageId = null }) {
      const delivery = state.deliveries.get(deliveryId);
      if (delivery?.status === 'processing') {
        Object.assign(delivery, { status: next, reason, errorCode: errorCode ?? null, attempts, providerMessageId });
        if (next === 'sent') {
          const settings = state.settings.get(delivery.siteId);
          if (settings) settings.lastSentAt = new Date(now()).toISOString();
        }
      }
      const saved = delivery ?? {};
      return { status: saved.status ?? next, reason: saved.reason ?? reason, errorCode: saved.errorCode ?? errorCode, attempts: saved.attempts ?? attempts };
    },

    async markChannelConnection(connectionId, nextStatus, reason) {
      const conn = state.connections.get(connectionId);
      if (!conn) return;
      Object.assign(conn, { status: nextStatus, statusReason: reason });
      if (nextStatus !== 'connected') disable(conn.siteId);
    },

    async touchChannelConnection(connectionId, { expiresAt, scopes } = {}) {
      const conn = state.connections.get(connectionId);
      if (conn) Object.assign(conn, { lastVerifiedAt: new Date(now()).toISOString(), expiresAt: iso(expiresAt), scopes: scopes ?? conn.scopes });
    },

    async findChannelConnections(provider, externalId) {
      return [...state.connections.values()]
        .filter((c) => c.provider === provider && (c.accountId === externalId || c.businessId === externalId))
        .map((c) => ({ siteId: c.siteId, connectionId: c.id }));
    },

    async listCredentialsToRotate(currentVersion, batch = 10) {
      return [...state.credentials.entries()]
        .filter(([, cred]) => (cred.keyVersion ?? 1) < currentVersion)
        .slice(0, batch)
        .map(([connectionId, cred]) => {
          const conn = state.connections.get(connectionId);
          return {
            connectionId, siteId: conn.siteId, provider: conn.provider, accountId: conn.accountId,
            tokenCiphertext: cred.tokenCiphertext, keyVersion: cred.keyVersion ?? 1
          };
        });
    },

    async rotateChannelCredential(connectionId, oldCiphertext, newCiphertext, newVersion) {
      const cred = state.credentials.get(connectionId);
      if (!cred || cred.tokenCiphertext !== oldCiphertext || (cred.keyVersion ?? 1) >= newVersion) return false;
      Object.assign(cred, { tokenCiphertext: newCiphertext, keyVersion: newVersion });
      return true;
    },

    async recordDataDeletion(codeHash, provider, removed) {
      if (state.deletionRequests.has(codeHash)) return;
      const at = new Date(now()).toISOString();
      state.deletionRequests.set(codeHash, {
        provider, status: removed > 0 ? 'completed' : 'pending_review', receivedAt: at, completedAt: removed > 0 ? at : null
      });
    },

    async readDataDeletion(codeHash) {
      const row = state.deletionRequests.get(codeHash);
      return row ? { status: row.status, receivedAt: row.receivedAt, completedAt: row.completedAt } : null;
    },

    async autoReplyMaintenance() {
      let stale = 0;
      for (const delivery of state.deliveries.values()) {
        if (delivery.status === 'processing' && delivery.staleForTest) {
          Object.assign(delivery, { status: 'uncertain', reason: 'processing_interrupted' });
          stale += 1;
        }
      }
      return { stale, purged: 0, windows: 0, verify: [] };
    },

    async readAutoReplyAdmin() {
      const deliveries = [...state.deliveries.values()];
      return structuredClone({
        controls: { ...state.controls },
        allowedSites: [...state.siteAccess.entries()].filter(([, allowed]) => allowed)
          .map(([siteId]) => ({ siteId, slug: sites.get(siteId)?.slug ?? null })),
        connections: [...state.connections.values()].map((c) => ({
          connectionId: c.id, siteId: c.siteId, slug: sites.get(c.siteId)?.slug ?? null, provider: c.provider,
          username: c.username, status: c.status, statusReason: c.statusReason,
          enabled: state.settings.get(c.siteId)?.enabled === true, connectedAt: c.connectedAt,
          lastEventAt: c.lastEventAt, expiresAt: c.expiresAt, webhookSubscribed: c.webhookSubscribed,
          keyVersion: state.credentials.get(c.id)?.keyVersion ?? null
        })),
        last7Days: {
          received: deliveries.length,
          sent: deliveries.filter((d) => d.status === 'sent').length,
          skippedFrequency: deliveries.filter((d) => d.reason === 'frequency').length,
          skipped: deliveries.filter((d) => d.status === 'skipped').length,
          failed: deliveries.filter((d) => d.status === 'failed').length,
          authFailures: deliveries.filter((d) => ['token_invalid', 'permission_missing'].includes(d.reason)).length,
          uncertain: deliveries.filter((d) => d.status === 'uncertain').length,
          cancelled: deliveries.filter((d) => d.status === 'cancelled').length,
          processing: deliveries.filter((d) => d.status === 'processing').length
        },
        deletionRequests: {
          pendingReview: [...state.deletionRequests.values()].filter((r) => r.status === 'pending_review').length,
          completed: [...state.deletionRequests.values()].filter((r) => r.status === 'completed').length
        }
      });
    },

    async setAutoReplyControls({ enabled, instagramEnabled }) {
      if (typeof enabled === 'boolean') state.controls.enabled = enabled;
      if (typeof instagramEnabled === 'boolean') state.controls.instagramEnabled = instagramEnabled;
      return this.readAutoReplyAdmin();
    },

    async setAutoReplySiteAccess(siteId, allowed) {
      state.siteAccess.set(siteId, Boolean(allowed));
      if (!allowed) disable(siteId);
      return this.readAutoReplyAdmin();
    },

    async suspendChannelConnection(connectionId) {
      if (!state.connections.has(connectionId)) throw autoReplyDomainError('CHANNEL_CONNECTION_NOT_FOUND');
      await this.markChannelConnection(connectionId, 'suspended', 'platform_suspended');
      return this.readAutoReplyAdmin();
    }
  };
}

/** Adaptador PostgREST. Funções `service_*` exigem SUPABASE_SERVICE_ROLE_KEY. */
export function createRestAutoReply({ baseUrl, fetchImpl, authHeaders }) {
  function serviceHeaders(env) {
    const key = env?.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw autoReplyUnavailableError();
    return { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  }

  async function call(name, body, headers) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (response.ok) return parsed;
    const domain = autoReplyDomainError(String(parsed?.message ?? ''));
    if (domain) throw domain;
    if (response.status === 404) throw autoReplyUnavailableError();
    if (parsed?.message === 'FORBIDDEN') throw new PortalValidationError(403, 'FORBIDDEN_PLATFORM_ADMIN', 'Acesso restrito aos operadores da plataforma.');
    if (response.status === 401 || response.status === 403 || parsed?.message === 'SITE_NOT_FOUND') {
      throw new PortalValidationError(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
    }
    if (response.status === 400 && /check constraint/i.test(String(parsed?.message ?? ''))) {
      throw new PortalValidationError(422, 'AUTO_REPLY_MESSAGE_INVALID', 'Mensagem inválida.');
    }
    throw new Error(`Falha na AutoResposta (${response.status}).`);
  }

  const user = (token) => ({ ...authHeaders(token), 'content-type': 'application/json' });
  const svc = (env) => serviceHeaders(env);

  return {
    readAutoReply: (siteId, { token } = {}) => call('read_auto_reply', { target_site: siteId }, user(token)),
    saveAutoReplySettings: (siteId, { enabled, message, frequency, expectedVersion }, { token } = {}) =>
      call('save_auto_reply_settings', {
        target_site: siteId, target_enabled: Boolean(enabled), target_message: message,
        target_frequency: frequency, expected_version: expectedVersion ?? 0
      }, user(token)),
    createOAuthState: ({ nonceHash, siteId, userId, provider, purpose, ttlSeconds = 600 }, { env } = {}) =>
      call('service_create_channel_oauth_state', {
        target_nonce_hash: nonceHash, target_site: siteId, target_user: userId, target_provider: provider,
        target_purpose: purpose, ttl_seconds: ttlSeconds
      }, svc(env)),
    async consumeOAuthState(nonceHash, { env } = {}) {
      const rows = await call('service_consume_channel_oauth_state', { target_nonce_hash: nonceHash }, svc(env));
      const row = Array.isArray(rows) ? rows[0] : null;
      return row ? { siteId: row.site_id, userId: row.user_id, provider: row.provider, purpose: row.purpose } : null;
    },
    saveChannelConnection: (record, { env } = {}) => call('service_save_channel_connection', {
      target_site: record.siteId, actor: record.actor, target_provider: record.provider,
      target_account_id: record.accountId, target_business_id: record.businessId ?? null,
      target_username: record.username ?? null, target_display_name: record.displayName ?? null,
      target_scopes: record.scopes ?? [], target_token_ciphertext: record.tokenCiphertext,
      target_expires_at: record.expiresAt ?? null, target_webhook_subscribed: Boolean(record.webhookSubscribed),
      target_key_version: record.keyVersion ?? 1
    }, svc(env)),
    async listCredentialsToRotate(currentVersion, batch = 10, { env } = {}) {
      const rows = await call('service_auto_reply_credentials_to_rotate', { current_version: currentVersion, batch }, svc(env));
      return (Array.isArray(rows) ? rows : []).map((row) => ({
        connectionId: row.connection_id, siteId: row.site_id, provider: row.provider, accountId: row.provider_account_id,
        tokenCiphertext: row.token_ciphertext, keyVersion: row.key_version
      }));
    },
    async rotateChannelCredential(connectionId, oldCiphertext, newCiphertext, newVersion, { env } = {}) {
      return (await call('service_rotate_channel_credential', {
        target_connection: connectionId, old_ciphertext: oldCiphertext, new_ciphertext: newCiphertext, new_version: newVersion
      }, svc(env))) === true;
    },
    recordDataDeletion: (codeHash, provider, removed, { env } = {}) => call('service_record_data_deletion', {
      target_code_hash: codeHash, target_provider: provider, target_removed: removed
    }, svc(env)),
    readDataDeletion: (codeHash, { env } = {}) => call('service_read_data_deletion', { target_code_hash: codeHash }, svc(env)),
    async getChannelCredential(siteId, provider, { env } = {}) {
      const rows = await call('service_channel_credential', { target_site: siteId, target_provider: provider }, svc(env));
      const row = Array.isArray(rows) ? rows[0] : null;
      return row ? { connectionId: row.connection_id, accountId: row.provider_account_id, tokenCiphertext: row.token_ciphertext } : null;
    },
    disconnectChannel: (siteId, provider, actor, reason, { env } = {}) =>
      call('service_disconnect_channel', { target_site: siteId, target_provider: provider, actor, target_reason: reason }, svc(env)),
    getAutoReplyTarget: (provider, accountId, { env } = {}) =>
      call('service_auto_reply_target', { target_provider: provider, target_account_id: accountId }, svc(env)),
    claimAutoReplyEvent: (record, { env } = {}) => call('service_claim_auto_reply_event', {
      target_provider: record.provider, target_event_id: record.eventId, target_site: record.siteId,
      target_connection: record.connectionId, target_recipient_hash: record.recipientHash,
      target_event_at: record.eventAt, target_correlation_id: record.correlationId
    }, svc(env)),
    claimRecipientWindow: (connectionId, recipientHash, frequency, { env } = {}) => call('service_claim_recipient_window', {
      target_connection: connectionId, target_recipient_hash: recipientHash, target_frequency: frequency
    }, svc(env)),
    releaseRecipientWindow: (connectionId, recipientHash, previous, { env } = {}) => call('service_release_recipient_window', {
      target_connection: connectionId, target_recipient_hash: recipientHash, previous_sent_at: previous
    }, svc(env)),
    async finishAutoReplyDelivery(deliveryId, result, { env } = {}) {
      await call('service_finish_auto_reply_delivery', {
        target_delivery: deliveryId, target_status: result.status, target_reason: result.reason ?? null,
        target_error_code: result.errorCode ?? null, target_attempts: result.attempts ?? 0,
        target_provider_message_id: result.providerMessageId ?? null
      }, svc(env));
      return { status: result.status, reason: result.reason ?? null, errorCode: result.errorCode ?? null, attempts: result.attempts ?? 0 };
    },
    markChannelConnection: (connectionId, status, reason, { env } = {}) => call('service_mark_channel_connection', {
      target_connection: connectionId, target_status: status, target_reason: reason
    }, svc(env)),
    touchChannelConnection: (connectionId, { expiresAt, scopes } = {}, { env } = {}) => call('service_touch_channel_connection', {
      target_connection: connectionId, target_expires_at: expiresAt ?? null, target_scopes: scopes ?? null
    }, svc(env)),
    async findChannelConnections(provider, externalId, { env } = {}) {
      const rows = await call('service_find_channel_connection', { target_provider: provider, target_external_id: externalId }, svc(env));
      return (Array.isArray(rows) ? rows : []).map((row) => ({ siteId: row.site_id, connectionId: row.connection_id }));
    },
    autoReplyMaintenance: ({ env } = {}) => call('service_auto_reply_maintenance', {
      stale_minutes: 15, retention_days: 90, verify_limit: 5
    }, svc(env)),
    readAutoReplyAdmin: ({ token } = {}) => call('admin_read_auto_reply', {}, user(token)),
    setAutoReplyControls: ({ enabled, instagramEnabled }, { token } = {}) => call('admin_set_auto_reply_controls', {
      target_enabled: typeof enabled === 'boolean' ? enabled : null,
      target_instagram_enabled: typeof instagramEnabled === 'boolean' ? instagramEnabled : null
    }, user(token)),
    setAutoReplySiteAccess: (siteId, allowed, { token } = {}) =>
      call('admin_set_auto_reply_site_access', { target_site: siteId, target_allowed: Boolean(allowed) }, user(token)),
    suspendChannelConnection: (connectionId, { token } = {}) =>
      call('admin_suspend_channel_connection', { target_connection: connectionId }, user(token))
  };
}
