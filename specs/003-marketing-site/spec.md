# Feature Specification: Site de divulgação institucional

**Feature Branch**: `003-marketing-site`

**Created**: 2026-11-07

**Status**: Implementado localmente em `web/` e validado via build estático (`dist/`) e Wrangler dry-run; deploy remoto na Cloudflare pendente de configuração de credenciais e DNS (`vitrine.inspira.dev.br`).

**Input**: Página pública institucional da Vitrine Inspira seguindo a Direção A ("Laranja Pontual") do brandbook do Coletivo Inspira, com demonstração identificada de cardápio de pizzaria, exemplos reais por área, comparação transparente da oferta em preparação, alternância de tema claro/escuro sem FOUC, respeito integral a `prefers-reduced-motion`, isolamento estático do pacote `dist/` e cabeçalhos de segurança CSP restritivos.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navegar pela apresentação institucional, exemplos e demonstração em qualquer tela (`003-US1`) (Priority: P1)

Como visitante em celular ou computador, quero navegar por uma página institucional rápida, fluida, sem rolagem lateral indevida e com controles acessíveis por toque e teclado, para compreender como a Vitrine Inspira funciona, interagir com a demonstração identificada de cardápio, explorar referências reais por área e consultar as perguntas frequentes.

**Why this priority**: É a missão principal do site de divulgação (`vitrine.inspira.dev.br`): apresentar a proposta de valor com clareza visual e acessibilidade sem confundir demonstrações ilustrativas com um portal ou checkout já ativo.

**Independent Test**: Renderizar `dist/index.html` em viewports de 390 px (mobile) e 1440 px (desktop), verificar ausência de barra de rolagem horizontal, alvos de toque mínimos de 44 px nos controles principais, funcionamento do menu móvel e do FAQ via teclado (`Enter`, `Space`, `Escape`), filtro de áreas por botões `aria-pressed` e identificação explícita da prévia de pizzaria como demonstração.

**Acceptance Scenarios**:

1. **Given** um visitante acessando a página em um viewport móvel de 390 px ou desktop de 1440 px, **When** rola pelas seções de abertura, funcionamento, possibilidades, oferta, FAQ e rodapé, **Then** o layout se adapta sem gerar overflow horizontal (`scrollWidth <= clientWidth`) e mantém os controles interativos primários (menu, seletor de tema, botões de ação e controles do carrossel) com área mínima de toque de 44×44 px.
2. **Given** um visitante inspecionando a prévia de cardápio de pizzaria e a galeria de possibilidades por área (`Alimentação`, `Arte & design`, `Fotografia & mídia`, `Saúde` e `Tecnologia`), **When** interage com os seletores de área ou observa o cardápio demonstrativo, **Then** visualiza a imagem local em WebP, descrição, preço em reais e ação ilustrativa explicitamente identificada como demonstração, enquanto a área `Tecnologia` exibe estado vazio honesto sem exemplos fictícios inventados.
3. **Given** um visitante navegando exclusivamente por teclado ou leitor de tela, **When** utiliza `Tab`, `Enter`, `Space` e `Escape` no menu de navegação móvel, nos seletores de área e nos itens de perguntas frequentes (`<details>` / `<summary>`), **Then** o foco permanece visível (contorno de 3 px em `#C74414`), o menu fecha ao pressionar `Escape` devolvendo o foco ao botão acionador e cada item do FAQ expande ou recolhe seu conteúdo de forma semântica.

---

### User Story 2 - Alternar entre tema claro e escuro sem FOUC (`003-US2`) (Priority: P2)

Como visitante, quero que a página respeite automaticamente a preferência de esquema de cores do meu sistema operacional na primeira visita e permita alternar manualmente entre os temas claro e escuro no cabeçalho sem piscar de tela (*Flash of Unstyled Content* — FOUC), para ler o conteúdo com conforto visual em qualquer ambiente.

**Why this priority**: Atende ao requisito visual aprovado em `DESIGN.md` e `docs/marketing-design.md`, garantindo contraste WCAG AA tanto na paleta neutra clara (`#F7F7F4` / `#27322E`) quanto na paleta escura (`#171E1A` / `#F7F7F4`).

**Independent Test**: Carregar a página com `prefers-color-scheme: dark` e `light`, acionar o botão `#theme-toggle` no cabeçalho e recarregar a página, verificando que `web/theme.js` define `document.documentElement.dataset.theme` sincronamente antes da renderização, persiste a escolha em `localStorage['vitrine-theme']` (tolerando bloqueio de storage) e alterna os SVGs do logotipo para suas variantes inversas.

**Acceptance Scenarios**:

