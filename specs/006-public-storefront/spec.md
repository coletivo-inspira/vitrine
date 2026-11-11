# Feature Specification: Vitrine Pública Mobile-First (`006-public-storefront`)

**Feature Branch**: `006-public-storefront`

**Created**: 2026-11-11

**Status**: Active — template estático ultra-leve em `web/vitrine/` (`index.html`, `vitrine.css`, `vitrine.js`), roteamento público `/:slug` e `/loja1` em `workers/api.mjs`, `scripts/serve.mjs` e `scripts/build.mjs` implementados na Fase 4.

**Input**: Template web estático mobile-first em `/loja1` e `/:slug` (< 100 KB total de HTML/CSS/JS próprios, zero chamadas ao Supabase, zero rastreadores/anúncios/CDNs externas, 100% compatível com a CSP estrita de `dist/_headers`), seguindo `DESIGN.md` ("Laranja Pontual", WCAG AA, alvos >= 44px, tema claro/escuro sem FOUC, `prefers-reduced-motion: reduce`), exibindo itens visíveis agrupados por categoria com preço formatado em BRL a partir de `priceCents` e botão "Pedir no WhatsApp" gerando link `https://wa.me/...` exato via `whatsappLink()` de `src/public-menu.mjs`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consultar cardápio mobile-first agrupado por categoria e pedir no WhatsApp (`006-US1`) (Priority: P1)

Como cliente visitando a vitrine pública de uma pizzaria pelo celular ou computador (ex.: `/loja1`), quero visualizar os produtos visíveis organizados por categoria com nome, descrição, preço em reais (`R$`) formatado a partir de `priceCents` e botão "Pedir no WhatsApp" em cada item, para iniciar meu pedido diretamente no WhatsApp do estabelecimento com mensagem pré-preenchida.

**Why this priority**: É a entrega central de valor ao consumidor final do negócio local, convertendo a visita à vitrine em contato direto no WhatsApp sem intermediários nem taxas.

**Independent Test**: Acessar `/loja1` e `/data/vitrines/loja1/menu.json`, verificar renderização dos itens ativos por categoria com preços formatados (`4800` -> `R$ 48,00`) e links `https://wa.me/<whatsapp>?text=...` idênticos à saída de `whatsappLink(menu, item.id)`.

**Acceptance Scenarios**:

1. **Given** uma vitrine publicada em `/loja1` com cardápio projetado em `/data/vitrines/loja1/menu.json`, **When** o visitante abre `/loja1`, **Then** a página carrega o JSON público, agrupa os itens visíveis por categoria e exibe nome, descrição, preço formatado em BRL a partir de `priceCents` e o botão "Pedir no WhatsApp" com altura mínima de 44 px.
2. **Given** um item visível na vitrine pública, **When** o link do botão "Pedir no WhatsApp" é gerado para o item, **Then** a URL aponta exatamente para `https://wa.me/<whatsapp>?text=<encodeURIComponent("Olá! Tenho interesse em <item.name>. Pode confirmar preço e disponibilidade?")>`, utilizando `whatsappLink()` de `src/public-menu.mjs` e sem enviar mensagens automaticamente sem clique do visitante.
3. **Given** uma vitrine inexistente ou ainda não publicada (ex.: `/vitrine-inexistente`), **When** o visitante tenta acessá-la, **Then** recebe status `404 Not Found` claro e seguro sem consultar o banco administrativo Supabase.

---

### User Story 2 - Carregamento ultra-leve (< 100 KB), cache CDN e zero chamadas ao Supabase (`006-US2`) (Priority: P1)

Como visitante em rede móvel e operador da plataforma sob o regime de Custo Zero (ADR 0005), quero que a vitrine pública pese menos de 100 KB no total de HTML/CSS/JS próprios, seja servida com cabeçalhos de cache CDN (`stale-while-revalidate`) e CSP estrita, e jamais realize conexões ao Supabase ou CDNs externas.

**Why this priority**: Garante performance instantânea em redes móveis 3G/4G e protege a cota gratuita do Supabase e Cloudflare Workers.

**Independent Test**: Medir a soma em bytes de `web/vitrine/index.html`, `web/vitrine/vitrine.css` e `web/vitrine/vitrine.js` (< 102.400 bytes), inspecionar o código-fonte contra referências a `supabase` ou URLs externas e verificar os cabeçalhos HTTP de `/loja1` e `/data/vitrines/loja1/menu.json`.

**Acceptance Scenarios**:

1. **Given** os arquivos próprios do template em `web/vitrine/` (`index.html`, `vitrine.css`, `vitrine.js`), **When** seus tamanhos em bytes são somados no build, **Then** o peso total é estritamente inferior a 100 KB (`102400` bytes).
2. **Given** uma requisição `GET /loja1` ou `GET /:slug` para uma vitrine publicada, **When** o Worker ou servidor responde, **Then** inclui `Cache-Control: public, max-age=300, stale-while-revalidate=86400` e `Content-Security-Policy` estrita (`default-src 'self'`, `script-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`, `form-action 'none'`).
3. **Given** qualquer navegação na vitrine pública, **When** o cliente carrega a página e o cardápio, **Then** apenas recursos locais (`'self'`) são requisitados, com zero chamadas ao Supabase, zero scripts inline e zero rastreadores de terceiros.

