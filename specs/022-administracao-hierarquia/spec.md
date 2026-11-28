# Feature Specification: Hierarquia da administração, licenças, cupons e limites por vitrine

**Feature Branch**: `cursor/admin-hierarquia-licencas-3200`

**Created**: 2026-11-28

**Status**: Draft (implementado com testes, sem deploy; depende do [ADR 0018](../../docs/adr/0018-hierarquia-licencas-cupons.md), proposto)

**Input**: Pedido do Felipe A. Denise Silva: melhorar a administração da plataforma com uma hierarquia de contas. A conta dele é a administradora total. Abaixo dela ficam os administradores, que não têm todo o acesso, e um nível com poderes de licença (liberar licença para alguém, configurar). Também quer cupons que dão tempo de vitrine (por exemplo, um ano) e ver quanto isso vale. Na administração, quer gerir usuários, processos e os limites de cada vitrine.

Decisões de 2026-11-28: cupom é um código criado pela administração que, ao ser resgatado, libera tempo de plano, com relatório de quantos foram usados e quanto valem em reais; três níveis (Dono, Administrador, Gestor de licenças); entregar especificação e implementação com testes, sem deploy.

Vocabulário em [`CONTEXT.md`](../../CONTEXT.md). Decisões anteriores: [ADR 0002](../../docs/adr/0002-site-access-boundary.md), [ADR 0005](../../docs/adr/0005-zero-cost-mvp.md), [ADR 0013](../../docs/adr/0013-plans-and-recurring-billing.md) e [ADR 0016](../../docs/adr/0016-convite-demonstracao-e-cortesia.md) (cortesia, proposta).

## Ponto de partida

- `public.platform_operators` tem os papéis `platform_admin`, `support_operator` (sem uso) e `sponsor`. `private.is_platform_admin()` é o único portão da administração; não existe uma conta acima dos administradores.
- Os direitos de uma vitrine vêm só da assinatura da organização cliente (`private.site_entitlements`). A única forma de dar um plano sem cobrança é `set_tenant_subscription`, sem tela, que mexe na assinatura.
- Os limites (itens ativos e blocos de itens) são os do plano, iguais para todas as vitrines do plano.
- A Administração do painel tem Visão geral (indicadores, pedidos de customização, atividade), Mila, Linktree, Patrocinadores, Resposta automática, Modelos e Site institucional. Não há lista de usuários.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dono da plataforma define quem administra (Priority: P1)

O Dono da plataforma (uma única conta) vê a aba "Equipe da plataforma", procura uma pessoa pelo e-mail ou nome e dá a ela o papel de Administrador ou de Gestor de licenças; também retira papéis. Um Administrador vê a mesma aba, mas só dá ou retira o papel de Gestor de licenças (e o de Suporte, ainda sem tela própria).

**Independent Test**: com o Dono, promover uma conta a Administrador; com essa conta, tentar promover outra a Administrador (recusado) e a Gestor de licenças (aceito); tentar retirar o Dono (recusado).

**Acceptance Scenarios**:

1. **Given** o Dono, **When** dá o papel de Administrador a uma conta, **Then** a conta passa a ver a Administração e a ação fica na atividade ("Papel dado · Administrador").
2. **Given** um Administrador, **When** tenta dar ou retirar o papel de Administrador, **Then** recebe "Só o Dono da plataforma muda administradores" e nada muda.
3. **Given** qualquer operador, **When** tenta mudar o próprio papel ou o do Dono, **Then** recebe recusa e nada muda.
4. **Given** um banco sem Dono, **When** a pessoa responsável roda `select private.bootstrap_platform_owner('<e-mail>')` no SQL Editor, **Then** essa conta vira o Dono; uma segunda execução é recusada.

### User Story 2 - Liberar licença para uma vitrine (Priority: P1)

