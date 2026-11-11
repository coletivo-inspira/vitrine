---

description: "Task list for feature 002-commercial-portfolio implementation and verification"
---

# Tasks: Oferta comercial, portfólio e pedidos de orçamento

**Input**: Design documents from `/specs/002-commercial-portfolio/` (`spec.md`, `plan.md`, `data-model.md`, `checklists/requirements.md`)

**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories `002-US1` to `002-US4`), `data-model.md`, `docs/commercial-offer.md`, ADRs 0005–0007

**Tests**: Inclui testes unitários e de empacotamento para projeção pública do portfólio, validação estrita de URLs HTTPS, geração segura de links de orçamento WhatsApp e exclusão de campos privados em `dist/`.

**Organization**: Tarefas agrupadas por história de usuário (`002-US1` a `002-US4`) para permitir implementação, auditoria e validação independentes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode ser executada em paralelo (arquivos distintos, sem dependência de tarefa incompleta)
- **[Story]**: História de usuário associada (`US1`, `US2`, `US3`, `US4`)
- Caminhos exatos do repositório incluídos em cada tarefa

---

## Phase 1: Setup (Shared Infrastructure & Governance)

**Purpose**: Documentar as decisões comerciais de custo zero, inventário DNS e estrutura inicial de dados públicos versionados.

