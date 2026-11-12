# Plano de implementação: Vitrine por cidade

**Diretório**: `specs/012-vitrine-por-cidade/` | **Data**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

## Resumo

Campo `locality` por vitrine no rascunho (autorização + cidade + UF) → projeção pública `menu.locality` só quando autorizada → trigger no Postgres deriva `public.city_listings` a partir do manifesto publicado → Worker renderiza `/por-cidade` e `/por-cidade/<cidade-uf>` no servidor, com filtros por link e paginação por cursor, e serve o mesmo conteúdo em JSON. Decisões numeradas em [research.md](./research.md).

## Contexto técnico

- **Linguagem**: JavaScript ESM (Node 24 nos testes; Cloudflare Workers em produção).
- **Dependências**: nenhuma nova; `@electric-sql/pglite` já existente para testes de banco.
- **Armazenamento**: Supabase Postgres Free — tabela derivada `public.city_listings`, view `public.city_listing_cities`, trigger `private.refresh_city_listings()`.
- **Testes**: `node --test` (`test/city-listings.test.mjs`, `test/database/city-listings.test.mjs`).
- **Plataforma**: Workers Free com Static Assets; Cache API na borda.
- **Restrições**: CSP `script-src 'self'` e `form-action 'none'` mantidas; 1–2 subrequests por página não cacheada; sem `package.json` novo.
- **Escala**: piloto de 10 vitrines × 20 itens; projeção de 10 mil vitrines dentro do Supabase Free (research D9).

## Verificação da constituição

| Princípio | Como é atendido |
|---|---|
| I. Projeção pública explícita | `locality` só entra no manifesto com autorização; `assertNoPrivateLeakage` aceita apenas `city`, `uf`, `citySlug` e confere o slug; a tabela deriva só do manifesto público. |
| II. Isolamento entre vitrines | Escrita na tabela só pelo trigger (`SECURITY DEFINER`); `anon`/`authenticated` sem `insert/update/delete`; `site_id` sem grant de leitura. Testado em PGlite. |
| III. Credenciais no servidor | Leitura pública com chave `anon`; nenhum segredo novo. |
| IV. Custo verificável | Cotas e estimativa em research D9; Cache API com chave normalizada (parâmetros desconhecidos não geram novas entradas). |
| V. Entregas verificáveis | Testes de projeção, rotas, privacidade, paginação, trigger e RLS; capturas 1280/375 claro/escuro. |

## Estrutura

```text
src/portal-validation.mjs     # BRAZIL_UFS, slugifyCity, validateLocality, projectPublicLocality; reserva "por-cidade"
src/publication-engine.mjs    # menu.locality + validação de vazamento + link no rodapé da vitrine
src/city-listings.mjs         # linhas derivadas (gêmeo JS do trigger), cursor, filtros, describeListingPrice (encaixe 013)
src/city-page.mjs             # HTML do índice, da cidade, 404 e indisponível
workers/api.mjs               # rotas /por-cidade e /data/por-cidade, Cache API, métodos de store (memória e Supabase)
supabase/migrations/20261112190432_city_listings.sql
web/portal/{index.html,editor.js,portal.css}   # bloco "Página por cidade" em Ajustes
web/por-cidade/por-cidade.css
web/vitrine/vitrine.css       # estilo do link no rodapé
wrangler.jsonc                # CSS servido direto dos assets
test/city-listings.test.mjs, test/database/city-listings.test.mjs
```

## Fluxo de dados

1. Editor grava `content.locality = { listed, city, uf }`; entrada incompleta fica local com `listed: false` para o autosave não ser recusado.
2. `validateDraftContent` recusa `listed: true` sem cidade/UF válidas (422).
3. Publicação projeta `menu.locality = { city, uf, citySlug }`.
4. Upsert em `public.publications` dispara o trigger: apaga as linhas da vitrine e recria as de `offer`/`donation`/`trade`.
5. Worker: `listCityIndex()` (view, memorizada 60 s) + `listCityListings({ citySlug, priceMode, cursor, limit: 24 })` (`order=sort_key.desc&sort_key=lt.<cursor>&limit=25`).

## Riscos

- A migração precisa ser aplicada no Supabase de produção (ação humana) antes de a página ter dados reais; sem ela a página responde 503 (degradação controlada) e as vitrines seguem normais.
- Até 5 minutos de cache após desmarcar a autorização (documentado no editor e na spec).
- Nomes de cidade digitados livremente podem gerar duplicatas por erro de grafia (ex.: "Porto Alegr"); mitigação futura: lista de municípios.
