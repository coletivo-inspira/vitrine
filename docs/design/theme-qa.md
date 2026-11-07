# Temas claro e escuro

Solicitação de 2026-11-07: controle de tema e inversão da logo para branco quebrado.
Implementado em `web/theme.js`, carregado antes do CSS, e tokens em styles.css.
Sem dependências, cookies, serviço remoto ou mudança de hospedagem.

## Comportamento

- Primeira visita segue sistema; alterações de sistema são acompanhadas até
  a pessoa escolher explicitamente claro/escuro.
- Botão acessível de 44 px ao lado do menu mobile; nome anuncia o próximo tema.
- Escolha em localStorage `vitrine-theme`; armazenamento bloqueado não impede uso.
- Sem JavaScript: tema claro, conteúdo intacto, controle oculto.
- SVG inverso: letras e endosso #F7F7F4, V #133824 e caixa #BAFF29.
  Animação e preferência de movimento reduzido preservadas.
- Exemplos reais e Orb oficial não recebem filtros nem recoloração.

## Verificação

23 testes passaram, build concluído. Chromium em 1440×1000 e 390×1000:
ambos os temas sem overflow/erro JS; marcas carregadas; tema escuro inicial pelo
sistema; alternância por botão/Enter; escolha preservada após reload; menu mobile
e Escape funcionais. Alteração de preferência do sistema e armazenamento bloqueado
testados separadamente com sucesso. Capturas em `.impeccable/review/theme/`.

Detector Impeccable executado uma vez nesta alteração, registro temporário em
`tmp/theme-detector.json`; avisos sobre estilos preexistentes não expandem escopo.
Revisão visual independente: **ship**, sem correções materiais nos temas.
