# Auditoria de Design e Usabilidade — Portal, Divulgação, 404 e Vitrine Pública

**Data:** 2026-11-12  
**Escopo:** Auditoria visual, funcional e de acessibilidade de todas as superfícies em `web/portal/` (`index.html`, `portal.css`, `portal.js`, `editor.js`), `web/index.html` + `web/styles.css` (site de divulgação), `web/404.html` e `web/vitrine/` (`index.html`, `vitrine.css`, `vitrine.js`), validada com `npm run build` e `npm run preview` em desktop (`1440×900`) e celular (`390×844`), nos temas claro e escuro.  
**Referências normativas:** `DESIGN.md`, `docs/marketing-design.md`, `.specify/memory/constitution.md` e plano aprovado de repaginação do portal (`008-portal-redesign`).

---

## 1. Metodologia e Evidências de Captura

A build estática (`npm run build`) e o servidor de pré-visualização (`npm run preview` em `http://127.0.0.1:4173`) foram executados e inspecionados via Chromium headless em `1440px` (desktop) e `390px` (mobile), alternando `data-theme="light"` e `data-theme="dark"`.

As capturas de tela de referência foram geradas em `/opt/cursor/artifacts/portal-audit/`:
- **Portal — Login (`/portal/`):** `portal-auth-desktop-light.png`, `portal-auth-desktop-dark.png`, `portal-auth-mobile-light.png`, `portal-auth-mobile-dark.png`
- **Portal — Painel (`/portal/` autenticado/demo):** `portal-dashboard-desktop-light.png`, `portal-dashboard-desktop-dark.png`, `portal-dashboard-mobile-light.png`, `portal-dashboard-mobile-dark.png`
- **Portal — Editor (`/portal/` editor ativo):** `portal-editor-desktop-light.png`, `portal-editor-desktop-dark.png`, `portal-editor-mobile-light.png`, `portal-editor-mobile-dark.png`
- **Divulgação (`/`):** `marketing-home-desktop-light.png`, `marketing-home-desktop-dark.png`, `marketing-home-mobile-light.png`, `marketing-home-mobile-dark.png`
- **Erro 404 (`/404.html`):** `page-404-desktop-light.png`, `page-404-desktop-dark.png`, `page-404-mobile-light.png`, `page-404-mobile-dark.png`
- **Vitrine Pública (`/loja1`):** `storefront-loja1-desktop-light.png`, `storefront-loja1-desktop-dark.png`, `storefront-loja1-mobile-light.png`, `storefront-loja1-mobile-dark.png`

---

## 2. Resumo Executivo por Severidade

| ID | Superfície | Severidade | Achado Principal | PR Responsável pela Correção |
| --- | --- | --- | --- | --- |
| `AUD-001` | `web/portal/portal.css` | **Crítica (P0)** | Logos claro e escuro aparecem simultaneamente no cabeçalho do portal por conflito de especificidade CSS. | **PR (b)** Shell, painel, perfil, wizard e pedidos |
| `AUD-002` | `web/portal/` | **Alta (P1)** | Ausência de estrutura de aplicativo (app shell), visão geral, perfil, interesses e fluxo de pedidos de customização. | **PR (a)** Backend + **PR (b)** Shell e telas do portal |
| `AUD-003` | `web/portal/` + `src/` + `supabase/` | **Alta (P1)** | Criação de vitrine fixa em formulário simples sem escolha de área/tipo nem modelo (`pizzeria-v1` hardcoded). | **PR (a)** Backend + **PR (b)** Wizard em 3 passos |
| `AUD-004` | `web/portal/editor.js` + `web/vitrine/` | **Alta (P1)** | Catálogo engessado em pizzaria (`pizza-demo`) sem suporte a componentes configuráveis, agendamento, orçamento, fotos no Supabase Storage ou fluxo público em etapas. | **PR (a)** Backend + **PR (c)** Editor por componentes e fluxo público |
| `AUD-005` | `web/portal/index.html` + `portal.css` | **Alta (P1)** | Ações do editor espalhadas no topo, medidores soltos ocupando altura excessiva, ausência de importação/exportação em lote por planilha (CSV) e prévia empilhada no final da página no celular. | **PR (c)** Editor por componentes e fluxo público |
| `AUD-006` | `web/portal/portal.css` | **Média (P2)** | Superfícies chapadas sem tokens Liquid Glass, botão de login com azul Google (`#4285F4`) fora da paleta e banners de erro/sucesso/conflito com cores Bootstrap que quebram o modo escuro. | **PR (b)** Shell, painel, perfil, wizard e pedidos |
| `AUD-007` | `web/portal/editor.js` + `portal.css` | **Média (P2)** | Problemas de acessibilidade no editor: inputs dinâmicos de categoria/item sem `<label>`/`aria-label`, alvos de toque `< 44px` (`min-height: 40px`) e prévia `.pizza-demo` com cores fixas claras no modo escuro. | **PR (c)** Editor por componentes e fluxo público |
| `AUD-008` | `web/404.html` | **Média (P2)** | Página 404 usa ativo legado (`plus.svg` em vez da marca oficial `vitrine.svg`), não carrega `theme.js` (quebra o tema escuro salvo pelo usuário) e não oferece botão em pílula/primário claro. | **PR (b)** Shell/telas ou **PR (d)** QA e refinamento |
| `AUD-009` | `web/vitrine/vitrine.css` | **Média (P2)** | Vitrine pública usa clique individual por item sem carrinho/etapas, `brand-logo` no rodapé sem regra de ocultação sem escopo `.brand` e `theme-color` fixo no HTML estático. | **PR (c)** Editor por componentes e fluxo público |
| `AUD-010` | `web/index.html` + `web/styles.css` | **Baixa (P3)** | No site de divulgação, `.brand img { width: 32px; height: 32px }` no `@media (max-width: 800px)` depende da ordem de cascata, e falta atalho direto para o portal administrativo quando disponível. | **PR (d)** QA visual, acessibilidade e regressão |

