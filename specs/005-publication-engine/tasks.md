---

description: "Task list for feature 005-publication-engine implementation and verification"
---

# Tasks: Motor de Publicação Determinístico e Imutável (`005-publication-engine`)

**Input**: Design documents from `/specs/005-publication-engine/` (`spec.md`, `plan.md`, `data-model.md`, `checklists/requirements.md`)

**Prerequisites**: `plan.md`, `spec.md` (`005-US1` a `005-US4`), `data-model.md`, `src/public-menu.mjs`, `src/portal-validation.mjs`

**Organization**: Tarefas organizadas por fases e histórias de usuário (`005-US1` a `005-US4`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode ser executada em paralelo
- **[Story]**: História de usuário associada (`US1`, `US2`, `US3`, `US4`)

---

## Phase 1: Setup & Specification Artifacts

**Purpose**: Formalizar a documentação Spec Kit para `005-publication-engine`.

- [x] T001 Criar `specs/005-publication-engine/spec.md` com User Stories `005-US1` a `005-US4` e cenários Given-When-Then
- [x] T002 [P] Criar `specs/005-publication-engine/plan.md`, `specs/005-publication-engine/data-model.md` e `specs/005-publication-engine/checklists/requirements.md`

---

## Phase 2: Foundational (Deterministic Publication Compiler)

**Purpose**: Construir o compilador determinístico e calculador de hash SHA-256 em `src/publication-engine.mjs`.

- [x] T003 [US1] [US2] Implementar `computeSha256Hex()`, `compilePublicStorefront()` e `assertNoPrivateLeakage()` em `src/publication-engine.mjs` integrados a `publicMenu()` de `src/public-menu.mjs`

---

## Phase 3: User Story 1, 2 & 3 - Endpoint `POST /api/sites/:siteId/publish` e Atomicidade (`005-US1`, `005-US2`, `005-US3`) (Priority: P1) 🎯 MVP

**Goal**: Expor rota autenticada de publicação no Worker com isolamento por vitrine, projeção imutável e rollback automático em caso de falha.

**Independent Test**: Chamar `POST /api/sites/:siteId/publish` autenticado (`200 OK`), com rascunho sem itens ativos (`422 EMPTY_PUBLIC_MENU` preservando publicação anterior), sem token (`401`) e com usuário sem vínculo (`404`).

- [x] T004 [US1] [US2] [US3] Adicionar suporte a publicações atômicas no store e rota `POST /api/sites/:siteId/publish` em `workers/api.mjs`
- [x] T005 [US1] Conectar botão "Publicar Vitrine" e feedback de link/hash publicado no Portal Administrativo (`web/portal/index.html`, `web/portal/portal.css`, `web/portal/editor.js`)

---

## Phase 4: User Story 4 - Pré-compilação Estática no Build e Cache Imutável (`005-US4`) (Priority: P2)

**Goal**: Gerar a vitrine piloto `/loja1` estaticamente durante `npm run build` e servir artefatos publicados com cabeçalhos de cache CDN.

**Independent Test**: Rodar `npm run build` e verificar `dist/data/vitrines/loja1/menu.json` e respostas HTTP para `/data/vitrines/:slug/menu.json` e `/data/vitrines/:slug/releases/:hash.json`.

- [x] T006 [US4] Criar catálogo público `content/vitrines/loja1.json` e pré-compilar `dist/data/vitrines/loja1/menu.json` em `scripts/build.mjs`
- [x] T007 [US4] Servir `/data/vitrines/:slug/menu.json` e `/data/vitrines/:slug/releases/:hash.json` com cabeçalhos `Cache-Control` e CSP estrita em `workers/api.mjs` e `scripts/serve.mjs`

---

## Phase 5: Polish & Automated Verification

**Purpose**: Garantir cobertura automatizada integral dos requisitos de publicação.

- [x] T008 Criar testes automatizados de publicação, atomicidade e ausência de vazamento privado em `test/publication-and-storefront.test.mjs`
