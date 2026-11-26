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

## `PUT /api/admin/auto-reply/controls`

Corpo `{ "enabled": true, "instagramEnabled": true }` (campos opcionais). Desligar barra novos envios na hora (a releitura antes do envio cancela eventos em processamento). Auditado (`auto_reply_controls`).

## `PUT /api/admin/auto-reply/sites/:siteId`

Corpo `{ "allowed": true | false }`. `false` desliga a resposta daquela vitrine. Auditado (`auto_reply_site_access`).

## `POST /api/admin/auto-reply/connections/:connectionId/suspend`

Corpo `{}`. Conexão vai para `suspended` (`platform_suspended`) e a resposta é desligada. Para reativar, o dono reconecta. Auditado (`channel_suspend`).

## Pendente

A tela de administração no painel ainda não existe: as rotas estão prontas e testadas, e a operação usa `curl` com a sessão de um `platform_admin` (`docs/integrations/auto-reply/operational-runbook.md`). Issue 07 de `docs/backlog/autoresposta/`.
