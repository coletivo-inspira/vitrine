---
titulo: "[Login múltiplo] Ponte do código pelo WhatsApp no Worker (Send SMS Hook e webhook)"
rotulos: autenticacao, enhancement
depende:
---
## Contexto

SMS é pago e o modelo de autenticação do WhatsApp também. A entrega gratuita é responder a uma
mensagem que a própria pessoa envia ao número da Vitrine (janela de atendimento de 24 horas).
O Supabase Auth continua gerando e verificando o código; o Worker só o recebe pelo Send SMS Hook,
guarda cifrado e entrega quando a mensagem chega.

## Escopo

- Migração `supabase/migrations/20261122000100_auth_otp_outbox.sql`: `private.auth_otp_outbox`,
  `private.whatsapp_service_windows`, `private.auth_hook_events` e as funções
  `store_auth_otp`, `take_auth_otp`, `touch_whatsapp_window` e `purge_auth_otp`
  ([modelo de dados](../../../specs/017-login-multiplo/data-model.md)).
- `src/auth/phone.mjs`: E.164 e forma canônica brasileira com nono dígito; HMAC do telefone.
- `src/auth/standard-webhooks.mjs`: verificação do hook.
- `src/auth/otp-outbox.mjs`: AES-GCM e chamadas às funções privadas.
- `src/auth/whatsapp.mjs`: verificação de `X-Hub-Signature-256`, desafio `hub.verify_token` e
  envio de texto pela Graph API (nunca `template`).
- Rotas em `workers/api.mjs`:
  [`POST /api/auth/hooks/send-sms`](../../../specs/017-login-multiplo/contracts/send-sms-hook.md)
  e [`GET`/`POST /api/whatsapp/webhook`](../../../specs/017-login-multiplo/contracts/whatsapp-webhook.md).
- Limpeza de expirados no `scheduled()` existente.
- Variáveis não secretas em `wrangler.jsonc` vazias por padrão; segredos só com
  `wrangler secret put`.

## Fora de escopo

- Telas do painel ({{issue:04}} e {{issue:05}}).

## Critérios de aceite

- [ ] Hook com assinatura errada, ausente, carimbo de 6 minutos ou `webhook-id` repetido: `401`,
      nada gravado.
- [ ] Webhook sem `X-Hub-Signature-256` válido: `401` e nenhuma chamada à Graph API.
- [ ] Mensagem com código pendente gera uma única chamada à Graph API com `type: "text"`; o mesmo
      webhook repetido não envia de novo.
- [ ] Sexto pedido de código do mesmo telefone na mesma hora não envia nada.
- [ ] Número com e sem o nono dígito gera o mesmo `phone_hash`.
- [ ] PGlite: `anon` e `authenticated` não leem nem escrevem nas tabelas novas; `take_auth_otp`
      entrega uma vez só.
- [ ] Teste estático: nenhum `"template"` no módulo do WhatsApp.
- [ ] Nenhum telefone, código ou segredo nos logs de teste nem no bundle.
- [ ] Teste real registrado no PR depois de `BLK-WA-01` e `BLK-HOOK-01`.

## Dependências

- Passos humanos `BLK-WA-01` (app Meta com WhatsApp, número dedicado, token de usuário do sistema
  e webhook `messages`) e `BLK-HOOK-01` (Send SMS Hook no Supabase), só para o teste real.

## Referências

- `specs/017-login-multiplo/research.md` (R1 a R4); tasks T005 a T014; ADR 0015.