---

## 3. Auditoria Detalhada por Tela

### 3.1. Portal Administrativo — Cabeçalho, Login e Shell (`web/portal/index.html`, `web/portal/portal.css`, `web/portal/portal.js`)

#### `AUD-001` — [Crítica / P0] Logos claro e escuro visíveis ao mesmo tempo no cabeçalho do portal
- **Evidência no código:** Em `web/portal/portal.css`, a regra `.brand .brand-logo { display: block; width: 188px; height: 58px; }` (linhas 166–171) tem especificidade `(0, 2, 0)`. Logo abaixo, `.theme-sun, .brand-logo-dark { display: none; }` (linhas 198–200) tem especificidade `(0, 1, 0)`. Como `(0, 2, 0) > (0, 1, 0)`, no tema claro `.brand-logo-dark` permanece com `display: block` e renderiza ao lado de `.brand-logo-light` (com texto branco invisível no fundo claro, deixando a segunda caixa verde-lima com "V" aparente à direita).
- **Evidência visual:** Confirmado em `portal-auth-desktop-light.png`, `portal-dashboard-desktop-light.png`, `portal-editor-desktop-light.png` e equivalentes mobile.
- **Correção planejada:** Qualificar os seletores de alternância de tema como `.brand .brand-logo-dark { display: none; }`, `[data-theme="dark"] .brand .brand-logo-light { display: none; }` e `[data-theme="dark"] .brand .brand-logo-dark { display: block; }` (igual ao padrão de `web/styles.css`).
- **PR responsável:** **PR (b)** (`portal shell/dashboard/profile/wizard/requests`).

#### `AUD-002` — [Alta / P1] Falta de estrutura de aplicativo (App Shell), painel inicial, perfil, interesses e pedidos de customização
- **Evidência no código:** `web/portal/index.html` possui apenas três `<section>` monolíticas (`#auth-section`, `#dashboard-section`, `#editor-section`) empilhadas sem navegação persistente. Não existem rotas, abas nem telas para visão geral do negócio, edição de perfil (`profiles`), seleção de interesses (`profile_interests`) ou solicitação de customização (`customization_requests`).
- **Impacto de usabilidade:** O usuário autenticado cai em uma lista simples de vitrines sem contexto de completude do perfil, sem status consolidado de publicação e sem caminho no produto para pedir um projeto sob medida ou modelo sob customização.
- **Correção planejada:**
  1. Criar migração `supabase/migrations/202611120002_portal_profiles.sql` (após `202611120001_public_publications.sql`) e rotas `GET/PUT /api/profile` e `GET/POST /api/customization-requests` em `workers/api.mjs`.
  2. Implementar App Shell com barra lateral em Liquid Glass no desktop (`>= 900px`) e barra inferior fixa com ícones e alvos de `>= 44px` no celular, navegando entre **Início (Painel)**, **Minhas vitrines**, **Perfil e interesses** e **Pedidos de customização**.
