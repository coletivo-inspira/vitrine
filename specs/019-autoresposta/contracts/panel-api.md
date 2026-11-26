# Contrato: API do painel da AutoResposta

Todas as rotas exigem sessão (`401 UNAUTHORIZED` sem ela) e respondem `cache-control: no-store`. Quem não é da equipe da vitrine recebe `404 SITE_NOT_FOUND`. Mutações exigem `Origin` igual à do painel (`403 FORBIDDEN_ORIGIN`) e, quando têm corpo, `Content-Type: application/json`.

## `GET /api/sites/:siteId/auto-reply`

Papéis: `owner`, `admin`, `editor`, `viewer`.

```json
{
  "autoReply": {
    "role": "owner",
    "canManage": true,
    "availability": "available",
    "connection": {
      "provider": "instagram",
      "username": "pizzaria.exemplo",
      "displayName": "Pizzaria Exemplo",
      "status": "connected",
      "statusReason": null,
      "hasMessagingPermission": true,
      "webhookSubscribed": true,
      "connectedAt": "2026-11-26T18:40:00.000Z",
      "expiresAt": null,
      "lastEventAt": null
    },
    "settings": {
      "enabled": false,
      "message": "Olá! Obrigado pelo contato. ...\n\n{{vitrine.url}}",
      "frequency": "daily",
      "version": 1,
      "enabledAt": null,
      "lastSentAt": null
    },
    "publicUrl": "https://vitrine.inspira.dev.br/pizzaria-exemplo",
    "publicUrlReason": null,
    "preview": "Olá! Obrigado pelo contato. ...\n\nhttps://vitrine.inspira.dev.br/pizzaria-exemplo",
    "enableBlocker": null,
    "limits": { "maxBytes": 1000 }
  }
}
```

- `availability`: `available`, `not_allowed` (vitrine fora do piloto), `platform_disabled` (interruptor global ou do canal desligado) ou `unconfigured` (ambiente sem `META_*`, `AUTO_REPLY_ENCRYPTION_KEY` ou acesso de serviço).
- `enableBlocker`: motivo que impede ligar agora (`not_connected`, `reconnect_required`, `connection_suspended`, `permission_missing`, `site_not_published`, `site_paused`, `site_archived`, `site_demo`, `public_url_invalid` ou o valor de `availability`), ou `null`.
- Nunca traz token, credencial, `config_id` nem identificador de consumidor.

## `PUT /api/sites/:siteId/auto-reply`

Papéis: `owner`, `admin`. Corpo:

```json
{ "enabled": true, "message": "...", "frequency": "daily", "version": 1 }
```

| Erro | Status | Quando |
| --- | --- | --- |
| `AUTO_REPLY_MESSAGE_EMPTY`, `AUTO_REPLY_MESSAGE_INVALID`, `AUTO_REPLY_MESSAGE_VARIABLE`, `AUTO_REPLY_MESSAGE_TOO_LONG` | 422 | Mensagem vazia, com caractere de controle, variável desconhecida ou acima de 1000 bytes com o endereço (`field: "message"`, `fieldErrors`) |
| `AUTO_REPLY_FREQUENCY_INVALID` | 422 | Frequência fora de `once`, `daily`, `weekly` |
| `AUTO_REPLY_VERSION_CONFLICT` | 409 | `version` diferente da atual |
| `AUTO_REPLY_NOT_AVAILABLE` | 409 | Ligar sem os interruptores ou sem liberação |
| `AUTO_REPLY_CONNECTION_REQUIRED` | 409 | Ligar sem conexão `connected` com `instagram_manage_messages` |
| `AUTO_REPLY_SITE_NOT_PUBLISHED` | 409 | Ligar com vitrine sem publicação ativa, pausada, arquivada ou demonstração |
| `AUTO_REPLY_UNAVAILABLE` | 503 | Ligar num ambiente sem configuração |

Resposta: o mesmo corpo do `GET`.

## `POST /api/sites/:siteId/auto-reply/instagram/connect`

Papéis: `owner`, `admin`. Corpo `{}`. Exige `availability = available`. Cria o estado OAuth (10 minutos, uso único) e devolve:

```json
{ "authorizeUrl": "https://www.facebook.com/v27.0/dialog/oauth?client_id=...&config_id=...&redirect_uri=...&response_type=code&state=...&prompt=login", "expiresInSeconds": 600 }
```

Sem `scope` e sem segredo na URL. Erros: `409 AUTO_REPLY_NOT_AVAILABLE`, `503 AUTO_REPLY_UNAVAILABLE`.

## `GET /api/instagram/oauth/callback`

Retorno da Meta (`code`, `state` ou `error`). Sempre responde `302` para `PORTAL_ORIGIN/?autoResposta=<resultado>&vitrine=<siteId>` com `referrer-policy: no-referrer`.

| `autoResposta` | Significado |
| --- | --- |
| `connected` | Conexão gravada, assinatura de webhooks confirmada |
| `connected_without_webhook` | Gravada, mas a Meta não confirmou a assinatura de `messages` |
| `cancelled` | A pessoa cancelou na Meta |
| `permission_missing` | Token sem `instagram_basic` e `instagram_manage_messages` |
| `no_account`, `multiple_accounts` | Nenhuma ou mais de uma conta compartilhada (na primeira conexão) |
| `account_in_use`, `account_mismatch` | Conta já em outra vitrine; troca de conta na reconexão |
| `invalid_state`, `invalid_callback`, `meta_error` | Estado inválido, vencido, reutilizado ou de outra sessão; retorno sem código; erro da Meta |

`state` inválido é recusado antes de qualquer chamada à Meta.

## `DELETE /api/sites/:siteId/auto-reply/instagram/connection`

Papéis: `owner`, `admin`. Tenta `DELETE /<IG_ID>/subscribed_apps`, depois apaga credencial, janelas e conexão, cancela pendentes, desliga e audita. Resposta: corpo do `GET` + `webhookRemoved` (`true`, `false` ou `null` quando não havia credencial).
