# Trilha do mouse — 2026-11-07

Fonte inspecionada: https://brandbook.inspira.dev.br/assets/js/dot-trail.js?v=2
(o próprio script declara compartilhar a lógica DotTrail do portal coletivo).
Adaptado localmente em `web/assets/brand/dot-trail.js`, sem execução de scripts
de analytics ou proteção Cloudflare do HTML de referência.

Menta/multiply no claro; lima/screen no escuro. Tema observado por data-theme.
Sem efeito no modo de movimento reduzido, toque e caneta. Limpa em blur,
visibilitychange, saída da janela e resize. DPR limitado a 2. Mantém o cursor
do sistema e todos os cliques. Sem armazenamento ou requisições externas.

## Evidência

23 testes passaram; build concluído. Chromium1440: canvas recebe pixels ao mover
mouse em ambos os temas e fica vazio após 800 ms; cores e blend conferidos;
movimento reduzido e evento touch não desenham; blur limpa imediatamente; sem
erros JavaScript. Celular390: menu por toque funcional, sem overflow horizontal.
Capturas temporárias em `.impeccable/review/trail/`.
