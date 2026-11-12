# Campanha “profundidade e movimento” — pesquisa e roteiro

Especificação: [`specs/015-campanha-movimento/spec.md`](../../specs/015-campanha-movimento/spec.md).
Acervo: [`carrossel-instagram/2026-11-profundidade-e-movimento/`](../../carrossel-instagram/2026-11-profundidade-e-movimento/README.md).

## Objetivo

Apresentar a Vitrine a pequenos negócios e profissionais, mostrar quatro usos e
levar a `vitrine.inspira.dev.br`. Uma ação concreta logo na abertura, um benefício
por cena e uma chamada única no fim.

## Direção visual

- Paleta do [brandbook](https://brandbook.inspira.dev.br/) (ver
  [`docs/design/brandbook-reference.md`](../design/brandbook-reference.md)):
  floresta `#133824` como tinta e fundo das capas, branco quebrado `#F7F7F4` nas
  demonstrações, lima `#BAFF29` para seleção e ação, menta `#A3E5C2` em
  superfícies e luz de borda, mostarda `#E5A93C` só no selo do diploma e no
  ponto da etiqueta “Demonstração ilustrativa”.
- Syne nos títulos, DM Sans no corpo e nos valores (algarismos tabulares).
- Logo vetorial original (`web/assets/brand/vitrine.svg` e `vitrine-inverse.svg`),
  plana. O relevo fica nas janelas ao redor.
- Profundidade: janela de trás em menta, janela principal branca com sombra macia
  e luz de borda lima → menta no canto superior, cartão da direita que começa
  recuado (92%, esmaecido) e avança quando a ação acontece, linha escolhida que
  sobe 8 px com sombra própria e contorno lima. Nas peças do Instagram, as janelas
  ganham perspectiva leve (`rotateX/rotateY` de 5° a 20°).
- Assinatura: a trilha de etapas em nós ortogonais, derivada do DotTrail do
  brandbook, que acende a cada passo (Escolher → Ver total → WhatsApp etc.).
- Aproximação: em vez de miniaturas pequenas, cada lâmina amplia o detalhe que
  importa (total, resumo, estimativa, diploma) numa janela própria à frente.

## Elementos reconhecíveis

| Modelo | Negócio fictício | Ação no ciclo de 4 s | Valores |
|---|---|---|---|
| Cardápio (site: Pratos) | Sabor da Praça | toque em Moqueca de banana-da-terra → total → mensagem pronta para o WhatsApp | R$ 0,00 → R$ 42,00 |
| Lanches | Lanche do Bairro | Combo Clássico → quantidade 1 → 2 → resumo em destaque | R$ 32,00 → R$ 64,00 |
| Serviços | Casa em Ordem | Pintura de cômodo → pedido de orçamento se forma em três linhas | a partir de R$ 380,00 |
| Portfólio | Marina Rocha | Projeto → Currículo → Diploma, com aproximação de cada conteúdo | — |

Fotos de apoio (prato, combo, projeto) geradas com ImageGen; recortes da mesma
foto servem de miniaturas (arroz com farofa, suco, fritas). Marca, textos,
preços e interfaces são vetoriais e usam as fontes locais.

## Tempos

- Ciclo: 4 s; toda mudança dura 180–300 ms; o resultado fica visível por cerca
  de 1,5 s antes do retorno (3,45–3,75 s); 3,75–4 s repete o quadro inicial.
- Vídeos: abertura 0–2 s, Cardápio 2–6 s, Lanches 6–10 s, Serviços 10–14 s,
  Portfólio 14–18 s, encerramento 18–20 s. Cada demonstração congela no resultado
  (3,4 s do ciclo) até a troca, que dura 300 ms.
- Story: 250 px livres no topo e 340 px na base para a interface do Instagram;
  faixa de 1450 a 1580 px reservada ao sticker de link.

## Som (versões com efeitos)

Sintetizado a partir dos mesmos instantes das animações: clique suave nos
toques, duas notas curtas quando um valor muda, deslocamento quando uma janela
avança, passagem entre cenas e uma assinatura de três notas no encerramento.
Sem música ou locução; pico −3 dBFS, cerca de −23 LUFS integrados.

## Terminologia

`CONTEXT.md` proíbe “cardápio” e “catálogo” nas páginas de divulgação. No site a
demonstração se chama **Pratos** e o SVG não usa essas palavras. As peças do
Instagram seguem o roteiro aprovado (“Cardápio”).

## Avaliação após a publicação

A Meta indica o tempo assistido como informação útil para revisar a abertura de
vídeos ([referência](https://about.fb.com/news/2023/04/instagram-reels-trending-audio-and-gifts-updates/)).
O guia de postagem orienta acompanhar retenção nos primeiros 3 segundos,
tempo médio assistido, deslizes do carrossel até a lâmina 7 e toques no link.
