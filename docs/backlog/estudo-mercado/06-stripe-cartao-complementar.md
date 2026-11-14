---
titulo: "[Estudo de mercado] Stripe como complemento para cartão e exterior (depois)"
rotulos: estudo-mercado, cobranca, depois
depende: 03, 04
---
## Contexto

O ADR 0013 deixa o Stripe como complemento posterior para cartão e clientes do
exterior. Cartão no Stripe custa 3,99% + R$ 0,39 (+0,7% e R$ 0,50 com Billing).
O repasse entre contas (Stripe Connect) foi descartado.

## Escopo

- Implementar o provedor `stripe` na interface criada na issue {{issue:03}}:
  Checkout em modo assinatura, portal do cliente e webhook com verificação de
  assinatura `Stripe-Signature` e idempotência por `event.id`.
- Reaproveitar a mesma máquina de estados da issue {{issue:04}}.
- Escolha do meio no checkout: Asaas como padrão; Stripe só para cartão
  internacional ou quando o cliente pedir.

## Fora de escopo

- Stripe Connect, repasses ou vendas do lojista.
- Migrar assinaturas existentes do Asaas.

## Critérios de aceite

- [ ] Webhook com assinatura inválida responde `400` e não altera nada.
- [ ] Evento repetido é aplicado uma vez só.
- [ ] Assinatura paga pelo Stripe libera os mesmos recursos que a do Asaas (teste).
- [ ] Segredos só via `wrangler secret put`; nada no bundle.
- [ ] Nenhuma conta Stripe é criada sem decisão do Lino.

## Dependências

- {{issue:03}} `03-integracao-asaas.md` e {{issue:04}} `04-ciclo-da-assinatura.md`.
- Passo humano: conta Stripe do coletivo (`BLK-STRIPE-01`), só quando o Lino decidir.

## Referências

- Estudo: [seção 5, Meios de pagamento](../../market-study-2026.md#5-precificação-adotada-decisão-2b).
- ADR 0013 (Cobrança, item 7).
