# Tasks: Leilão de verdade para itens no modo lance (`013-leilao`)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md), [contracts/auction-api.md](./contracts/auction-api.md)

**Tests**: obrigatórios (Princípio V — autorização, projeção pública e publicação).

## Phase 1: Setup

- [x] T001 Criar `specs/013-leilao/` com spec, plano, pesquisa, modelo de dados, contrato, quickstart e checklist

## Phase 2: Foundational (bloqueia todas as histórias)

- [x] T002 Migração append-only `supabase/migrations/20261112194217_auction_bids.sql`: tabelas `auction_lots`, `auction_bids`, `auction_blocks`, `private.auction_settings`, RLS, grants de coluna
- [x] T003 [P] Regras puras compartilhadas em `web/assets/auction-rules.mjs` (termos, mínimo, prorrogação, validação de entrada, mensagens, formatação)
- [x] T004 [P] Validar `auctionEndsAt` e `bidIncrementCents` em `src/portal-validation.mjs`
- [x] T005 [P] Projetar `auctionEndsAt` (UTC) e `bidIncrementCents` só para itens `offer` em `src/publication-engine.mjs`

## Phase 3: User Story 1 + 2 — lance registrado com regras no servidor (P1)

- [x] T006 [US2] Funções `private/public.place_auction_bid` e `read_auction_board` na migração (canal secreto, limites, prorrogação, congelamento, limpeza de 90 dias)
- [x] T007 [US2] Testes PGlite em `test/database/auction-bids.test.mjs` (canal, mínimo, prazo, limites, identidades, bloqueio, RLS, prorrogação)
- [x] T008 [US1] Motor em memória `src/auction-engine.mjs` espelhando as regras para testes/local
- [x] T009 [US1] Rotas `GET /api/public/auctions/:slug` e `POST /api/public/auctions/:slug/bids` em `workers/api.mjs` (origem, robô, isca, tamanho, HMAC do visitante, mapeamento de erros, domínio personalizado)
- [x] T010 [US1] Métodos do store Supabase (`readAuctionBoard`, `placeAuctionBid`) com cabeçalho `x-vitrine-bid-key`
- [x] T011 [US1] Cartão de leilão e diálogo de lance em `web/assets/storefront-renderer.mjs`; estilos em `web/vitrine/vitrine.css`
- [x] T012 [US1] Cliente do quadro, polling de 30 s com aba visível e envio em `web/vitrine/vitrine.js`
- [x] T013 [US1] Testes de contrato da API e renderização em `test/auction-api.test.mjs` e `test/auction-rules.test.mjs`

## Phase 4: User Story 3 — vencedor no painel (P1)

- [x] T014 [US3] Função `public.void_auction_bid` com auditoria e bloqueio (migração)
- [x] T015 [US3] Rotas `GET /api/sites/:id/auctions` e `POST /api/sites/:id/auctions/bids/:bidId/void` + store Supabase/memória
- [x] T016 [US3] Seção "Leilões" em `web/portal/auctions-panel.js`, `index.html`, `portal.js`, `portal.css` (vencedor, lances, "Chamar no WhatsApp", desconsiderar)
- [x] T017 [US3] Testes de autorização (owner/admin vs editor/viewer/outra vitrine) e desconsideração

## Phase 5: User Story 4 — configuração no editor (P2)

- [x] T018 [US4] Campos "Encerramento do leilão" e "Incremento mínimo" em `web/portal/editor.js`

## Phase 6: Polish

- [x] T019 Atualizar `supabase/README.md`, `docs/operations-guide.md` (segredo do canal) e `CONTEXT.md` (vocabulário)
- [x] T020 Capturas 1280/375 claro/escuro em `media/leilao/` da store do projeto
- [x] T021 `npm test`, `npm run build`, `npx wrangler deploy --dry-run`, CI verde
