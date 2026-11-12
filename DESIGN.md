---
name: Vitrine Inspira — divulgação
description: Base neutra, tipografia expressiva e laranja pontual.
colors:
  primary: "#C74414"
  brand-lime: "#BAFF29"
  brand-forest: "#133824"
  dark-paper: "#171E1A"
  dark-surface: "#202A23"
  dark-ink: "#F7F7F4"
  dark-ink-soft: "#B9C5BD"
  dark-action: "#FFB18A"
  dark-action-hover: "#FFC4A7"
  dark-apricot: "#33291F"
  dark-line: "#45544A"
  primary-hover: "#A9360E"
  paper: "#F7F7F4"
  ink: "#27322E"
  ink-soft: "#56615B"
  apricot: "#FBEDE5"
  line: "#DDDCD6"
  white: "#FFFFFF"
  offer-surface: "#F0EFE9"
typography:
  display:
    fontFamily: "Syne, sans-serif"
    fontSize: "clamp(3.75rem, 6.6vw, 6rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Syne, sans-serif"
    fontSize: "clamp(2rem, 3.4vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Syne, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.025em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "16px"
    lineHeight: 1.6
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 600
rounded:
  control: "7px"
  surface: "12px"
  status: "4px"
spacing:
  base: "8px"
  content-gap: "24px"
  section: "96px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "13px 24px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-small:
    padding: "10px 21px"
    height: "44px"
  contact-panel:
    backgroundColor: "{colors.apricot}"
    rounded: "{rounded.surface}"
    padding: "64px 72px"
---

# Design System: Vitrine Inspira — divulgação

## Overview

**Creative North Star: "Uma vitrine com espaço para respirar"**

A direção aprovada A — Laranja pontual combina superfícies claras, texto carvão e ações quentes. A personalidade vem da Syne, do espaço generoso e da assinatura oficial do Coletivo Inspira. O laranja orienta a atenção sem transformar toda a página em uma área saturada.

Este registro descreve o HTML/CSS do site de divulgação, não um sistema do painel ou dos sites de clientes. O usuário rejeitou o excesso de verde, as grandes áreas de cor intensa e as sombras fortes do estudo anterior. Logo e Orb oficiais preservam suas cores e proporções; o tratamento da Vitrine não modifica o brandbook global.

**Key Characteristics:**
- Base neutra e cor concentrada nas ações.
- Títulos expressivos e leitura simples.
- Divisórias finas e profundidade discreta.
- Demonstrações identificadas como ilustrações.

## Colors

Tema claro/escuro: controle sol/lua no cabeçalho, alvo de 44 px. Na primeira
visita segue `prefers-color-scheme`; a escolha explícita fica em `vitrine-theme`
no localStorage. Sem acesso ao armazenamento, funciona durante a visita.
`theme.js` aplica o tema antes do CSS; sem JavaScript, a página continua clara
e o controle fica oculto. O modo escuro usa os tokens dark do frontmatter,
com ações em pêssego e texto escuro, painéis floresta e texto branco quebrado.
Screenshots dos sites de clientes mantêm suas cores originais.
As letras da logo e o endosso ficam #F7F7F4 no escuro; a caixa lima e o V
verde-floresta permanecem, assim como a Orb oficial. Versão animada inversa
no cabeçalho e inversa estática no rodapé.

A paleta normativa está no frontmatter; os nomes abaixo descrevem seu emprego.

### Primary
- **Laranja pontual:** ações principais, foco de teclado, links em destaque e pequenos marcadores; sua versão mais escura atende ao hover.

### Neutral
- **Papel claro:** fundo predominante.
- **Carvão vegetal:** títulos e texto principal.
- **Carvão suave:** apoio, notas e legendas.
- **Damasco leve:** fundo do contato, estado de preparação e camada atrás da demonstração.
- **Linha mineral:** divisórias e contornos discretos.
- **Branco:** texto dos botões e superfície da moldura demonstrativa.
- **Areia de oferta:** faixa que agrupa as propostas comerciais.

**The Laranja Pontual Rule.** Concentre a cor de ação nos controles e detalhes; preserve o predomínio neutro aprovado.

## Typography

**Display Font:** Syne, com sans-serif de fallback.
**Body Font:** DM Sans, com sans-serif de fallback.

As fontes variáveis são locais, com `font-display: swap`. A Syne traz presença aos títulos e a DM Sans mantém controles e explicações legíveis. Não há família mono.

