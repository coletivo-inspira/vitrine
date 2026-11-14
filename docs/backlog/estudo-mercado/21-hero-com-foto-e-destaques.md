---
titulo: "[Estudo de mercado] Hero com foto e duas ações, e módulo de destaques"
rotulos: estudo-mercado, vitrine-publica, referencia-laurapires, enhancement
depende:
---
## Contexto

O módulo `hero` publica só título e subtítulo (`renderStorefrontHero` em
`src/publication-engine.mjs`), com o rótulo fixo "Atendimento direto no WhatsApp".
Não há foto da pessoa ou do negócio nem botões.

Na referência, o hero tem foto real em moldura arredondada, título que apresenta a
pessoa, uma frase, **um botão principal** e **um link secundário**. Logo abaixo, uma
faixa de 4 destaques com ícone e uma linha ("Ao vivo, sem gravação", "Turmas pequenas").

## Escopo

- Campos novos e opcionais no `hero`: `imageUrl` (WebP, ADR 0011), `imageAlt`
  (obrigatório se houver imagem), `primaryAction` e `secondaryAction`, cada um com
  `label` (até 28 caracteres) e `target`: `selecao` (rola até os itens), `whatsapp`
  (conversa com mensagem neutra), `pagina:<endereço>` ou âncora de seção.
- Layout: duas colunas no desktop (texto à esquerda, foto à direita) e foto acima do
  texto no celular; botão principal na cor de destaque do tema e ação secundária
  como link sublinhado, como no `DESIGN.md`.
- Rótulo superior editável (`eyebrow`, até 40 caracteres), que pode ficar vazio.
- Novo módulo `highlights`: de 2 a 4 destaques, cada um com um ícone de uma lista
  fechada de SVGs locais (relógio, pessoas, local, online, entrega, garantia, estrela,
  calendário, coração, mensagem) e até 60 caracteres. Uma linha no desktop, duas
  colunas no celular.
- Editor: campos novos no painel de seções (`web/portal/showcase-structure.js`), com prévia.
- Imagem do hero com `width`, `height` e `fetchpriority="high"`; as demais com
  `loading="lazy"`.

## Fora de escopo

- Vídeo de fundo, carrossel no hero e animações de texto.
- Ícones enviados pelo dono; fontes ou paleta da referência.

## Critérios de aceite

- [ ] Hero com foto, duas ações e `eyebrow` mostra a foto à direita em 1280 px e
      acima do texto em 390 px.
- [ ] Publicar imagem sem `imageAlt` é recusado com erro no campo.
- [ ] Cada `target` leva ao destino certo; `whatsapp` respeita o modo Mila (ADR 0012).
- [ ] O botão não quebra palavras em 360 px.
- [ ] `highlights` com 4 itens mostra 4 colunas em 1280 px e 2 em 390 px; ícones com
      `aria-hidden` e texto lido pelo leitor de tela.
- [ ] Vitrines publicadas antes da mudança renderizam igual (campos ausentes mantêm o
      comportamento atual).
- [ ] LCP da primeira tela com foto no hero ≤ 2,5 s no perfil da issue {{issue:27}}.

## Dependências

Nenhuma bloqueante. O modelo da issue {{issue:26}} usa estes módulos.

## Referências

- [Referência laurapires.com](../../referencia-laurapires.md): seções 2 (Home), 6.3,
  6.4 e decisão 12.
- `DESIGN.md` (uma ação principal e um link secundário por bloco).
