---
name: Vitrine Inspira — divulgação
description: Base neutra, tipografia expressiva e laranja pontual.
colors:
  primary: "#C74414"
  brand-lime: "#BAFF29"
  brand-forest: "#133824"
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
`vitrine-inverse.svg` fica disponível como variante de reserva, sem uso nesta página.
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
