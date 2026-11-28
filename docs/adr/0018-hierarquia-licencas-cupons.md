---
status: proposed
---
# Hierarquia da administração, licenças, cupons e limites por vitrine

Relaciona-se com as ADRs [0002](0002-site-access-boundary.md) (acesso por vitrine),
[0005](0005-zero-cost-mvp.md) (custo zero), [0013](0013-plans-and-recurring-billing.md) (planos e
assinatura) e [0016](0016-convite-demonstracao-e-cortesia.md) (cortesia, proposta).
Origem: [`specs/021-administracao-hierarquia`](../../specs/021-administracao-hierarquia/plan.md).

## Contexto e Problema

A administração da plataforma tem um único nível (`platform_admin`). O Felipe quer ser o
administrador total, ter administradores com menos poder e um nível que só libera licenças e
configura limites. Quer também cupons que dão tempo de vitrine e saber quanto isso vale. Hoje não
há como dar um plano sem mexer na assinatura, nem limites diferentes para uma vitrine.

## Opções Consideradas

Para os papéis:

1. **Tabela nova de papéis com permissões configuráveis**: flexível, mas exige tela de permissões,
   mais políticas e mais testes, sem pedido para isso.
2. **Novos valores em `platform_operators.role` com uma matriz fixa de capacidades** no código e no
   banco.

Para as licenças:

- **A. Assinatura `manual`**: reaproveita `set_tenant_subscription`, mas sobrescreve a assinatura
  paga e confunde o ciclo de cobrança.
- **B. Concessão separada (`license_grants`) lida nos direitos da vitrine**.

## Decisão

Opção **2** e opção **B**.

- Papéis: `platform_owner` (um só, índice único parcial), `platform_admin`, `license_manager`, além
  de `support_operator` e `sponsor`. Capacidades fixas: `platform.operate`, `users.read`,
  `licenses.manage`, `staff.manage`, `admins.manage`. O Dono é definido só no SQL Editor por
  `private.bootstrap_platform_owner(email)`.
- `private.is_platform_admin()` passa a aceitar o Dono; as rotas e políticas atuais continuam.
- Licenças com origem `manual`, `coupon` ou `courtesy`. Direitos: maior plano entre assinatura
  válida e licenças vigentes; senão Gratuito; depois a sobrescrita de limites da vitrine.
- Cupom gera licença no resgate, uma vez por organização, com limite de 10 tentativas por hora por
  conta e o valor guardado no resgate.

## Consequências

- **Boas**: uma única leitura de direitos para Worker e banco; licenças e cupons sem cobrança e sem
  tocar na assinatura; a cortesia da 018 cabe na mesma tabela; auditoria de tudo.
- **Ruins**: a matriz de capacidades existe em dois lugares (JavaScript e SQL); o teste de banco
  compara as duas. Trocar o Dono é um passo manual.
- **Custo**: nenhum serviço novo; quatro tabelas pequenas no Supabase Free.