1. **Given** um visitante abrindo a página pela primeira vez com preferência do sistema em modo escuro (`prefers-color-scheme: dark`) ou com escolha prévia salva em `localStorage['vitrine-theme']`, **When** o documento HTML inicia o carregamento, **Then** o script síncrono `theme.js` no `<head>` aplica imediatamente `data-theme="dark"` (ou `"light"`) no elemento `<html>` antes do primeiro paint, evitando FOUC.
2. **Given** a página renderizada em qualquer viewport, **When** o visitante ativa o botão de alternância sol/lua no cabeçalho (`#theme-toggle`), **Then** o atributo `data-theme` alterna entre `"light"` e `"dark"`, `aria-pressed` e os rótulos acessíveis são atualizados, a preferência é salva em `localStorage` (sem falhar caso o navegador bloqueie o armazenamento) e o logotipo no cabeçalho e rodapé troca para os ativos inversos (`vitrine-animated-inverse.svg` e `vitrine-inverse.svg`) preservando a caixa verde-lima (`#BAFF29`) e o V verde-floresta (`#133824`).

---

### User Story 3 - Garantir empacotamento estático isolado e cabeçalhos de segurança CSP (`003-US3`) (Priority: P1)

Como engenheiro de segurança da plataforma, quero que o build do site de divulgação produza em `dist/` exclusivamente ativos públicos validados e um arquivo `dist/_headers` com Content Security Policy (CSP) restritiva, para impedir a exposição acidental de migrações SQL, testes, scripts de build ou variáveis de ambiente e bloquear execução de scripts inline ou de terceiros.

**Why this priority**: Cumpre os Princípios I, III e V da Constituição em uma superfície pública exposta diretamente na borda (Cloudflare Workers Static Assets).

**Independent Test**: Executar `npm run build` e `node --test test/marketing-build.test.mjs`, verificando que nenhum arquivo `.sql`, `.env`, `supabase/`, `test/`, `scripts/` ou `node_modules/` existe em `dist/`, que todos os caminhos locais referenciados em `dist/index.html` resolvem para arquivos existentes e que `dist/_headers` aplica `script-src 'self'` sem `unsafe-inline` nem `unsafe-eval`.

**Acceptance Scenarios**:

1. **Given** o repositório contendo código de backend (`supabase/migrations/*.sql`), testes (`test/`), scripts (`scripts/`) e configurações locais, **When** `npm run build` (`scripts/build.mjs`) gera o diretório `dist/`, **Then** `dist/` contém apenas os ativos públicos de `web/`, `dist/assets/portfolio.mjs` e as projeções sanitizadas `dist/data/portfolio.json` e `dist/data/contact.json`, sem qualquer arquivo `.sql`, `.env`, `supabase/`, `test/`, `scripts/` ou segredo.
2. **Given** o pacote estático gerado em `dist/`, **When** o arquivo `dist/_headers` é inspecionado, **Then** define `Content-Security-Policy` com `default-src 'self'`, `script-src 'self'` (sem `'unsafe-inline'` ou `'unsafe-eval'`), `style-src 'self' 'unsafe-inline'` (restrito à injeção de estilo da Orb oficial), `img-src 'self'`, `font-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'` e `form-action 'none'`, além de `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` e `X-Frame-Options: DENY`.
3. **Given** o build executado com `SITE_BASE_PATH=/vitrine/` (para prévia em subcaminho) ou com o padrão `/` (para raiz Cloudflare), **When** `dist/404.html` é gerado, **Then** todas as ocorrências de `__SITE_BASE__` são substituídas pelo caminho base validado e `npx --yes wrangler@4.158.0 deploy --dry-run` valida o empacotamento Cloudflare Workers Static Assets sem erros e sem realizar deploy remoto.

---

### User Story 4 - Respeitar preferência de movimento reduzido (`prefers-reduced-motion`) (`003-US4`) (Priority: P2)

Como visitante com sensibilidade vestibular ou com a preferência `prefers-reduced-motion: reduce` ativada no sistema operacional, quero que animações contínuas, o avanço automático do carrossel de vitrines no hero, a abertura animada da logo e o rastro de ponteiro em canvas (`dot-trail.js`) sejam automaticamente desativados, para navegar pela página sem desconforto visual e sem perda de funcionalidade.

**Why this priority**: Garante acessibilidade inclusiva e conformidade com as diretrizes do brandbook e WCAG AA documentadas em `DESIGN.md` e `docs/design/dot-trail-qa.md`.

