# Implementation Plan: Vitrine Pública Mobile-First (`006-public-storefront`)

**Branch**: `006-public-storefront` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-public-storefront/spec.md`.

## Summary

Implementar a vitrine pública estática mobile-first em `web/vitrine/` (`index.html`, `vitrine.css`, `vitrine.js`), exportar `src/public-menu.mjs` como `/assets/public-menu.mjs` no build para reuso direto de `whatsappLink()` no navegador, pré-renderizar `/loja1` em `dist/loja1/index.html` e configurar o roteamento de `/:slug` e `/data/vitrines/:slug/menu.json` em `workers/api.mjs`, `scripts/serve.mjs` e `wrangler.jsonc` com cabeçalhos de cache CDN e CSP estrita.

## Technical Context

**Language/Version**: HTML5 semântico, CSS3 com tokens "Laranja Pontual", JavaScript ES Modules (Node.js `>=24.12.0 <25`).

**Primary Dependencies**: `src/public-menu.mjs` (`/assets/public-menu.mjs`) e `web/theme.js` (`/theme.js`). Zero bibliotecas externas ou frameworks JS.

**Storage**: Leitura exclusivamente estática via HTTP `GET /data/vitrines/<slug>/menu.json`.

**Testing**: `node --test` (`test/publication-and-storefront.test.mjs` e `test/marketing-build.test.mjs`).

**Target Platform**: Cloudflare Workers Free com Static Assets (`wrangler.jsonc`) e preview local (`scripts/serve.mjs`).

**Project Type**: Aplicação web estática mobile-first + roteamento de borda no Cloudflare Worker.

**Performance Goals**: Peso total de HTML + CSS + JS próprios < 25 KB (muito abaixo do teto de 100 KB); First Contentful Paint instantâneo com fontes locais e zero dependências externas.

**Constraints**: Custo zero (ADR 0005); zero consultas ao Supabase; compatibilidade 100% com CSP `script-src 'self'` (sem scripts inline); conformidade com `DESIGN.md`.

**Scale/Scope**: Suporte a `/loja1` estático na CDN e a qualquer `/:slug` publicado dinamicamente via motor de publicação.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Administração privada e publicação pública**: Atendido. A vitrine consome apenas `/data/vitrines/<slug>/menu.json` projetado por `publicMenu()`.
- **II. Isolamento entre vitrines**: Atendido. Cada rota `/:slug` carrega exclusivamente o JSON público correspondente ao seu próprio `slug`.
- **III. Credenciais apenas no servidor**: Atendido. Zero chaves, tokens ou endpoints administrativos do Supabase no bundle da vitrine.
- **IV. Custo e condições verificáveis**: Atendido. Cabeçalhos `Cache-Control: public, max-age=300, stale-while-revalidate=86400` para HTML e `immutable` para releases por hash.
- **V. Entregas verificáveis**: Atendido. Peso, CSP, cache, renderização de `/loja1` e links `wa.me` verificados em `test/publication-and-storefront.test.mjs`.

## Project Structure

### Documentation (this feature)

```text
specs/006-public-storefront/
├── spec.md                  # Especificação da feature (006-US1 a 006-US3)
├── plan.md                  # Plano técnico de implementação
├── data-model.md            # Modelo de visão e contrato de roteamento/cache
├── tasks.md                 # Lista de tarefas ordenadas por dependência
└── checklists/
    └── requirements.md      # Checklist de qualidade e requisitos
```

### Source Code (repository root)

```text
web/
├── _headers                 # Regras estáticas de CSP e Cache-Control para Cloudflare Assets
└── vitrine/
    ├── index.html           # Template HTML semântico da vitrine pública
    ├── vitrine.css          # Estilos mobile-first "Laranja Pontual" (WCAG AA, >=44px, dark mode)
    └── vitrine.js           # Hidratação de /data/vitrines/<slug>/menu.json e whatsappLink()

scripts/
├── build.mjs                # Copia src/public-menu.mjs -> dist/assets/public-menu.mjs e gera dist/loja1/
└── serve.mjs                # Preview local servindo /loja1 e /:slug com CSP e Cache-Control

workers/
└── api.mjs                  # Roteamento público de /:slug e /data/vitrines/:slug/* com Cache-Control e CSP
```

**Structure Decision**: Compartilhar `/assets/public-menu.mjs` diretamente entre servidor e navegador (tal como `/assets/portfolio.mjs` já é compartilhado para o site de divulgação), garantindo que o link "Pedir no WhatsApp" na vitrine pública execute exatamente a função `whatsappLink()` canônica.

## Complexity Tracking

Sem desvios da Constituição.
