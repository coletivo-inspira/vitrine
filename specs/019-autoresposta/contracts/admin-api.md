# Contrato: administração da AutoResposta

Sessão obrigatória (`401`); só `platform_admin` (`403 FORBIDDEN_PLATFORM_ADMIN`), checado no Worker (`isPlatformAdmin`) e de novo no banco (`private.is_platform_admin()`). Mutações exigem `Origin` do painel e JSON. Respostas `no-store`; nunca trazem token, credencial nem dado de consumidor.

## `GET /api/admin/auto-reply`

```json
{
  "autoReply": {
    "controls": { "enabled": false, "instagramEnabled": false, "updatedAt": "..." },
    "allowedSites": [{ "siteId": "...", "slug": "pizzaria-exemplo" }],
    "connections": [{
      "connectionId": "...", "siteId": "...", "slug": "pizzaria-exemplo", "provider": "instagram",
      "username": "pizzaria.exemplo", "status": "connected", "statusReason": null, "enabled": true,
      "connectedAt": "...", "lastEventAt": "...", "expiresAt": null
    }],
    "last7Days": {
      "received": 12, "sent": 7, "skippedFrequency": 4, "skipped": 5, "failed": 0,
      "authFailures": 0, "uncertain": 0, "cancelled": 0
    }
  }
}
```

A resposta também traz `keys` (`currentVersion`, `previousKeyConfigured`, `stableHashKey`, sem valores), `deletionRequests` dos últimos 30 dias, `webhookSubscribed` e `keyVersion` por conexão e `alerts`: lista ordenada por gravidade (`critical`, `warning`, `info`) com `code`, `title`, `detail`, `count` e até 10 `sites`. Códigos: `auth_failures`, `high_failure_rate`, `rotation_missing_previous_key`, `hash_key_unstable`, `token_expired`, `credentials_pending_rotation`, `token_expiring`, `reconnect_required`, `webhook_not_subscribed`, `no_events`, `uncertain_sends`, `deletion_pending_review`, `connections_suspended`.

## `PUT /api/admin/auto-reply/controls`

Corpo `{ "enabled": true, "instagramEnabled": true }` (campos opcionais). Desligar barra novos envios na hora (a releitura antes do envio cancela eventos em processamento). Auditado (`auto_reply_controls`).

## `PUT /api/admin/auto-reply/sites/:siteId`

Corpo `{ "allowed": true | false }`. `false` desliga a resposta daquela vitrine. Auditado (`auto_reply_site_access`).

## `POST /api/admin/auto-reply/connections/:connectionId/suspend`

Corpo `{}`. Conexão vai para `suspended` (`platform_suspended`) e a resposta é desligada. Para reativar, o dono reconecta. Auditado (`channel_suspend`).

## `POST /api/admin/auto-reply/rotate-keys`

Corpo `{}`. Recifra até 10 credenciais com `key_version` menor que `AUTO_REPLY_KEY_VERSION`: abre com a chave atual ou a anterior, cifra com a atual e troca só se a cifra não mudou desde a leitura. Resposta: `rotation` (`currentVersion`, `rotated`, `failed`, `conflicts`, `remaining`) e a leitura atualizada. Com `AUTO_REPLY_ENCRYPTION_KEY_PREVIOUS` configurada e sem `AUTO_REPLY_HASH_KEY`, responde `409 AUTO_REPLY_HASH_KEY_REQUIRED`. O Cron recifra 5 por execução nas mesmas condições.

## Tela

Aba "Resposta automática" da Administração da plataforma (`web/portal/auto-reply-admin.mjs`).
