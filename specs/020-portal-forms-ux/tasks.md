# Tasks: Portal da Vitrine no modelo Google Forms

**Input**: [spec.md](spec.md), [plan.md](plan.md). Marcadores: `[P]` pode correr em paralelo; `[USn]` história da spec.

## Fase 1 - Base

- [x] T001 Criar `specs/020-portal-forms-ux/` e apontar `AGENTS.md` e `.specify/feature.json` para ela.
- [x] T002 [P] Ajustar CSP do portal (`web/_headers`, `scripts/serve.mjs`, `PORTAL_CSP_HEADER` em `workers/api.mjs`) com `img-src https://lh3.googleusercontent.com`.

## Fase 2 - Início e rotas (US1)

- [x] T010 [US1] Barra superior com busca e menu do avatar; remover barra lateral, barra inferior, cartões do painel e assistente em `web/portal/index.html`.
- [x] T011 [US1] Rotas `#/...` e redirecionamento das antigas em `web/portal/portal.js` (`parseRoute`, `routeRedirectTarget`, `handleRouting`).
- [x] T012 [US1] Grade "Vitrines recentes" com status, busca, filtro Ativas/Arquivadas e ações de ciclo de vida no menu (`createLifecycleMenuItems` em `web/portal/site-lifecycle.js`).
- [x] T013 [US1] Diálogo único de nova vitrine e modelo Sob medida.

## Fase 3 - Vitrine (US2, US3, US4)

- [x] T020 [US2] Cabeçalho (nome, "Salvando... / Salvo", Personalizar, Visualizar, Publicar, menu) e abas em `web/portal/editor.js`.
- [x] T021 [US2] Lista única com categorias como seções; barra flutuante com importar planilha.
- [x] T022 [US2] Salvamento automático de 1,5 s com `flushAutosave` antes de sair, renomear por `PATCH`, medidores só acima de 80%.
- [x] T023 [US2] Publicar salva, publica e abre o diálogo com link e Copiar; só proprietário e `admin`.
- [x] T024 [US3] Aba Pedidos com Insights da vitrine aberta e Leilões (`web/portal/auctions-panel.js` sem seletor).
- [x] T025 [US4] Aba Configurações com seções recolhíveis, resumos e área de atuação em Atendimento.

## Fase 4 - Equipe por link (US5, = 018 US5)

- [x] T030 [P] [US5] Migração `supabase/migrations/20261126003000_site_team_invitations.sql` (`private.site_invitations`, funções de equipe e auditoria) + `test/database/site-team-invitations.test.mjs`.
- [x] T031 [US5] Rotas `GET /api/sites/:id/team`, `POST|DELETE /api/sites/:id/invitations`, `POST /api/invitations/lookup|accept`, página `/convite/:token`, loja em memória + `test/team-invitations.test.mjs`.
- [x] T032 [US5] `web/portal/team-panel.mjs` em Configurações > Acesso e `web/portal/invite-accept.mjs` na rota `#/convite` + `test/team-panel.test.mjs`.
- [x] T033 [P] `PATCH /api/sites/:id` e `publishedAt` na lista + `test/site-rename-and-published-at.test.mjs`.

## Fase 5 - Perfil e paletas (US6, US7)

- [x] T040 [P] [US6] `web/portal/br-locations.js`, listas do IBGE e `scripts/generate-ibge-municipios.mjs` no Perfil e no primeiro acesso + `test/br-locations.test.mjs`.
- [x] T041 [US6] Foto do Google no avatar e no Perfil, com filtro de host.
- [x] T042 [P] [US7] Paletas em `structure.theme.palette` (`web/assets/storefront-palettes.*`, `src/showcase-structure.mjs`, `src/publication-engine.mjs`, `web/vitrine/*`) + `test/storefront-palettes.test.mjs`.
- [x] T043 [US7] Seletor de paleta no painel Personalizar (`web/portal/palette-picker.*`).

## Fase 6 - QA e documentação

- [x] T050 Atualizar testes do portal que descreviam a barra lateral, o painel e o assistente (`portal-inicio-vitrines`, `portal-topo-perfil`, `portal-shell-wizard`, `admin-platform-ui`, `sponsor-impact`, `servicos-produtos-template`, `site-pause-archive`).
- [x] T051 Contraste de erros, alvos de 44 px no celular, textos sem emojis.
- [x] T052 Atualizar `CONTEXT.md` e `DESIGN.md`.
- [ ] T053 Conferência visual em 1440 px e 390 px, claro e escuro (`npm run preview`).
