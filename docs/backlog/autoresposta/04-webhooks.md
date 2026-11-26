---
titulo: "[AutoResposta 04] Webhooks: verificação, assinatura, normalização e idempotência"
rotulos: autoresposta, enhancement
depende: 03
---
**Épico**: {{issue:00}} · **Prioridade**: P0 · **Complexidade**: M · **Tipo**: técnico (+ pendência externa no console)

## Contexto

A Meta avisa mensagens novas pelo webhook `messages`; o Worker precisa responder rápido e não repetir ações.

## Objetivo

Receptor confiável no Workers Free, sem fila paga.

## Escopo

`GET/POST /api/webhooks/meta/instagram`; `src/auto-reply/instagram-webhook.mjs`; teto de 5 eventos novos por requisição; `500` quando o banco falha; `503` para reentrega do resto.

## Fora do escopo

mTLS; campos além de `messages`.

## Requisitos

FR-008, FR-009; `webhook-events.md`; contrato `meta-endpoints.md`.

## Critérios de aceite

- [x] Testado com fixtures oficiais (CT-007, CT-009, CT-010, CT-018, lote grande).
- [ ] Webhook verificado no console e primeiro evento real recebido (app publicado).
- [ ] Teste com conta sem Página vinculada (limitação temporária).

## Dependências

{{issue:03}}; console ({{issue:08}}); app Live para eventos reais.

## Riscos

Limitação oficial de webhooks sem Página; app em desenvolvimento não recebe eventos de usuários.

## Cenários de teste

`test/auto-reply.test.mjs` (webhook, CT-018, lote grande).

## Evidências para conclusão

Log `auto_reply_webhook_received` em staging com evento real.

## Referências

ADR 0017 D5; research R4.