O Gestor de licenças (ou o Administrador, ou o Dono) abre "Usuários", procura a pessoa, abre a vitrine dela e concede uma licença de um plano pago por N meses, com uma observação. A vitrine passa a ter os direitos desse plano na hora, sem cobrança e sem mexer na assinatura. A licença pode ser retirada.

**Independent Test**: conceder 12 meses do Profissional a uma vitrine sem organização cliente; conferir `read_site_entitlements` = Profissional; retirar e conferir Gratuito.

**Acceptance Scenarios**:

1. **Given** uma vitrine sem organização cliente, **When** a licença é concedida, **Then** a organização é criada para a dona da vitrine e ligada a ela.
2. **Given** uma licença vigente do mesmo plano, **When** outra é concedida, **Then** a nova começa quando a anterior termina (os meses somam).
3. **Given** uma assinatura válida e uma licença vigente, **When** os direitos são lidos, **Then** vale o maior plano entre as duas.
4. **Given** a data final, **When** passa, **Then** a licença deixa de valer sem tolerância; nada da vitrine é apagado.

### User Story 3 - Cupom de tempo de vitrine (Priority: P1)

Quem gere licenças cria um cupom (plano, meses, número de usos, validade opcional, código gerado ou escolhido). A dona de uma vitrine digita o código em "Plano e cobrança" e ganha uma licença daquele plano. A aba "Licenças e cupons" mostra os cupons, os usos e quanto valem em reais (preço mensal do plano × meses concedidos).

**Independent Test**: criar o cupom "1 ano de Profissional" com 2 usos; resgatar em duas organizações; a terceira recebe "Este cupom já foi usado o máximo de vezes"; o relatório mostra 2 resgates, 24 meses e R$ 2.136,00.

**Acceptance Scenarios**:

1. **Given** um código inexistente ou desativado, **When** a dona tenta resgatar, **Then** vê "Cupom não encontrado" e a tentativa conta no limite de 10 por hora.
2. **Given** um cupom vencido, esgotado ou já usado pela mesma organização, **When** a dona resgata, **Then** vê a mensagem do caso e nada muda.
3. **Given** um cupom válido, **When** a dona resgata, **Then** recebe uma licença com origem "cupom" e vê "Profissional liberado até dd/mm/aaaa".
4. **Given** 10 tentativas na última hora, **When** a dona tenta outra, **Then** vê "Muitas tentativas. Tente de novo mais tarde.".

### User Story 4 - Limites de uma vitrine (Priority: P2)

Quem gere licenças ajusta, para uma vitrine, o número de itens ativos (1 a 100) e de blocos de itens (1 a 5), por cima do plano, com observação. Pode voltar aos limites do plano.

**Independent Test**: definir 3 itens para uma vitrine Gratuita; publicar com 4 itens é recusado (`ACTIVE_ITEMS_LIMIT_EXCEEDED`); limpar e publicar com 4 passa.

### User Story 5 - Usuários e processos (Priority: P2)

O Administrador e o Dono veem a lista de usuários (e-mail, nome, cidade, papel na plataforma, número de vitrines, cadastro e último acesso), com busca por e-mail, nome, nome do negócio, endereço da vitrine ou identificador. O detalhe mostra as vitrines com plano efetivo, assinatura, licenças e limites. A aba "Processos" reúne os pedidos de customização e a atividade, que já existiam na Visão geral. O Gestor de licenças vê a lista de usuários para achar a vitrine, mas não vê CMS, modelos, Mila, Linktree, patrocinadores, resposta automática nem atividade.

### Edge Cases

- Vitrine de demonstração (sem dona): não recebe licença nem cupom (`SITE_WITHOUT_OWNER`).
- Organização com slug já usado: a organização nova recebe o slug da vitrine com um sufixo.
- Patrocinador: o papel continua na aba Patrocinadores; a Equipe da plataforma não o altera (`OPERATOR_ROLE_CONFLICT`).
- Sem sessão: `401`; sem papel: `403 FORBIDDEN_PLATFORM_ROLE`.

