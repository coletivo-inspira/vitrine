# Specification Quality & Requirements Checklist: Vitrine Pública (`006-public-storefront`)

**Purpose**: Auditar a completude, acessibilidade, performance e conformidade constitucional da especificação `006-public-storefront`.  
**Created**: 2026-11-11  
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [data-model.md](../data-model.md)

## Content & Governance Quality

- [x] CHK001 As User Stories (`006-US1` a `006-US3`) estão redigidas em português com prioridades P1/P2 e cenários Given-When-Then.
- [x] CHK002 O vocabulário segue `CONTEXT.md` e a direção visual segue `DESIGN.md` ("Laranja Pontual").

## Storefront Experience & WhatsApp Link (`006-US1` & `006-US3`)

- [x] CHK003 Itens visíveis são exibidos agrupados por categoria com nome, descrição, preço formatado a partir de `priceCents` e botão "Pedir no WhatsApp" (`FR-004`).
- [x] CHK004 O link do WhatsApp utiliza a lógica exata de `whatsappLink()` de `src/public-menu.mjs` (`FR-004`).
- [x] CHK005 Alvos interativos possuem altura mínima de `44px`, alternância claro/escuro sem FOUC via `theme.js` e suporte a `prefers-reduced-motion: reduce` (`FR-006`).

## Performance, Isolation & Cache/CSP (`006-US2`)

- [x] CHK006 A soma de `web/vitrine/index.html`, `web/vitrine/vitrine.css` e `web/vitrine/vitrine.js` é estritamente menor que 100 KB (`FR-002`).
- [x] CHK007 A vitrine pública realiza zero chamadas ao Supabase e zero requisições a CDNs externas, respeitando a CSP de `dist/_headers` (`FR-003`).
- [x] CHK008 Rotas públicas `/:slug` e `/data/vitrines/:slug/*` aplicam `Cache-Control` CDN (`stale-while-revalidate` e `immutable` para hashes) e CSP estrita (`FR-005`).