### Hierarchy
- **Display:** chamada principal, limitada a cerca de 10ch no desktop; o frontmatter registra seu tamanho base. Em 1100px usa `clamp(3.5rem,7vw,5rem)`; em 800px, `clamp(3.4rem,10.8vw,5.5rem)`; em 520px, `clamp(3.25rem,12.6vw,4rem)` com entrelinha 1.04.
- **Headline:** títulos de seção, com até 24ch; o contato usa uma escala maior (`clamp(2.2rem,4vw,3.5rem)`).
- **Title:** títulos das possibilidades; ofertas usam Syne semibold (25px/1.2).
- **Body:** base normativa no frontmatter; apoio do hero usa 20px/1.55 e até 38ch, reduzindo a 18px e 17px nos breakpoints menores.
- **Label:** navegação semibold; legendas e notas variam entre 11px e 13px. O pequeno texto das miniaturas pertence à ilustração, não à interface funcional.

## Layout

Contêiner central com largura máxima de 1240px e margem total de 96px. Essa margem total passa a 64px em 1100px, 48px em 800px e 40px em 520px. Seções usam respiro vertical de 96px, reduzido a 76px, 60px e 50px nesses mesmos limites. O token base é 8px; a composição também emprega ajustes ópticos fora dessa malha.

O hero tem duas colunas (1fr / 1.05fr), intervalo de 64px e uma malha pontilhada discreta. Processo e possibilidades usam três colunas; a FAQ usa duas colunas assimétricas. Em 800px, hero, processo e FAQ se empilham; possibilidades assumem imagem e texto lado a lado e se tornam totalmente verticais em 520px. Ofertas passam de três colunas a uma em 520px.

## Elevation & Depth

A página é predominantemente plana, com profundidade restrita às prévias ilustrativas. Contornos e mudanças de tom organizam FAQ, processo e ofertas. Não existe material de vidro ou blur aplicado na implementação atual.

### Shadow Vocabulary
- **Prévia principal** (`0 18px 42px -18px #49372935`): sombra ambiente da moldura do navegador demonstrativo, com rotação estática de 1 grau.
- **Miniatura** (`0 5px 18px -10px #49372935`): relevo discreto das possibilidades ilustradas.

**The Profundidade Discreta Rule.** Preserve sombras suaves nas demonstrações; não reinstale as sombras fortes rejeitadas.

## Shapes

Controles têm cantos suaves; painéis e moldura usam o raio de superfície do frontmatter. Miniaturas usam 8px, menu compacto 6px e indicadores circulares. Linhas de separação têm 1px. A seção de contato reduz o raio a 10px no menor breakpoint. A malha pontilhada usa repetição de 22px e baixa opacidade.

## Components

### Revisão de abertura, áreas e rodapé

Na chamada “Seu negócio, em vitrine.”, apenas o primeiro v de vitrine é o símbolo
de duas lâminas sem caixa: floresta/menta no claro, lima/menta no escuro. A marca
do cabeçalho continua na caixa aprovada. SVG inline decorativo, letra v disponível
à leitura assistiva; dimensões .63em×.59em, alinhado à linha de base.

Possibilidades agora usa cinco seletores de área com V bicolor: Alimentação
(laranja/mostarda), Arte & design (rosa/mostarda), Fotografia & mídia
(floresta/lima), Saúde (floresta/menta) e Tecnologia (azul/ciano, extensão do produto).
No escuro, floresta dos símbolos de fotografia/saúde vira menta; saúde usa
branco quebrado na segunda lâmina. Grade de cinco seletores no desktop e dois
em até 520 px; exemplos em três colunas, duas em até 800 px e uma em até 520 px.
São três exemplos de alimentação, dois de arte, um de fotografia/mídia e quatro
de saúde. Seleção por botão aria-pressed em grupo rotulado;
sem JS todos os grupos ficam visíveis. Tecnologia tem estado vazio, sem case fictício.

Rodapé compacto substitui a composição anterior: somente copyright de 2026,
link do coletivo e respiro à esquerda para a Orb fixa. Sem voltar ao início,
“Sobre esta página” ou slogan. Estas regras substituem as descrições anteriores
de navegação no rodapé e de três categorias por formato.

### Trilha do ponteiro

Rastro decorativo derivado do DotTrail oficial do brandbook, carregado localmente.
Grade de 22 px, nós de até 8 px e conexões ortogonais de até 3 px, até 40 segmentos,
desaparecimento em 700 ms. Menta #A3E5C2 com multiply no claro e lima #BAFF29 com
screen no escuro. Canvas fixo, sem eventos de clique e oculto da acessibilidade.
Desativado com movimento reduzido, toque e caneta; limpa ao sair da janela,
perder foco, ocultar aba e redimensionar. Densidade do canvas limitada a DPR 2.
Sem loop de renderização quando vazio.