**Independent Test**: Emular `prefers-reduced-motion: reduce` e verificar que `web/dot-trail.js` não cria nem renderiza o elemento `<canvas class="dot-trail-canvas">`, que o carrossel do hero em `web/app.js` inicia sem autoplay (mantendo o botão manual "Próxima vitrine" operante), que `web/styles.css` desativa transições/scroll suave e que `vitrine-animated.svg` mantém as lâminas estáticas.

**Acceptance Scenarios**:

1. **Given** um visitante com `prefers-reduced-motion: reduce` ativo no navegador ou utilizando dispositivo de toque/caneta (`pointer: coarse`), **When** carrega a página e move o ponteiro ou toca na tela, **Then** `web/dot-trail.js` interrompe a inicialização do efeito ou limpa imediatamente o canvas, não executando loops de `requestAnimationFrame` nem desenhando trilhas na tela.
2. **Given** um visitante com `prefers-reduced-motion: reduce` ativo, **When** visualiza a pilha de quatro vitrines no hero (`Pastus`, `Nathália Verri`, `Dani Braga` e `Nexa`), **Then** o carrossel não inicia rotação automática de 5 segundos, o controle de pausa indica autoplay inativo e o visitante continua podendo alternar manualmente entre as vitrines pelo botão "Próxima vitrine" ou teclado.
3. **Given** um visitante com `prefers-reduced-motion: reduce` ativo, **When** a página aplica as regras de `web/styles.css` e renderiza os SVGs `vitrine-animated.svg` / `vitrine-animated-inverse.svg`, **Then** `scroll-behavior` permanece `auto`, transições e deslocamentos de hover são desativados e a marca do cabeçalho é exibida diretamente em sua posição final sem animação de 700 ms.

---

### Edge Cases

