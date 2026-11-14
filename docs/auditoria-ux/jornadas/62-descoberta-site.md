# Jornada `#62` — Descoberta do Vitrine até o contato

Seção da Auditoria UX para a issue `#62`, seguindo as convenções da
[matriz central](../matriz-central.md) (`#61`) e o
[contrato da auditoria](../../../specs/010-ux-audit-meta-readiness/contracts/ux-audit-matrix-contract.md).

## 1. Cabeçalho

| Campo | Valor |
| --- | --- |
| Issue | `#62` (1ª onda, AFK) |
| Data da coleta | 2026-11-14, 17:20–18:10 UTC |
| Commit auditado | `main` em `bbafd95c13ab5142aa642287f788632cdd0c55e3` |
| Hash do build | `0911af34bd42` (`/loja1`, 6 itens ativos, 0 casos publicados, contato configurado) |
| Ambiente | `local_preview` — `PORT=4182 npm run preview` (`http://127.0.0.1:4182`) |
| Superfícies | `/`, `/como-funciona/`, `/possibilidades/`, `/planos/`, `/orcamento/`, `/privacidade/`, `/termos/`, bolinha fixa (`a.inspira-orb`), pílula fixa "Orçamento com a Mila" (`.fixed-quote-btn`) |
| Evidências | Pasta `media/auditoria-ux/62-descoberta/` do Context do projeto (102 capturas, não versionadas) |

## 2. Ambiente, simulações e limites

- **Navegador**: Chrome headless (`/usr/local/bin/google-chrome`) dirigido pelo
  Chrome DevTools Protocol. Temas e movimento por `Emulation.setEmulatedMedia`
  (`prefers-color-scheme`, `prefers-reduced-motion`); toque por
  `Emulation.setTouchEmulationEnabled`; zoom 200% como 720 × 450 com
  `deviceScaleFactor: 2` (equivale a 1440 px a 200%).
- **Roteiros** (no Context do projeto, sem alterar o repositório):
  `internal/auditoria-ux/mock-62.mjs` (grade completa, capturas e cenários) e
  `internal/auditoria-ux/mock-62-extra.mjs` (Enter/Espaço com eventos completos,
  faixa de 801 a 1000 px, variáveis do tema escuro e simulação do conteúdo institucional).
- **Simulações usadas**:
  1. Falha do canal de contato: `/data/contact.json` respondendo `503`.
  2. Conteúdo institucional publicado: `/api/public/platform-cms` respondendo as
     10 seções-semente da migração `202611120006_cms_pages_sections_releases.sql`
     como se tivessem sido publicadas.
- **Fora do preview**: `/api/public/platform-cms` responde `404` (sem Worker), por
  isso o site mostra só o conteúdo estático. Destinos externos foram consultados
  apenas com `curl` (código HTTP), sem abrir conversas de WhatsApp: os links
  `wa.me` foram validados só pelo `href`.
- **Limite conhecido do headless**: o Chrome headless informa `hover: none`, então o
  estado de repouso da bolinha em desktop com mouse (sinal "+" invisível) não pôde
  ser observado; o hover foi verificado por evento de mouse sobre a bolinha.
- **Capturas de página inteira**: elementos fixos (bolinha e pílula) aparecem na
  posição da janela no momento da captura, não necessariamente sobre o conteúdo
  real daquele trecho. Para sobreposições, valem as capturas de primeira dobra e
  as de cenário.

## 3. Inventário de controles

Larguras: `360`, `390`, `768`, `1024`, `1440`, horizontal `844×390`, zoom `200%`.
"Todas" significa todas as larguras e modos da grade, nos temas claro e escuro.

