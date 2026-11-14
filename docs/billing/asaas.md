# Cobrança pelo Asaas (sandbox)

Issue #113, ADR 0013 (Cobrança, itens 1 a 5). Estado: implementado e testado com
simulações (`fetch` falso e PGlite). **Nenhuma chamada real ao Asaas foi feita**: o
teste de ponta a ponta no sandbox depende do passo humano `BLK-ASAAS-01`. Produção
fica desligada até uma decisão explícita (seção 1).

## 1. Configuração

| Nome | Tipo | Valor | Onde |
| --- | --- | --- | --- |
| `ASAAS_ENV` | variável pública | `sandbox` (padrão) ou `production` | `wrangler.jsonc` |
| `ASAAS_API_BASE` | variável pública | `https://api-sandbox.asaas.com/v3` | `wrangler.jsonc` |
| `ASAAS_API_KEY` | segredo | chave da API do Asaas | `npx wrangler secret put ASAAS_API_KEY` |
| `ASAAS_WEBHOOK_TOKEN` | segredo | token aleatório do webhook | `npx wrangler secret put ASAAS_WEBHOOK_TOKEN` |
| `SUPABASE_SERVICE_ROLE_KEY` | segredo | já usado por domínios próprios | grava eventos e assinaturas |

Regras aplicadas em `src/billing/asaas.mjs` (`resolveAsaasConfig`):

- Sem `ASAAS_ENV=production`, o Worker só aceita os hosts de sandbox
  (`api-sandbox.asaas.com` e `sandbox.asaas.com`). Qualquer outro host, `http:` ou
  chave com prefixo `$aact_prod_` deixa a cobrança "não configurada".
- Com `ASAAS_ENV=production`, só `https://api.asaas.com/v3` é aceito, e uma chave de
  sandbox (`$aact_hmlg_`) é recusada. Para ligar produção é preciso trocar as duas
  variáveis públicas e o segredo; nada muda sozinho.
