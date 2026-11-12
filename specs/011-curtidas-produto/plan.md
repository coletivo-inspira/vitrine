# Implementation Plan: Curtidas por Item na Vitrine Pública

**Branch**: `cursor/curtidas-produto-d462` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-curtidas-produto/spec.md`

## Summary

Botão de curtir em cada item da vitrine pública, com contagem calculada no Supabase a partir de registros únicos por visitante anônimo (cookie funcional `HttpOnly` gerado pelo Worker, só o hash é gravado), tetos por hora contra abuso e um card "Itens mais curtidos" no Painel de Insights para a equipe da vitrine.

## Technical Context

**Language/Version**: JavaScript ES modules (Node 24 para testes; Cloudflare Workers runtime), SQL PostgreSQL 15 (Supabase)

**Primary Dependencies**: nenhuma nova; `@electric-sql/pglite` já usado nos testes de banco

**Storage**: Supabase Postgres (`public.item_likes`); store em memória no Worker para desenvolvimento e testes

**Testing**: `node --test` (`test/item-likes.test.mjs`): PGlite com todas as migrações, Worker HTTP com store em memória, cliente da vitrine e cálculo de insights

**Target Platform**: Cloudflare Workers Free com Static Assets; navegadores móveis e desktop

**Project Type**: web (Worker + estáticos em `web/`)

**Performance Goals**: 1 subrequisição Supabase por carregamento e por toque; atualização otimista < 100 ms

**Constraints**: custo zero; CSP `script-src 'self'`; sem IP; sem `package.json` alterado; migração append-only

**Scale/Scope**: vitrines de pequenos negócios (≤ 100 itens, dezenas a centenas de curtidas por dia)

## Constitution Check

- **I. Projeção pública**: curtidas não entram no artefato publicado; `GET /api/likes` expõe só contagens por item e o estado do próprio visitante. ✅
- **II. Isolamento entre vitrines**: tabela sem grants; estatísticas filtradas por `private.accessible_site_ids()`; testes cobrem estranho sem dados. ✅
- **III. Credenciais no servidor**: nenhum segredo novo; token do visitante é `HttpOnly` e só o hash é persistido. ✅
- **IV. Custo verificável**: cotas documentadas em `research.md` (R3); sem serviço pago. ✅
- **V. Entregas verificáveis**: cenários de aceite com testes automatizados e capturas 1280/375 claro/escuro. ✅

## Project Structure

### Documentation (this feature)

```text
specs/011-curtidas-produto/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/item-likes-api.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
supabase/migrations/20261112192000_item_likes.sql   # tabela, funções e grants
src/portal-validation.mjs                           # validação do payload, limites e bloco "likes" dos insights
workers/api.mjs                                     # rota /api/likes, cookie, stores memória/Supabase, insights
web/assets/storefront-renderer.mjs                  # botão de curtir no card do item
web/vitrine/vitrine.js                              # cliente de curtidas (GET/POST, otimista, rollback)
web/vitrine/vitrine.css                             # estilo do botão (claro/escuro, 44 px)
web/vitrine/index.html, src/publication-engine.mjs  # aviso de privacidade
web/portal/index.html, portal.js, portal.css        # card "Itens mais curtidos" nos Insights
scripts/capture-curtidas-screenshots.mjs            # capturas locais com Worker em memória
test/item-likes.test.mjs                            # testes da funcionalidade
```

**Structure Decision**: segue o padrão já usado pelas métricas agregadas (`/api/events` + `record_site_metric_batch`), com funções `SECURITY DEFINER` no banco e store em memória espelhando as regras.

## Complexity Tracking

Sem violações da constituição.
