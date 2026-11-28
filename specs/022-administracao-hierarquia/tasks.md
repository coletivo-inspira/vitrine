---
description: "Tarefas da hierarquia da administração, licenças, cupons e limites por vitrine"
---

# Tasks: Hierarquia da administração, licenças, cupons e limites

**Input**: `specs/022-administracao-hierarquia/` (spec, plan, data-model, contracts, quickstart)

**Tests**: obrigatórios para permissões no banco, rotas por papel e abas por capacidade (Princípios II e V).

## Phase 1: Setup

- [x] T001 Criar `specs/022-administracao-hierarquia/` com spec, plan, data-model, contracts, quickstart e tasks.
- [x] T002 Propor o ADR `docs/adr/0018-hierarquia-licencas-cupons.md`.
- [x] T003 Atualizar `AGENTS.md`, `.specify/feature.json` e `CONTEXT.md`.

## Phase 2: Banco

- [x] T004 Migração `supabase/migrations/20261128001000_platform_hierarchy_licenses.sql`: papéis, capacidades, Dono, licenças, cupons, resgates, tentativas, limites, `site_entitlements`, usuários (data-model.md).
- [x] T005 Teste `test/database/platform-hierarchy.test.mjs`.

## Phase 3: Worker

- [x] T006 `src/admin/platform-roles.mjs` (matriz) e `src/admin/routes.mjs` (rotas e repositório Supabase).
- [x] T007 `workers/api.mjs`: roteamento, `isPlatformAdmin` com o Dono, `readPlatformAccess` no armazenamento, resgate em `/api/sites/:id/coupon`.
- [x] T008 Teste `test/admin-hierarchy-routes.test.mjs`.

## Phase 4: Painel

- [x] T009 Abas Usuários, Equipe da plataforma, Licenças e cupons e Processos, por capacidade (`web/portal/platform-*.mjs`, `index.html`, CSS).
- [x] T010 "Tenho um cupom" em Plano e cobrança.
- [x] T011 Ampliar `test/admin-platform-ui.test.mjs`.

## Phase 5: Documentação

- [x] T012 `supabase/README.md`, `docs/operations-guide.md` (Dono) e nota na 018 sobre `license_grants`.

## Pendências humanas

- [ ] H001 Aplicar a migração no Supabase remoto e definir o Dono (`quickstart.md`).
- [ ] H002 Validar as abas com contas reais nos três papéis.
