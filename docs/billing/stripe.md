# Cobrança pelo Stripe (complemento, modo de teste)

Issue #116, ADR 0013 (Cobrança, item 7). Estado: implementado e testado com
simulações (`fetch` falso e PGlite). **Nenhuma chamada real ao Stripe foi feita e
nenhuma conta Stripe foi criada**: o teste em modo de teste depende do passo humano
`BLK-STRIPE-01`, só quando o Lino decidir. O modo live fica desligado até uma
decisão explícita (seção 1). Stripe Connect não é usado.

O Asaas continua sendo o meio padrão ([`asaas.md`](asaas.md)). O Stripe serve para
cartão internacional ou quando o cliente pede.

## 1. Configuração

| Nome | Tipo | Valor | Onde |
| --- | --- | --- | --- |
| `STRIPE_ENV` | variável pública | `test` (padrão) ou `live` | `wrangler.jsonc` |
| `STRIPE_SECRET_KEY` | segredo | chave secreta (ou restrita) da API | `npx wrangler secret put STRIPE_SECRET_KEY` |
| `STRIPE_WEBHOOK_SECRET` | segredo | segredo de assinatura do endpoint de webhook | `npx wrangler secret put STRIPE_WEBHOOK_SECRET` |
| `SUPABASE_SERVICE_ROLE_KEY` | segredo | já usado pelo Asaas | grava eventos e assinaturas |

Regras em `src/billing/stripe.mjs` (`resolveStripeConfig`):

- Sem `STRIPE_ENV=live`, só valem chaves de teste (`sk_test_`, `rk_test_`). Uma chave
  live nesse modo deixa o Stripe "não configurado".
- Com `STRIPE_ENV=live`, só valem chaves live (`sk_live_`, `rk_live_`); chave de teste
  é recusada. Ligar o modo live exige trocar a variável pública **e** o segredo.
- Sem chave válida, `POST /api/billing/checkout` com `provider: "stripe"` responde
  `503 BILLING_NOT_CONFIGURED` com `provider: "stripe"` e a mensagem "A cobrança pelo
  Stripe ainda não está configurada nesta plataforma.". O Asaas e o resto do Worker
  seguem funcionando.
- A base da API é fixa (`https://api.stripe.com/v1`, a mesma nos dois modos); não há
  variável para trocá-la. A chave vai só no cabeçalho `Authorization`; nunca em URL,
  corpo de erro ou log. As requisições fixam `Stripe-Version: 2025-03-31.basil`.
- Sem SDK e sem dependência nova: `fetch` e Web Crypto.
- Nunca passe chave ou segredo como argumento de linha de comando: `wrangler secret
  put` lê o valor do terminal. Prefira uma chave restrita com acesso só a Customers,
  Checkout Sessions, Subscriptions e Customer Portal (Princípio III).

## 2. Escolha do meio no checkout (contrato para a issue #115)

`POST /api/billing/checkout` (mesmas regras de [`asaas.md`](asaas.md), seção 2) aceita
o campo opcional `provider`:

```json
{
  "tenantId": "uuid da organização cliente",
  "planCode": "essencial | profissional | equipe",
  "provider": "asaas | stripe",
  "billing": { "name": "Nome", "email": "e-mail de cobrança", "cpfCnpj": "só para o Asaas" }
}
```

- Sem `provider`, vale `asaas` (padrão). Outro valor: `400 INVALID_PROVIDER`.
- Com `stripe`, o CPF ou CNPJ não é exigido nem enviado (cliente do exterior); só nome
  e e-mail vão ao Stripe.