### 3.1 Cabeçalho e navegação (todas as páginas)

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `.skip-link` "Pular para o conteúdo" | Link | default, focus-visible | 1440, 390 | Pular o cabeçalho | Aparece no primeiro Tab e leva a `#conteudo` | Aparece no primeiro Tab (`foco-skip-link-1440-claro.png`) | Visual: contorno laranja 3 px |
| `a.brand` (logo animado) | Link | default, focus-visible | Todas | Voltar à home | Leva a `/` | OK; troca para a versão inversa no escuro | `aria-label` "Vitrine Inspira — início" |
| `#site-nav a` (Como funciona, Possibilidades, Planos, Orçamento, Entrar) | Link | default, hover, focus-visible | ≥ 801 px inline; ≤ 800 px no menu | Navegar entre páginas | Página atual destacada; alvos confortáveis | Sem destaque visual da página atual (só `aria-current`); no desktop os links têm 22 px de altura; entre 801 e ~900 px quebram em duas linhas (`UX-62-003`, `UX-62-016`, `UX-62-017`) | `aria-current="page"` nas páginas internas |
| `#site-nav .button-small` "Criar minha vitrine" | Link (botão) | default, hover, focus-visible | Todas | Ir ao painel para criar a vitrine | Leva a `https://painel.inspira.dev.br/` | Destino correto no `href`; responde `403` com desafio da borda (`UX-62-023`); entre 801 e ~980 px o texto quebra em 3 linhas (83 px de altura) | Visual |
| `.theme-toggle` | Botão (ícone) | default, hover, focus-visible, ativo claro/escuro | Todas | Alternar tema | Troca o tema e lembra a escolha | Troca e persiste entre páginas (`localStorage['vitrine-theme']`); rótulo muda para "Ativar modo claro/escuro"; entre 801 e 870 px sai da caixa do cabeçalho e cria rolagem lateral (`UX-62-003`) | `aria-label` + `title` |
| `.menu-toggle` | Botão (ícone) | default, aberto, fechado, focus-visible | ≤ 800 px e zoom 200% | Abrir o menu móvel | Abre/fecha; `Esc` fecha e devolve o foco; clique fora fecha | Abre/fecha; `aria-expanded` e rótulo "Abrir/Fechar menu" corretos; `Esc` fecha e devolve o foco; clique fora não fecha (`UX-62-016`) | ARIA completo |
| Links do menu aberto | Link | default, focus-visible | 360, 390, 768, 200% | Navegar | Alvos ≥ 44 px | 300 × 48 px; o botão final tem 300 × 44 px (`menu-aberto-390-claro.png`, `menu-aberto-390-escuro.png`) | Visual |

### 3.2 Home (`/`)

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `.hero-actions .button` "Crie sua vitrine grátis →" | Link (botão) | default, hover, focus-visible | Todas | Ação principal | Ir ao painel | `href` correto (painel, `UX-62-023`); 52 px de altura | Visual |
| `.hero-actions .text-link` "Ver possibilidades" | Link | default, focus-visible | Todas | Ação secundária | Ir a `/possibilidades/` | OK; 26 px de altura (`UX-62-017`) | Visual |
| `.hero-sublink a` "Já tenho conta: entrar no portal" | Link | default, focus-visible | Todas | Entrar no painel | Ir ao painel | OK; usa "portal" enquanto o menu diz "Entrar" e a privacidade diz "painel" (`UX-62-020`) | Visual |
| `.showcase-link` (nome da vitrine em destaque) | Link externo | default, focus-visible, troca de lâmina | Todas | Abrir o site do exemplo | Nova aba, aviso de nova aba | `target="_blank"`, `rel="noopener noreferrer"`, texto oculto "(abre em nova aba)"; `href` e título acompanham a lâmina; 19 px de altura em 360 (`UX-62-017`) | Texto oculto |
| `.showcase-pause` | Botão (ícone) | default, pressionado, hover, focus-visible, movimento reduzido | Todas | Pausar/retomar a troca automática | Pausa e retoma | Pausa (fica em `03 / 04` por 6 s); com movimento reduzido começa "pressionado" e "Retomar" não retoma nada (`UX-62-006`) | `aria-pressed` + rótulo "Pausar/Retomar troca automática" |
| `.showcase-next` | Botão (ícone) | default, hover, focus-visible | Todas | Mostrar a próxima vitrine | Avança uma lâmina | Avança (`02 / 04` → `03 / 04`); contagem não anunciada (`UX-62-015`) | `aria-label` "Mostrar próxima vitrine" |
| `.showcase-stack` (arrastar) | Gesto | toque/arraste > 45 px | 360, 390, 768 | Avançar por gesto | Avança | Implementado por `pointerdown/pointerup` (`web/app.js:176-178`); gesto não foi executado no headless | — |
| Troca automática do carrossel | Automático | rodando, pausado por hover/foco, aba oculta | 1440 | Mostrar os 4 exemplos | 5 s por lâmina; pausa em hover/foco | Avançou de `01` para `02` em 6,5 s; pausa em hover/foco pelo código (`web/app.js:140`) | — |
| `.teaser-card .text-link` (4 links) | Link | default, focus-visible | Todas | Ir às páginas internas | Destinos corretos | OK; 26 px de altura (`UX-62-017`) | Visual |
| `.mila-cta .button` "Falar com a Mila" | Link (botão) | default, focus-visible, tema escuro | Todas | Ir a `/orcamento/` | Superfície própria nos dois temas | No escuro, caixa sem fundo e com borda clara (`UX-62-007`) | Visual |
| `.fixed-quote-btn` "Orçamento com a Mila" | Link fixo | default, focus-visible, fim da página | ≤ 800 px e zoom 200% | Atalho para `/orcamento/` | Não cobrir conteúdo nem controles | 194 × 46 px, contraste 4,92:1 (claro) e 9,63:1 (escuro); cobre o rodapé e passa sobre o carrossel e os CTAs ao rolar (`UX-62-004`) | Visual |

