# Specification Quality & Security Checklist: Site de divulgação institucional

**Purpose**: Validar os requisitos de especificação, isolamento estático de `dist/`, política de Content Security Policy (`dist/_headers`), acessibilidade WCAG AA / `prefers-reduced-motion` e validação dry-run da Cloudflare para a feature `003-marketing-site`.  
**Created**: 2026-11-11  
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [tasks.md](../tasks.md)

## Specification Structure & User Stories (`003-US1` a `003-US4`)

- [x] CHK001 As User Stories canônicas `003-US1` (P1 — navegação responsiva, demonstração e FAQ), `003-US2` (P2 — tema claro/escuro sem FOUC), `003-US3` (P1 — isolamento de `dist/` e CSP em `dist/_headers`) e `003-US4` (P2 — respeito a `prefers-reduced-motion`) estão formalizadas com prioridades, testes independentes e cenários Given-When-Then.
- [x] CHK002 A página distingue claramente o modelo demonstrativo de pizzaria e as referências reais por área (`Alimentação`, `Arte & design`, `Fotografia & mídia`, `Saúde` e estado vazio honesto em `Tecnologia`) de funcionalidades ou templates ainda não operacionais (`FR-005`).

## Content Security Policy (`dist/_headers`)

- [x] CHK003 `dist/_headers` define `Content-Security-Policy` com `default-src 'self'` e `script-src 'self'`, proibindo `'unsafe-inline'`, `'unsafe-eval'` e origens externas de scripts.
- [x] CHK004 `dist/_headers` restringe `img-src 'self'`, `font-src 'self'` e `connect-src 'self'`, garantindo zero chamadas a CDNs externas, Google Fonts ou rastreadores de terceiros (`FR-006`, `FR-007`).
- [x] CHK005 `dist/_headers` inclui endurecimento contra clickjacking, injeção de base/objeto e submissão não autorizada: `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` e `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- [x] CHK006 A permissão `style-src 'self' 'unsafe-inline'` está documentada e circunscrita exclusivamente à necessidade técnica do script local oficial da Orb do Coletivo Inspira (`specs/003-marketing-site/plan.md`).

## Isolamento Estático do Pacote (`dist/`)

- [x] CHK007 `scripts/build.mjs` reconstrói `dist/` de forma limpa a partir de `web/` e das projeções `publishedPortfolio()` e `quoteContactLink()`, validando `SITE_BASE_PATH` e garantindo que o único diretório removido/recriado é `dist/`.
- [x] CHK008 `test/marketing-build.test.mjs` verifica automaticamente que nenhum arquivo de `node_modules/`, `supabase/`, `test/`, `scripts/`, `.env`, `.git` ou com extensão `.sql` é copiado para `dist/`.
- [x] CHK009 `test/marketing-build.test.mjs` comprova que todos os ativos locais (`src="./..."` e `href="./..."`) referenciados em `dist/index.html` existem como arquivos válidos dentro de `dist/` e que `dist/data/portfolio.json` não contém `internalNotes` nem `published`.

## Acessibilidade WCAG AA, Temas e `prefers-reduced-motion`

- [x] CHK010 O tema claro (`#F7F7F4` / `#27322E` / `#C74414`) e o tema escuro (`#171E1A` / `#F7F7F4` / `#FFB18A`) cumprem relação de contraste mínima de 4,5:1 para texto normal e 3:1 para títulos grandes, com aplicação síncrona via `web/theme.js` antes do CSS para eliminar FOUC (`003-US2`, `FR-008`).
- [x] CHK011 Os controles interativos principais possuem alvo de toque mínimo de 44×44 px, contorno de foco visível (`3px solid`) e operação completa por teclado (`Tab`, `Enter`, `Space`, `Escape` no menu móvel e `<details>`/`<summary>` no FAQ) (`003-US1`, `FR-002`).
- [x] CHK012 Com `prefers-reduced-motion: reduce` ativo, o autoplay de 5 s do carrossel do hero é desativado em `web/app.js`, o efeito de canvas `web/dot-trail.js` não é iniciado (assim como em dispositivos `pointer: coarse`), a abertura animada de 700 ms em `vitrine-animated.svg` permanece estática e `web/styles.css` remove transições e rolagem suave (`003-US4`, `FR-009`).

## Validação Dry-Run da Cloudflare e Governança de Deploy

- [x] CHK013 `wrangler.jsonc` configura exclusivamente `assets: { directory: "./dist", not_found_handling: "404-page" }` compatível com o plano Cloudflare Workers Free com Static Assets (ADR 0001 e ADR 0005).
- [x] CHK014 O pacote é validado localmente via `npx --yes wrangler@4.158.0 deploy --dry-run` sem exigir credenciais remotas e sem realizar ou alegar deploy remoto na Cloudflare (`FR-007`).

## Notes

- Evidências de QA visual, temas, logotipo e rastro de ponteiro encontram-se registradas em `docs/design/marketing-qa.md`, `docs/design/theme-qa.md`, `docs/design/vitrine-logo-qa.md` e `docs/design/dot-trail-qa.md`.
