---

description: "Task list for feature 006-public-storefront implementation and verification"
---

# Tasks: Vitrine Pública Mobile-First (`006-public-storefront`)

**Input**: Design documents from `/specs/006-public-storefront/` (`spec.md`, `plan.md`, `data-model.md`, `checklists/requirements.md`)

**Prerequisites**: `plan.md`, `spec.md` (`006-US1` a `006-US3`), `data-model.md`, `DESIGN.md`, `src/public-menu.mjs`, `src/publication-engine.mjs`

**Organization**: Tarefas organizadas por fases e histórias de usuário (`006-US1` a `006-US3`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode ser executada em paralelo
- **[Story]**: História de usuário associada (`US1`, `US2`, `US3`)

---

## Phase 1: Setup & Specification Artifacts

**Purpose**: Formalizar os artefatos Spec Kit para `006-public-storefront`.

- [x] T001 Criar `specs/006-public-storefront/spec.md` com User Stories `006-US1` a `006-US3` e cenários Given-When-Then
- [x] T002 [P] Criar `specs/006-public-storefront/plan.md`, `specs/006-public-storefront/data-model.md` e `specs/006-public-storefront/checklists/requirements.md`

---

## Phase 2: User Story 1 & 3 - Template Mobile-First "Laranja Pontual" e Pedido no WhatsApp (`006-US1`, `006-US3`) (Priority: P1/P2) 🎯 MVP

**Goal**: Implementar `web/vitrine/index.html`, `web/vitrine/vitrine.css` e `web/vitrine/vitrine.js` com agrupamento por categoria, formatação BRL de `priceCents`, botão "Pedir no WhatsApp" via `whatsappLink()`, tema claro/escuro sem FOUC e acessibilidade WCAG AA.

**Independent Test**: Carregar `/loja1`, verificar HTML semântico, categorias, preços formatados e URLs `https://wa.me/...` geradas por `whatsappLink()`.

- [x] T003 [US1] [US3] Implementar `web/vitrine/index.html`, `web/vitrine/vitrine.css` e `web/vitrine/vitrine.js` seguindo `DESIGN.md`

---

## Phase 3: User Story 2 - Build Estático `/loja1`, Roteamento `/:slug` e Cabeçalhos de Cache/CSP (`006-US2`) (Priority: P1)

**Goal**: Garantir peso < 100 KB, geração estática de `/loja1` no build, roteamento público de `/:slug` e cabeçalhos `Cache-Control` e CSP estrita.

**Independent Test**: Executar `npm run build`, verificar peso de `web/vitrine/*` < 100 KB e testar `GET /loja1` e `GET /:slug` no Worker e no `scripts/serve.mjs`.

- [x] T004 [US2] Atualizar `scripts/build.mjs` e `web/_headers` para copiar `src/public-menu.mjs` para `dist/assets/public-menu.mjs`, gerar `dist/loja1/index.html` e configurar cabeçalhos de cache da vitrine
- [x] T005 [US2] Implementar roteamento público de `/:slug` e `/data/vitrines/:slug/*` em `workers/api.mjs`, `scripts/serve.mjs` e `wrangler.jsonc`

---

## Phase 4: Polish & Verification Gates

**Purpose**: Validar todos os cenários da vitrine pública com testes automatizados.

- [x] T006 Adicionar testes automatizados de peso (< 100 KB), CSP, Cache-Control, renderização de `/loja1` e link `wa.me` em `test/publication-and-storefront.test.mjs`