### 3.3 `/possibilidades/`

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `.model-demo-toggle` (4) | Botão | oculto, pausar, retomar, movimento reduzido | 390, 1440 | Pausar a demonstração animada | Pausa; some com movimento reduzido | Aparece quando o SVG animado carrega; alterna "Pausar/Retomar demonstração <nome>"; com movimento reduzido volta ao PNG e o botão fica oculto | `aria-pressed` + rótulo |
| `.area-choice` (Alimentação, Arte & design, Fotografia & mídia, Saúde, Tecnologia) | Botão (filtro) | default, pressionado, hover, focus-visible, Enter, Espaço | Todas | Filtrar exemplos por área | Mostra só o painel da área | Enter e Espaço selecionam; um painel por vez; 165 × 110 px em 390; sem JS todos os painéis ficam visíveis | `aria-pressed` em `role="group"` rotulado |
| `.area-example` (10 links) | Link externo | default, hover, focus-visible | Todas | Abrir o site do exemplo | Nova aba, destino válido | Todos com `target="_blank"` e aviso oculto; `felipecarvalhopsi.com` falha no HTTPS (`UX-62-008`); 4 destinos sob desafio da borda (`UX-62-023`) | Texto oculto |
| `.area-empty a` "Converse sobre seu projeto" | Link | default | Todas | Estado vazio de Tecnologia | Ir a `/orcamento/` | OK (`possibilidades-filtro-tecnologia-390-claro.png`) | — |
| CTA final "Crie sua vitrine grátis →" | Link (botão) | default, tema escuro | Todas | Criar vitrine | Ir ao painel | OK; mesma caixa da Mila sem fundo no escuro (`UX-62-007`); `aria-labelledby` quebrado (`UX-62-014`) | — |

### 3.4 `/planos/`

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ofertas `.offer` (3) | Conteúdo | default, tema escuro | Todas | Comparar ofertas | Cada oferta com uma próxima ação | Só "Projeto sob medida" tem ação; a oferta gratuita não leva ao painel (`UX-62-011`) | — |
| `.offer .text-link` "Sobre customizações ↗" | Link | default, focus-visible | Todas | Ir a `/orcamento/` | Ícone coerente com link interno | Seta "↗" de link externo num link interno; 21 px de altura (`UX-62-011`) | — |
| `.faq summary` (5) | Disclosure | fechado, aberto, Enter, Espaço, focus-visible | Todas | Responder dúvidas | Abre/fecha por teclado e toque | Enter e Espaço funcionam; "+" gira 45°; 70–72 px de altura (`planos-faq-aberto-390-claro.png`, `planos-faq-aberto-390-escuro.png`) | Nativo de `details` |
| Link "Conheça o coletivo ↗" (FAQ) | Link externo | default | Todas | Ir ao site do coletivo | Nova aba | OK, com aviso oculto | Texto oculto |

### 3.5 `/orcamento/`, `/como-funciona/`, `/privacidade/`, `/termos/`

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `#contact-action` → "Falar com a Mila no WhatsApp ↗" | Link externo | carregando, carregado, falha | 390, 1280, claro/escuro | Abrir a conversa com a Mila | `wa.me` válido; estado indisponível quando falha | `https://wa.me/553131890669?text=…` válido e codificado; mensagem "Olá, Mila! Eu estava vendo a Vitrine Inspira e fiquei interessado em fazer um orçamento." (`UX-62-019`); na falha fica para sempre em "O canal de atendimento está carregando..." (`UX-62-002`) | `aria-label` "(abre em nova aba)"; sem `aria-live` |
| `/como-funciona/` | Página | default | Todas | Explicar as 3 etapas | Terminar com uma próxima ação | Nenhum link no conteúdo, só cabeçalho e rodapé (`UX-62-010`) | — |
| Links internos de `/termos/` (planos, exclusão de dados) | Link | default | Todas | Navegação entre documentos | Destinos existem | OK (`/planos/`, `/privacidade/#exclusao-dados`) | — |
| Links da `/privacidade/` (painel, site do coletivo) | Link | default | Todas | Orientar a exclusão de dados | Destinos corretos | `href` corretos; destinos sob desafio da borda (`UX-62-023`) | — |

