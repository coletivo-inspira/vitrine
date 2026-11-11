---

description: "Task list for feature 007-admin-portal-shell implementation and verification"
---

# Tasks: Shell do Portal Administrativo e Gestão de Sessão e Vitrines

**Input**: Design documents from `/specs/007-admin-portal-shell/` (`spec.md`, `plan.md`, `data-model.md`, `checklists/requirements.md`)

**Prerequisites**: `plan.md`, `spec.md` (`007-US1` a `007-US4`), `data-model.md`, `specs/004-catalog-editor/contracts/portal-api.md`

**Organization**: Tarefas agrupadas por histórias de usuário (`007-US1` a `007-US4`) dentro da fronteira estrita da Frente Backend da Fase 3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode ser executada em paralelo
- **[Story]**: História de usuário associada (`US1`, `US2`, `US3`, `US4`)

---

## Phase 1: Setup & Specification Artifacts

**Purpose**: Formalizar a especificação Spec Kit do shell administrativo e seus contratos de sessão e gestão de vitrines.

- [x] T001 Redigir histórias de usuário `007-US1` a `007-US4` com prioridades P1/P2 e cenários Given-When-Then em `specs/007-admin-portal-shell/spec.md`
- [x] T002 [P] Documentar plano técnico e modelo de dados em `specs/007-admin-portal-shell/plan.md` e `specs/007-admin-portal-shell/data-model.md`

---

## Phase 2: Foundational (Schema & Validation)

**Purpose**: Estender constraints de slugs reservados do portal no PostgreSQL e no módulo de validação.

- [x] T003 Adicionar constraint `sites_portal_slug_check` (comprimento 3..40 e bloqueio de `portal`, `assets`, `data`, `login`, `logout`), coluna `updated_at` e função `private.user_site_role(uuid)` em `supabase/migrations/202611110001_portal_schema.sql`
- [x] T004 Implementar `validateSlug`, `validateSiteInput` e `createInitialDraftContent` em `src/portal-validation.mjs`

---

## Phase 3: User Story 1 - Validar sessão autenticada e encerrar acesso (`007-US1`) (Priority: P1) 🎯 MVP

**Goal**: Extrair sessão de `Authorization: Bearer <jwt>` ou cookie `__Host-vitrine_session`, verificar JWT/sessão e implementar `GET /api/auth/session` e `POST /api/auth/logout`.

**Independent Test**: Verificar `GET /api/auth/session` autenticado (`200`) e anônimo (`401`), e `POST /api/auth/logout` limpando `__Host-vitrine_session` (`200`).

- [x] T005 [US1] Implementar extração de token, verificador de sessão (`authVerifier` injetável, JWT HS256 via Web Crypto e Supabase `/auth/v1/user`) e rotas `GET /api/auth/session` e `POST /api/auth/logout` em `workers/api.mjs`

---

## Phase 4: User Story 2 & 3 - Listar e criar vitrines com isolamento (`007-US2`, `007-US3`) (Priority: P1)

**Goal**: Implementar `GET /api/sites` e `POST /api/sites` com validação de slug (`400 INVALID_SLUG`), detecção de duplicidade (`409 SLUG_TAKEN`) e criação de rascunho inicial (`201 Created`).

**Independent Test**: Criar vitrine via `POST /api/sites` (`201`), testar colisão de slug (`409`), testar slug reservado (`400`) e listar vitrines por usuário (`200`).

- [x] T006 [US2] [US3] Implementar `GET /api/sites` e `POST /api/sites` sobre o store em memória e o adaptador Supabase PostgREST em `workers/api.mjs`

---

## Phase 5: User Story 4 - Roteamento do Worker e Static Assets (`007-US4`) (Priority: P2)

**Goal**: Configurar `wrangler.jsonc` com `main: "workers/api.mjs"` e delegar rotas não-`/api/*` para `env.ASSETS.fetch(request)`.

**Independent Test**: Executar `npm run build` e `npx --yes wrangler@4.158.0 deploy --dry-run`.

- [x] T007 [US4] Configurar `main: "workers/api.mjs"` em `wrangler.jsonc` e delegação `env.ASSETS.fetch(request)` no export default de `workers/api.mjs`