- **PR responsável:** **PR (a)** (dados e rotas no Worker) e **PR (b)** (shell, painel inicial, perfil/interesses e pedidos).

#### `AUD-003` — [Alta / P1] Criação de vitrine sem escolha de área de atuação nem modelo de vitrine
- **Evidência no código:** O formulário `#create-site-form` em `web/portal/index.html` (linhas 75–89) pergunta apenas nome e slug, e `web/portal/portal.js` (linha 647) envia `template: 'pizzeria-v1'` fixo. Além disso, `slug-preview` inicia com `vitrine.inspira.dev.br/loja` enquanto o placeholder do input diz `pizzaria-bella`.
- **Impacto de usabilidade:** Negócios de Saúde, Arte & design, Fotografia & mídia ou Tecnologia não conseguem classificar sua vitrine nem descobrir modelos além de cardápio ou abrir um pedido de customização contextualizado.
- **Correção planejada:**
  1. Estender `sites` com `storefront_type` e atualizar `POST /api/sites` e `src/portal-validation.mjs` para aceitar `storefrontType` e novos modelos/catálogos.
  2. Substituir o formulário lateral por um **Assistente de Nova Vitrine em 3 passos**:
     - Passo 1 — Tipo/Área: Alimentação, Arte & design, Fotografia & mídia, Saúde ou Tecnologia;
     - Passo 2 — Modelo/Catálogo: Produtos/Cardápio, Agendamento de serviços e Lista de interesse/Orçamento disponíveis, e demais modelos marcados como "Sob customização" (abrindo o formulário de pedido já preenchido);
     - Passo 3 — Nome do negócio e endereço (`slug`) com sugestão automática a partir do nome.
- **PR responsável:** **PR (a)** (schema e validação backend) e **PR (b)** (assistente de 3 passos no portal).

#### `AUD-006` — [Média / P2] Estética chapada no portal, botão Google azul fora da paleta e banners com cores inacessíveis no escuro
- **Evidência no código:**
  - `web/portal/portal.css` usa `.button-google { background: #4285F4; }` (linha 261), introduzindo azul saturado estranho à paleta floresta/grafite + pêssego/laranja.
  - `.feedback-banner.success` (`#d4edda` / `#155724`), `.feedback-banner.error` (`#f8d7da` / `#721c24`) e `.conflict-banner` (`#fff3cd` / `#856404`) usam cores pastéis claras fixas mesmo em `data-theme="dark"`, gerando clarões no modo escuro.
  - Quando o usuário entra no Modo Local, tanto `#global-feedback` ("Entrou no Modo Local...") quanto `#demo-mode-badge` ("Modo Local de Demonstração (Offline)") aparecem empilhados com a mesma mensagem.
  - Raios atuais são `12px` e `7px`, sem superfícies translúcidas (`backdrop-filter: blur(20px) saturate(140%)`), sem raios de `20–28px` e sem botões em pílula (`999px`).
- **Correção planejada:** Aplicar o sistema visual **Portal Liquid Glass** documentado na nova seção `Portal` do `DESIGN.md` (superfícies translúcidas com fallback sólido em `@supports not (backdrop-filter)` e `@media (prefers-reduced-transparency: reduce)`, paleta monocromática floresta/grafite com único acento laranja/pêssego, raios de `20–28px` e botões em pílula). Unificar o indicador de modo offline na barra superior do shell.
- **PR responsável:** **PR (b)** (`portal shell/dashboard/profile/wizard/requests`).

---

### 3.2. Portal Administrativo — Editor de Catálogo (`web/portal/index.html`, `web/portal/editor.js`, `web/portal/portal.css`)

