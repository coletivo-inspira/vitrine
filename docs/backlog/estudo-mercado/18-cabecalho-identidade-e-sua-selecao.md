---
titulo: "[Estudo de mercado] Cabeçalho da vitrine com identidade, menu e ícone \"Sua seleção\""
rotulos: estudo-mercado, vitrine-publica, referencia-laurapires, enhancement
depende:
---
## Contexto

O cabeçalho da vitrine pública (`web/vitrine/index.html` e `renderStorefrontHtml` em
`src/publication-engine.mjs`) mostra o selo "Vitrine", o endereço `/<endereço>` e o
controle de tema. O nome do negócio só aparece no hero, e os menus da estrutura
modular (`structure.navigation.header`) entram como uma lista solta.

Na referência (laurapires.com), o cabeçalho tem a identidade à esquerda e, no
celular, só dois controles à direita: a sacola com contador e o menu. O Lino pediu
esse padrão.

## Escopo

- Cabeçalho fixo e fino com o logo da vitrine (quando houver) ou o nome do negócio,
  com link para o topo da vitrine.
- Desktop (≥ 801 px): links de `navigation.header` (no máximo 5), link do Instagram da
  vitrine quando informado (o mesmo link direto da issue {{issue:15}}) e o ícone "Sua seleção".
- Celular (≤ 800 px): nome à esquerda; à direita, o ícone "Sua seleção" e o botão de
  menu, nessa ordem. O menu abre um painel com os mesmos links, fecha com Esc, com o
  botão de fechar e ao escolher um link, e devolve o foco ao botão.
- Ícone "Sua seleção": sacola em SVG local, alvo de pelo menos 44×44 px, contador
  visível quando há itens e nome acessível dinâmico ("Sua seleção, 2 itens"),
  anunciado em região `aria-live="polite"`.
- Sem JavaScript, o ícone é um link para a âncora das etapas e o menu fica visível como lista.
- O selo "Vitrine" e o endereço saem do cabeçalho; o crédito da Vitrine Inspira vai
  para o rodapé (issue {{issue:25}}).
- O controle de tema continua disponível, dentro do menu no celular.
- Vitrines sem itens selecionáveis (só links ou só portfólio) não exibem o ícone.

## Fora de escopo

- Abrir a gaveta lateral (issue {{issue:19}}); aqui o ícone só rola até as etapas.
- Busca no cabeçalho, megamenu ou submenus.

## Critérios de aceite

- [ ] Em 375, 390 e 1280 px, o nome ou logo do negócio aparece no cabeçalho e o selo
      "Vitrine /<endereço>" não aparece.
- [ ] Em 390 px, o cabeçalho tem exatamente dois controles à direita (seleção e menu),
      cada um com alvo ≥ 44×44 px.
- [ ] Adicionar um item muda o contador para 1 e o nome acessível para "Sua seleção,
      1 item"; remover volta a esconder o contador.
- [ ] Menu do celular: abre e fecha por teclado, Esc fecha e o foco volta ao botão.
- [ ] Sem JavaScript, os links do menu ficam visíveis e o ícone leva às etapas.
- [ ] Nenhum texto de interface em inglês nem termo proibido ("catálogo", "cardápio",
      "loja", "carrinho").
- [ ] Contraste ≥ 4,5:1 no texto e ≥ 3:1 nos ícones, nos temas claro e escuro.
- [ ] O HTML publicado continua sem script inline e com `script-src 'self'`.

## Dependências

Nenhuma bloqueante. Usar o token de contraste de `PB-07` e os alvos de `PB-14`. A
quebra em 801 px é a mesma de `PB-19` (cabeçalho do site de divulgação).

## Referências

- [Referência laurapires.com](../../referencia-laurapires.md): seções 2 (Cabeçalho),
  6.1 e decisões 1, 2 e 11.
- Estudo: [seção 1, Posicionamento](../../market-study-2026.md#1-posicionamento).