### Buttons

Ações claras e compactas. O botão principal usa laranja com texto branco, peso 700 e intervalo interno de 22px. A altura é mínima, permitindo expansão do conteúdo. Hover escurece o fundo e sobe 1px; active retorna à posição inicial. A variante pequena usa texto de 14px e altura mínima de 44px. Não há botão secundário preenchido: a segunda ação é um link sublinhado.

O foco global é um contorno laranja de 3px com afastamento de 5px. Transições dos botões duram 0.2s, com `cubic-bezier(.16,1,.3,1)` no deslocamento. Movimento reduzido remove transições e rolagem suave.

### Cards / Containers

Possibilidades têm miniatura ilustrada acima da legenda, sem uma caixa pesada envolvendo todo o conteúdo. Ofertas são colunas abertas com divisória superior e marcadores laranja. O painel de contato usa damasco, raio de superfície e amplo padding; no celular, seu ornamento de mais desaparece.

### Navigation

Marca oficial à esquerda, links de 14px semibold e ação pequena à direita. Hover torna links laranja. Em até 800px, o menu é vertical; quando JavaScript está ativo, um controle de 44px abre e fecha os links. Sem JavaScript, a navegação permanece visível. Não há estilo de seção ativa documentado no CSS.

### Status and Tags

O estado “Em preparação” combina superfície damasco, indicador laranja, texto de 12px semibold e raio curto. Tags das possibilidades são texto auxiliar de 11px, sem aparência de filtro ou botão.

### FAQ

`details` e `summary` nativos com divisórias finas. A linha clicável tem altura mínima de 70px (72px no menor breakpoint); o mais gira 45 graus ao abrir. Respostas usam texto de 14px e até 65ch. O foco segue o tratamento global.

### Official Signature and Illustrations

A marca própria aprovada da Vitrine é a opção A: V de duas lâminas na caixa
verde-lima, seguido de “vitrine” e endosso pequeno “coletivo inspira” abaixo,
alinhado à direita em verde-floresta. Letras em curvas derivadas do estudo
Segoe UI Bold, sem fonte adicional no navegador ou alongamento horizontal.
`vitrine.svg` é estática; `vitrine-animated.svg` abre as lâminas uma única vez em
700 ms com desaceleração e permanece estática com `prefers-reduced-motion: reduce`.
Cabeçalho usa a versão animada; rodapé usa a estática e mantém o endosso textual
do coletivo; favicon usa `vitrine-icon.svg`. Proporção 470:145, 188×58 px no desktop
e 169.2×52.2 px em larguras até 520 px, pela regra `.brand .brand-logo`.
No tema escuro, o cabeçalho usa `vitrine-animated-inverse.svg` e o rodapé usa
`vitrine-inverse.svg`; letras e endosso ficam em branco quebrado, preservando
a caixa lima e o V verde-floresta.
O novo símbolo pertence ao produto e não modifica
a marca oficial do coletivo. Títulos do site continuam Syne; corpo continua DM Sans.

O símbolo oficial `plus.svg` permanece preservado como ativo do coletivo. A Orb oficial permanece como assinatura fixa inferior esquerda, com link ao hub. Não redesenhar ou recolorir esses ativos.

O navegador de pizzaria e os mini-sites são conteúdo demonstrativo, com paletas próprias e até Georgia nos títulos. Seus falsos controles não são componentes do produto nem modelos já disponíveis. Não há inputs, formulário, checkout ou painel implementados para documentar.

## Do's and Don'ts

### Do:
- **Do** preservar a base neutra, a Syne/DM Sans e o laranja pontual aprovado.
- **Do** usar os arquivos oficiais da marca e reservar espaço para a Orb.
- **Do** manter foco visível, navegação sem JavaScript e respeito a movimento reduzido.
- **Do** identificar as prévias como ilustrações e separar seus estilos dos controles reais.

### Don't:
- **Don't** retomar grandes campos verde/lima, cor intensa ou sombras fortes rejeitadas.
- **Don't** tratar o estilo das miniaturas como sistema do futuro painel.
- **Don't** inventar campos, checkout ou estados de conta que não existem nesta superfície.
- **Don't** apresentar este registro de código como validação em navegadores ou evidência de conversão.

### Revisão de vitrines reais

Prévias reais locais substituem as ilustrações nas possibilidades. O hero reúne
quatro capturas em uma pilha de folhas com controles de pausa e avanço. O rodapé
usa superfície neutra com duas colunas e linha de apoio; a Orb oficial fica fixa
no canto inferior esquerdo, conforme solicitação posterior do usuário. Este
registro substitui a orientação anterior de montar a Orb dentro do rodapé.

