---

description: "Task list for feature 004-catalog-editor implementation and verification"
---

# Tasks: Editor de Cardápio e Gestão de Rascunhos (`pizzeria-v1`)

**Input**: Design documents from `/specs/004-catalog-editor/` (`spec.md`, `plan.md`, `data-model.md`, `contracts/portal-api.md`, `checklists/requirements.md`)

**Prerequisites**: `plan.md`, `spec.md` (`004-US1` a `004-US4`), `data-model.md`, `contracts/portal-api.md`, `src/public-menu.mjs`

**Organization**: Tarefas organizadas por fases e histórias de usuário (`004-US1` a `004-US4`), respeitando estritamente a fronteira de arquivos da Frente Backend da Fase 3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode ser executada em paralelo
- **[Story]**: História de usuário associada (`US1`, `US2`, `US3`, `US4`)

---

## Phase 1: Setup & Specification Artifacts

**Purpose**: Formalizar os artefatos Spec Kit e o contrato HTTP/JSON compartilhado do editor de cardápio.

- [x] T001 Formalizar especificação com histórias de usuário `004-US1` a `004-US4` e cenários Given-When-Then em `specs/004-catalog-editor/spec.md`
- [x] T002 [P] Documentar plano técnico, modelo de dados e contrato de API em `specs/004-catalog-editor/plan.md`, `specs/004-catalog-editor/data-model.md` e `specs/004-catalog-editor/contracts/portal-api.md`

---

## Phase 2: Foundational (Database Migration & Validation Core)

**Purpose**: Reforçar constraints incrementais no banco PostgreSQL/PGlite e construir o módulo puro de validação do domínio do portal.

- [x] T003 Criar migração incremental idempotente `supabase/migrations/202611110001_portal_schema.sql` e atualizar `supabase/README.md` com slugs reservados do portal, validação incremental de `drafts` <= 256 KiB e função auxiliar segura com `auth.uid()`
- [x] T004 Implementar módulo de validação `src/portal-validation.mjs` compatível com `src/public-menu.mjs`

---

## Phase 3: User Story 1 - Editar itens, categorias e preços em centavos (`004-US1`) (Priority: P1) 🎯 MVP

**Goal**: Garantir validação estrita de preços inteiros positivos em centavos (`INVALID_PRICE_CENTS`), WhatsApp internacional (`INVALID_WHATSAPP`) e compatibilidade com `publicMenu()`.

**Independent Test**: Validar via `src/portal-validation.mjs` e `PUT /api/sites/:siteId/draft` payloads válidos (`200 OK`) e payloads com centavos inválidos ou WhatsApp malformado (`422`).

- [x] T005 [US1] Implementar validação de `priceCents` inteiro positivo seguro, `whatsapp` (`^[1-9]\d{7,14}$`), categorias/itens e projeção `toPublicMenuDraft()` em `src/portal-validation.mjs`

---

## Phase 4: User Story 2 - Respeitar limites do plano básico gratuito e tetos operacionais (`004-US2`) (Priority: P1)

**Goal**: Impor limite de 20 itens ativos (`ACTIVE_ITEMS_LIMIT_EXCEEDED`), teto técnico de 100 itens totais (`TOTAL_ITEMS_LIMIT_EXCEEDED`) e limite de 262.144 bytes UTF-8 (`DRAFT_TOO_LARGE`).

**Independent Test**: Submeter rascunhos com 21 itens ativos (`422`), 101 itens totais (`422`) e > 256 KiB (`413`).

- [x] T006 [US2] Implementar verificação de tamanho UTF-8 <= 262.144 bytes e contadores de itens totais (<= 100) e ativos (<= 20) em `src/portal-validation.mjs` e `workers/api.mjs`

---

## Phase 5: User Story 3 & 4 - Concorrência otimista por revisão e isolamento por vitrine (`004-US3`, `004-US4`) (Priority: P1/P2)

**Goal**: Implementar `GET /api/sites/:siteId/draft` e `PUT /api/sites/:siteId/draft` com isolamento multi-tenant (`404 SITE_NOT_FOUND`) e detecção de conflito de revisão (`409 REVISION_CONFLICT` com `currentRevision`).

**Independent Test**: Verificar `GET` e `PUT` autenticados pelo proprietário (`200`), conflito de revisão obsoleta (`409`) e acesso cruzado por outro usuário (`404`).

- [x] T007 [US3] [US4] Implementar rotas `GET /api/sites/:siteId/draft` e `PUT /api/sites/:siteId/draft` com controle otimista de `revision` e isolamento por usuário em `workers/api.mjs`

---

## Phase 6: Polish & Verification Gates

**Purpose**: Executar todos os portões de qualidade do repositório sem conflitos de fronteira.

- [x] T008 Executar validação embarcada PGlite (`202611070001_site_access.sql` + `202611110001_portal_schema.sql`), verificação de contratos HTTP, `npm test`, `npm run build` e `npx --yes wrangler@4.158.0 deploy --dry-run`
