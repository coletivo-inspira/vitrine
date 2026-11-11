# Implementation Plan: Editor de Cardápio e Gestão de Rascunhos (`pizzeria-v1`)

**Branch**: `004-catalog-editor` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-catalog-editor/spec.md` and shared contract `/specs/004-catalog-editor/contracts/portal-api.md`.

## Summary

Implementar a camada de validação de domínio (`src/portal-validation.mjs`), as restrições incrementais de banco (`supabase/migrations/202611110001_portal_schema.sql`) e os handlers HTTP de leitura e atualização de rascunho (`GET /api/sites/:siteId/draft` e `PUT /api/sites/:siteId/draft` em `workers/api.mjs`). O design impõe preços em centavos inteiros positivos (`INVALID_PRICE_CENTS`), limite comercial gratuito de 20 itens ativos (`ACTIVE_ITEMS_LIMIT_EXCEEDED`), teto técnico de 100 itens totais (`TOTAL_ITEMS_LIMIT_EXCEEDED`), limite de 256 KiB em UTF-8 (`DRAFT_TOO_LARGE`), WhatsApp internacional válido (`INVALID_WHATSAPP`), isolamento multi-tenant (`404 SITE_NOT_FOUND`) e concorrência otimista por `revision` (`409 REVISION_CONFLICT`).

## Technical Context

**Language/Version**: JavaScript ES Modules (Node.js `>=24.12.0 <25`); SQL PostgreSQL / PGlite `0.5.15`.

**Primary Dependencies**: APIs Web padrão do runtime Cloudflare Workers e Node.js 24 (`Request`, `Response`, `URL`, `TextEncoder`, `crypto.subtle`, `fetch`), sem dependências de produção externas.

**Storage**: Tabela `public.drafts` no Supabase Postgres com RLS habilitada, trigger `private.bump_draft_revision()` e constraints JSONB <= 256 KiB; adaptador em memória determinístico e adaptador PostgREST (encaminhando JWT do usuário autenticado) em `workers/api.mjs`.

**Testing**: `node --test` com PGlite embarcado para migrações SQL e testes de contrato HTTP sobre `createApiHandler({ authVerifier, store })`.

**Target Platform**: Cloudflare Workers Free com Static Assets (`wrangler.jsonc` com `main: "workers/api.mjs"` e `assets.directory: "./dist"`).

**Project Type**: Módulo de domínio compartilhado + Cloudflare Worker API + migração PostgreSQL/Supabase.

**Performance Goals**: Validação de rascunho de até 100 itens em < 5 ms no Worker; rejeição imediata de payloads > 256 KiB antes de persistência.

**Constraints**: Custo zero (ADR 0005); zero uso de `service_role` em requisições de usuários; compatibilidade total com `src/public-menu.mjs`; zero alterações em arquivos fora da fronteira de Backend.

**Scale/Scope**: Piloto de até 10 vitrines, até 20 itens ativos e até 100 itens totais (ativos + ocultos) por vitrine, tamanho máximo de rascunho de 262.144 bytes UTF-8.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Explicit public-data projection; private fields excluded from artifacts**: Atendido. O rascunho armazenado em `public.drafts` permanece privado e autenticado; a função `toPublicMenuDraft()` garante que o rascunho seja conversível sem perda para a projeção explícita `publicMenu()` de `src/public-menu.mjs`.
- **Server-side tenant authorization and isolation tests for persistence changes**: Atendido. `GET` e `PUT /api/sites/:siteId/draft` validam sessão no Worker e verificam vínculo à vitrine no store/RLS, retornando `404 SITE_NOT_FOUND` para vitrines de terceiros.
- **Server-only credentials with minimum permissions**: Atendido. O Worker repassa exclusivamente o JWT `Bearer` do usuário para o PostgREST/Supabase com a chave pública `anon`, nunca utilizando `service_role`.
- **Provider quotas, commercial-use terms and failure behavior documented**: Atendido. Limites de 20 itens ativos, 100 itens totais e 256 KiB são validados com códigos de erro determinísticos (`422` e `413`).
- **Testable acceptance criteria; pending choices remain proposed**: Atendido. Todos os cenários Given-When-Then de `004-US1` a `004-US4` possuem códigos HTTP e JSON determinísticos verificáveis sem rede.

## Project Structure

### Documentation (this feature)

```text
specs/004-catalog-editor/
├── spec.md                  # Especificação da feature (004-US1 a 004-US4)
├── plan.md                  # Plano técnico de implementação
├── data-model.md            # Modelo de dados do rascunho e regras de validação
├── tasks.md                 # Tarefas de implementação ordenadas por dependência
├── checklists/
│   └── requirements.md      # Checklist de verificação de requisitos
└── contracts/
    └── portal-api.md        # Contrato HTTP/JSON completo dos endpoints do portal
```

### Source Code (repository root)

```text
src/
├── public-menu.mjs          # Projeção pública existente (inalterado)
├── portfolio.mjs            # Projeção de portfólio existente (inalterado)
└── portal-validation.mjs    # Validação de criação de vitrine e rascunho pizzeria-v1

workers/
└── api.mjs                  # Cloudflare Worker com createApiHandler e delegação ASSETS

supabase/
├── README.md                # Documentação das migrações e invariantes de revisão/RLS
└── migrations/
    ├── 202611070001_site_access.sql   # Migração fundacional (inalterada)
    └── 202611110001_portal_schema.sql # Migração incremental do portal e constraints adicionais

wrangler.jsonc               # Configuração do Worker (main: "workers/api.mjs") e Static Assets
```

**Structure Decision**: Manter a validação pura e isomórfica em `src/portal-validation.mjs` (sem dependências externas, reutilizável tanto pelo Worker quanto por testes e scripts) e concentrar o roteamento HTTP, extração de sessão e adaptadores de persistência em `workers/api.mjs`.

## Complexity Tracking

Sem desvios da Constituição. O uso de injeção de dependências em `createApiHandler({ authVerifier, store, fetch })` permite testes de contrato 100% determinísticos em memória ou PGlite sem exigir rede ativa.
