# Implementation Plan: Leilão de verdade para itens no modo lance

**Branch**: `cursor/leilao-lances-cac0` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-leilao/spec.md`

## Summary

Itens `priceMode: "offer"` com `auctionEndsAt` viram leilões. A vitrine pública lê um quadro sem dados pessoais (`GET /api/public/auctions/:slug`) e envia lances (`POST /api/public/auctions/:slug/bids`) ao Worker, que filtra origem, robôs, tamanho e campo isca, deriva um identificador irreversível do visitante e chama a função `public.place_auction_bid` no Supabase com um cabeçalho secreto do canal. A função (SECURITY DEFINER) revalida tudo contra a publicação ativa, trava o lote, aplica limites, prorrogação e grava o lance. O painel lê lotes e lances via PostgREST com o JWT do usuário sob RLS (`owner`/`admin`) e desconsidera lances via `public.void_auction_bid`, com auditoria.

## Technical Context

**Language/Version**: JavaScript ES Modules (Node 24 nos testes; Cloudflare Workers no runtime); SQL PostgreSQL 15+ (Supabase).

**Primary Dependencies**: nenhuma nova. Web Crypto (`crypto.subtle`) para HMAC no Worker; `pg_catalog.sha256` no banco.

**Storage**: Supabase Postgres — novas tabelas `public.auction_lots`, `public.auction_bids`, `public.auction_blocks` e `private.auction_settings` (migração append-only `supabase/migrations/20261112191347_auction_bids.sql`).

**Testing**: `node --test` — PGlite para RLS/função SQL (`test/database/auction-bids.test.mjs`), contrato da API com o store em memória (`test/auction-api.test.mjs`), regras puras e renderização (`test/auction-rules.test.mjs`).

**Target Platform**: Cloudflare Workers Free + Static Assets; Supabase Free.

**Project Type**: web (Worker + páginas estáticas + painel).

**Performance Goals**: um lance = 1 subrequest do Worker ao Supabase; quadro = 1 subrequest; consulta ao quadro a cada 30 s só com a aba visível.

**Constraints**: CSP `script-src 'self'`; sem segredos no frontend/logs; sem `service_role` no Worker; sem `package.json` alterado; vocabulário "vitrine".

**Scale/Scope**: piloto de até 10 vitrines, 20 itens ativos cada; teto de 300 lances por lote.

## Constitution Check

- **I. Projeção pública explícita**: quadro público montado no banco só com valores, horários, contagem e marcador curto do lance líder; menu publicado ganha apenas `auctionEndsAt` e `bidIncrementCents`. ✅
- **II. Isolamento entre vitrines**: RLS por `private.has_site_role(site_id, {owner,admin})`; sem grants de escrita; testes provam que anônimo, outra vitrine, editor e leitor não leem lances. ✅
- **III. Credenciais apenas no servidor**: `AUCTION_BID_SECRET` só como secret do Worker; banco guarda o SHA-256; nenhuma `service_role`. ✅
- **IV. Custo e condições**: sem cron novo, sem API paga, polling limitado; falha fechada quando o segredo falta. ✅
- **V. Entregas verificáveis**: cenários de aceite cobertos por testes de banco, API e renderização; capturas 1280/375 claro/escuro. ✅

## Project Structure

### Documentation (this feature)

```text
specs/013-leilao/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/auction-api.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
supabase/migrations/20261112191347_auction_bids.sql   # tabelas, RLS, funções place/read/void
web/assets/auction-rules.mjs                           # regras puras compartilhadas (browser + Worker)
web/assets/storefront-renderer.mjs                     # cartão de leilão e diálogo de lance
web/vitrine/vitrine.js                                 # cliente do quadro, polling e envio
web/vitrine/vitrine.css                                # estilos do cartão/diálogo
web/portal/auctions-panel.js                           # seção "Leilões" do painel
web/portal/{index.html,portal.js,portal.css,editor.js} # rota, navegação, campos do editor
src/auction-engine.mjs                                 # livro de leilões em memória (testes/local)
src/portal-validation.mjs                              # validação de auctionEndsAt/bidIncrementCents
src/publication-engine.mjs                             # projeção pública dos termos
workers/api.mjs                                        # rotas públicas e do painel, store Supabase
test/auction-rules.test.mjs, test/auction-api.test.mjs, test/database/auction-bids.test.mjs
```

**Structure Decision**: regras puras em `web/assets/` (servidas ao navegador e importadas pelo Worker, como `storefront-renderer.mjs`), motor em memória em `src/`, autoridade final no SQL.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Regras duplicadas em JS e SQL | O banco é a autoridade (chamada direta), o JS dá retorno imediato e alimenta o store em memória dos testes | Só JS deixaria o banco aberto a chamadas diretas; só SQL impediria testes de contrato sem Postgres |