### 3.6 Rodapé e bolinha fixa

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Rodapé compacto: texto "Coletivo Inspira" | Link | default, hover | Todas | Ir ao site do coletivo | Mesmo comportamento do logo | Abre na mesma aba; o logo abre em nova aba (`UX-62-018`) | — |
| Rodapé: logo `coletivo-inspira.svg` | Link (imagem) | default, tema escuro | Todas | Ir ao site do coletivo | Versão inversa no escuro | Mesma imagem nos dois temas, quase invisível no escuro (`UX-62-012`) | `alt` "Coletivo Inspira" |
| Rodapé: "Privacidade · Termos de uso" | Link | default | Só em `/privacidade/` e `/termos/` | Acesso aos documentos legais | Presente em todas as páginas | Ausente nas 5 páginas de descoberta (`UX-62-005`) | — |
| `a.inspira-orb` (bolinha) | Link fixo (canvas) | repouso, hover, focus-visible, toque, movimento reduzido, claro/escuro | 5 páginas de descoberta; todas as larguras | Assinatura do coletivo, leva a `https://inspira.dev.br/` | Reage a hover/foco; estática com movimento reduzido | 64 × 64 px no canto inferior esquerdo; hover mostra o "+" (opacidade 1, escala 1); foco por Shift+Tab mostra anel duplo verde/lima; com movimento reduzido o canvas para (assinatura idêntica após 700 ms) e o "+" aparece sem escala; com `hover: none` o "+" fica a 0,85; ausente em `/privacidade/` e `/termos/` | `aria-label` "Coletivo Inspira — ir ao site oficial" (`orb-hover-1440-claro-normal.png`, `orb-foco-1440-claro-normal.png`, `orb-foco-1440-claro-reduzido.png`, `orb-foco-1440-escuro-normal.png`) |

## 4. Matriz de cenários da jornada

Legenda: `executado` (medido e capturado), `parcial` (medido com limite
registrado), `bloqueado`, `n/a`.

| Página | 360 | 390 | 768 | 1024 | 1440 | Horizontal | Zoom 200% | Claro | Escuro | Teclado | Movimento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |
| `/como-funciona/` | executado | executado | executado | executado | executado | executado | executado | executado | executado | parcial | n/a (sem animação própria) |
| `/possibilidades/` | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |
| `/planos/` | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | n/a (só o "+" do FAQ) |
| `/orcamento/` | executado | executado | executado | executado | executado | executado | executado | executado | executado | parcial | n/a |
| `/privacidade/` | executado | executado | executado | executado | executado | executado | executado | executado | executado | parcial | n/a |
| `/termos/` | executado | executado | executado | executado | executado | executado | executado | executado | executado | parcial | n/a |
| Bolinha fixa | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |
| Destinos externos | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | — | — | — | — |

Resultados transversais medidos em todas as páginas e larguras:

- **Rolagem lateral**: nenhuma em 360, 390, 768, 1024, 1440 e zoom 200%. Na
  horizontal `844×390` o documento tem 871 px de largura (`UX-62-003`).
- **Contraste**: o cálculo automático (cor do texto contra o fundo efetivo,
  ignorando texto sobre imagens) não encontrou texto nem controle abaixo de AA
  nos temas claro e escuro, em 390 e 1440. Os pares de maior risco medidos:
  pílula fixa 4,92:1 (claro) e 9,63:1 (escuro).
- **Foco**: contorno laranja de 3 px com afastamento de 5 px em todos os
  controles da home (30 paradas de Tab em 1440 e 390); a bolinha usa anel
  duplo próprio. A ordem segue a leitura: pular conteúdo, logo, navegação,
  tema, ações do hero, carrossel, cartões, Mila, rodapé, pílula e bolinha.
  "Parcial" nas páginas sem controles próprios indica que só cabeçalho e
  rodapé foram percorridos.
- **Toque**: alvos de menu, filtros, FAQ, carrossel, tema e bolinha ≥ 44 px.
  Abaixo de 44 px ficam links de texto e os links do menu desktop (`UX-62-017`).
- **Termos proibidos**: nenhum no texto das páginas estáticas. Aparecem em
  imagem (`UX-62-021`) e no conteúdo institucional simulado (`UX-62-001`).
- **Redirecionamento de âncoras antigas**: `/#duvidas` → `/planos/#duvidas`,
  `/#contato` → `/orcamento/`, `/#planos` → `/planos/`.
- **Transparência reduzida**: verificada só no código (`web/styles.css:5` troca o
  vidro do cabeçalho por superfície sólida); o Chrome headless não emula
  `prefers-reduced-transparency`.

