# Modelo de Dados e Roteamento: Vitrine Pública Mobile-First (`006-public-storefront`)

**Feature**: `006-public-storefront`  
**Date**: 2026-11-11  
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## 1. Contrato de Consumo no Cliente (`web/vitrine/vitrine.js`)

1. **Resolução do `slug` da Vitrine**:
   - Extrai o primeiro segmento do `window.location.pathname` (ex.: `/loja1` ou `/loja1/` -> `slug = "loja1"`).
   - Caso aberto diretamente em `/vitrine/` para inspeção de template, permite fallback seguro para `loja1` (ou query `?slug=loja1` validada contra `^[a-z0-9]+(?:-[a-z0-9]+)*$`).
2. **Busca do Artefato Público**:
   - `GET /data/vitrines/${slug}/menu.json` (`Accept: application/json`).
   - Nenhuma requisição a `supabase.co`, `/rest/v1/*`, `/auth/v1/*` ou `/api/sites/*` é realizada.
3. **Renderização Segura (Zero `innerHTML` com dados não confiáveis)**:
   - Toda construção de DOM utiliza `document.createElement` e `textContent`.
   - Preço formatado determinísticamente a partir de `item.priceCents` inteiro positivo:
     `R$ ${(item.priceCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.
   - Link do botão "Pedir no WhatsApp":
     Calculado chamando `whatsappLink(menu, item.id)` de `/assets/public-menu.mjs`.

---

## 2. Contrato de Roteamento e Cabeçalhos HTTP

| Rota | Origem dos Dados | `Cache-Control` | `Content-Security-Policy` |
|---|---|---|---|
| `GET /loja1` (e `GET /:slug` publicado) | Template `dist/vitrine/index.html` (ou `dist/loja1/index.html`) | `public, max-age=300, stale-while-revalidate=86400` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` |
| `GET /data/vitrines/:slug/menu.json` | Publicação ativa no store do Worker ou asset estático em `dist/data/vitrines/:slug/menu.json` | `public, max-age=300, stale-while-revalidate=86400` | Mesma CSP estrita + `X-Content-Type-Options: nosniff` |
| `GET /data/vitrines/:slug/releases/:hash.json` | Artefato imutável versionado por hash SHA-256 | `public, max-age=31536000, immutable` | Mesma CSP estrita + `X-Content-Type-Options: nosniff` |

---

## 3. Orçamento de Peso (< 100 KB)

| Arquivo | Meta de Tamanho | Limite Máximo Combinado |
|---|---|---|
| `web/vitrine/index.html` | < 8 KB | |
| `web/vitrine/vitrine.css` | < 12 KB | **< 100 KB (`102.400` bytes)** |
| `web/vitrine/vitrine.js` | < 8 KB | |