---

## Portal

**Escopo estrito de superfície:** Os tokens e efeitos **Liquid Glass** definidos nesta seção aplicam-se **exclusivamente ao portal administrativo** (`web/portal/` / `painel.inspira.dev.br/portal`). O site de divulgação (`web/index.html` e `web/styles.css`) e a página `404.html` **mantêm estritamente a direção "no glass"** (superfícies sólidas sem `backdrop-filter`), **exceto pelo cabeçalho flutuante (`header.site-header.wrap`)** que utiliza elementos Liquid Glass para um design translúcido e premium.

### Referências e Identidade
- **Base funcional e composição:** seção "Vitrine de soluções" e pilares do hub `inspira.dev.br` (cards com linha superior de categoria e status, eyebrow, título, descrição, rodapé com tags e filtros em pílula).
- **Estética de material:** superfícies translúcidas em estilo Liquid Glass com luz suave, paleta quase monocromática em floresta e grafite, botões arredondados em pílula e composição equilibrada.
- **Tipografia e Marca:** `Syne` (títulos) e `DM Sans` (corpo, controles e tabelas) permanecem inalteradas. A caixa verde-lima com o V em duas lâminas e as variantes oficiais da logo (`vitrine-animated.svg` no claro e `vitrine-animated-inverse.svg` no escuro) não mudam.

### Paleta Monocromática Floresta/Grafite e Único Acento
- **Base e atmosfera:** tons neutros de floresta e grafite, iluminados por gradientes radiais discretos no fundo da aplicação (sem cores vivas ou saturadas no plano de fundo).
- **Acento único:** laranja (`#C74414`, hover `#A9360E`) no tema claro e pêssego (`#FFB18A`, hover `#FFC4A7`, texto escuro `#171E1A` / `#231B15`) no tema escuro. Nenhuma cor secundária de ação (como azul de terceiros) deve competir com o acento único.
- **Contraste mínimo:** todo texto sobre superfícies translúcidas ou sólidas deve atingir no mínimo **WCAG AA** (`4.5:1` para texto normal e `3:1` para texto grande e componentes de interface).

### Tokens de Superfície Liquid Glass (`web/portal/portal.css`)
- **Variáveis de material:**
  - Tema claro: `--glass: 255 255 255`, `--glass-border: rgb(255 255 255 / .68)`, `--glass-highlight: inset 0 1px 0 0 rgb(255 255 255 / .75)`, `--glass-shadow: 0 20px 48px -20px rgb(19 56 36 / .14)`.
  - Tema escuro (`[data-theme="dark"]`): `--glass: 32 42 35`, `--glass-border: rgb(247 247 244 / .14)`, `--glass-highlight: inset 0 1px 0 0 rgb(247 247 244 / .12)`, `--glass-shadow: 0 24px 52px -20px rgb(0 0 0 / .55)`.
- **Regra padrão da superfície de vidro:**
  - `background: rgb(var(--glass) / .55);`
  - `backdrop-filter: blur(20px) saturate(140%);`
  - `-webkit-backdrop-filter: blur(20px) saturate(140%);`
  - `border: 1px solid var(--glass-border);`
  - `box-shadow: var(--glass-highlight), var(--glass-shadow);`

### Fallbacks Obrigatórios de Transparência e Suporte
- **Sem suporte a `backdrop-filter`:**
  - `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` troca o fundo das superfícies `.glass-surface` / `.portal-card` / `.app-sidebar` / `.editor-action-bar` por superfície sólida (`background: var(--white)` no claro e `#202A23` no escuro).
- **Preferência de transparência reduzida:**
  - `@media (prefers-reduced-transparency: reduce)` remove `backdrop-filter` / `-webkit-backdrop-filter` e aplica superfície sólida com `background: var(--white)` (claro) ou `#202A23` (escuro) e borda `1px solid var(--line)`.

### Formas, Ergonomia e Segurança
- **Raios de superfície:** `20px` a `28px` (`--radius-portal-surface: 24px`, cards compactos `20px`, painéis principais e barra flutuante `28px`).
- **Botões e chips em pílula:** `border-radius: 999px` em botões de ação, seletores de aba, filtros e chips de interesse.
- **Acessibilidade e movimento:** foco de teclado visível (`outline: 3px solid var(--orange); outline-offset: 4px`), alvos de toque e clique com mínimo de `44×44px` e respeito integral a `@media (prefers-reduced-motion: reduce)`.
- **Segurança e custo zero:** manutenção estrita de `script-src 'self'` sem scripts inline, gráficos de Insights construídos em SVG e CSS próprios e zero dependências pagas.

