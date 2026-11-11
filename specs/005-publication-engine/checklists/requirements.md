# Specification Quality & Requirements Checklist: Motor de Publicação (`005-publication-engine`)

**Purpose**: Auditar a completude, segurança e conformidade constitucional da especificação `005-publication-engine`.  
**Created**: 2026-11-11  
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [data-model.md](../data-model.md)

## Content & Governance Quality

- [x] CHK001 As User Stories (`005-US1` a `005-US4`) estão redigidas em português com prioridades P1/P2 e cenários formais Given-When-Then.
- [x] CHK002 O vocabulário segue `CONTEXT.md` (*Vitrine*, *Proprietário*, *Membro*, *Modelo*, *Rascunho*, *Publicação*).

## Explicit Projection & Immutability (`005-US1` & `005-US2`)

- [x] CHK003 `src/publication-engine.mjs` executa obrigatoriamente `publicMenu()` de `src/public-menu.mjs` (`FR-001`).
- [x] CHK004 Nenhum campo privado (`owner_user_id`, `email`, `session`, `token`, `internalCost`, `service_role`) ou item inativo (`active: false`) entra no JSON publicado (`FR-002`, `FR-007`).
- [x] CHK005 Rascunhos sem itens visíveis são rejeitados com `422 EMPTY_PUBLIC_MENU` preservando intacta a publicação anterior (`FR-003`, `FR-006`).
- [x] CHK006 Cada publicação gera um hash de integridade SHA-256 determinístico de 64 caracteres hexadecimais (`FR-004`).

## Security & Static Distribution (`005-US3` & `005-US4`)

- [x] CHK007 `POST /api/sites/:siteId/publish` retorna `401 UNAUTHORIZED` para anônimos e `404 SITE_NOT_FOUND` para usuários autenticados sem vínculo (`FR-005`).
- [x] CHK008 `scripts/build.mjs` pré-compila `loja1` em `dist/data/vitrines/loja1/menu.json` sem consultar o Supabase em rotas públicas (`FR-008`).
