---
titulo: "[Estudo de mercado] Integração com o Asaas em sandbox (assinatura e webhook)"
rotulos: estudo-mercado, cobranca, enhancement
depende: 02
---
## Contexto

O ADR 0013 escolhe o Asaas como motor de cobrança: sem mensalidade, tarifa só no
recebimento, Pix, boleto, cartão e Pix Automático. A integração começa em sandbox;
produção só depois do passo humano `BLK-ASAAS-01`.

## Escopo

- Módulo `src/billing/asaas.mjs` atrás de uma interface de provedor (a mesma que o
  Stripe usará depois, issue {{issue:06}}): criar cliente, criar assinatura mensal,
  consultar e cancelar.
- Rota autenticada `POST /api/billing/checkout` (só o dono do tenant): recebe o plano
  e os dados de cobrança (nome, CPF ou CNPJ, e-mail), cria cliente e assinatura no
  Asaas e devolve o link da página de pagamento do Asaas. Os dados pessoais não são
  gravados no banco da Vitrine; só os identificadores do Asaas.
- Rota pública `POST /api/billing/asaas/webhook`:
  - confere `asaas-access-token` contra `ASAAS_WEBHOOK_TOKEN` em tempo constante;
  - grava o `id` do evento em `private.billing_events` (único) e ignora repetidos;
  - trata confirmação, recebimento, vencimento, estorno, exclusão e cancelamento de
    assinatura, atualizando `public.subscriptions` (issue {{issue:02}});
  - responde `200` rápido, dentro do limite de CPU do Workers Free.
- Chamadas ao Asaas com tempo limite e no máximo 3 tentativas, com espera crescente,
  só para `429` e `5xx`.
- Segredos `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` só via `wrangler secret put`;
  `ASAAS_API_BASE` aponta para o sandbox por padrão em `wrangler.jsonc`.
- Documentar em `docs/billing/asaas.md`: configuração, eventos tratados, como testar
  em sandbox, cotas e condições (Princípio IV).

## Fora de escopo

- Aviso de vencimento e suspensão (issue {{issue:04}}).
- Telas do painel (issue {{issue:05}}).
- Chaves de produção (passo humano `BLK-ASAAS-01`).

## Critérios de aceite

- [ ] Webhook sem token ou com token errado responde `401` e não altera nada.
- [ ] O mesmo evento enviado duas vezes altera a assinatura uma vez só (teste).
- [ ] Pagamento confirmado deixa a assinatura `active` com `current_period_end`
      vindo do evento; estorno a deixa `past_due`.
- [ ] Um `503` do Asaas gera no máximo 3 tentativas; um `400` não gera nova tentativa.
- [ ] `grep` no bundle, em `dist/` e nos logs de teste não encontra a chave nem o token.
- [ ] O checkout recusa quem não é dono do tenant (`403`) e plano inexistente (`400`).
- [ ] Nenhuma coluna nova guarda CPF, CNPJ, e-mail de cobrança ou dados de cartão.
- [ ] Teste de ponta a ponta no sandbox registrado em `docs/billing/asaas.md`
      (depois de `BLK-ASAAS-01`, com chave de sandbox).

## Dependências

- {{issue:02}} `02-direitos-por-plano.md`.
- Passo humano `BLK-ASAAS-01` só para o teste real em sandbox e para produção.

## Referências

- Estudo: [seção 5, Meios de pagamento](../../market-study-2026.md#5-precificação-adotada-decisão-2b).
- ADR 0013 (Cobrança, itens 1 a 5); constituição, Princípio III.