#### `AUD-004` — [Alta / P1] Editor e modelo de dados presos ao layout de pizzaria (`pizzeria-v1`)
- **Evidência no código:** `web/portal/editor.js` constrói itens apenas com `name`, `priceCents` (> 0 obrigatório) e `description`, e renderiza a prévia com classes `.pizza-demo`, `.pizza-header`, `.pizza-item-row` e subtítulo fixo `MODELO CARDÁPIO` / `'Sua Pizzaria'` (linhas 486–491).
- **Impacto de usabilidade:** Impede criar vitrines de agendamento de serviços (com duração, data e horários), catálogos de orçamento/lista de interesse (com preço opcional), itens com foto ou quantidade mínima, campos do pedido customizados e template de mensagem de WhatsApp com variáveis (`{itens}`, `{total}`, `{data}`, `{horario}`, `{endereco}`, `{nome}`).
- **Correção planejada:**
  1. No backend (**PR (a)**), suportar `catalogType` (`products`, `booking`, `quote`), `components`, `orderFields` e `messages` no JSON de `drafts.content`, mantendo compatibilidade e migração transparente de rascunhos `pizzeria-v1`, além de configurar o bucket `catalog-images` no Supabase Storage e `img-src` na CSP.
  2. No frontend (**PR (c)**), construir o editor de catálogo por componentes com upload de imagem convertido no cliente para WebP (`<= 200 KB`) e compartilhar o módulo renderizador em etapas entre a prévia ao vivo do editor e a vitrine pública.
- **PR responsável:** **PR (a)** (validação, migração e CSP/Storage) e **PR (c)** (editor por componentes e renderizador compartilhado).

#### `AUD-005` — [Alta / P1] Ações do editor espalhadas, medidores ocupando metade da dobra, sem importação/exportação por planilha e prévia inacessível durante edição no celular
- **Evidência no código e capturas (`portal-editor-desktop-light.png`, `portal-editor-mobile-dark.png`):**
  - No topo do editor, `← Voltar`, título, `Revisão: 1`, `Salvar Rascunho` e `Publicar Vitrine` ficam em `.editor-header-bar` que rola para fora da tela assim que o usuário edita categorias.
  - Abaixo do cabeçalho, a faixa `#publication-status-bar`, o `#conflict-banner` e os 3 cards de medidores (`.editor-stats-container`: Itens Ativos, Total de Itens, Tamanho do Rascunho) consomem mais de `420px` verticais no celular antes do primeiro campo do formulário.
  - Configurações, Categorias e Itens ficam misturados em uma única coluna longa, e no celular (`<= 1100px`) a prévia ao vivo fica empilhada no final da página, obrigando rolagem extensa para conferir cada mudança.
  - O cadastro de itens é exclusivamente manual um a um, sem opção de baixar modelo de planilha (`.csv`), importar cardápio/serviços em lote ou exportar o rascunho atual para edição em planilha.
- **Correção planejada:**
  1. Criar **barra de ações fixa em Liquid Glass** contendo voltar, status/revisão, medidores compactos, Salvar, Publicar e link para abrir vitrine.
  2. Organizar o editor em **abas claras** (`Configurações`, `Categorias`, `Itens` e `Pedido & Mensagem`) com prévia lado a lado no desktop e alternância em aba (`Editar` / `Prévia ao vivo`) no celular.
  3. Adicionar **importação e exportação de cardápio por planilha CSV** no editor (`modelo-produtos.csv` e `modelo-servicos.csv` com UTF-8 BOM, separador `;` e decimais com vírgula; parser próprio no navegador sem dependências novas; prévia de importação com erros por linha e coluna; escolha entre adicionar/atualizar por `categoria + nome` ou substituir cardápio; operação restrita ao rascunho respeitando os limites do Worker).
- **PR responsável:** **PR (c)** (`component editor + public staged flow`).

#### `AUD-007` — [Média / P2] Acessibilidade e contraste no editor (inputs sem rótulo acessível, alvos de 40px, prévia sem suporte a tema)
- **Evidência no código:**
  - Em `web/portal/editor.js` (linhas 215–220 e 300–334), os campos `.category-title-input` e `.item-input` (nome, preço e descrição) são criados via DOM apenas com `placeholder`, sem `<label>` associado nem `aria-label`. Leitores de tela anunciam apenas "caixa de texto de edição" sem contexto de qual item ou categoria está sendo editado.
  - `.category-title-input` e `.item-input` têm `min-height: 40px` (`web/portal/portal.css`, linhas 689 e 741), abaixo do mínimo de `44px` definido nas diretrizes do projeto.
  - A exclusão de categoria (`deleteCategory`) e de item (`removeItem`) acontece imediatamente no clique sem confirmação nem opção de desfazer.
  - O container `.pizza-demo` usa fundo `#fbf6ee` e texto `#3f231a` hardcoded, destoando da identidade da Vitrine Inspira.
- **Correção planejada:** Associar `<label>` ou `aria-label` descritivo em todos os controles gerados dinamicamente, elevar a altura mínima de inputs e botões de ação para `>= 44px`, exigir confirmação acessível antes de excluir categoria com itens e usar os tokens oficiais da Vitrine no renderizador compartilhado da prévia.
- **PR responsável:** **PR (c)** (`component editor + public staged flow`).

