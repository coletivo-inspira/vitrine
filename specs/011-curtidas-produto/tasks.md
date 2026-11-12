# Tasks: Curtidas por Item na Vitrine Pública (`011-curtidas-produto`)

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/item-likes-api.md`

## Phase 1: Foundational (bloqueia todas as histórias)

- [x] T001 Criar migração append-only `supabase/migrations/20261112190500_item_likes.sql` com `public.item_likes`, índice, RLS sem grants e funções `get_item_likes`, `set_item_like` e `site_item_like_stats`.
- [x] T002 Adicionar `ITEM_LIKE_LIMITS`, `MAX_LIKE_REQUEST_BYTES` e `validateItemLikePayload` em `src/portal-validation.mjs`.

## Phase 2: User Story 1 + 2 — Curtir com proteção (P1)

- [x] T003 [US1] Implementar `getItemLikes`/`setItemLike` no store em memória de `workers/api.mjs`, com unicidade e tetos por hora.
- [x] T004 [US1] Implementar `getItemLikes`/`setItemLike` no store Supabase (RPC + mapeamento de erros, `503 LIKES_UNAVAILABLE`).
- [x] T005 [US2] Rota `GET/POST /api/likes` no Worker: origem, JSON, 1 KiB, robôs, cookie `vitrine_curtidas` e hash SHA-256; liberar em domínios próprios.
- [x] T006 [US1] Cliente `createStorefrontLikesClient` em `web/vitrine/vitrine.js` (carga inicial, atualização otimista, rollback, mensagens).
- [x] T007 [US1] Botão de curtir no card em `web/assets/storefront-renderer.mjs` (somente página pública) e estilos em `web/vitrine/vitrine.css`.
- [x] T008 [US1] Atualizar aviso de privacidade em `web/vitrine/index.html` e `src/publication-engine.mjs`.

## Phase 3: User Story 3 — Métrica do dono (P2)

- [x] T009 [US3] Bloco `likes` em `computeStorefrontInsights` e destaque "item mais curtido".
- [x] T010 [US3] Incluir estatísticas de curtidas em `getSiteInsights` (memória e Supabase).
- [x] T011 [US3] Card "Itens mais curtidos" em `web/portal/index.html`, `portal.js` e `portal.css`, com estado vazio; ajustar textos de privacidade do painel.

## Phase 4: Verificação

- [x] T012 Testes em `test/item-likes.test.mjs`: PGlite (unicidade, tetos, isolamento, grants), Worker HTTP, cliente e insights.
- [x] T013 Script `scripts/capture-curtidas-screenshots.mjs` e capturas 1280/375 claro/escuro em `media/curtidas/`.
- [x] T014 Rodar `npm test`, `npm run build`, `npx wrangler deploy --dry-run`; registrar vocabulário em `CONTEXT.md`.

## Dependencies

T001–T002 → T003–T005 → T006–T008; T009–T010 → T011; T012 depende de todas; T013 depende de T007 e T011.
