# Specification Quality & Requirements Checklist: Shell do Portal Administrativo (`007-admin-portal-shell`)

**Purpose**: Auditar a completude, clareza e conformidade constitucional da especificação `007-admin-portal-shell` frente aos ADRs 0001 a 0006.  
**Created**: 2026-11-11  
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [data-model.md](../data-model.md)

## Content & Governance Quality

- [x] CHK001 As User Stories canônicas (`007-US1` a `007-US4`) estão escritas em português no formato `Como..., quero..., para que...`, com prioridades (`P1`/`P2`) e cenários Given-When-Then.
- [x] CHK002 O vocabulário adere estritamente a `CONTEXT.md` (*Portal*, *Painel*, *Vitrine*, *Proprietário*, *Equipe da vitrine*, *Membro*, *Modelo*, *Rascunho*).

## Session & Identity Security (`007-US1`)

- [x] CHK003 O Worker aceita credenciais via header `Authorization: Bearer <jwt>` ou cookie host-only `__Host-vitrine_session=<jwt>` (`FR-001`).
- [x] CHK004 `GET /api/auth/session` retorna exclusivamente o identificador opaco `user.id` (`auth.uid()`), sem utilizar email como chave estrangeira (ADR 0004, `FR-002`).
- [x] CHK005 `POST /api/auth/logout` expira o cookie `__Host-vitrine_session` com `Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax` (`FR-003`).

## Multi-Tenant Site Management & Worker Routing (`007-US2`, `007-US3`, `007-US4`)

- [x] CHK006 `GET /api/sites` lista exclusivamente vitrines próprias (`role: "owner"`) ou associadas em `site_memberships` (`role: "member"`) (`FR-004`).
- [x] CHK007 `POST /api/sites` valida `slug` (3 a 40 caracteres, `^[a-z0-9]+(?:-[a-z0-9]+)*$`, bloqueando `admin`, `api`, `auth`, `app`, `www`, `portal`, `assets`, `data`, `login`, `logout`) com `400 INVALID_SLUG`, rejeita duplicatas com `409 SLUG_TAKEN` e cria rascunho inicial na `revision: 1` com `201 Created` (`FR-005`, `FR-006`).
- [x] CHK008 A migração `202611110001_portal_schema.sql` é append-only e idempotente, sem modificar `202611070001_site_access.sql` (`FR-007`).
- [x] CHK009 `workers/api.mjs` exporta `createApiHandler(deps = {})` e `default { fetch(request, env, ctx) }` delegando rotas fora de `/api/*` para `env.ASSETS.fetch(request)` (`FR-008`).
