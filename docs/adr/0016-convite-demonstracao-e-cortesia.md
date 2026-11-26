---
status: proposed
---
# Convite de demonstração, cortesia de 3 meses e equipe por link

Amplia a demonstração do Linktree (issue #123, `20261115000900_linktree_demo.sql`). Relaciona-se
com as ADRs [0002](0002-site-access-boundary.md) (acesso por vitrine), [0005](0005-zero-cost-mvp.md)
(custo zero) e [0013](0013-plans-and-recurring-billing.md) (planos e assinatura), e fecha a
pendência "fluxo de convites" da decisão 2 de [`docs/roadmap.md`](../roadmap.md).
Origem: [`specs/018-convite-demonstracao`](../../specs/018-convite-demonstracao/plan.md).

## Contexto e Problema

Para trazer negócios, o Lino quer montar por conta própria uma vitrine para um negócio do bairro
(por exemplo, um salão com os serviços no catálogo do WhatsApp), mandar um convite ao dono e,
como incentivo, dar 3 meses do plano Profissional. Quem aceitar fica com a vitrine e pode chamar
outras pessoas para a equipe como administrador ou funcionário. Só o administrador do sistema, ou
pessoas autorizadas por ele, faz isso.

Hoje a demonstração existe só para o Linktree, o convite pede o identificador interno de uma conta
que já existe, a equipe só aceita o mesmo identificador e não há como dar meses grátis sem mexer
na assinatura.

## Opções Consideradas

1. **Publicar a demonstração no endereço público com uma faixa "Demonstração"**: mais simples de
   mostrar, mas põe no ar conteúdo de um negócio sem o aceite dele e o expõe a buscadores.
2. **Prévia só pelo link do convite, sem login, fora dos buscadores, e publicação só depois do
   aceite**.
3. **Exigir conta antes de ver a prévia**: protege mais, mas o dono do negócio desiste antes de ver
   o que foi feito.

Para a cortesia:

- **A. Assinatura `manual` do Profissional marcada como cortesia**: reaproveita o ciclo atual, mas
  `billing_attach_checkout` recusa contratar com assinatura ativa e, ao aceitar, deixa a linha
  `pending`, o que tiraria o Profissional de quem quer pagar.
- **B. Concessão separada da assinatura, lida nos direitos da vitrine**.

## Decisão

Adotamos a **Opção 2** e a cortesia **B**, com as regras abaixo (decisões D1 a D7 de
[`research.md`](../../specs/018-convite-demonstracao/research.md)):

1. **Demonstração** é qualquer vitrine sem dono montada pela equipe (origens `linktree`, `manual`
   e `csv`), só em rascunho, sem publicação possível, apagada em 30 dias (prorrogável até 90).
2. **Convite** é um token aleatório de 256 bits, de uso único, por 7 dias, guardado só como
   SHA-256. Serve para dar a propriedade de uma demonstração (`demo_owner`) ou um papel na equipe
   de uma vitrine (`team`). A resposta para convite indisponível é sempre a mesma.
3. **Prévia do convite** sem login, gerada na hora a partir do rascunho, com `noindex`,
   `no-store` e `no-referrer`. A vitrine só vai ao endereço público depois do aceite, pelo fluxo
   normal de publicação.
4. **Recusa** sem conta apaga a demonstração, o rascunho, as fotos e os convites na hora.
5. **Cortesia**: 90 dias do Profissional a partir do aceite, numa organização cliente nova, no
   máximo uma por conta. Os direitos seguem: assinatura paga que vale, senão cortesia, senão
   Gratuito. Termina pela data, sem tolerância, sem cobrança e sem apagar nada; a pessoa é avisada
   no painel 15 e 3 dias antes.
6. **Papel `growth_operator`** (operador de captação) em `platform_operators`: cria demonstrações e
   convites de dono e nada mais. Só o `platform_admin` concede e retira.
7. **Equipe por link**: a proprietária convida `admin`, `editor` ("Funcionário") e `viewer`; o
   `admin` convida `editor` e `viewer`. As permissões de cada papel são as que o banco já aplica.
8. **Nenhuma mensagem sai da plataforma**: o convite vai do WhatsApp de quem o gerou, pelo link
   `wa.me`; o número do negócio não é gravado.

## Consequências

- **Positivas**: captação com custo zero; o dono vê a vitrine pronta antes de criar conta; a
  equipe da vitrine deixa de depender de identificadores internos; a prospecção pode ser delegada
  sem abrir cobrança e CMS.
- **Negativas / Trade-offs**:
  - Quem tiver o link vê a prévia; um convite encaminhado pode ser aceito por outra pessoa (a
    primeira a aceitar fica com a vitrine). Mitigação: uso único, 7 dias, revogação e registro de
    quem aceitou.
  - O robô de prévia do WhatsApp abre o link; a "primeira abertura" registrada é só indicativa.
  - Montar a demonstração continua manual (planilha ou editor): não há API para ler o catálogo do
    WhatsApp de terceiros, e raspar páginas viola os termos da Meta.
  - Tratar dados e fotos de um negócio antes do aceite exige base legal (legítimo interesse),
    minimização, prazo curto e recusa fácil; a reconferir com o jurídico antes de usar em escala.
  - `private.site_entitlements` passa a ler mais uma tabela.
- **Pendências**: ratificação desta ADR pelo Lino; implementação pelas issues de
  `docs/backlog/convite-demonstracao/`. Nada foi implementado.