## Requirements *(mandatory)*

- **FR-001**: Papéis da plataforma: `platform_owner` (um só, garantido por índice único), `platform_admin`, `license_manager`, `support_operator` e `sponsor`.
- **FR-002**: Capacidades por papel numa matriz única (`src/admin/platform-roles.mjs`, espelhada em `private.platform_capabilities`): `platform.operate`, `users.read`, `licenses.manage`, `staff.manage` e `admins.manage` (tabela em `data-model.md`).
- **FR-003**: `private.is_platform_admin()` aceita `platform_owner` e `platform_admin`, mantendo todos os portões atuais.
- **FR-004**: `grant_platform_role` e `revoke_platform_role` seguem a hierarquia (FR-002), recusam mudar o próprio papel, o Dono e patrocinadores, e gravam `platform_role_granted` / `platform_role_revoked` na auditoria.
- **FR-005**: O Dono é definido só por `private.bootstrap_platform_owner(email)`, executada fora do painel e só quando não há Dono. Nenhum e-mail fica no repositório.
- **FR-006**: Licença = concessão de um plano pago por período, separada da assinatura, com origem `manual`, `coupon` ou `courtesy` (a cortesia da 018 usa esta tabela). Concessão e retirada só com `licenses.manage`, auditadas.
- **FR-007**: Direitos da vitrine: maior plano entre assinatura válida (regras da ADR 0013) e licenças vigentes; senão Gratuito; depois a sobrescrita de limites da vitrine.
- **FR-008**: Cupom com código único (gerado `XXXX-XXXX-XXXX` sem caracteres ambíguos, ou escolhido), plano, meses (1 a 36), usos (1 a 1.000), validade opcional e desativação. Criação e desativação só com `licenses.manage`, auditadas.
- **FR-009**: Resgate só pela proprietária da vitrine, uma vez por organização, até 10 tentativas por hora por conta; o resgate cria a licença na mesma transação e guarda o valor (`monthly_price_cents × meses`).
- **FR-010**: Relatório de cupons: cupons, cupons ativos, resgates, meses e valor total, por plano, e licenças vigentes por origem.
- **FR-011**: Sobrescrita de limites por vitrine (itens 1 a 100, blocos 1 a 5) só com `licenses.manage`, auditada, valendo no Worker e no gatilho de publicação.
- **FR-012**: Lista e detalhe de usuários só com `users.read`, por funções do banco; nada de chave de serviço no navegador.
- **FR-013**: O painel mostra a Administração para Dono, Administrador e Gestor de licenças e as abas por capacidade, a partir de `GET /api/admin/me`.
- **FR-014**: Plano, licença, cupom e limites nunca entram no artefato público (`publications_menu_check` já barra as chaves).

### Key Entities

- **Operador da plataforma** (`platform_operators`): conta e papel.
- **Licença** (`license_grants`): organização, plano, início, fim, origem, autor, retirada.
- **Cupom** (`coupons`) e **Resgate** (`coupon_redemptions`).
- **Limites da vitrine** (`site_limit_overrides`).

## Success Criteria *(mandatory)*

- **SC-001**: Todos os casos dos testes de banco (`test/database/platform-hierarchy.test.mjs`) e de rotas (`test/admin-hierarchy-routes.test.mjs`) passam com `npm test`.
- **SC-002**: Cada rota nova responde `401` sem sessão, `403` para papel sem a capacidade e `200/201` para o papel certo.
- **SC-003**: Nenhuma das novas tabelas é legível por `anon`, e uma pessoa comum não lê licenças de outra organização.

## Fora do escopo

- Editar preços e limites globais dos planos (continuam em `content/plans.json`, ADR 0013).
- Recompensa por indicação.
- Suspender ou apagar contas.
- Configurar o Dono no Supabase remoto (passo humano em `quickstart.md`).
