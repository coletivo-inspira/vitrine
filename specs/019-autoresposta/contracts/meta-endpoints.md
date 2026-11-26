# Contrato: endpoints chamados pela Meta

Nenhum deles usa sessão. Todos respondem `cache-control: no-store`.

## `GET /api/webhooks/meta/instagram` (verificação)

Parâmetros `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`. Se o token bater com `META_WEBHOOK_VERIFY_TOKEN` (comparação em tempo constante), responde `200 text/plain` com o `hub.challenge`; senão `403`.

## `POST /api/webhooks/meta/instagram` (eventos)

1. Corpo acima de 1 MiB → `413`.
2. `X-Hub-Signature-256` ausente ou diferente de `sha256=` + HMAC-SHA256(corpo bruto, `META_APP_SECRET`) → `401`, nada gravado, log `auto_reply_webhook_rejected`.
3. JSON inválido → `400`.
4. Normalização (`src/auto-reply/instagram-webhook.mjs`): só `message` com `mid`, remetente diferente da conta e sem `is_echo`, `is_self`, `is_deleted`, `is_unsupported`, `quick_reply` é elegível. `read`, `reaction`, `message_edit`, `postback`, `referral` e `changes` são ignorados.
5. Ambiente sem configuração → `200` sem gravar.
6. Para cada elegível (até 5 reclamações novas e 12 tentativas por requisição): contexto da conta (`service_auto_reply_target`), hash do consumidor e `service_claim_auto_reply_event`. Reentrega do mesmo `mid` → ignorada.
7. Falha do banco → `500` (a Meta reentrega por até 36 h).
8. Processamento em `ctx.waitUntil` (`src/auto-reply/processor.mjs`).
9. Sobrou evento elegível sem tentativa → `503` (a Meta reentrega; os já reclamados são ignorados). Senão `200 EVENT_RECEIVED`.

### Processamento e situações finais

| Situação (`status`/`reason`) | Quando |
| --- | --- |
| `skipped`/`platform_disabled`, `channel_disabled`, `site_not_allowed`, `connection_suspended`, `reconnect_required`, `permission_missing`, `auto_reply_disabled` | Bloqueio pelas regras centrais |
| `skipped`/`window_expired`, `before_activation`, `invalid_timestamp` | Evento com mais de 23 h, anterior à ativação ou sem hora |
| `skipped`/`frequency` | Vaga de frequência ocupada |
| `skipped`/`site_not_published`, `site_paused`, `site_archived`, `site_demo`, `public_url_invalid` | Sem endereço que possa ir ao consumidor |
| `cancelled`/motivo | O estado mudou entre o recebimento e o envio (releitura) |
| `sent` | Envio aceito pela Meta (`provider_message_id` gravado) |
| `failed`/`token_invalid`, `permission_missing` | Conexão vai para `reconnect_required` e a resposta é desligada |
| `failed`/`messaging_disabled`, `recipient_unavailable`, `rejected`, `credential_unreadable`, `message_invalid` | Falha definitiva |
| `failed`/`rate_limited`, `provider_unavailable` | 3 tentativas (espera de 1 s e 3 s) sem sucesso |
| `uncertain`/`send_uncertain` | Erro de rede ou tempo esgotado no envio: sem reenvio, vaga mantida |
| `uncertain`/`processing_interrupted` | Execução presa em `processing` há mais de 15 min (Cron) |

Toda falha antes de a Meta aceitar a mensagem (exceto `uncertain`) libera a vaga de frequência.

## `POST /api/instagram/deauthorize` e `POST /api/instagram/data-deletion`

Corpo `application/x-www-form-urlencoded` com `signed_request` (`<assinatura>.<payload>` em base64url, `algorithm: HMAC-SHA256`, chave `META_APP_SECRET`). Assinatura inválida → `400 INVALID_SIGNED_REQUEST`.

O `user_id` é comparado com a conta e o portfólio guardados (`service_find_channel_connection`); cada conexão encontrada é desconectada como na desconexão pelo painel (motivo `meta_deauthorize` ou `meta_data_deletion`, sem autor na auditoria).

- Desautorização: `200 {"ok": true}`.
- Exclusão: `200 {"url": "https://vitrine.inspira.dev.br/privacidade/exclusao/?codigo=<código>", "confirmation_code": "<código>"}`, mesmo sem conexão encontrada. O SHA-256 do código vai para `private.data_deletion_requests` com a situação `completed` (conexão apagada) ou `pending_review` (nenhuma conexão encontrada; a equipe confere).

## `GET /privacidade/exclusao/?codigo=<código>`

Página pública de acompanhamento, gerada no Worker com a CSP das páginas de conformidade, `noindex, nofollow`, `no-store` e `no-referrer`. Mostra "Exclusão concluída", "Pedido recebido" (em conferência), "Código não encontrado" ou, sem código, como chegar à página. O código não aparece no HTML; formatos inválidos não consultam o banco.

Estes callbacks só devem ser cadastrados no console depois do teste em modo desenvolvimento (item 16 de #48: confirmar qual identificador chega com o token de usuário do sistema).
