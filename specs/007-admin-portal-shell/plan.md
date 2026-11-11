# Implementation Plan: Shell do Portal Administrativo e Gestão de Sessão e Vitrines

**Branch**: `007-admin-portal-shell` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-admin-portal-shell/spec.md` and shared API contract `/specs/004-catalog-editor/contracts/portal-api.md`.

## Summary

Implementar o backend do shell do portal administrativo (`workers/api.mjs`), a validação de criação de vitrines (`src/portal-validation.mjs`), a migração incremental de schema (`supabase/migrations/202611110001_portal_schema.sql`) e a configuração do Cloudflare Worker (`wrangler.jsonc`). O Worker provê verificação de sessão via Bearer JWT ou cookie `__Host-vitrine_session`, logout seguro, listagem multi-tenant de vitrines (`GET /api/sites`), criação atômica de vitrine com rascunho inicial (`POST /api/sites`) e delegação de ativos estáticos para `env.ASSETS`.

## Technical Context

**Language/Version**: JavaScript ES Modules (Node.js `>=24.12.0 <25`); SQL PostgreSQL / PGlite `0.5.15`.

**Primary Dependencies**: Runtime nativo Cloudflare Workers / Node.js 24 (`Request`, `Response`, `URL`, `crypto.subtle`, `fetch`), zero pacotes npm adicionais.

**Storage**: Tabelas `public.sites`, `public.site_memberships` e `public.drafts` no Supabase Postgres com RLS; adaptador PostgREST repassando JWT do usuário e store em memória injetável para testes determinísticos.

**Testing**: `node --test` e validação embarcada PGlite (`202611070001_site_access.sql` + `202611110001_portal_schema.sql`).

**Target Platform**: Cloudflare Workers Free com Static Assets (`wrangler.jsonc`).

**Project Type**: Cloudflare Worker API + validação de domínio + migração SQL incremental.

**Performance Goals**: Resolução de sessão e roteamento de API em < 5 ms no Worker (excluindo latência de rede PostgREST quando remoto).

**Constraints**: Custo zero (ADR 0005); cookie host-only `__Host-vitrine_session` (ADR 0006); uso exclusivo de `auth.uid()` opaco (ADR 0004); proibição de `service_role` em fluxos de usuário.

**Scale/Scope**: Piloto de até 10 vitrines, suporte a múltiplos negócios por proprietário e membros isolados por vitrine.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Explicit public-data projection; private fields excluded from artifacts**: Atendido. Rotas administrativas ficam sob `/api/*` e exigem autenticação; `dist/` continua contendo apenas arquivos públicos estáticos.
- **Server-side tenant authorization and isolation tests for persistence changes**: Atendido. Identidade é extraída apenas do token verificado pelo servidor (`authVerifier` / JWT / Supabase Auth), nunca do corpo da requisição.
- **Server-only credentials with minimum permissions**: Atendido. Nenhuma credencial privada é exposta; o adaptador Supabase encaminha o próprio token do usuário para respeitar RLS.
- **Provider quotas, commercial-use terms and failure behavior documented**: Atendido. Operação integralmente compatível com Cloudflare Workers Free com Static Assets e Supabase Free.
- **Testable acceptance criteria; pending choices remain proposed**: Atendido. Critérios Given-When-Then formalizados para `007-US1` a `007-US4`.

## Project Structure

### Documentation (this feature)

```text
specs/007-admin-portal-shell/
├── spec.md                  # Especificação da feature (007-US1 a 007-US4)
├── plan.md                  # Este plano técnico
├── data-model.md            # Modelo de dados de sessão, vitrines e membros
├── tasks.md                 # Lista de tarefas ordenada por dependências
└── checklists/
    └── requirements.md      # Checklist de qualidade dos requisitos
```

### Source Code (repository root)

```text
src/
└── portal-validation.mjs    # Validação de slug (3..40 chars, slugs reservados), nome e template

workers/
└── api.mjs                  # createApiHandler(deps) e export default { fetch(request, env, ctx) }

supabase/
├── README.md                # Documentação atualizada das migrações 202611070001 e 202611110001
└── migrations/
    └── 202611110001_portal_schema.sql # Constraints incrementais do portal

wrangler.jsonc               # Configuração de main: "workers/api.mjs" e assets: "./dist"
```

**Structure Decision**: Unificar os endpoints de sessão, vitrines e rascunhos em `workers/api.mjs` exportando `createApiHandler(deps = {})` para permitir testes unitários e de contrato sem servidor externo.

## Complexity Tracking

Sem violações da Constituição.
