---
titulo: "[Estudo de mercado] Direitos por plano no banco e no Worker (plans e subscriptions)"
rotulos: estudo-mercado, cobranca, enhancement
depende: 01
---
## Contexto

`public.tenants.plan` já existe (`free`, `custom_domain`, `bespoke`) e só
`platform_admin` altera (migração `202611120005_multi_tenant_rbac_audit.sql`). O
desenho `commercial_subscriptions` do [spec 002](../../../specs/002-commercial-portfolio/data-model.md)
nunca foi migrado. O limite de 20 itens ativos está fixo em
`src/portal-validation.mjs` (`MAX_ACTIVE_ITEMS`). O ADR 0013 define que o Worker
libera cada recurso pago pelo plano do tenant, verificado no servidor.

## Escopo

- Migração nova (append-only) com:
  - `public.plans` semeada a partir de `content/plans.json` (issue {{issue:01}});
  - `public.subscriptions`: uma por tenant; `plan_code`, `status` (`pending`,
    `active`, `past_due`, `grace`, `suspended`, `canceled`), `provider`
    (`manual`, `asaas`, `stripe`), identificadores do provedor, `current_period_end`,
    `grace_until`, `updated_by`;
  - `private.site_entitlements(site_id)` (`security definer`) que devolve limites e
    recursos; vitrine sem tenant ou sem assinatura ativa recebe `free`;
  - RLS: o dono do tenant lê a própria assinatura; ninguém além de `platform_admin`
    e do `service_role` do webhook escreve; `anon` não lê nada;
  - mapeamento: `custom_domain` → `essencial`; `bespoke` → direitos de
    `profissional` até revisão manual (ADR 0013).
- Worker: trocar o limite fixo de itens pelo da função e exigir o recurso em
  domínio próprio (`/api/sites/:id/domains`), `vitrine.json` (issue {{issue:10}}),
  webhook de pré-orçamento (issue {{issue:11}}) e blocos de itens acima de 1.
- Resposta `403 PLAN_FEATURE_REQUIRED` com o nome do plano que libera o recurso.
- Toda mudança de assinatura grava em `audit_logs`.

## Fora de escopo

- Falar com o Asaas (issue {{issue:03}}) e o ciclo de vencimento (issue {{issue:04}}).
- Telas de plano no painel (issue {{issue:05}}).

## Critérios de aceite

- [ ] Teste PGlite: o usuário A não lê a assinatura do tenant de B, nem por chamada direta.
- [ ] Teste PGlite: o dono não consegue mudar `plan_code` nem `status` da própria assinatura.
- [ ] Vitrine sem tenant publica até 20 itens ativos; com `essencial` ativo, até 100;
      acima disso, `ACTIVE_ITEMS_LIMIT_EXCEEDED`.
- [ ] Cadastrar domínio próprio com plano `free` responde `403 PLAN_FEATURE_REQUIRED`;
      com `essencial` ativo segue para a verificação de #44.
- [ ] A trava de 95 domínios ativos (ADR 0008) continua valendo para qualquer plano.
- [ ] Mudança de assinatura aparece em `audit_logs` com autor e valores antigo e novo.
- [ ] O artefato público não contém plano, status de pagamento nem identificador do provedor
      (`assertNoPrivateLeakage` cobre os campos novos).

## Dependências

- {{issue:01}} `01-tabela-de-planos.md`.
- Externas: [#39](https://github.com/coletivo-inspira/vitrine/issues/39) (tenants e
  RBAC) e, para domínio próprio, [#44](https://github.com/coletivo-inspira/vitrine/issues/44).

## Referências

- Estudo: [seção 5](../../market-study-2026.md#5-precificação-adotada-decisão-2b).
- ADR 0013 (Direitos por plano), ADR 0002 (isolamento por vitrine), ADR 0008.
