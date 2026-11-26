// Adaptador do Instagram (login unificado: Facebook Login for Business com `config_id`,
// token de usuário do sistema do portfólio do cliente, host graph.facebook.com).
// Nenhuma URL com segredo ou token é registrada em log. docs/integrations/auto-reply/oauth-flow.md.
export const DEFAULT_GRAPH_VERSION = 'v27.0';
export const SEND_TIMEOUT_MS = 8000;
export const API_TIMEOUT_MS = 8000;
export const REQUIRED_SCOPES = Object.freeze(['instagram_basic', 'instagram_manage_messages']);
export const WEBHOOK_FIELDS = 'messages';

export class MetaApiError extends Error {
  constructor(kind, { status = null, code = null, subcode = null } = {}) {
    super(`META_${kind.toUpperCase()}`);
    this.name = 'MetaApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.subcode = subcode;
  }

  get errorCode() {
    return [this.code ?? this.status ?? 'na', this.subcode].filter((part) => part !== null && part !== undefined).join(':');
  }
}

/**
 * Tipos: `token_invalid` e `permission_missing` (reconectar), `messaging_disabled` (o dono
 * desligou "Permitir acesso às mensagens"), `recipient_unavailable`, `rate_limited` e
 * `unavailable` (transitórios), `rejected` (definitivo).
 */
export function classifyGraphError(status, body) {
  const error = body?.error ?? {};
  const code = Number.isInteger(error.code) ? error.code : null;
  const subcode = Number.isInteger(error.error_subcode) ? error.error_subcode : null;
  const message = String(error.message ?? '');
  const meta = { status, code, subcode };
  if (code === 190 || code === 102 || status === 401) return new MetaApiError('token_invalid', meta);
  if (code === 10 && /permission/i.test(message)) return new MetaApiError('permission_missing', meta);
  if (code === 200 && /disabled access|messag/i.test(message)) return new MetaApiError('messaging_disabled', meta);
  if (code === 200 || code === 3 || (code === 10 && !/rate/i.test(message))) return new MetaApiError('permission_missing', meta);
  if (code === 551 || subcode === 2534014 || subcode === 2534022) return new MetaApiError('recipient_unavailable', meta);
  if (status === 429 || [4, 17, 32, 613, 80002, 80006].includes(code)) return new MetaApiError('rate_limited', meta);
  if (status >= 500 || code === 1 || code === 2 || error.is_transient === true) return new MetaApiError('unavailable', meta);
  return new MetaApiError('rejected', meta);
}

export function metaConfig(env = {}) {
  return {
    appId: typeof env.META_APP_ID === 'string' ? env.META_APP_ID.trim() : '',
    appSecret: typeof env.META_APP_SECRET === 'string' ? env.META_APP_SECRET : '',
    configId: typeof env.META_IG_AUTOREPLY_CONFIG_ID === 'string' ? env.META_IG_AUTOREPLY_CONFIG_ID.trim() : '',
    version: /^v\d{1,3}\.\d$/.test(String(env.META_GRAPH_VERSION ?? '')) ? env.META_GRAPH_VERSION : DEFAULT_GRAPH_VERSION
  };
}

export function hasMetaConfig(env = {}) {
  const config = metaConfig(env);
  return Boolean(/^[0-9]{5,32}$/.test(config.appId) && config.appSecret && /^[0-9]{5,32}$/.test(config.configId));
}

export function createInstagramAdapter({ env = {}, fetch: fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  const config = metaConfig(env);
  const graph = `https://graph.facebook.com/${config.version}`;

  async function request(url, init = {}, timeoutMs = API_TIMEOUT_MS) {
    let response;
    try {
      response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), ...init });
    } catch {
      throw new MetaApiError('network');
    }
    const text = await response.text().catch(() => '');
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok || body?.error) throw classifyGraphError(response.status, body);
    return body ?? {};
  }

  return {
    provider: 'instagram',

    /** Tela oficial da Meta. Sem `scope`: as permissões vêm da configuração. */
    buildAuthorizeUrl({ state, redirectUri }) {
      const url = new URL(`https://www.facebook.com/${config.version}/dialog/oauth`);
      url.searchParams.set('client_id', config.appId);
      url.searchParams.set('config_id', config.configId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('state', state);
      url.searchParams.set('prompt', 'login');
      return url.href;
    },

    async exchangeCode({ code, redirectUri }) {
      const url = new URL(`${graph}/oauth/access_token`);
      url.searchParams.set('client_id', config.appId);
      url.searchParams.set('client_secret', config.appSecret);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('code', code);
      const body = await request(url.href);
      if (typeof body.access_token !== 'string' || !body.access_token) throw new MetaApiError('rejected');
      return { accessToken: body.access_token };
    },

    /** `debug_token` com o token do app: validade e permissões concedidas. */
    async inspectToken(accessToken) {
      const url = new URL(`${graph}/debug_token`);
      url.searchParams.set('input_token', accessToken);
      url.searchParams.set('access_token', `${config.appId}|${config.appSecret}`);
      const data = (await request(url.href)).data ?? {};
      const expires = Number(data.expires_at);
      return {
        valid: data.is_valid === true,
        appMatches: String(data.app_id ?? '') === config.appId,
        scopes: Array.isArray(data.scopes) ? data.scopes.filter((scope) => typeof scope === 'string') : [],
        expiresAt: Number.isFinite(expires) && expires > 0 ? new Date(expires * 1000).toISOString() : null,
        businessId: /^[0-9]{1,32}$/.test(String(data.profile_id ?? '')) ? String(data.profile_id) : null
      };
    },

    async listAssignedAccounts(accessToken) {
      const url = new URL(`${graph}/me/assigned_instagram_accounts`);
      url.searchParams.set('fields', 'id,username,name');
      url.searchParams.set('limit', '25');
      const body = await request(url.href, { headers: { authorization: `Bearer ${accessToken}` } });
      return (Array.isArray(body.data) ? body.data : [])
        .filter((account) => /^[0-9]{1,32}$/.test(String(account?.id ?? '')))
        .map((account) => ({
          id: String(account.id),
          username: /^[A-Za-z0-9._]{1,30}$/.test(String(account.username ?? '')) ? account.username : null,
          name: typeof account.name === 'string' ? account.name.slice(0, 120) : null
        }));
    },

    async subscribeWebhooks(accountId, accessToken) {
      const body = new URLSearchParams({ subscribed_fields: WEBHOOK_FIELDS });
      const result = await request(`${graph}/${accountId}/subscribed_apps`, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
      return result.success === true;
    },

    async unsubscribeWebhooks(accountId, accessToken) {
      const result = await request(`${graph}/${accountId}/subscribed_apps`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${accessToken}` }
      });
      return result.success === true;
    },

    /**
     * Uma tentativa de envio. Erro de rede ou tempo esgotado depois do pedido vira
     * `uncertain`: a mensagem pode ter saído, então ninguém reenvia às cegas.
     */
    async sendText({ accountId, recipientId, text, accessToken }) {
      let response;
      try {
        response = await fetchImpl(`${graph}/${accountId}/messages`, {
          method: 'POST',
          redirect: 'manual',
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
          headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ recipient: { id: recipientId }, message: { text } })
        });
      } catch {
        throw new MetaApiError('uncertain');
      }
      const raw = await response.text().catch(() => '');
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }
      if (!response.ok || body?.error) throw classifyGraphError(response.status, body);
      return { messageId: typeof body?.message_id === 'string' ? body.message_id.slice(0, 256) : null };
    }
  };
}