- A tela "Plano e cobrança" (#115) deve mostrar o Asaas como caminho principal e o
  Stripe como opção secundária ("Cartão internacional"), e tratar `503
  BILLING_NOT_CONFIGURED` com `provider: "stripe"` escondendo ou desabilitando essa
  opção.
- Resposta `201 { checkoutUrl, subscription: { planCode, status: 'pending', provider: 'stripe' } }`;
  `checkoutUrl` é sempre `https://checkout.stripe.com/...`.

Passos com `stripe`:

1. `POST /v1/customers` com nome, e-mail, `preferred_locales` e `metadata[tenant_id]`.
2. `POST /v1/checkout/sessions` com `mode=subscription`, só cartão, preço em BRL da
   tabela de planos (`price_data` com `recurring[interval]=month`), `locale=pt-BR`,
   `client_reference_id` = tenant e o metadado `vitrine_subscription` na sessão e em
   `subscription_data`. Retorno para `PORTAL_ORIGIN` (`?cobranca=concluida` ou
   `?cobranca=cancelada`, âncora `#inicio`).
3. `billing_attach_checkout` grava `provider = 'stripe'`, o `cus_...` e a referência
   `vtr_...` (seção 3) com `status = 'pending'`.
4. Toda criação vai com `Idempotency-Key`, então a nova tentativa em `429`/`5xx`
   (`fetchWithRetry`, no máximo 3) não duplica cliente nem sessão.
5. Se havia assinatura não cancelada de **outro** provedor (por exemplo, pendente no
   Asaas), ela é cancelada no provedor dela; se a gravação no banco falhar, a sessão
   recém-criada é expirada.

## 3. Por que a referência `vtr_...` (sem migração)

O Checkout só cria a assinatura do Stripe (`sub_...`) depois do pagamento, mas o banco
precisa de `provider_subscription_id` no início. O Worker gera uma referência
aleatória `vtr_` + 32 hex, grava-a como `provider_subscription_id` e a envia como
metadado `vitrine_subscription`. O Stripe copia esse metadado para a assinatura, e as
faturas o trazem em `parent.subscription_details.metadata` (ou em
`subscription_details.metadata` em versões antigas da API). Assim cada evento casa com
a linha do banco em qualquer ordem de entrega, e não é preciso migração nem troca de
identificador depois do pagamento.

## 4. Rotas

### `POST /api/billing/stripe/webhook`

1. Corpo bruto até 64 KB (`413`).
2. Confere `Stripe-Signature` (`t=...,v1=...`): HMAC-SHA256 de `"{t}.{corpo}"` com
   `STRIPE_WEBHOOK_SECRET`, comparação em tempo constante (SHA-256 dos dois lados) e
   tolerância de 5 minutos em relação ao relógio do Worker. Aceita várias `v1` (troca
   de segredo). Assinatura ausente, errada, vencida, corpo alterado ou segredo
   ausente: **`400 INVALID_WEBHOOK_SIGNATURE`** e nada muda.
3. Evento sem `id`, `type` ou `livemode`: `400`. Evento live com `STRIPE_ENV` diferente
   de `live` (ou de teste com `live`): `400 STRIPE_MODE_MISMATCH`, nada muda.
4. Uma chamada a `public.billing_apply_event` com `provider = 'stripe'`: grava o
   `event.id` em `private.billing_events` e muda `public.subscriptions` na mesma
   transação. Evento repetido devolve `duplicate`.
5. `200 { received: true, outcome }`; falha do banco: `503` (o Stripe reenvia).

### `POST /api/billing/stripe/portal`

Sessão obrigatória, mesma origem e JSON `{ tenantId }`. Só a pessoa dona e só quando a
assinatura é do Stripe (`409 STRIPE_PORTAL_UNAVAILABLE` para Asaas ou manual). Cria uma
sessão do portal do cliente (`POST /v1/billing_portal/sessions`) e responde
`200 { portalUrl }` (sempre `https://billing.stripe.com/...`), com retorno para o
painel. No portal a pessoa troca o cartão, vê faturas e cancela.

### `POST /api/billing/cancel`

A rota da issue #114 passa a escolher o provedor pela assinatura gravada. Para o
Stripe: expira sessões de Checkout abertas da referência e cancela já
(`DELETE /v1/subscriptions/{id}`) a assinatura com o metadado da referência, listando
pelo `provider_customer_id`. O plano vale até `current_period_end`, como no Asaas.

## 5. Eventos tratados (mesma máquina de estados da #114)

| Evento do Stripe | Tipo normalizado | Efeito em `public.subscriptions` |
| --- | --- | --- |
| `invoice.paid` | `payment_received` | `active`; `current_period_end` = maior `period.end` das linhas da fatura (nunca recua); `grace_until` limpo |
| `invoice.payment_failed` | `payment_overdue` | `past_due` (pendente não muda) |
| `customer.subscription.deleted` | `subscription_canceled` | `canceled` |
| Outros (por exemplo `checkout.session.completed`, `invoice.created`) | `other` | registrados como `ignored` ou `unmatched` |

Tolerância de 7 dias, suspensão dos recursos pagos, aviso de vencimento e reativação
automática vêm do Cron e de `billing_apply_event`, iguais para os dois provedores. O
teste `test/database/billing-stripe.test.mjs` confere que uma assinatura paga pelo
Stripe recebe exatamente os mesmos direitos (`private.site_entitlements`) que a do
Asaas.

Estorno e contestação no Stripe não mudam a assinatura automaticamente nesta versão:
na API fixada, a cobrança não traz a referência da assinatura. O operador cancela pela
rota de cancelamento ou pelo painel do Stripe, o que gera
`customer.subscription.deleted`.

Cadastre no endpoint só os três eventos da tabela.

## 6. Cotas e condições (Princípio IV)

Consultado em 2026-11-14 na documentação do Stripe; conferir antes de cada mudança:

- **API** ([Rate limits](https://docs.stripe.com/rate-limits)): 25 requisições por
  segundo em sandbox e 100 em live, 25 por endpoint, `429` ao exceder. Leituras: média
  de até 500 por transação, mínimo de 10.000 por mês. Um checkout usa 2 chamadas; um
  cancelamento, 2 leituras e até 2 escritas.
- **Webhooks**: entrega "pelo menos uma vez", com reenvio por até 3 dias em live
  (daí a idempotência por `event.id`). Responder `2xx` rápido; eventos não usados
  ficam `ignored`.
- **Versão da API** ([basil](https://docs.stripe.com/changelog/basil/2025-03-31/adds-new-parent-field-to-invoicing-objects)):
  o endpoint de webhook deve ser criado com `2025-03-31.basil` ou mais nova; o Worker
  também lê o formato antigo da fatura.
- **Tarifas** (ADR 0013): cartão 3,99% + R$ 0,39, mais 0,7% e R$ 0,50 com Billing.
  Mais caro que o Asaas, por isso não é o padrão. O modo de teste não cobra.
- **Workers Free**: webhook = verificar HMAC, ler JSON e um RPC; o checkout espera até
  2 chamadas externas, sem custo de CPU na espera.

## 7. Como testar

Sem chave real (o que roda no CI):

```bash
npm test   # test/billing-stripe.test.mjs e test/database/billing-stripe.test.mjs
```

Em modo de teste, depois de `BLK-STRIPE-01`:

1. `npx wrangler secret put STRIPE_SECRET_KEY` (chave de teste, de preferência
   restrita) e `npx wrangler secret put STRIPE_WEBHOOK_SECRET`.
2. No Dashboard do Stripe em modo de teste, crie o endpoint
   `https://vitrine.inspira.dev.br/api/billing/stripe/webhook` com os eventos da seção
   5 e versão `2025-03-31.basil` ou mais nova; copie o segredo de assinatura para o
   passo 1. Salve a configuração do portal do cliente (Settings > Billing > Customer
   portal).
3. Com uma sessão de dono, chame `POST /api/billing/checkout` com
   `"provider": "stripe"` e pague no `checkoutUrl` com um cartão de teste do Stripe.
4. Confira `public.subscriptions` (`status = 'active'`, `provider = 'stripe'`),
   `private.billing_events` (`outcome = 'applied'`) e `audit_logs`.
5. Reenvie o evento pelo Dashboard: resposta `duplicate`, sem nova auditoria.
6. Abra o portal (`POST /api/billing/stripe/portal`) e cancele: a assinatura fica
   `canceled` e o plano vale até `current_period_end`.

### Registro do teste em modo de teste

Pendente de `BLK-STRIPE-01`. Ao executar, registre aqui a data, quem executou, os ids
de evento (não os dados da pessoa) e o resultado de cada passo.

## 8. Passo humano

`BLK-STRIPE-01` (Lino, só se decidir): abrir a conta Stripe do coletivo, gerar a chave
de teste (e, depois de nova decisão, a live), gravar os segredos com `wrangler secret
put`, cadastrar o endpoint de webhook e salvar o portal do cliente. Nenhuma conta
Stripe é criada sem essa decisão.