- **JavaScript desabilitado no navegador**: O tema padrão permanece claro (`#F7F7F4`), o botão de alternância de tema e os controles dependentes de JS ficam ocultos (`[hidden]`), o menu de navegação permanece visível, a primeira vitrine do hero e todos os links da galeria de possibilidades continuam acessíveis sem filtro ocultando categorias.
- **Armazenamento local bloqueado (`SecurityError` em `localStorage`)**: `web/theme.js` e `web/app.js` capturam exceções de acesso ao `localStorage` com blocos `try/catch`, permitindo alternar o tema normalmente durante a sessão ativa sem quebrar a execução da página.
- **Aba em segundo plano ou hero fora do viewport**: O `IntersectionObserver` e o listener de `visibilitychange` suspendem o temporizador do carrossel do hero e limpam o rastro do mouse quando a aba fica oculta ou a seção sai da área visível, economizando CPU/bateria.
- **Portfólio vazio (`entries: []`) e WhatsApp não configurado (`teamWhatsapp: null`)**: A seção dinâmica de cases ("Feito com a Inspira") permanece oculta (`hidden`) em vez de exibir cards vazios ou clientes fictícios, e os CTAs de contato exibem aviso claro de produto em preparação.
- **Caminho base customizado (`SITE_BASE_PATH`) inválido**: `scripts/build.mjs` valida `SITE_BASE_PATH` contra `/^\/(?:[A-Za-z0-9._~-]+\/)*$/` e aborta o build caso receba caminho relativo ou caracteres inseguros.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A página DEVE implementar a Direção A ("Laranja Pontual") registrada em `DESIGN.md`, utilizando fontes locais `Syne` e `DM Sans` (OFL), marca aprovada em SVG (`vitrine-animated.svg`, `vitrine.svg` e variantes inversas), símbolo V bicolor apenas no primeiro "v" da palavra "vitrine" no título principal do hero e Orb oficial fixa no canto inferior esquerdo com link para `https://inspira.dev.br/`.
- **FR-002**: Todos os controles interativos (menu responsivo, alternador de tema, controles do carrossel do hero, seletores de área com `aria-pressed` e itens de FAQ `<details>`/`<summary>`) DEVEM ser operáveis por teclado com foco visível, suporte a `Escape` no menu móvel e alvos de toque de pelo menos 44 px nos controles primários.
- **FR-003**: A página DEVE consumir apenas as projeções públicas geradas em `dist/data/portfolio.json` e `dist/data/contact.json`; quando não houver cases publicados a seção de portfólio dinâmico DEVE permanecer oculta, e quando `href` for `null` nenhuma ação DEVE apontar para número fictício.
- **FR-004**: O script `scripts/build.mjs` DEVE gerar `dist/` contendo estritamente ativos públicos da página de divulgação e dados projetados, excluindo `node_modules/`, `supabase/`, `test/`, `scripts/`, `.env`, `.git` e quaisquer arquivos `.sql`.
- **FR-005**: A página DEVE distinguir claramente o modelo demonstrativo de pizzaria e os exemplos reais agrupados por área (`Alimentação`, `Arte & design`, `Fotografia & mídia`, `Saúde` e `Tecnologia` com estado vazio explícito) de templates prontos para contratação imediata, preservando avisos de oferta em preparação.
- **FR-006**: Todos os ativos visuais, fontes, scripts e estilos DEVEM ser servidos localmente da própria origem (`'self'`), sem dependência de CDNs externas, Google Fonts, iframes de sites de terceiros, bibliotecas pagas ou scripts de analytics/rastreamento.
- **FR-007**: O pacote gerado em `dist/` DEVE incluir `_headers` com CSP restritiva (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'none'`) e ser validável por `npx --yes wrangler@4.158.0 deploy --dry-run` usando `wrangler.jsonc` sem provisionar recursos remotos.
- **FR-008**: O sistema de temas (`web/theme.js`, `web/app.js`, `web/styles.css`) DEVE aplicar o tema inicial (`light` ou `dark`) antes do primeiro paint a partir de `localStorage['vitrine-theme']` ou `prefers-color-scheme`, permitir alternância manual acessível no cabeçalho e preservar contraste mínimo WCAG AA (4,5:1 para texto normal e 3:1 para texto grande).
- **FR-009**: O rastro decorativo do ponteiro (`web/dot-trail.js`), a animação do logotipo e o autoplay do carrossel do hero DEVEM respeitar `prefers-reduced-motion: reduce`, desativando animações automáticas e trilhas de canvas em modo de movimento reduzido ou entrada por toque/caneta.

### Key Entities *(include if feature involves data)*

- **Preferência de Tema (`ThemePreference`)**: Estado visual local do visitante (`"light"` ou `"dark"`), resolvido sincronamente em `web/theme.js` via `localStorage['vitrine-theme']` ou `window.matchMedia('(prefers-color-scheme: dark)')` e refletido em `document.documentElement.dataset.theme`.
- **Vitrine de Exemplo por Área (`AreaShowcaseItem`)**: Referência real autorizada exibida na seção "Possibilidades" sob uma das cinco áreas (`alimentacao`, `arte`, `midia`, `saude`, `tecnologia`), utilizando captura local em `web/assets/showcase/` e link externo identificado com `target="_blank" rel="noopener noreferrer"`.
- **Pacote Estático de Divulgação (`MarketingDistArtifact`)**: Diretório imutável `dist/` produzido por `npm run build`, contendo `index.html`, `404.html`, `_headers`, estilos, scripts modulares, fontes locais, vetores da marca e projeções JSON em `dist/data/`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 ocorrências de overflow horizontal (`scrollWidth > clientWidth`) e 0 erros de console/JavaScript nos viewports de verificação (390 px, 836 px e 1440 px) tanto no tema claro quanto no tema escuro.
- **SC-002**: 100% dos ativos locais referenciados por `src` ou `href` em `dist/index.html` existem no pacote compilado `dist/`, e 0 arquivos privados (`.sql`, `.env`, `supabase/`, `test/`, `scripts/`) são incluídos em `dist/` (verificado por `test/marketing-build.test.mjs`).
- **SC-003**: `dist/_headers` bloqueia scripts inline e externos (`script-src 'self'`), framing (`frame-ancestors 'none'`, `X-Frame-Options: DENY`) e submissão de formulários (`form-action 'none'`).
- **SC-004**: Com `prefers-reduced-motion: reduce` ativo, 0 loops de animação automática (autoplay do hero ou `requestAnimationFrame` do `dot-trail.js`) permanecem em execução.
- **SC-005**: `npx --yes wrangler@4.158.0 deploy --dry-run` conclui com código de saída `0` sobre o diretório `./dist` configurado em `wrangler.jsonc`.

## Assumptions

- O escopo desta especificação restringe-se exclusivamente ao site público de divulgação (`vitrine.inspira.dev.br`); o portal administrativo (`painel.inspira.dev.br`), login Google OAuth, editor de cardápio e motor de publicação pertencem às especificações `001` e `004` a `007`.
- A prévia pública no GitHub Pages (`SITE_BASE_PATH=/vitrine/`) serve apenas para homologação visual da branch `main` e não aplica o arquivo `_headers` específico da Cloudflare (`docs/marketing-launch.md`).
- O deploy remoto definitivo na Cloudflare aguarda configuração de autenticação Wrangler e confirmação de controle da zona DNS `inspira.dev.br` pelo responsável da conta, não devendo ser alegado como realizado enquanto as credenciais não estiverem configuradas.