---

### 3.3. Vitrine Pública (`web/vitrine/index.html`, `web/vitrine/vitrine.css`, `web/vitrine/vitrine.js`)

#### `AUD-009` — [Média / P2] Fluxo público sem etapas de pedido e ajustes de acabamento na vitrine pública
- **Evidência no código e capturas (`storefront-loja1-desktop-light.png`, `storefront-loja1-mobile-dark.png`):**
  - Atualmente cada card de produto tem apenas um link individual `Pedir no WhatsApp` para um único item (`whatsappLink(menu, item.id)`), sem permitir escolher múltiplos produtos/quantidades, selecionar dia/horário (para serviços) ou informar nome/endereço/observação antes de abrir o WhatsApp.
  - Em `web/vitrine/index.html` (linha 20), a tag do topo é estática (`Cardápio Digital`) e o subtítulo (linhas 36–38) instrui apenas o fluxo antigo.
  - Em `web/vitrine/vitrine.js`, quando o carregamento falha ou a vitrine não existe, `#storefront-slug-pill` permanece exibindo `/loja1` hardcoded em vez do slug requisitado.
- **Correção planejada:** Implementar o **fluxo público em etapas** (1. Escolher itens/serviços → 2. Preencher dados do pedido configurados pelo dono → 3. Revisar resumo e confirmar envio para `wa.me` com template de mensagem interpolado), compartilhando o mesmo módulo de renderização com a prévia do editor e migrando vitrines `pizzeria-v1` sem perda de dados. Atualizar `#storefront-slug-pill` imediatamente a partir de `resolveStorefrontSlug()`.
- **PR responsável:** **PR (c)** (`component editor + public staged flow`).

---

### 3.4. Página 404 (`web/404.html`)

#### `AUD-008` — [Média / P2] Página 404 sem suporte ao tema escuro salvo e com marca legada `plus.svg`
- **Evidência no código e capturas (`page-404-desktop-dark.png`, `page-404-mobile-light.png`):**
  - `web/404.html` não inclui `<script src="__SITE_BASE__theme.js"></script>` nem o botão `.theme-toggle`. Como consequência, um usuário navegando em modo escuro recebe um flash claro (`#F7F7F4`) ao cair em uma URL inexistente.
  - O cabeçalho de `web/404.html` usa `assets/brand/plus.svg` com texto "Vitrine Inspira" ao lado e favicon `plus.svg`, divergindo da assinatura oficial aprovada (`vitrine-icon.svg` no favicon e `vitrine.svg` / `vitrine-inverse.svg` no cabeçalho).
  - Não há `<a class="skip-link">` nem preload das fontes locais `syne.ttf` e `dm-sans.ttf`.
- **Correção planejada:** Atualizar `web/404.html` (mantendo a superfície sólida sem vidro da divulgação) para carregar `theme.js`, usar `vitrine-icon.svg` e o par `.brand-logo-light` / `.brand-logo-dark`, incluir `skip-link` e oferecer navegação clara para a página inicial.
- **PR responsável:** **PR (b)** ou **PR (d)** (conforme alocação na `tasks.md`: **PR (b)** atualiza `web/404.html` junto às melhorias de telas web e **PR (d)** valida nos testes visuais).

---

### 3.5. Site de Divulgação (`web/index.html`, `web/styles.css`, `web/app.js`, `web/categories.js`)

#### `AUD-010` — [Baixa / P3] Preservação da Direção A ("no glass") e pequenos pontos de atenção em `web/index.html` / `web/styles.css`
- **Evidência no código e capturas (`marketing-home-desktop-light.png`, `marketing-home-mobile-dark.png`):**
  - A página de divulgação cumpre fielmente a direção aprovada **A — Laranja pontual** (`DESIGN.md` e `docs/marketing-design.md`): superfícies sólidas (`#F7F7F4` no claro, `#171E1A`/`#202A23` no escuro), sem blur/vidro, tipografia Syne + DM Sans, pilha interativa de vitrines reais com pausa/avanço e seletores de área com V bicolor.
  - Em `web/styles.css` (linha 11), dentro de `@media (max-width: 800px)`, existe uma regra legada `.brand img { width: 32px; height: 32px }` que só não achata a logo porque `.brand .brand-logo { width: 188px; height: 58px }` aparece depois na linha 39 com maior especificidade.
  - No celular (`390px`), a Orb fixa no canto inferior esquerdo fica próxima à nota `.showcase-note` durante a rolagem, embora `.showcase-note { margin-left: 72px }` no `@media (max-width: 520px)` mitigue a sobreposição.