- Sem `ASAAS_API_KEY` (ou sem `SUPABASE_SERVICE_ROLE_KEY`), `POST /api/billing/checkout`
  responde `503 BILLING_NOT_CONFIGURED` ("A cobrança ainda não está configurada nesta
  plataforma."). O resto do Worker não depende dessas chaves.
- A chave vai só no cabeçalho `access_token`; nunca em URL, corpo de erro ou log. O
  token do webhook é um valor gerado por nós (por exemplo `openssl rand -hex 32`),
  diferente da chave da API, como pede o Asaas.
- Nunca passe chave ou token como argumento de linha de comando: `wrangler secret put`
  lê o valor do terminal.

## 2. Rotas

### `POST /api/billing/checkout`

Sessão obrigatória, `Origin` igual ao do Worker e `Content-Type: application/json`.

```json
{
  "tenantId": "uuid da organização cliente",
  "planCode": "essencial | profissional | equipe",
  "billing": { "name": "Nome", "cpfCnpj": "CPF ou CNPJ", "email": "e-mail de cobrança" }
}
```

1. `401` sem sessão; `403 FORBIDDEN_ORIGIN` com outra origem.
2. `400 INVALID_PLAN` para plano inexistente ou `free`; `400 INVALID_TENANT`.
3. `422 INVALID_BILLING_DETAILS` com `fields` (CPF e CNPJ com dígito verificador,
   inclusive o CNPJ alfanumérico).
4. `503 BILLING_NOT_CONFIGURED` (seção 1).
5. `403 FORBIDDEN_TENANT_OWNER` se quem chama não é `tenants.owner_user_id` (lido com o
   token da pessoa, pela RLS de `public.tenants`); um `platform_admin` também recebe
   `403`, porque contratar é do dono.
6. `409 SUBSCRIPTION_ALREADY_ACTIVE` se a assinatura está `active`, `past_due` ou `grace`.
7. Cria o cliente (`POST /customers`) e a assinatura mensal (`POST /subscriptions`,
   `billingType: UNDEFINED`, `cycle: MONTHLY`, valor da tabela de planos, primeiro
   vencimento hoje no horário de Brasília) e lê a primeira cobrança para obter a
   página de pagamento (`invoiceUrl`). `externalReference` é o id do tenant.
8. Grava pela RPC `billing_attach_checkout` só `provider_customer_id` e
   `provider_subscription_id`, com `status = 'pending'` (direitos de `free`). Se a
   gravação falhar, a assinatura recém-criada é cancelada no Asaas. Se havia uma
   assinatura pendente anterior, ela é cancelada no Asaas.
9. Responde `201 { checkoutUrl, subscription: { planCode, status: 'pending', provider } }`.

Erros do Asaas: `400`/`4xx` vira `422 BILLING_DATA_REJECTED` (com `providerCode`);
`429`, `5xx`, rede ou tempo esgotado viram `502 BILLING_PROVIDER_UNAVAILABLE`.

Nome, CPF ou CNPJ e e-mail seguem só para o Asaas. Nenhuma coluna da Vitrine guarda
esses dados nem dados de cartão; o cartão é digitado na página do Asaas.

### `POST /api/billing/asaas/webhook`

1. Confere `asaas-access-token` contra `ASAAS_WEBHOOK_TOKEN` comparando os SHA-256
   em tempo constante. Sem token, token errado ou segredo ausente: `401` e nada muda.
2. Corpo até 64 KB (`413`); sem `id` ou `event` válidos, `400`.
3. Uma única chamada ao banco, `public.billing_apply_event`, que grava o id em
   `private.billing_events` e muda `public.subscriptions` na mesma transação. Evento
   repetido devolve `duplicate` e não muda nada.
4. Responde `200 { received: true, outcome }`, com `outcome` em `applied`, `ignored`,
   `unmatched` ou `duplicate`. Falha do banco responde `503` para o Asaas reenviar; como
   o id só é gravado junto com a mudança, o reenvio é seguro.

O trabalho por evento é verificar o token, ler o JSON e fazer um RPC, então o tempo de
CPU fica bem abaixo do limite do Workers Free (a espera pelo banco não conta como CPU).

## 3. Eventos tratados

| Evento do Asaas | Efeito em `public.subscriptions` |
| --- | --- |
| `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` | `active`; `current_period_end` = `payment.dueDate` + 1 mês, à meia-noite de Brasília (nunca recua); `grace_until` limpo |
| `PAYMENT_OVERDUE` | `past_due` (tolerância de 7 dias contada de `current_period_end`, migração `20261115000100`) |
| `PAYMENT_DELETED` | `past_due`: sem cobrança a receber, o período pago não se renova sozinho |
| `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED` | `past_due`; `current_period_end` passa ao momento do estorno, e a tolerância conta dali |
| `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED` | `canceled` |
| Outros (por exemplo `PAYMENT_CREATED`) | registrados como `ignored` |

Regras do banco: assinatura `canceled` não volta por evento (uma nova contratação gera
outro identificador); atraso, exclusão e estorno não mudam uma assinatura `pending`;
evento de assinatura desconhecida fica `unmatched`. Toda mudança vai para
`audit_logs` com `summary.source = 'service_role'`. Aviso de vencimento e suspensão
ficam para a issue #114.

## 4. Chamadas ao Asaas

`fetchWithRetry` em `src/billing/provider.mjs`: tempo limite de 8 s por chamada, no
máximo 3 tentativas, só para `429` e `5xx`, com espera crescente (300 ms e 600 ms) ou o
`RateLimit-Reset` do Asaas, se for maior. Se a liberação passar de 2 s, não há nova
tentativa. Falha de rede e tempo esgotado não são repetidos, porque uma criação pode
ter chegado ao Asaas.

## 5. Cotas e condições (Princípio IV)

Consultado em 2026-11-14 na documentação do Asaas; conferir antes de cada mudança:

- **API** ([Limites da API](https://docs.asaas.com/reference/rate-e-quota-limit)): até
  25.000 requisições por conta a cada 12 horas, até 50 `GET` simultâneos e limites por
  endpoint, todos com `429`. Um checkout usa 3 chamadas (4 se cancelar uma pendente).
  O sandbox segue as mesmas regras.
- **Webhooks** ([Introdução](https://docs.asaas.com/docs/sobre-os-webhooks)): entrega
  "pelo menos uma vez" (daí a tabela de eventos); até 10 webhooks por conta; depois de
  15 falhas seguidas a fila pode ser interrompida; eventos ficam guardados por 14 dias.
  Por isso o Worker responde `200` também para eventos que não usa.
- **Cloudflare** ([Bloqueio do firewall](https://docs.asaas.com/docs/bloqueio-do-firewall-na-cloudflare)):
  regras de WAF ou proteção contra robôs podem devolver `403` ao Asaas. Se o log de
  webhooks do Asaas mostrar `403`, libere só a rota do webhook para os IPs oficiais.
- **Tarifas**: sem mensalidade; tarifa por recebimento conforme a tabela vigente do
  Asaas (ADR 0013). O sandbox não cobra.
- **Workers Free**: o webhook e o checkout cabem no limite de CPU; o checkout espera
  até 3 chamadas externas, sem custo de CPU na espera.

## 6. Como testar

Sem chave real (o que roda no CI):

```bash
npm test   # test/billing-asaas.test.mjs e test/database/billing-events.test.mjs
```

No sandbox, depois de `BLK-ASAAS-01` (conta Asaas do coletivo e chave de sandbox):

1. `npx wrangler secret put ASAAS_API_KEY` (chave `$aact_hmlg_...` do sandbox) e
   `npx wrangler secret put ASAAS_WEBHOOK_TOKEN` (valor gerado na hora).
2. No painel do sandbox do Asaas, cadastre o webhook com a URL
   `https://vitrine.inspira.dev.br/api/billing/asaas/webhook`, o mesmo token, envio
   sequencial e os eventos da seção 3.
3. Com uma sessão de dono de tenant, chame `POST /api/billing/checkout` e abra o
   `checkoutUrl` devolvido.
4. No sandbox, confirme o pagamento da cobrança. Confira em `public.subscriptions` o
   `status = 'active'` e o `current_period_end`; em `private.billing_events`, o
   `outcome = 'applied'`; em `audit_logs`, a entrada `subscription.update`.
5. Reenvie o mesmo evento pelo log de webhooks do Asaas: a resposta deve ser
   `duplicate`, sem nova entrada em `audit_logs`.
6. Estorne a cobrança: a assinatura deve ficar `past_due`.

### Registro do teste de ponta a ponta no sandbox

Pendente de `BLK-ASAAS-01`. Ao executar, registre aqui a data, quem executou, os ids
de evento (não os dados da pessoa) e o resultado de cada passo acima.

## 7. Reaproveitamento pelo Stripe (issue #116)

`src/billing/provider.mjs` define a interface (`createCustomer`, `createSubscription`,
`getSubscription`, `cancelSubscription`, `verifyWebhook`, `parseWebhookEvent`), o
evento normalizado e `subscriptionChangeFor`. `private.billing_events` e as RPCs já
aceitam `provider = 'stripe'`. O Stripe precisa do seu arquivo em `src/billing/` e de
uma rota de webhook própria em `src/billing/routes.mjs`.