## 5. Achados

| ID | Issue | Severidade | Natureza | Eixo | Descrição e Evidência | Critério de Aceite | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UX-62-001` | `#62` | `P1` | `risco_codigo` | `navegacao` | Ao publicar o conteúdo institucional, `applyPlatformCms` (`web/app.js:200-269`) quebra o site. Simulando a publicação das seções-semente: (1) a seção de abertura da home vai para o fim do `main`, porque `#contato` não existe mais na home e `insertBefore(root, null)` anexa ao final (`web/app.js:202,210`); (2) o título perde a marca "V" e o subtítulo-semente traz dois termos proibidos (migração `202611120006…sql:32`); (3) na primeira seção sem alvo na página (`areas_showcase` na home; `hero` nas outras) `root` é `null` e o laço para com `TypeError`, engolido pelo `catch` (`web/app.js:205-210,271-278`). Na prática, as seções de planos, dúvidas, navegação e rodapé nunca chegam às páginas novas. Captura `cms-semente-home-1280-claro.png` | Com as 10 seções publicadas, a home mantém a abertura no topo; nenhuma página dispara exceção; cada seção só é aplicada na página que tem o alvo; o texto-semente não contém termos proibidos (teste automatizado sobre a resposta da API) | Aberto |
| `UX-62-002` | `#62` | `P1` | `problema_confirmado` | `feedback` | Sem canal de contato, `/orcamento/` fica para sempre em "O canal de atendimento está carregando...", sem ação alternativa. Acontece quando `/data/contact.json` falha ou quando o build roda sem telefone configurado (`scripts/build.mjs:34,55` grava `href: null`). O texto inicial está em `web/orcamento/index.html:63` e só é trocado se houver contato (`web/app.js:78-85`). Contradiz `docs/marketing-design.md:141-142` ("mostrar estado indisponível"). Captura `orcamento-falha-contato-390-claro.png` | Com `contact.json` em erro ou `href: null`, a página mostra em até 5 s uma mensagem de indisponibilidade com outro caminho (por exemplo, criar a vitrine no painel); a região de status é anunciada (`role="status"`) | Aberto |
| `UX-62-003` | `#62` | `P2` | `problema_confirmado` | `navegacao` | Entre 801 e ~900 px o cabeçalho de desktop não cabe: o botão de tema sai da caixa do cabeçalho (borda direita em 871 px), o documento ganha rolagem lateral até 870 px e "Criar minha vitrine" quebra em 3 linhas até ~980 px. A troca para o menu móvel só acontece em 800 px (`web/styles.css:60`). Afeta tablet na horizontal e janelas estreitas. Capturas `cabecalho-844-claro-desktop.png`, `home-horizontal-claro-dobra.png` | De 801 a 1100 px: `scrollWidth === innerWidth`, botão de tema dentro do cabeçalho e rótulos da navegação em uma linha (ou menu compacto até o ponto em que caibam) | Aberto |
| `UX-62-004` | `#62` | `P2` | `problema_confirmado` | `navegacao` | Em ≤ 800 px a pílula fixa "Orçamento com a Mila" (`web/styles.css:120-123`) e a bolinha ocupam os dois cantos inferiores sem espaço reservado. No fim da página a pílula cobre o texto e o link do rodapé; ao rolar, passa sobre os controles do carrossel e sobre os CTAs. Contradiz `docs/marketing-design.md:155-157` ("evitar camadas fixas sobrepostas"). Capturas `rodape-orb-orcamento-390-claro.png`, `home-390-claro-dobra.png`, `menu-aberto-390-claro.png` | Em 360 e 390, rolando até o fim, nenhum link nem texto do rodapé fica sob a pílula ou a bolinha (reserva inferior ≥ altura da pílula + 16 px); um controle focado nunca fica coberto | Aberto |
| `UX-62-005` | `#62` | `P2` | `problema_confirmado` | `navegacao` | `/privacidade/` e `/termos/` só são alcançáveis uma pela outra. O rodapé das 5 páginas de descoberta não tem esses links (ex.: `web/index.html:120-129`), contrariando `docs/marketing-design.md:139` ("links de privacidade/termos reais"). Também afeta a prontidão para a Meta, que exige política acessível | Todas as páginas públicas trazem no rodapé links para `/privacidade/` e `/termos/`, alcançáveis por teclado | Aberto |
| `UX-62-006` | `#62` | `P2` | `problema_confirmado` | `movimento` | Com movimento reduzido o carrossel começa com "Retomar troca automática" pressionado; ao acionar, o estado e o rótulo mudam para "Pausar", mas nada acontece, porque `schedule()` exige `!reduced.matches` (`web/app.js:130,140`). O controle anuncia uma ação que não ocorre. Captura `carrossel-reduzido-retomar-1440-claro.png` (continua em `01 / 04` após 6,5 s) | Com movimento reduzido, ou o botão de pausa fica oculto/desabilitado com explicação, ou "Retomar" de fato retoma a troca sem animação | Aberto |
| `UX-62-007` | `#62` | `P2` | `problema_confirmado` | `conta_tema` | No tema escuro, `.mila-cta-content` (home e possibilidades) e `.mila-card` (orçamento) usam `--dark-surface`, `--dark-line` e `--dark-ink-soft`, que não existem (`web/styles.css:108,111,126,129`). Resultado medido: fundo transparente, borda em `rgb(247,247,244)` (cor do texto) e parágrafo sem o tom suave. Capturas `home-mila-cta-1280-escuro.png`, `orcamento-contato-1280-escuro.png`, `home-375-escuro.png` | No escuro, as duas caixas têm fundo de superfície do tema, borda `var(--line)` e texto secundário em `var(--ink-soft)` | Aberto |
| `UX-62-008` | `#62` | `P2` | `problema_confirmado` | `navegacao` | O exemplo "Felipe Carvalho" (`web/possibilidades/index.html:206`) aponta para `https://felipecarvalhopsi.com/`, que responde com o certificado `*.github.io` (erro de nome no TLS); só o `http://` responde `200`. Quem clica vê um alerta de segurança do navegador | `curl -sI https://felipecarvalhopsi.com/` responde sem erro de certificado, ou o exemplo é retirado até corrigir | Bloqueado HITL |
| `UX-62-009` | `#62` | `P2` | `problema_confirmado` | `navegacao` | Quatro páginas não têm `h1` e começam em `h2`: `web/como-funciona/index.html:59`, `web/possibilidades/index.html:61`, `web/planos/index.html:61`, `web/orcamento/index.html:60`. Prejudica a navegação por títulos em leitores de tela | Cada página pública tem exatamente um `h1` que descreve a página | Aberto |
| `UX-62-010` | `#62` | `P2` | `critica_ux` | `navegacao` | `/como-funciona/` termina sem próxima ação: depois das 3 etapas não há link para criar a vitrine, ver possibilidades ou planos (`web/como-funciona/index.html:57-85`). A página é curta e deixa quase toda a tela vazia em 1280. Captura `como-funciona-1280-escuro.png` | A página termina com uma chamada para criar a vitrine e um link secundário para possibilidades ou planos | Aberto |
| `UX-62-011` | `#62` | `P2` | `critica_ux` | `navegacao` | Em `/planos/`, a oferta gratuita (`web/planos/index.html:74`) só mostra "Gratuita", sem botão para o painel; a dúvida "Como posso criar a minha vitrine?" diz "Basta acessar o portal" sem link (`:111`); "Sobre customizações ↗" usa seta de link externo para uma página interna (`:96`). O limite de itens do plano básico (20 ativos e 100 no total) só aparece em `/termos/` | A oferta gratuita tem CTA "Criar minha vitrine"; a resposta da dúvida tem link para o painel; o ícone de links internos é "→"; o limite do plano básico aparece em `/planos/` | Aberto |
| `UX-62-012` | `#62` | `P3` | `problema_confirmado` | `conta_tema` | O logo do coletivo no rodapé usa `coletivo-inspira.svg` nos dois temas (ex.: `web/index.html:125`); no escuro fica verde-escuro sobre `#171e1a`, quase invisível. Existe `coletivo-inspira-inverse.svg`, e `DESIGN.md:222` pede versão inversa no rodapé escuro. Captura `como-funciona-1280-escuro.png` | No tema escuro o rodapé mostra a versão inversa do logo | Aberto |
| `UX-62-013` | `#62` | `P3` | `problema_confirmado` | `navegacao` | Em 360 px o cabeçalho quebra em duas linhas: tema e menu descem para baixo do logo e a caixa chega a 114 px de altura. Captura `home-360-claro-dobra.png` | Em 360 px logo, tema e menu cabem em uma linha (cabeçalho ≤ 80 px) | Aberto |
| `UX-62-014` | `#62` | `P3` | `problema_confirmado` | `navegacao` | Em `/possibilidades/`, a seção final usa `aria-labelledby="teasers-title"` (`web/possibilidades/index.html:245`), mas o id não existe na página: a região fica sem nome acessível | Todo `aria-labelledby` aponta para um id existente na mesma página | Aberto |
| `UX-62-015` | `#62` | `P3` | `critica_ux` | `feedback` | No carrossel, a contagem `01 / 04` muda sem anúncio (sem `aria-live`) e o total "04" está fixo no código (`web/app.js:160`): se o número de lâminas mudar, a contagem fica errada | A contagem é anunciada de forma educada (`aria-live="polite"`) após "Mostrar próxima vitrine" e usa o total real de lâminas | Aberto |
| `UX-62-016` | `#62` | `P3` | `critica_ux` | `navegacao` | O menu móvel não fecha com toque fora (`afterOutsideClick: "true"` no roteiro) e a página atual não tem destaque visual: `aria-current="page"` existe, mas não há estilo para ele em `web/styles.css` | Toque fora do menu aberto fecha o menu; o link da página atual tem destaque visual nos dois temas | Aberto |
| `UX-62-017` | `#62` | `P3` | `critica_ux` | `navegacao` | Alvos abaixo da meta de 44 px do projeto (`docs/marketing-design.md:157`): links do menu desktop com 22 px de altura, links de texto da home com 26 px, "Sobre customizações" com 21 px, link do carrossel com 19 px em 360. Pelo espaçamento passam no critério 2.5.8 da WCAG 2.2, mas ficam abaixo da meta | Links de navegação e de ação com área clicável ≥ 44 px de altura (padding), sem mudar o visual | Aberto |
| `UX-62-018` | `#62` | `P3` | `critica_ux` | `navegacao` | A bolinha leva a `https://inspira.dev.br/` na mesma aba, sem indicar que sai da Vitrine. No rodapé, o texto "Coletivo Inspira" abre na mesma aba e o logo, ao lado, em nova aba (mesmo destino, comportamentos diferentes) | Os links para o coletivo têm comportamento único e o rótulo indica a saída do site | Aberto |
| `UX-62-019` | `#62` | `P3` | `critica_ux` | `formularios` | A mensagem pronta do WhatsApp fixa o gênero: "fiquei interessado em fazer um orçamento" (`src/portfolio.mjs:31`) | A mensagem usa forma neutra, por exemplo "tenho interesse em fazer um orçamento", mantendo a codificação do `href` | Aberto |
| `UX-62-020` | `#62` | `P3` | `critica_ux` | `navegacao` | Três nomes para o mesmo destino: "Entrar" (menu), "entrar no portal" (`web/index.html:65`, `web/planos/index.html:111`) e "painel" (`web/privacidade/index.html`) | O site usa um único nome para a área do dono da vitrine (sugestão: "painel") | Aberto |
| `UX-62-021` | `#62` | `P3` | `critica_ux` | `navegacao` | A captura do site Pastus (primeira lâmina do carrossel da home e primeiro exemplo de Alimentação) mostra, dentro da imagem, um título com termo proibido. É imagem de site real, não texto da Vitrine, mas é a primeira coisa vista na home. Captura `home-1280-claro.png` | A imagem de destaque é recortada ou substituída para não exibir termo proibido | Aberto |
| `UX-62-022` | `#62` | `P3` | `nao_verificado` | `movimento` | Estado de repouso da bolinha em desktop com mouse: pelo código, o "+" fica invisível (`opacity: 0`) e só aparece em hover/foco; o headless informa `hover: none` e mostra o "+" a 0,85 | Em navegador desktop com mouse, o "+" fica invisível em repouso e aparece em hover e foco | Aberto |
| `UX-62-023` | `#62` | `P2` | `nao_verificado` | `navegacao` | Destinos da descoberta respondem `403` com `cf-mitigated: challenge` a partir da VM: `painel.inspira.dev.br` (todos os "Criar"/"Entrar"), `inspira.dev.br` (bolinha e rodapé) e quatro exemplos (`nathaliaverri`, `cacia`, `aldeiamix`, `fantaze` `.inspira.dev.br`). Os demais exemplos externos responderam `200` | Depois de `BLK-UX-61-PROD`, os destinos respondem `200` e o clique em "Criar minha vitrine" chega à tela de login do painel | Bloqueado HITL |