- **Diretriz arquitetural confirmada:** O site de divulgação (`web/index.html` e `web/styles.css`) **mantém estritamente a direção A sem efeito de vidro ("no glass")**. O sistema Liquid Glass aplica-se exclusivamente ao portal administrativo (`web/portal/`).
- **PR responsável:** **PR (d)** (verificação de não-regressão do site de divulgação).

---

## 4. Mapa de Propriedade de Correções por PR Sequencial

Para respeitar o isolamento de arquivos e a sequência de entrega definida no plano:

1. **PR (a) — Backend (`supabase/`, `src/`, `workers/`, `test/` de contrato/schema):**
   - Resolve a base de dados e API de `AUD-002`, `AUD-003` e `AUD-004` (`202611120002_portal_profiles.sql` sobre o modelo de publicações persistidas em `publications` / `publication_releases`, rotas `/api/profile`, `/api/customization-requests`, `POST /api/sites` com `storefrontType` e `template`, validação de catálogo por componentes, migração de rascunhos `pizzeria-v1` e CSP `img-src` para o Supabase Storage).
2. **PR (b) — Portal Shell, Painel, Perfil, Assistente e Pedidos (`web/portal/index.html`, `web/portal/portal.css`, `web/portal/portal.js`, `web/404.html`):**
   - Resolve integralmente `AUD-001` (logo duplicada), `AUD-002` (shell Liquid Glass desktop/mobile, painel inicial, perfil + interesses), `AUD-003` (assistente de nova vitrine em 3 passos + tela de pedidos de customização com link opcional para WhatsApp), `AUD-006` (tokens Liquid Glass, fallbacks `@supports` e `prefers-reduced-transparency`, botões em pílula, remoção do azul Google e banners compatíveis com tema escuro) e `AUD-008` (`web/404.html`).
3. **PR (c) — Editor por Componentes, Planilha CSV e Fluxo Público em Etapas (`web/portal/editor.js`, `web/portal/csv-catalog.js`, `web/portal/modelo-produtos.csv`, `web/portal/modelo-servicos.csv`, `web/portal/index.html`, `web/portal/portal.css`, `web/vitrine/`, `src/storefront-renderer.mjs`, `src/publication-engine.mjs`):**
   - Resolve integralmente `AUD-004` (catálogo por componentes: produtos, agendamento, orçamento; componentes de item; campos do pedido; textos e template de mensagem WhatsApp; upload WebP no Supabase Storage), `AUD-005` (barra de ações de vidro fixa, abas do editor, importação/exportação CSV e prévia responsiva), `AUD-007` (acessibilidade e alvos de 44px no editor) e `AUD-009` (fluxo público em etapas compartilhando o renderizador com a prévia do editor e migrando vitrines `pizzeria-v1` sobre as tabelas `publications` e `publication_releases` e roteamento dinâmico `/<slug>` no Worker).
4. **PR (e) — Métricas Agregadas sem Dados Pessoais e Painel de Insights (`supabase/migrations/202611120003_site_metrics_daily.sql`, `src/portal-validation.mjs`, `workers/api.mjs`, `web/vitrine/`, `web/portal/`):**
   - Entrega a coleta pública em lote (`POST /api/events` via `navigator.sendBeacon` validando contra a publicação ativa em `publications`), contadores diários/horários agregados em `site_metrics_daily` via função `security definer` com retenção de 13 meses, aviso de privacidade no rodapé da vitrine pública, rota `GET /api/sites/:id/insights?period=7d|30d|90d` para membros da vitrine, aba **Insights** no portal (cards de resumo, rankings, gráficos em SVG/CSS próprios e frases automáticas de variação semanal) e card de destaque da semana no painel inicial.
5. **PR (d) — QA Visual, Acessibilidade e Regressão (`test/`, validação `wrangler deploy --dry-run` e evidências desktop/mobile claro/escuro):**
   - Verifica todas as correções de `AUD-001` a `AUD-010`, garante zero regressão em `AUD-010` (marketing sem vidro), valida contraste WCAG AA, navegação por teclado, fallbacks de transparência/movimento reduzido e suíte completa `npm test`.
