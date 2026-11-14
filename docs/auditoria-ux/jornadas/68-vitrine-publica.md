# Jornada `#68` — Vitrine pública, da escolha ao contato

Seção da Auditoria UX ([matriz central](../matriz-central.md), contrato
[`ux-audit-matrix-contract.md`](../../../specs/010-ux-audit-meta-readiness/contracts/ux-audit-matrix-contract.md)).

- **Issue**: [#68](https://github.com/coletivo-inspira/vitrine/issues/68), 1ª onda, AFK.
- **Coleta**: 2026-11-14, 17:20–18:10 UTC.
- **Versão auditada**: `main` em `bbafd95c13ab5142aa642287f788632cdd0c55e3`; build com hash `0911af34bd42` (`/loja1`, 6 itens ativos).
- **Evidências**: pasta `media/auditoria-ux/68-vitrine-publica/` do Context do projeto (78 capturas, não versionadas). Os nomes citados abaixo são arquivos dessa pasta.
- **Produção**: a versão publicada é `bbafd95` (workflow "Deploy Cloudflare Worker", 14/11/2026 16:20Z), o mesmo commit e build do preview local. Por isso o preview e o Worker local servem como evidência equivalente. O `403` que clientes automatizados recebem é o desafio de bots da Cloudflare, não uma falha. Conferir num navegador real é passo humano opcional (`CHK-UX-61-PROD`, seção 1.4 da matriz).

## 1. Escopo

| Superfície | Rota | Ambiente usado |
| --- | --- | --- |
| Vitrine piloto estática | `/loja1`, `/loja1/` | Preview (`PORT=4185`) e Worker local |
| Vitrine publicada dinâmica | `/<slug>` (`/bazar-auditoria`, `/mila-auditoria`, `/leilao-auditoria`) | Worker local |
| Casca genérica | `/vitrine/`, `/vitrine/?slug=<slug>` | Preview e Worker local |
| Página de erro | rota inexistente, vitrine não publicada, `/404.html` | Preview e Worker local |
| Páginas por cidade | `/por-cidade`, `/por-cidade/<cidade>`, filtros `?modo=` | Worker local |
| Etapas do pedido | 1. Vitrine → 2. Seus dados → 3. Revisar e enviar | Ambos |
| Modalidades | preço fixo, lance, leilão, doação, troca, cotas | Worker local (`/loja1` só tem preço fixo) |
| Curtidas | `/api/likes` (GET e POST) | Worker local |
| Contato | `href` de `wa.me`, direto e via Mila | Ambos (só leitura do `href`) |
| Open Graph | `<title>`, `og:*`, `twitter:card` | Ambos |

Fora do escopo: painel (`#63`–`#67`), prévia assinada `/__preview/:siteId` (`#67`).

## 2. Ambiente e dados de teste

- **Preview estático** (`PORT=4185 npm run preview`): serve só `dist/`. `/api/*` responde `404`, então as curtidas ficam ocultas e as métricas são descartadas em silêncio.
- **Worker local** (`http://127.0.0.1:4285`): o roteiro
  `internal/auditoria-ux/worker-local-68.mjs` do Context chama
  `createApiHandler({ store })` de `workers/api.mjs` com `createMemoryStore`,
  sem credenciais, e simula o binding `ASSETS` lendo `dist/` (com
  `not_found_handling: 404-page`). Ele publica com `compilePublicStorefront`:
  - `bazar-auditoria` (`products-v1`, cidade Porto Alegre – RS listada): nome do negócio `Bazar & Cia "Auditoria"`, boas-vindas com `<únicos>` e aspas, item `Pão & Café "Especial" <b>negrito</b> — Açaí, ç, 50% off #1`, item de nome longo, lance (mínimo R$ 150,00), doação com condições, troca com `tradeFor`, cotas 7/10 e cotas esgotadas 5/5, item inativo;
  - `mila-auditoria` (`orderRelay: mila`);
  - `leilao-auditoria` (lance com `auctionEndsAt` em 2 dias).
- **Recusadas na publicação** (comportamento correto, registrado como verificação): vitrine sem item ativo (`EMPTY_PUBLIC_MENU`), sem WhatsApp (`INVALID_WHATSAPP`) e descrição com `<script>` (`INVALID_ITEM`). Por isso a vitrine pública vazia e a vitrine sem número não são alcançáveis por publicação.
- **Navegador**: Chrome headless controlado pelo roteiro `internal/auditoria-ux/mock-68.mjs` (cenários em JSON; tema e `prefers-reduced-motion` por `Emulation.setEmulatedMedia`; falhas de rede e respostas `404`/`429`/`503` simuladas por `Fetch`).
- O Worker recusa curtidas de agentes com `HeadlessChrome` (`LIKE_NOT_ALLOWED`, filtro de robôs). Os testes de curtida bem-sucedida trocaram o user agent; o `403` foi usado para observar a mensagem de erro.
- Nenhum link do WhatsApp foi aberto. As mensagens foram lidas de `URL.searchParams.get('text')` e comparadas com a prévia exibida.

## 3. Inventário de controles

Larguras verificadas para todos os controles da vitrine: 360, 390, 768, 1024, 1440, horizontal 844×390 e zoom 200%, sem rolagem horizontal em nenhuma (`scrollWidth − innerWidth = 0`) e sem alvo menor que 44×44 px.

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `.skip-link` "Pular para os itens" | Link | default, focus-visible | 375, 1280 | Saltar o topo | Aparece no 1º `Tab` e leva ao conteúdo | Aparece; `Enter` muda o hash para `#vitrine-principal`; o foco fica em `body`, mas o próximo `Tab` segue dentro do conteúdo | Contorno de 3 px (`skip-link-375-claro.png`) |
| `.theme-toggle` | Botão (ícone) | default, focus-visible, active | todas, claro/escuro | Alternar tema | Troca o tema e salva a escolha | Troca para escuro, rótulo vira "Ativar modo claro", grava `localStorage['vitrine-theme']` | `aria-label` dinâmico |
| `#storefront-slug-pill`, `.storefront-template-tag` | Texto | default | todas | Mostrar endereço e tipo | Endereço correto | Correto, inclusive para slug inexistente (`/nao-existe`) | — |
| `#category-nav .category-chip` | Link (âncora) | default, focus-visible | todas | Ir à categoria | Rolar até `#cat-<id>` | Funciona; em 375 px os chips quebram linha | Contorno de foco |
| `.sf-step-pill` (1. Vitrine, 2. Seus dados, 3. Revisar e enviar) | Botão | default, active (`aria-current="step"`), done, disabled | todas | Mostrar e voltar etapas | Etapas futuras desabilitadas; concluídas clicáveis | Conforme; voltar pela etapa 1 a partir da 3 funciona. Em 390 px quebra em duas linhas | `aria-current`, `disabled` |
| `.sf-like-button` | Botão (ícone + contador) | default, pressed, pending (`aria-busy`), error, oculto | 375, 1280, claro/escuro | Curtir item | Alterna, persiste por cookie, mostra erro | Com o Worker: curtir → `aria-pressed="true"`, "1"; recarregar mantém; descurtir zera. `429` mostra "Muitas curtidas nesta vitrine agora…"; `403` mostra "Não foi possível registrar sua curtida…"; GET `503`/`404` oculta todos os botões | `aria-label` "Curtir X (n curtidas)", `title` "Curtir"/"Remover curtida", erro com `role="status"` |
| `.btn-qty` "−" / "+" (preço fixo) | Botão | default, focus-visible, disabled (− com 0) | todas | Ajustar quantidade | Atualiza quantidade e mantém o foco | Quantidade atualiza, mas o foco vai para `body` ([UX-68-002](#5-achados)); valor sem região viva ([UX-68-006](#5-achados)) | `aria-label` "Adicionar X" / "Diminuir quantidade de X" |
| `#public-sf-offer-<id>` + "Incluir lance" / "Atualizar lance" / "Remover" | Campo + botões | empty, error (vazio, abaixo do mínimo), selected | 390, 1280 | Registrar lance livre | Valida e inclui no pedido | Máscara `R$ 0,00`; "Informe o valor do seu lance."; "O lance mínimo para este item é R$ 150,00."; aceito com R$ 200,00 | Erro com `role="alert"`; foco perdido após cada clique |
| Leilão: `#public-sf-bid-<id>` + "Dar lance" + `dialog.sf-bid-dialog` | Campo, botão, diálogo | empty, error, dialog open, `Esc` | 390, 1280 | Dar lance em leilão | Valida mínimo, pede nome, WhatsApp e autorização | "O lance mínimo agora é R$ 200,00."; diálogo nativo abre com foco no nome; enviar vazio mostra "Informe seu nome (2 a 60 caracteres)."; `Esc` fecha e devolve o foco a "Dar lance" (`leilao-dialogo-390-claro.png`) | Diálogo modal com `aria-labelledby` |
| Doação "Quero receber" / "Selecionado" | Botão alternável | default, pressed | todas | Pedir item doado | Alterna seleção | `aria-pressed="true"` ao selecionar | `aria-pressed` |
| Troca `#public-sf-trade-<id>` + "Propor troca" / "Atualizar proposta" / "Remover" | Campo + botões | empty, error, selected | 390, 1280 | Propor troca | Exige proposta | "Informe o que você oferece em troca."; aceita aspas e `&` | `role="alert"` |
| Cotas "−" / "+" | Botão | default, disabled no limite, esgotado | todas | Reservar cotas | Limita ao restante | Para no limite de 3; "+" fica desabilitado sem explicação ([UX-68-016](#5-achados)); esgotado mostra "Cotas esgotadas" | `aria-live` no valor; barra `<progress>` com rótulo "7 de 10 cotas confirmadas" |
| `.storefront-cart-bar` + `.sf-cart-advance-btn` | Região fixa + botão | hidden (0 itens), visible | todas | Resumo e avanço | Totais corretos por modalidade | "5 itens e 3 cotas reservadas · R$ 39,80 (sem os lances) · + R$ 75,00 em cotas · Preencher dados" | `role="region"` "Resumo da seleção" |
| Etapa 2: `#public-sf-cust-name`, "Retirada no local" / "Entrega no endereço", `#public-sf-cust-address`, `#public-sf-cust-notes` | Campos + botões alternáveis | empty, error, filled | 390, 1280 | Coletar dados do pedido | Validar e levar à revisão | Valida nome e endereço com mensagem no topo; sem `aria-invalid` e sem foco no campo ([UX-68-005](#5-achados)) | `role="alert"` na mensagem; `aria-pressed` nos botões de recebimento |
| "Voltar aos itens" / "Revisar resumo" | Botões | default | todas | Navegar etapas | Trocar etapa e posicionar no título | Troca, mas mantém a rolagem antiga e perde o foco ([UX-68-004](#5-achados)) | — |
| Etapa 3: `.sf-wa-message-body` | Prévia | default | 375, 390 | Mostrar a mensagem exata | Igual ao `text` do link | Igual em todos os casos (`igualAoPreview: true`) | Rótulo "Mensagem que será aberta no WhatsApp" |
| "Enviar pedido no WhatsApp" (`a.whatsapp-order-button`) | Link externo | default | todas | Abrir conversa | `https://wa.me/<número>?text=<encodeURIComponent>`, nova aba | Conforme; `target="_blank"`, `rel="noopener noreferrer"`. Mila: número `553131890669` e prefixo `#VI-MILAAU-AV2K · Pedido para …` | Texto do botão vem de `ctaLabel` |
| "Editar dados" / "Voltar aos itens" (etapa 3) | Botão | default | todas | Voltar | Preserva dados | Dados preservados | — |
| `.storefront-city-link` | Link | default | 1280, 375 | Ir para `/por-cidade/<cidade>` | Aparece só com lance/doação/troca e cidade listada | Aparece em `/bazar-auditoria`; ausente em `/loja1` | Contraste abaixo do mínimo no claro ([UX-68-003](#5-achados)) |
| Rodapé `.brand` | Link (logo) | default | todas | Ir à página institucional | — | Funciona | `aria-label` |
| `/por-cidade/<cidade>`: `.city-filter` (Todos, Lance, Doação, Troca), "Ver na vitrine" | Links | default, current (`aria-current="page"`) | todas, claro/escuro | Filtrar e abrir a vitrine | Filtrar por `?modo=` | Contagens corretas (3/1/1/1); "Ver na vitrine" leva a `/bazar-auditoria` | `aria-current` |
| `/por-cidade`: "Abrir o painel →" | Link | default | 375, 1280 | Convite a negócios | — | Presente na página da plataforma, não na vitrine | — |
| 404: "Voltar ao início →" | Link | default | todas | Sair do erro | — | Leva à página institucional ([UX-68-013](#5-achados)) | — |

**Ausência de controles administrativos**: nenhuma vitrine (`/loja1`, `/<slug>`, `/vitrine/`) mostra links ou botões de editar, publicar, painel ou excluir. O item inativo não aparece no HTML nem em `menu.json`.

## 4. Matriz de cenários

`executado` = verificado com captura ou medição; `parcial` = parte das telas;
`n/a` = não se aplica.

| Tela | 360 | 390 | 768 | 1024 | 1440 | Horizontal | Zoom 200% | Claro | Escuro | Teclado | Movimento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/loja1` (preview) | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |
| `/<slug>` (Worker local) | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |
| Etapas 2 e 3 | parcial (375/390) | executado | n/a | n/a | parcial (1280) | n/a | n/a | executado | executado (`/loja1`) | executado | n/a |
| Leilão | parcial (375) | executado | n/a | n/a | parcial (1280) | n/a | n/a | executado | executado | executado | n/a |
| 404 (preview e Worker) | executado | executado | executado | executado | executado | executado | executado | executado | executado | n/a | n/a |
| `/por-cidade/<cidade>` | executado | executado | executado | executado | executado | executado | executado | executado | executado | parcial | n/a |
| `/por-cidade` índice | parcial (375) | n/a | n/a | n/a | parcial (1280) | n/a | n/a | executado | executado | n/a | n/a |

Linha resumida para a seção 5 da matriz central: `#68` — 360 executado,
390 executado, 768 executado, 1024 executado, 1440 executado, horizontal
executado, zoom 200% executado, claro executado, escuro executado, teclado
executado, movimento executado.

Outras verificações:

- **Toque**: emulação de toque abaixo de 768 px; todos os alvos da vitrine têm pelo menos 44×44 px (o botão de curtir mede 46×44). Na página por cidade, os links do cabeçalho institucional têm 22 px de altura (cabeçalho compartilhado, ver `#62`).
- **Movimento reduzido**: com `prefers-reduced-motion: reduce`, a animação da curtida e as transições caem para `1e-05s` e a rolagem suave é desligada (`vitrine.css:579`, `vitrine.css:939`).
- **Contraste**: medido por cálculo WCAG nos elementos renderizados; resultados em [UX-68-003](#5-achados). Tema escuro passa em todos os textos medidos, exceto o placeholder.
- **Caracteres especiais**: `&`, aspas, `<b>`, `<i>`, acentos, `%` e `#` aparecem como texto (escapados) no HTML, no `<title>`, no `og:*` e nos `aria-label`; no link são codificados por `encodeURIComponent` (`%26`, `%22`, `%3C`, `%25`, `%23`) e voltam idênticos ao decodificar.

## 5. Achados

Contagem: **P0 0 · P1 3 · P2 7 · P3 10** (20 achados).

| ID | Issue | Severidade | Natureza | Eixo | Descrição e Evidência | Critério de Aceite | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UX-68-001` | `#68` | `P1` | `problema_confirmado` | `formularios` | Na `/loja1`, o nome e o endereço de entrega informados na etapa 2 aparecem no resumo, mas não vão na mensagem do WhatsApp: o texto enviado é só "Olá! Tenho interesse nestes produtos: … Total estimado: R$ 48,00 / Observações: Sem cebola". O modelo padrão de `pizzeria-v1` não tem `{nome}` nem `{endereco}` (`src/portal-validation.mjs:481-489`) e `interpolateWhatsappTemplate` só acrescenta observações quando o marcador falta (`web/assets/storefront-renderer.mjs:57-77`). Afeta toda vitrine `pizzeria-v1` e qualquer modelo editado sem esses marcadores. Captura `loja1-passo3-entrega-390-claro.png` | Todo campo pedido na etapa 2 (nome, recebimento e endereço, data, horário) aparece na mensagem final mesmo quando o modelo não tem o marcador; teste automatizado cobre `pizzeria-v1` com entrega | Aberto |
| `UX-68-002` | `#68` | `P1` | `problema_confirmado` | `navegacao` | Cada interação re-renderiza a vitrine inteira com `replaceChildren` (`storefront-renderer.mjs:519-542`) e o foco vai para `body`: após "+", após erro de lance, ao trocar Retirada/Entrega, ao validar e ao mudar de etapa (medido: `document.activeElement === body`). O próximo `Tab` volta ao "1. Vitrine", e quem usa teclado ou leitor de tela perde a posição na lista (WCAG 2.4.3). Captura `foco-apos-adicionar-1280-claro.png` | Depois de "+"/"−", selecionar, incluir lance, propor troca e alternar recebimento, o foco continua no controle equivalente; ao mudar de etapa, o foco vai para o título da etapa | Aberto |
| `UX-68-003` | `#68` | `P1` | `problema_confirmado` | `feedback` | Contraste abaixo de 4,5:1 em texto pequeno no tema claro: `.storefront-eyebrow` 4,30 (13 px, `vitrine.css:196-203`), selo de modalidade `.sf-mode-badge` 4,30 (11 px, `vitrine.css:1014-1025`), `.storefront-city-link` 4,27 (14 px, `vitrine.css:1132-1137`); placeholder dos campos 4,29 no claro e 3,68 no escuro (cor padrão do navegador). Medição em `/bazar-auditoria`, 1280 px | Todos os textos citados atingem pelo menos 4,5:1 nos dois temas, medidos com a mesma fórmula WCAG | Aberto |
| `UX-68-004` | `#68` | `P2` | `problema_confirmado` | `navegacao` | Ao avançar a partir do fim da lista, a etapa 2 abre com a rolagem antiga: `scrollY` 477 e título a −223 px, fora da tela; a pessoa vê só o fim do formulário e o rodapé. `goToStage` não rola nem foca (`storefront-renderer.mjs:463-470`). Capturas `barra-selecao-fim-da-pagina-390-claro.png` e `passo2-apos-avancar-do-fim-390-claro.png` | Ao trocar de etapa, o título da nova etapa fica visível no topo, respeitando `prefers-reduced-motion` | Aberto |
| `UX-68-005` | `#68` | `P2` | `problema_confirmado` | `formularios` | A validação da etapa 2 mostra uma mensagem no topo ("Por favor, informe seu nome para continuar.", "Por favor, informe o endereço para entrega."), mas o campo não recebe `aria-invalid` nem `aria-describedby` e o foco não vai para ele (`storefront-renderer.mjs:2020-2051`). Captura `passo2-validacao-390-claro.png` | Campo com erro recebe `aria-invalid="true"`, mensagem ligada por `aria-describedby` e foco; a mensagem fica junto do campo | Aberto |
| `UX-68-006` | `#68` | `P2` | `problema_confirmado` | `feedback` | A quantidade de itens de preço fixo (`.qty-val`) não tem região viva (`storefront-renderer.mjs:1643-1645`); a de cotas tem `aria-live="polite"` (`:1767`). Somado ao `UX-68-002`, o leitor de tela não anuncia a nova quantidade | Mudança de quantidade é anunciada (região viva ou rótulo do botão com o valor atual) | Aberto |
| `UX-68-007` | `#68` | `P2` | `problema_confirmado` | `feedback` | `/vitrine/?slug=nao-existe` mantém o título "Cardápio Digital — Vitrine Inspira" (`web/vitrine/index.html:8`), termo proibido em texto de interface. `bootStorefront` não atualiza `<title>` nem `og:title` quando a vitrine não existe (`web/vitrine/vitrine.js:360-368`). Captura `vitrine-slug-inexistente-1280-claro.png` | O título inicial da casca e o do estado de erro usam "vitrine" (ex.: "Vitrine não encontrada — Vitrine Inspira"); o teste de termos proibidos cobre `web/vitrine/index.html` | Aberto |
| `UX-68-008` | `#68` | `P2` | `problema_confirmado` | `feedback` | No estado "Vitrine não encontrada", o topo continua dizendo "Atendimento direto no WhatsApp" e "Escolha seus itens abaixo e toque em Pedir no WhatsApp…", sem itens e sem caminho de saída (`vitrine.js:360-368`). Captura `vitrine-slug-inexistente-1280-claro.png` | O estado de erro esconde o texto de pedido e oferece uma ação clara (ex.: voltar ao início ou ver vitrines da cidade) | Aberto |
| `UX-68-009` | `#68` | `P2` | `risco_codigo` | `feedback` | Se `menu.json` responder `404` enquanto o HTML da vitrine ainda está em cache (`/loja1` e `/<slug>` usam `max-age=300, stale-while-revalidate=86400`), o título vira "Vitrine não encontrada" com o aviso "ainda não foi publicada", mas os 6 itens e os links "Pedir no WhatsApp" continuam na tela. Reproduzido com `404` simulado. Captura `loja1-menu-404-375-claro.png` | Com `menu.json` ausente, a página mostra um único estado coerente (ou mantém a vitrine estática sem o aviso, ou esconde os itens) | Aberto |
| `UX-68-010` | `#68` | `P2` | `risco_codigo` | `formularios` | A vitrine piloto pública `/loja1` gera links para `wa.me/5511999999999` (`content/vitrines/loja1.json:6`), número fictício que pode pertencer a alguém. O renderizador também usa esse número como reserva quando falta WhatsApp (`storefront-renderer.mjs:2389-2392`); a publicação recusa vitrine sem número (`INVALID_WHATSAPP`, verificado), então a reserva só alcança a `/loja1` e a prévia do editor | A `/loja1` aponta para um número controlado pelo coletivo (ex.: Mila) ou mostra aviso de vitrine de demonstração; o renderizador não inventa número quando falta WhatsApp | Aberto |
| `UX-68-011` | `#68` | `P3` | `problema_confirmado` | `navegacao` | Rota inexistente no preview responde texto puro "Página não encontrada." (`scripts/serve.mjs:91-92`); o Worker serve a página estilizada `404.html`. Capturas `404-preview-375-claro.png` e `404-worker-375-claro.png` | O preview serve `404.html` com status `404`, como o Worker | Aberto |
| `UX-68-012` | `#68` | `P3` | `problema_confirmado` | `navegacao` | `/vitrine/` diverge: no preview responde `200` e mostra a `/loja1` (reserva `'loja1'` em `vitrine.js:52`, rota em `serve.mjs:54-55`); no Worker redireciona `301` para `/` | Preview e Worker tratam `/vitrine/` da mesma forma, sem exibir a vitrine piloto como padrão | Aberto |
| `UX-68-013` | `#68` | `P3` | `critica_ux` | `feedback` | A 404 de vitrine não publicada só oferece "Voltar ao início →", que leva à página institucional; quem chegou por um link de negócio não recebe orientação (`web/404.html`). Captura `404-worker-375-claro.png` | Texto da 404 orienta conferir o endereço com o negócio e oferece um segundo caminho (ex.: `/por-cidade`) | Aberto |
| `UX-68-014` | `#68` | `P3` | `problema_confirmado` | `navegacao` | A partir de 640 px, o rodapé usa `flex-direction: row` sem largura base (`vitrine.css:389-401`): o link "Mais itens de lance, doação e troca em Porto Alegre – RS" fica espremido numa coluna de 81 px (134 px de altura) em 1280 e de 54 px (224 px de altura) em 768, quebrando a cada palavra. Captura `bazar-1280-escuro.png` | Em 768, 1024 e 1440 px o link ocupa no máximo duas linhas | Aberto |
| `UX-68-015` | `#68` | `P3` | `critica_ux` | `feedback` | Doação e troca mostram o mesmo selo duas vezes no cartão: no título (`storefront-renderer.mjs:1357-1368`) e no rodapé (`:1527-1530`, `:1547-1550`). Captura `bazar-1280-claro.png` | Cada cartão mostra a modalidade uma única vez | Aberto |
| `UX-68-016` | `#68` | `P3` | `problema_confirmado` | `feedback` | Ao atingir o limite de cotas, o "+" fica desabilitado sem explicação; a mensagem "Restam apenas N cotas disponíveis." existe (`storefront-renderer.mjs:136-143`), mas não é alcançável porque o botão desabilitado não recebe clique (`:1773`) | No limite, o cartão diz por que não é possível reservar mais | Aberto |
| `UX-68-017` | `#68` | `P3` | `problema_confirmado` | `formularios` | No modelo padrão de produtos, a mensagem repete o rótulo: "Entrega/Retirada: Entrega: Rua A, 10…" (`src/portal-validation.mjs:497` + `storefront-renderer.mjs:2149-2153`). Captura `passo3-revisao-390-claro.png` | A linha de recebimento tem um único rótulo (ex.: "Entrega: Rua A, 10…" ou "Retirada no local") | Aberto |
| `UX-68-018` | `#68` | `P3` | `critica_ux` | `feedback` | Com falha de rede no `menu.json`, a `/loja1` mostra "Não foi possível carregar a vitrine neste momento." enquanto a vitrine estática segue completa, com links por item que funcionam. Captura `loja1-falha-rede-375-claro.png` | O aviso diz que a montagem do pedido está indisponível e que ainda é possível pedir pelo botão de cada item | Aberto |
| `UX-68-019` | `#68` | `P3` | `risco_codigo` | `feedback` | Open Graph: `og:title`, `og:description` e `og:url` são personalizados e escapados, mas `<meta name="description">` fica genérica (`src/publication-engine.mjs:951`) e `og:image` usa a imagem padrão quando não há logo nem foto (`:716-728`). A pré-visualização real no WhatsApp e no Instagram não foi verificável | A descrição usa as boas-vindas da vitrine; a pré-visualização é validada em produção num aplicativo real (`BLK-UX-68-OG`) | Aberto |
| `UX-68-020` | `#68` | `P3` | `risco_codigo` | `feedback` | A resposta JSON de `/data/vitrines/<slug>/menu.json` inexistente diz "Cardápio público não encontrado." (`workers/api.mjs:3541`), termo proibido em texto que pode chegar a quem usa a API | A mensagem usa "vitrine" (ex.: "Vitrine publicada não encontrada.") | Aberto |

Observações sem achado:

- O link estático de cada item (versão sem JavaScript) usa "Pode confirmar preço e disponibilidade?" também para doação, troca e cotas (`src/public-menu.mjs:65`). Só aparece com JavaScript desligado ou quando o `menu.json` falha; vale ajustar junto com `UX-68-018`.
- O cabeçalho institucional da página por cidade tem links de 22 px de altura; pertence ao cabeçalho compartilhado auditado em `#62`.

## 6. Bloqueios e checklist de aceite

| Código | Tela | Bloqueio | Checklist de aceite |
| --- | --- | --- | --- |
| `CHK-UX-61-PROD` (opcional) | Todas as rotas desta jornada em produção | Clientes automatizados recebem o desafio de bots da Cloudflare; a versão publicada (`bbafd95`) é a mesma auditada localmente | [ ] Opcional: num navegador real, `/loja1`, uma `/<slug>` real com `og:title` do negócio, uma rota inexistente (404) e `/por-cidade` abrem como nas capturas locais |
| `BLK-UX-68-OG` | Pré-visualização de link | Sem produção, não há como testar o card no WhatsApp, Instagram e Facebook | [ ] Depuração de compartilhamento da Meta lê `og:title`, `og:description` e `og:image` de uma vitrine real · [ ] card no WhatsApp mostra nome e imagem |
| `BLK-UX-68-LIKES` | Curtidas em produção | Cookie `Secure`, limite real (`429`) e filtro de robôs só verificáveis em HTTPS com Supabase | [ ] Curtir e descurtir em navegador comum em produção · [ ] curtida persiste após recarregar · [ ] limite mostra a mensagem de `429` |

## 7. Recomendações

1. **Mensagem completa** (`UX-68-001`, `UX-68-017`): montar as linhas de nome, recebimento, data e horário fora do modelo quando o marcador não existir, como já acontece com as observações; corrigir o modelo padrão de `pizzeria-v1`.
2. **Foco e rolagem** (`UX-68-002`, `UX-68-004`, `UX-68-006`): guardar o identificador do controle ativo antes de `render()` e restaurá-lo depois; na troca de etapa, focar o título (`tabindex="-1"`) e rolá-lo para o topo; anunciar a quantidade.
3. **Contraste** (`UX-68-003`): escurecer `--primary` no tema claro ou usar `--ink` nos textos pequenos; definir cor de placeholder própria nos dois temas.
4. **Estados de erro** (`UX-68-007`, `UX-68-008`, `UX-68-009`, `UX-68-018`): um único componente de estado com título, explicação e ação, que esconda o texto de pedido quando não houver vitrine.
5. **Número da vitrine piloto** (`UX-68-010`): trocar o número da `/loja1` por um número do coletivo e remover a reserva fixa do renderizador.
6. **Paridade preview × Worker** (`UX-68-011`, `UX-68-012`): o preview pode reutilizar `404.html` e o mesmo tratamento de `/vitrine/`.
7. **Cosméticos** (`UX-68-014`, `UX-68-015`, `UX-68-016`, `UX-68-013`, `UX-68-019`, `UX-68-020`): baixa prioridade, podem entrar junto com o item 4.

## 8. Como reproduzir

```bash
npm ci --engine-strict=false
npm run build
PORT=4185 npm run preview
# Worker local com vitrines de teste (roteiro no Context do projeto):
node internal/auditoria-ux/worker-local-68.mjs "$PWD" 4285
# Cenários de navegador (gera capturas e JSON de resultados):
node internal/auditoria-ux/mock-68.mjs cenarios.json media/auditoria-ux/68-vitrine-publica resultado.json
```