**Contagem**: 23 achados — `P0`: 0 · `P1`: 2 · `P2`: 10 · `P3`: 11.
Natureza: 11 `problema_confirmado`, 1 `risco_codigo`, 9 `critica_ux`,
2 `nao_verificado`.

### 5.1 Verificado sem problema

- Pular conteúdo, foco visível, `Esc` no menu com retorno do foco, `aria-expanded`
  e rótulos dinâmicos do menu, do tema, do carrossel e das demonstrações.
- Carrossel: troca automática a cada 5 s, pausa em hover/foco, pausa manual
  persistente, avanço manual, `aria-hidden` nas lâminas de trás.
- Filtros por área e FAQ operáveis por Enter e Espaço; filtros com
  `aria-pressed` em grupo rotulado e conteúdo completo sem JavaScript.
- Demonstrações: SVG animado com botão de pausa; com movimento reduzido voltam
  ao PNG estático e escondem o botão.
- Bolinha: hover e foco revelam o "+", anel de foco duplo, canvas parado com
  movimento reduzido, segue só ponteiro de mouse, 64 × 64 px.
- Tema: segue o sistema até haver escolha; escolha persiste entre páginas.
- Contato: `href` `https://wa.me/553131890669?text=…` passa pela validação de
  `safeContactUrl` (`web/app.js:59-66`), com texto codificado, `target="_blank"`,
  `rel="noopener noreferrer"` e aviso de nova aba.