---

### User Story 3 - Acessibilidade WCAG AA, tema claro/escuro sem FOUC e respeito a movimento reduzido (`006-US3`) (Priority: P2)

Como visitante utilizando tecnologias assistivas, modo escuro ou preferência de movimento reduzido, quero navegar pela vitrine pública com contraste WCAG AA (>= 4.5:1), alvos de toque >= 44 px, alternância de tema claro/escuro sem FOUC e respeito a `prefers-reduced-motion: reduce`.

**Why this priority**: Garante conformidade integral com `DESIGN.md` ("Laranja Pontual") e inclusão digital em dispositivos móveis e desktop.

**Independent Test**: Verificar inclusão de `theme.js` antes do CSS, tokens de cores claro/escuro da paleta "Laranja Pontual" (`#F7F7F4`, `#27322E`, `#C74414`, `#171E1A`, `#FFB18A`), `min-height: 44px` nos controles interativos e regra `@media (prefers-reduced-motion: reduce)` em `vitrine.css`.

**Acceptance Scenarios**:

1. **Given** um visitante abrindo `/loja1` com preferência do sistema em modo escuro ou escolha salva em `vitrine-theme`, **When** a página é renderizada, **Then** `theme.js` aplica `data-theme="dark"` antes da pintura inicial (sem FOUC) e o botão de alternância sol/lua permite trocar o tema com alvo >= 44 px.
2. **Given** um visitante com `prefers-reduced-motion: reduce` ativo, **When** interage com a vitrine pública, **Then** transições e animações suaves são desativadas.

---

### Edge Cases

- **Rotas reservadas do sistema**: Caminhos reservados (`/`, `/portal`, `/api`, `/assets`, `/data`, `/404.html`, `/admin`, `/auth`, `/app`, `/www`, `/login`, `/logout`) nunca são interceptados como `:slug` de vitrine pública.
- **Slug com barra final (`/loja1/`)**: O roteador aceita tanto `/loja1` quanto `/loja1/` e resolve determinísticamente o mesmo `slug` (`loja1`) e o artefato `/data/vitrines/loja1/menu.json`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O template da vitrine pública DEVE residir em `web/vitrine/` (`index.html`, `vitrine.css`, `vitrine.js`) e ser copiado para `dist/vitrine/` e `dist/loja1/index.html` durante `npm run build`.
- **FR-002**: A soma dos tamanhos de `web/vitrine/index.html`, `web/vitrine/vitrine.css` e `web/vitrine/vitrine.js` DEVE ser estritamente menor que 100 KB (`102400` bytes).
- **FR-003**: A vitrine pública NÃO DEVE conter chamadas ao Supabase, scripts inline, fontes remotas ou CDNs externas, respeitando integralmente a CSP de `dist/_headers`.
- **FR-004**: Cada item visível DEVE ser renderizado dentro de sua categoria com nome, descrição (quando presente), preço formatado em BRL a partir de `priceCents` e link "Pedir no WhatsApp" gerado por `whatsappLink()` de `src/public-menu.mjs` (importado de `/assets/public-menu.mjs`).
- **FR-005**: Requisições públicas para `/:slug` (quando a vitrine publicada existir e o slug não for reservado) DEVEM retornar o HTML da vitrine pública com `Cache-Control: public, max-age=300, stale-while-revalidate=86400` e CSP estrita.
- **FR-006**: A interface da vitrine pública DEVE seguir `DESIGN.md` ("Laranja Pontual"), com alvos de toque `>= 44px`, alternância de tema claro/escuro via `theme.js` sem FOUC e suporte a `@media (prefers-reduced-motion: reduce)`.

### Key Entities

- **Template de Vitrine Pública (`PublicStorefrontTemplate`)**: Conjunto estático `web/vitrine/{index.html,vitrine.css,vitrine.js}` que hidrata o cardápio a partir de `/data/vitrines/<slug>/menu.json`.
- **Rota Pública de Vitrine (`StorefrontRoute`)**: Mapeamento de `GET /:slug` para o template HTML da vitrine e `GET /data/vitrines/:slug/menu.json` para o JSON público projetado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Peso total de HTML + CSS + JS próprios de `web/vitrine/` < 100 KB (`102400` bytes).
- **SC-002**: 100% dos links de pedido gerados na vitrine pública correspondem exatamente a `whatsappLink(menu, item.id)` de `src/public-menu.mjs`.
- **SC-003**: 0 requisições ao Supabase e 0 violações da CSP estrita de `dist/_headers`.
- **SC-004**: `GET /loja1` e `GET /<slug-publicado>` respondem `200 OK` com `Cache-Control: public, max-age=300, stale-while-revalidate=86400`.
