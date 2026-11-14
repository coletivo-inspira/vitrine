---
titulo: "[Estudo de mercado] Ciclo da assinatura: aviso, tolerância de 7 dias, suspensão e reativação"
rotulos: estudo-mercado, cobranca, enhancement
depende: 03
---
## Contexto

A política do ADR 0007, mantida pelo ADR 0013, é avisar o vencimento, dar 7 dias de
tolerância e suspender só os recursos pagos, sem apagar conteúdo. O
[guia de operação](../../operations-guide.md) (seção 3) descreve isso como processo
manual. Com o Asaas, o ciclo passa a ser automático.

## Escopo

- Máquina de estados em `public.subscriptions`: `active` → `past_due` (vencida) →
  `grace` (até `grace_until = vencimento + 7 dias`) → `suspended`; qualquer estado →
  `active` quando o Asaas confirma o pagamento; `canceled` a pedido do dono.
- Verificação diária no Cron Trigger já usado pelo Worker (`scheduled()`), com
  orçamento de subrequests do Workers Free: move `grace` vencidas para `suspended`.
- Na suspensão: o domínio próprio deixa de ser canônico e a vitrine volta para
  `vitrine.inspira.dev.br/<endereço>`; `vitrine.json` e o webhook de pré-orçamento
  param; a publicação atual continua no ar; novas publicações seguem os limites do
  `free`. Nada em `sites`, `drafts`, `publications` ou `site_memberships` é apagado.
- Aviso no painel (faixa no Início) 3 dias antes do vencimento e durante a tolerância.
  O e-mail de cobrança é o do próprio Asaas; a Vitrine não contrata SMTP (ADR 0005).
- Atualizar a seção 3 do `docs/operations-guide.md` para o fluxo automático.

## Fora de escopo

- Tela "Plano e cobrança" (issue {{issue:05}}).
- Reembolso proporcional ou troca de plano no meio do ciclo (manual por operador).

## Critérios de aceite

- [ ] Teste com relógio simulado: vencimento + 6 dias continua `grace` com domínio
      canônico; vencimento + 8 dias fica `suspended` e `/<endereço>` é canônico.
- [ ] Depois da suspensão, a contagem de linhas de `sites`, `drafts` e
      `publications` da vitrine é igual à de antes.
- [ ] Pagamento confirmado depois da suspensão volta a `active` e o domínio a canônico
      sem ação manual.
- [ ] `vitrine.json` de vitrine suspensa responde `404` com `cache-control` curto.
- [ ] O Cron não faz mais subrequests do que o limite do plano gratuito (teste com 100 assinaturas).
- [ ] Cada mudança de estado grava em `audit_logs`.

## Dependências

- {{issue:03}} `03-integracao-asaas.md`.
- Externa: [#44](https://github.com/coletivo-inspira/vitrine/issues/44) para a troca de domínio canônico.

## Referências

- Estudo: [seção 5](../../market-study-2026.md#5-precificação-adotada-decisão-2b).
- ADR 0013 (Cobrança, item 6), ADR 0007, `docs/operations-guide.md` seção 3.3.