- Links externos de exemplos com `rel="noopener noreferrer"` e aviso oculto.

## 6. Bloqueios e checklist de aceite

| Código | Bloqueio | Checklist de aceite (ação humana) |
| --- | --- | --- |
| `BLK-UX-61-PROD` (da `#61`) | Desafio da borda em `painel.inspira.dev.br`, `inspira.dev.br` e quatro exemplos `*.inspira.dev.br` (`UX-62-023`) | [ ] Lino libera as rotas públicas na Cloudflare ou confirma que o desafio é intencional · [ ] `curl -sI` nos 6 destinos responde `200` · [ ] repetir os cenários de destino desta seção em produção |
| `BLK-UX-62-TLS` | `felipecarvalhopsi.com` sem certificado próprio no HTTPS (`UX-62-008`) | [ ] Dono do site ativa o HTTPS do domínio personalizado no GitHub Pages (ou equivalente) · [ ] `curl -sI https://felipecarvalhopsi.com/` sem erro de certificado · [ ] se não houver correção, retirar o exemplo de `/possibilidades/` |
| `BLK-UX-62-CMS` | Conteúdo institucional real depende de Worker + Supabase (`UX-62-001` foi simulado) | [ ] Com `BLK-UX-61-PROD` resolvido, publicar uma seção de teste pelo painel de plataforma (`#72`) · [ ] conferir a home e `/planos/` em produção e o console sem exceções |