- [x] T001 Registrar proposta operacional de planos, preços sugeridos, franquia de 20 itens ativos e política de tolerância de 7 dias em `docs/commercial-offer.md` e `docs/adr/0007-commercial-services.md`
- [x] T002 [P] Auditar e documentar o inventário de subdomínios existentes da zona `inspira.dev.br` sem assumir autorização automática de cases em `docs/dns-review.md`
- [x] T003 [P] Inicializar os arquivos de configuração versionados `content/portfolio.json` (`schemaVersion: 1`, `entries: []`) e `content/contact.json` (`teamWhatsapp: null`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implementar o módulo puro de validação e projeção pública e integrá-lo ao pipeline de build estático.

- [x] T004 Implementar funções puras `publishedPortfolio(catalog)` e `quoteContactLink(teamPhone, publishedCase)` sem dependências externas em `src/portfolio.mjs`
- [x] T005 Integrar a compilação de `content/portfolio.json` e `content/contact.json` na geração de `dist/data/portfolio.json`, `dist/data/contact.json` e `dist/assets/portfolio.mjs` em `scripts/build.mjs`

**Checkpoint**: Fundação de projeção pública e build pronta — histórias de usuário podem ser verificadas independentemente.

---

## Phase 3: User Story 1 - Compreender a oferta comercial e limites do plano gratuito (`002-US1`) (Priority: P1) 🎯 MVP

**Goal**: Apresentar ao visitante da página de divulgação a comparação clara entre a vitrine básica gratuita (`vitrine.inspira.dev.br/loja1`, 1 vitrine, `pizzeria-v1`, até 20 itens ativos, WhatsApp), as assinaturas opcionais de endereço personalizado (R$ 10/mês subdomínio Inspira; R$ 15/mês vínculo de domínio próprio com registro pago à parte) e projetos sob medida em fase de preparação.

**Independent Test**: Verificar em `web/index.html` e no pacote gerado em `dist/index.html` a presença das colunas comparativas da oferta, a distinção explícita sobre compra/renovação de domínio próprio e os avisos de fase piloto sem cobrança automática.

### Implementation for User Story 1

- [x] T006 [US1] Estruturar a seção comparativa de oferta comercial (Básica gratuita, Endereço Inspira, Domínio do cliente e Projeto sob medida) e perguntas frequentes sobre domínio/renovação em `web/index.html`
- [x] T007 [P] [US1] Estilizar a grade comparativa de ofertas, estados "Em preparação" e responsividade mobile/desktop seguindo a Direção A ("Laranja Pontual") em `web/styles.css`

**Checkpoint**: `002-US1` entregue e verificável de forma independente na página de divulgação.

---

## Phase 4: User Story 2 - Explorar cases e solicitar orçamento com referência via WhatsApp (`002-US2`) (Priority: P1)

**Goal**: Permitir que o visitante acione "Quero algo parecido" em um case publicado ou solicite orçamento geral abrindo o WhatsApp comercial configurado com mensagem parametrizada, ou visualizar estado indisponível seguro quando `teamWhatsapp` for `null`.

**Independent Test**: Executar `node --test test/portfolio.test.mjs` validando `quoteContactLink()` com telefone válido, referência de case com caracteres especiais (`&`) e telefone ausente (`null`) ou malformado.

### Tests for User Story 2

- [x] T008 [P] [US2] Implementar testes unitários para `quoteContactLink` cobrindo `teamWhatsapp: null`, rejeição de injeção no telefone e codificação da referência (`title` e `id`) em `test/portfolio.test.mjs`

### Implementation for User Story 2

- [x] T009 [US2] Implementar hidratação progressiva de `dist/data/contact.json` e `dist/data/portfolio.json` para habilitar botões de orçamento ou preservar o estado indisponível em `web/app.js`

**Checkpoint**: `002-US2` funcional e testada independentemente com e sem telefone configurado.

---

## Phase 5: User Story 3 - Manter catálogo público do portfólio com projeção segura (`002-US3`) (Priority: P2)

**Goal**: Garantir que apenas cases com `published: true` e URLs HTTPS públicas sem credenciais sejam exportados para `dist/data/portfolio.json`, ordenados por `order` e `id` e livres de notas internas.

**Independent Test**: Executar `node --test test/portfolio.test.mjs test/marketing-build.test.mjs` verificando filtragem de rascunhos, rejeição de `http:`/`javascript:`/credenciais, imutabilidade do input e ausência de `internalNotes` e `published` em `dist/data/portfolio.json`.

### Tests for User Story 3

- [x] T010 [P] [US3] Implementar testes unitários de projeção explícita, ordenação, imutabilidade, rejeição de protocolos inseguros/credenciais e validação do catálogo versionado em `test/portfolio.test.mjs`
- [x] T011 [P] [US3] Implementar asserções de integração garantindo que `dist/data/portfolio.json` exclui `internalNotes` e `published` e que `dist/data/contact.json` expõe apenas `{ href }` em `test/marketing-build.test.mjs`

**Checkpoint**: `002-US3` validada por testes unitários e de build estático.

---

## Phase 6: User Story 4 - Gerenciar vigência de benefício de endereço e suspensão reversível (`002-US4`) (Priority: P2)

**Goal**: Formalizar o modelo de dados e as invariantes de autorização para assinaturas de endereço (`commercial_subscriptions`) e vínculos de hostname (`site_address_bindings`), assegurando controle exclusivo por Operadores Inspira, tolerância de 7 dias no vencimento e reversão automática ao endereço básico gratuito (`vitrine.inspira.dev.br/<slug>`) sem perda de rascunhos.

**Independent Test**: Inspecionar `specs/002-commercial-portfolio/data-model.md` e `specs/002-commercial-portfolio/checklists/requirements.md` confirmando cobertura integral de `FR-007`, `FR-008`, `FR-009` e `002-US4`.

### Implementation & Specification for User Story 4

- [x] T012 [P] [US4] Especificar entidades `commercial_subscriptions` e `site_address_bindings`, máquina de estados com 7 dias de tolerância, reversão para `vitrine.inspira.dev.br/<slug>` e políticas RLS restritas a Operadores Inspira em `specs/002-commercial-portfolio/data-model.md`
- [x] T013 [P] [US4] Formalizar critérios Given-When-Then de `002-US1` a `002-US4` e checklist de requisitos em `specs/002-commercial-portfolio/spec.md` e `specs/002-commercial-portfolio/checklists/requirements.md`

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validação completa dos portões de qualidade do repositório sem provisionamento pago.

- [x] T014 Executar `npm test`, `npm run build` e `npx --yes wrangler@4.158.0 deploy --dry-run` para atestar regressão zero e integridade do pacote público `dist/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Concluída — estabelece ADRs e arquivos base em `content/`.
- **Phase 2 (Foundational)**: Depende da Phase 1 — `src/portfolio.mjs` e `scripts/build.mjs` alimentam todas as histórias.
- **Phases 3, 4, 5, 6 (User Stories `002-US1` a `002-US4`)**: Dependem da Phase 2 e podem ser auditadas e evoluídas de forma independente respeitando as fronteiras de arquivo (Frontend em `web/` e `content/`, Backend em `src/` e `supabase/`, QA em `test/`).
- **Phase 7 (Polish)**: Valida o conjunto integrado.
