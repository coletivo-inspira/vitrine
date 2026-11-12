# Tarefas: Vitrine por cidade

**Entrada**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/por-cidade.md](./contracts/por-cidade.md)

## Fase 1 — Fundação

- [x] T001 Reservar `por-cidade` em `RESERVED_SLUGS` (`src/portal-validation.mjs`), `src/public-menu.mjs` e constraint `not valid` em `public.sites`
- [x] T002 `BRAZIL_UFS`, `slugifyCity`, `validateLocality`, `projectPublicLocality` em `src/portal-validation.mjs`; validar `content.locality` em `validateDraftContent`
- [x] T003 Projetar `menu.locality` e validar o bloco em `assertNoPrivateLeakage` (`src/publication-engine.mjs`); preservar `locality` em `hydratePublicationRecord` (`workers/api.mjs`)

## Fase 2 — Banco (US1, US2)

- [x] T004 Migração `supabase/migrations/20261112193000_city_listings.sql`: tabela, índices, trigger `private.refresh_city_listings()`, view `city_listing_cities`, RLS e grants por coluna
- [x] T005 [P] Testes PGlite `test/database/city-listings.test.mjs`: derivação, remoção ao desmarcar, localidade inválida, `site_id` oculto, escrita negada, cascade, slug reservado

## Fase 3 — Página pública (US1, US3)

- [x] T006 `src/city-listings.mjs`: linhas derivadas, `sort_key`, cursor, filtros, `toPublicListing`, `describeListingPrice` (encaixe 013)
- [x] T007 `src/city-page.mjs`: índice, cidade, 404 e 503 com o visual do site de divulgação
- [x] T008 Rotas, Cache API com chave normalizada e métodos de store (memória e Supabase) em `workers/api.mjs`
- [x] T009 [P] `web/por-cidade/por-cidade.css` (claro/escuro, 1280/375) e exclusão em `run_worker_first` (`wrangler.jsonc`)
- [x] T010 [P] Testes `test/city-listings.test.mjs`: projeção, rotas, filtros, paginação, privacidade, CSP, 404/405/503, fluxo rascunho → publicação

## Fase 4 — Editor (US2)

- [x] T011 Bloco "Página por cidade" em Ajustes (`web/portal/index.html`, `web/portal/editor.js`, `web/portal/portal.css`)
- [x] T012 Link "Mais itens de lance, doação e troca em <Cidade>" no rodapé das vitrines listadas (`src/publication-engine.mjs`, `web/vitrine/vitrine.css`)

## Fase 5 — Verificação

- [x] T013 `npm test`, `npm run build`, `npx wrangler deploy --dry-run`
- [x] T014 Capturas 1280/375 claro/escuro em `media/por-cidade/` (store do projeto)
- [x] T015 Documentação: `supabase/README.md`, `CONTEXT.md`

## Pendências humanas

- [ ] H001 Aplicar a migração `20261112193000_city_listings.sql` no Supabase de produção (fluxo `db-migrate`)
- [ ] H002 Após aplicar, publicar uma vitrine de teste com cidade autorizada e abrir `https://vitrine.inspira.dev.br/por-cidade`

## Fora do escopo (próximas fatias)

- Busca textual e lista oficial de municípios (IBGE).
- Link "Por cidade" na navegação principal do site de divulgação.
- Leilão com lances registrados (spec 013), pelo ponto de encaixe do contrato.