## 7. Recomendações (backlog nos 5 eixos)

- **navegacao**
  1. Reescrever o mapeamento do conteúdo institucional por página
     (`UX-62-001`): cada página declara as seções que aceita, o laço ignora
     alvos ausentes e a abertura nunca muda de lugar. Revisar o texto-semente
     da migração antes de qualquer publicação.
  2. Reservar o canto inferior para as camadas fixas (`UX-62-004`): `padding-bottom`
     no rodapé em ≤ 800 px ou esconder a pílula quando o rodapé ou o CTA da
     Mila estiver visível.
  3. Levar o ponto de troca do menu para ~1000 px ou compactar a navegação
     (`UX-62-003`, `UX-62-013`).
  4. Rodapé com "Privacidade · Termos de uso" em todas as páginas (`UX-62-005`).
  5. Um `h1` por página (`UX-62-009`), `aria-labelledby` válido (`UX-62-014`) e
     estilo para `aria-current` (`UX-62-016`).
  6. Fechar "Como funciona" e "Planos" com próximas ações (`UX-62-010`, `UX-62-011`).
- **feedback**
  1. Estado "contato indisponível" com alternativa e `role="status"` (`UX-62-002`).
  2. Contagem do carrossel anunciada e calculada (`UX-62-015`).
- **movimento**
  1. Com movimento reduzido, esconder o botão de pausa do carrossel ou fazer
     "Retomar" funcionar sem animação (`UX-62-006`).
- **conta_tema**
  1. Trocar as variáveis inexistentes por `var(--white)`/`var(--line)`/`var(--ink-soft)`
     (`UX-62-007`) e usar o logo inverso do coletivo no rodapé escuro (`UX-62-012`).
- **formularios**
  1. Mensagem do WhatsApp em forma neutra (`UX-62-019`).

## 8. Como reproduzir

```bash
cd <worktree> && npm ci --engine-strict=false && npm run build
PORT=4182 npm run preview
# No Context do projeto:
node internal/auditoria-ux/mock-62.mjs http://127.0.0.1:4182 media/auditoria-ux/62-descoberta /tmp/aud62.json
node internal/auditoria-ux/mock-62-extra.mjs http://127.0.0.1:4182 media/auditoria-ux/62-descoberta
curl -sI https://felipecarvalhopsi.com/   # erro de certificado (UX-62-008)
```
