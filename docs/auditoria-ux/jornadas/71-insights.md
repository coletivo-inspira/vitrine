# Jornada `#71` — Leitura dos Insights

Seção da Auditoria UX para a issue `#71`, seguindo as convenções da
[matriz central](../matriz-central.md) (seção 4) e o
[contrato da matriz](../../../specs/010-ux-audit-meta-readiness/contracts/ux-audit-matrix-contract.md).

- **Data da coleta**: 2026-11-14, 17:20–17:45 UTC.
- **Commit auditado**: `main` em `bbafd95c13ab5142aa642287f788632cdd0c55e3`.
- **Build**: hash `0911af34bd42` (`npm run build`).
- **Superfícies**: `/portal/#insights` (`#insights-section`) e o cartão
  "Destaques da Semana" de `/portal/#inicio` (`.insights-highlight-card`).
- **Evidências**: pasta `media/auditoria-ux/71-insights/` do Context do projeto
  (as imagens não são versionadas no repositório).

## 1. Escopo

Escolher uma vitrine, alternar os períodos `7d`, `30d` e `90d` e interpretar cada
indicador do painel: leitura automática, os quatro cartões de resumo, o gráfico
diário, o gráfico por hora, os rankings de itens e categorias e as curtidas.
Inclui a distinção entre **zero**, **sem dados** e **falha ao carregar**, e entre
**visita**, **visualização**, **escolha**, **clique no WhatsApp** e **pedido
confirmado**.

## 2. Ambiente e mocks

- Preview local `PORT=4187 npm run preview` (só o `dist/` estático).
- Painel autenticado simulado pelo Chrome DevTools Protocol com o script
  `internal/auditoria-ux/mock-71-72.mjs` do Context (cópia estendida de
  `painel-mock-cdp.mjs`, da `#61`). A resposta de
  `GET /api/sites/:id/insights?period=` é gerada pela **função real**
  `computeStorefrontInsights` (`src/portal-validation.mjs:2087`) sobre contadores
  sintéticos de 180 dias (visitas às 12h, 13h, 19h e 20h; pedidos às 19h e 20h;
  1 dia em cada 11 sem nenhum evento) e sobre os itens de
  `/data/vitrines/loja1/menu.json`. Data de referência: 2026-11-14.
- Cenários do mock: `dados`, `zero` (vitrine sem eventos), `sem-categoria` (itens
  sem categoria e um item removido), `erro500`, `erro401`, `rede` (falha de rede),
  `lento` (3,5 s para `30d`/`90d`), 0, 1 ou 2 vitrines e papéis `owner` e `viewer`.
- O que **não** foi verificado: dados reais de `site_metrics_daily` no Supabase,
  a gravação de eventos pela vitrine publicada (Worker) e o comportamento em
  produção, bloqueado pelo desafio da borda (`BLK-UX-61-PROD`).

## 3. Inventário de controles

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `.nav-link[data-section="insights"]` (barra lateral e barra inferior) | Link | default, active, focus-visible | 360–1440, horizontal, 200% | Abrir o painel | Abrir `#insights` e marcar o item | Abre e marca "Insights" nas duas barras | Classe `active`; sem `aria-current` |
| `#hub-open-insights-btn` | Botão | default, focus-visible | 375, 1280 | Atalho a partir do Início | Abrir `#insights` | Abre `#insights` | Troca de seção |
| `#hub-insights-stats-list` | Lista (leitura) | default, empty, error | 375, 1280 | Resumo rápido no Início | Mostrar o período a que os números se referem | Rótulo fixo "Visitas (7 dias)" mesmo com dados de 30 ou 90 dias (`UX-71-002`); com falha mostra "0 acessos" (`UX-71-001`) | Nenhum |
| `#insights-site-select` | Campo (select) | default, focus-visible, empty (0 vitrines), 2 vitrines | 360–1440, 200% | Escolher a vitrine | Trocar os dados para a vitrine escolhida | Troca e recarrega; com 0 vitrines mostra "Nenhuma vitrine cadastrada" mas ainda consulta `demo-site-pastus` (`UX-71-012`) | `<label for>` "Vitrine:"; 44 px de altura |
| `.insights-period-btn[data-period="7d"/"30d"/"90d"]` | Botão (grupo) | default, hover, focus-visible, active, loading | 360–1440, horizontal, 200% | Escolher o período | Marcar o período e mostrar dados dele, com estado de carregamento | Marca na hora (`aria-pressed`), mas mantém os dados antigos enquanto carrega (`UX-71-005`) e pode exibir dados de outro período em cliques rápidos (`UX-71-004`) | `aria-pressed`, cor; contorno de foco laranja de 3 px; 74–85 × 44 px |
| `#insights-highlights-list` | Lista (leitura) | default, empty, error | 360–1440 | Leitura automática do período | Frases coerentes com o período e com o estado | Frases ajustam "nesta semana"/"nestes 30 dias"; com falha mostra "Ainda sem visitas registradas" (`UX-71-001`) | Sem `aria-live` (`UX-71-013`) |
| `#insights-kpi-visits`, `-orders`, `-conversion`, `-estimated` e `*-delta` | Cartões (leitura) | default, empty, error | 360–1440, 200% | Resumo do período | Rótulos que dizem o que é medido; variação neutra quando não há mudança | "Pedidos no WhatsApp" e "Valor estimado em pedidos" contam cliques no botão de envio (`UX-71-006`); "+0%" e "Anterior: 12,8%" em laranja de destaque (`UX-71-010`); "2399" sem separador de milhar (`UX-71-011`) | Texto; cor laranja indica "positivo" |
| `#insights-day-chart-container` | Gráfico (SVG) | default, empty, error | 360–1440, 200% | Evolução diária | Cobrir o período escolhido e ter alternativa textual | Mostra só os 14 últimos dias em `30d` e `90d` (`UX-71-003`); dia com zero fica sem barra nem rótulo (`UX-71-014`) | `role="img"` com rótulo fixo; SVG `aria-hidden` (`UX-71-007`) |
| `#insights-hour-chart-container` | Gráfico (SVG) | default, empty, error | 360–1440, 200% | Concentração por hora | Escala, legenda e unidades separadas | Soma visitas e pedidos numa só barra, sem eixo de valores nem legenda do destaque laranja (`UX-71-009`); texto de 7,3–8,4 px em 360–1280 (`UX-71-008`) | `role="img"` com rótulo fixo |
| `.insights-chart-unit` ("0h às 23h") | Selo | default | 375, 1280 | Indicar a faixa do eixo | Texto informativo | Tem formato de pílula clicável, mas não é controle | Nenhum |
| `#insights-top-items-list` | Lista (leitura) | default, empty | 360–1440 | Itens mais escolhidos e vistos | Nomes legíveis; categoria real | Em 360 px o nome quebra uma palavra por linha (`UX-71-015`); item sem categoria cai numa categoria de reserva com termo proibido e item removido aparece pelo identificador (`UX-71-016`) | Pílulas "N escolhas" e "+N%" |
| `#insights-top-categories-list` | Lista (leitura) | default, empty | 360–1440 | Categorias com mais escolhas | Nomes de categoria da vitrine | Igual ao anterior; a categoria de reserva usa termo proibido (`UX-71-016`) | Pílula "N itens escolhidos" |
| `#insights-likes-list`, `#insights-likes-total`, `#insights-likes-period` | Lista (leitura) | default, empty | 375, 1280 | Itens mais curtidos | Total e novas no período | Correto; vazio explica como as curtidas aparecem | Texto |

## 4. Matriz de cenários da jornada

| Cenário | 360 | 390 | 768 | 1024 | 1440 | Horizontal | Zoom 200% | Claro | Escuro | Teclado | Movimento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#71` Insights | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |

Detalhes por cenário:

- **Larguras** (`insights-7d-<largura>-claro.png`): nenhuma rolagem horizontal
  (`scrollWidth = innerWidth` em 360, 375, 390, 768, 1024, 1280, 1440, 844×390 e
  720 px a 200%). A barra de filtros quebra em duas linhas abaixo de 520 px.
- **Horizontal 844×390** (`insights-7d-844x390-claro.png`) e **zoom 200%**
  (`insights-7d-zoom200-claro.png`): legíveis; os gráficos ocupam a largura toda e
  o texto do SVG chega a 15–18 px.
- **Claro/escuro**: contraste medido no navegador. Claro: rótulos e eixos
  `#56615B` sobre branco 6,45:1; laranja `#C74414` (destaques, variações, valores
  do gráfico) 4,92:1. Escuro: 8,3–8,4:1. Todos acima de 4,5:1.
- **Teclado** (`insights-foco-periodo-1280-claro.png`): ordem select → 7 dias →
  30 dias → 90 dias; `Enter` ativa o período e mantém o foco no botão; contorno
  laranja de 3 px visível. Os gráficos e rankings não recebem foco (são leitura).
- **Toque**: botões de período e select com 44 px de altura.
- **Movimento reduzido** (`insights-movimento-reduzido-375-escuro.png`): com
  `prefers-reduced-motion: reduce`, `transition-duration` dos botões é `0s`
  (`web/portal/portal.css:2007`). O painel não tem animações próprias.
- **Estados**: dados (`insights-7d-1280-claro.png`), 30 e 90 dias
  (`insights-30d-1280-claro.png`, `insights-90d-1280-claro.png`), zero
  (`insights-zero-1280-claro.png`, `home-hub-zero-1280-claro.png`), falha 500
  (`insights-erro500-1280-claro.png`, `home-hub-erro500-1280-claro.png`), falha de
  rede (`insights-rede-375-claro.png`), sessão expirada (401, sem captura: igual à
  falha 500), carregamento lento (`insights-lento-30d-carregando-1280-claro.png`),
  cliques rápidos (`insights-corrida-7d-com-dados-30d-1280-claro.png`), segunda
  vitrine (`insights-segunda-vitrine-1280-claro.png`), sem vitrine
  (`insights-sem-vitrine-1280-claro.png`), item sem categoria
  (`insights-item-sem-categoria-1280-claro.png`) e papel `viewer` (mesma tela do
  `owner`, sem captura).

### 4.1 Utilidade de cada indicador

| Indicador | O que mede de fato (código) | Leitura para quem vende | Avaliação |
| --- | --- | --- | --- |
| Visitas à vitrine | Um evento `visit` por carregamento da vitrine publicada (`web/vitrine/vitrine.js:409`) | Alcance | Útil; o nome está correto |
| Visualizações (nos rankings) | Um `item_view` para cada um dos 12 primeiros itens a cada carregamento, vistos ou não (`web/vitrine/vitrine.js:410-412`) | Interesse por item | Pouco útil: os 12 primeiros itens empatam com o número de visitas (`UX-71-006`) |
| Escolhas | `item_select` ao adicionar um item ao pedido (`web/assets/storefront-renderer.mjs:1154`) | Interesse forte | Útil |
| Pedidos no WhatsApp | `whatsapp_order` ao tocar em "enviar" no WhatsApp (`web/assets/storefront-renderer.mjs:2418-2422`) | Intenção de compra | Útil, mas o rótulo sugere pedido confirmado (`UX-71-006`) |
| Valor estimado | Soma do carrinho no clique de envio | Potencial de venda | O selo "Receita Estimada" sugere receita realizada (`UX-71-006`) |
| Taxa de conversão | Cliques no envio ÷ visitas | Eficiência da vitrine | Útil se o rótulo deixar claro que é "visita → clique no WhatsApp" |
| Curtidas | Uma curtida por visitante e item (cookie anônimo) | Preferência | Útil e bem explicado |

## 5. Achados

| ID | Issue | Severidade | Natureza | Eixo | Descrição e Evidência | Critério de Aceite | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UX-71-001` | `#71` | `P1` | `problema_confirmado` | `feedback` | Falha ao carregar (500, 401 ou rede) aparece como "sem dados": o painel mostra 0 em tudo e "Ainda sem visitas registradas", e o Início mostra "0 acessos". Não há aviso, botão de tentar de novo nem volta ao login no 401. `web/portal/portal.js:1977-1985` (o `catch` cai em `getEmptyInsightsDataset`) e `:1947`; capturas `insights-erro500-1280-claro.png`, `home-hub-erro500-1280-claro.png`, `insights-rede-375-claro.png`. Confirma a pista da `#61` | Com falha, o painel e o cartão do Início mostram uma mensagem de erro distinta do estado zero, com "Tentar novamente"; nenhum número é exibido como 0. No 401, a pessoa volta ao login com aviso de sessão expirada | Aberto |
| `UX-71-002` | `#71` | `P1` | `problema_confirmado` | `feedback` | O cartão "Destaques da Semana" do Início usa o último período aberto nos Insights, mas mantém o rótulo "Visitas (7 dias)": depois de abrir `90d`, mostra "Visitas (7 dias) 2399 acessos" e uma frase sobre "estes 90 dias". `web/portal/portal.js:1999-2003` e `:1973`; `web/portal/index.html:312`; captura `home-hub-apos-90d-1280-claro.png` | O cartão do Início sempre mostra os 7 dias (consulta própria) ou rotula o período real dos números; título e rótulo concordam com os dados | Aberto |
| `UX-71-003` | `#71` | `P1` | `problema_confirmado` | `feedback` | Em `30d` e `90d` o gráfico "Visitas e pedidos por dia" mostra só os 14 últimos dias (de 01/11 a 14/11, 26 barras nos dois períodos), sem aviso. O servidor devolve 30 ou 90 dias. `web/portal/portal.js:2042` (`byDay.slice(-14)`); capturas `insights-30d-1280-claro.png` e `insights-90d-1280-claro.png` | O gráfico cobre o período escolhido (agrupando por semana em `90d`, se preciso) ou informa no título o intervalo exibido | Aberto |
| `UX-71-004` | `#71` | `P1` | `problema_confirmado` | `feedback` | Cliques rápidos trocam os dados: clicar em 30 dias e logo em 7 dias deixa "7 dias" marcado com os números de 30 dias (792 visitas), porque a resposta mais lenta chega por último e sobrescreve. `web/portal/portal.js:1896-1906` e `:1956-1975` (sem cancelamento nem conferência do período da resposta); captura `insights-corrida-7d-com-dados-30d-1280-claro.png` | A tela só aplica a resposta do último período e vitrine pedidos (cancelamento com `AbortController` ou conferência de `insights.period`/`siteId`) | Aberto |
| `UX-71-005` | `#71` | `P2` | `problema_confirmado` | `feedback` | Sem estado de carregamento ao trocar período ou vitrine: o novo período fica marcado e os números antigos continuam na tela até a resposta chegar (3,5 s no cenário lento). `web/portal/portal.js:1896-1906`; captura `insights-lento-30d-carregando-1280-claro.png` | Ao trocar filtro, os cartões e gráficos indicam carregamento (`aria-busy` e esqueleto ou texto) e os números antigos não aparecem como se fossem do novo período | Aberto |
| `UX-71-006` | `#71` | `P2` | `critica_ux` | `feedback` | Os rótulos misturam intenção com resultado. "Pedidos no WhatsApp", "Valor estimado em pedidos", o selo "Receita Estimada" e "Taxa de conversão" contam toques no botão de envio, não pedidos confirmados (`web/assets/storefront-renderer.mjs:2418-2422`). "Visualizações" registra os 12 primeiros itens a cada visita, vistos ou não (`web/vitrine/vitrine.js:410-412`), e por isso empata com as visitas. `web/portal/index.html:420-437` | Rótulos e ajudas dizem "Cliques para enviar no WhatsApp", "Valor dos pedidos enviados (estimado)" e "Visitas que viraram envio"; "visualizações" só conta itens que apareceram na tela ou deixa de ser exibido | Aberto |
| `UX-71-007` | `#71` | `P1` | `problema_confirmado` | `feedback` | Os gráficos não têm alternativa textual: os contêineres têm `role="img"` com rótulo fixo ("Gráfico de visitas e pedidos por dia") e o SVG é `aria-hidden`, então leitor de tela não recebe nenhum valor. A legenda também é `aria-hidden`. Falha WCAG 1.1.1. `web/portal/index.html:449`, `:454`, `:467`; `web/portal/portal.js:2071`, `:2202` | Cada gráfico tem um resumo textual com os valores (tabela visualmente oculta ou `aria-label` gerado, por exemplo "Pico às 19h: 48 visitas e 13 cliques no WhatsApp") | Aberto |
| `UX-71-008` | `#71` | `P2` | `problema_confirmado` | `movimento` | O texto dos gráficos encolhe junto com o SVG (`viewBox` de 440 px, fonte de 11 px): 7,3 px em 360, 7,6 px em 375, 8,0 px em 390 e 8,4 px no gráfico por hora em 1280. Medido com `getBoundingClientRect`; captura `insights-graficos-360-claro.png`. `web/portal/portal.js:2051`, `:2182`; `web/portal/portal.css:3305-3311` | Rótulos dos eixos e valores com pelo menos 11–12 px de tamanho renderizado em todas as larguras (SVG desenhado na largura real ou rótulos em HTML) | Aberto |
| `UX-71-009` | `#71` | `P2` | `critica_ux` | `feedback` | O gráfico "Acessos e pedidos por faixa de hora" soma visitas e pedidos numa barra só, não tem eixo de valores e pinta de laranja as horas de pico sem legenda. A pessoa não sabe quantos pedidos houve em cada hora. `web/portal/portal.js:2191-2236`; captura `insights-graficos-360-claro.png` | Barras separadas (ou empilhadas com legenda) para visitas e cliques no WhatsApp, eixo com valores e legenda do destaque de pico | Aberto |
| `UX-71-010` | `#71` | `P3` | `problema_confirmado` | `feedback` | Variação sem mudança aparece como positiva: "+0% vs. período anterior (203)" em laranja (204 contra 203) e "Anterior: 12,8%" em laranja quando a taxa é igual. O laranja também é a cor de destaque geral, então "positivo" não se distingue. `web/portal/portal.js:2264-2268`, `:2289-2293`; `web/portal/portal.css:3212`; captura `insights-90d-1280-claro.png` | Variação arredondada a 0% é neutra; positivo e negativo têm sinal e cor próprios (e não só cor) | Aberto |
| `UX-71-011` | `#71` | `P3` | `problema_confirmado` | `feedback` | Contagens sem separador de milhar ("2399" visitas, "1925 itens escolhidos") ao lado de valores formatados ("R$ 16.016,00"). `web/portal/portal.js:2259`, `:2272`, `:2415`; captura `insights-90d-1280-claro.png` | Todas as contagens usam `toLocaleString('pt-BR')` | Aberto |
| `UX-71-012` | `#71` | `P2` | `problema_confirmado` | `navegacao` | Sem vitrine, o seletor mostra "Nenhuma vitrine cadastrada", mas o painel consulta `/api/sites/demo-site-pastus/insights` (identificador do antigo modo local) e mostra os cartões zerados sem convite para criar a vitrine. Requisição registrada no mock; `web/portal/portal.js:1958`; captura `insights-sem-vitrine-1280-claro.png` (no mock a rota responde com dados; no Worker real responderia 404 e cairia nos zeros) | Sem vitrine, nenhuma consulta é feita e o painel mostra um estado vazio com "Criar vitrine" | Aberto |
| `UX-71-013` | `#71` | `P2` | `risco_codigo` | `feedback` | A troca de período ou de vitrine não é anunciada: não há região `aria-live` nem `aria-busy` nos cartões e na leitura automática. Quem usa leitor de tela aciona "30 dias" e não ouve nada. `web/portal/index.html:403-438` | Ao concluir a carga, uma região `aria-live="polite"` anuncia "Mostrando 30 dias da vitrine X" (ou o erro) | Aberto |
| `UX-71-014` | `#71` | `P3` | `problema_confirmado` | `feedback` | No gráfico diário, um dia com zero eventos fica sem barra e sem número (09/11 na captura), igual a um dia sem coleta. Sem nenhum evento, o eixo mostra "0, 1, 1". Com falha, o gráfico diário diz "Sem dados diários" e o por hora desenha uma grade vazia. `web/portal/portal.js:2060-2063`, `:2092`, `:2223`; capturas `insights-graficos-360-claro.png`, `insights-zero-1280-claro.png`, `insights-erro500-1280-claro.png` | Zero aparece como valor explícito ("0") e os dois gráficos tratam vazio e falha do mesmo jeito; o eixo não repete rótulos | Aberto |
| `UX-71-015` | `#71` | `P2` | `problema_confirmado` | `navegacao` | Em 360–390 px as linhas do ranking espremem o nome do item entre a posição e as pílulas: o nome e a categoria quebram uma palavra por linha ("Pizzas / Clássicas / de / Fermentação / Natural"), e cada item ocupa uns 200 px de altura. Capturas `insights-rankings-360-claro.png` e `insights-rankings-360-escuro.png`. `web/portal/portal.css:3380` | Abaixo de 560 px as pílulas passam para baixo do nome e o nome usa a largura toda | Aberto |
| `UX-71-016` | `#71` | `P2` | `risco_codigo` | `feedback` | Itens sem categoria ou removidos da vitrine aparecem nos rankings com uma categoria de reserva cujo nome é um dos termos proibidos na interface, e o item removido aparece pelo identificador técnico ("item-removido-123"). Reproduzido com a função real do servidor no mock; `src/portal-validation.mjs:2003`, `:2149`; captura `insights-item-sem-categoria-1280-claro.png` | A categoria de reserva é "Itens da vitrine" (ou similar sem os termos proibidos) e item removido aparece como "Item removido" | Aberto |
| `UX-71-017` | `#71` | `P3` | `risco_codigo` | `feedback` | A frase automática "Esta semana o item mais pedido foi…" é usada em qualquer período quando não há período anterior para comparar, então aparece em `30d` e `90d`. `src/portal-validation.mjs:2297` | A frase usa o rótulo do período (`periodLabel`) | Aberto |
| `UX-71-018` | `#71` | `P3` | `risco_codigo` | `feedback` | A hora do evento vem do relógio do visitante (`web/vitrine/vitrine.js:91-94`), mas o dia é o do servidor em UTC (`src/portal-validation.mjs:1815-1816`). Entre 21h e 23h59 (horário de Brasília), as visitas entram no dia seguinte do gráfico diário | Dia e hora seguem o mesmo fuso, de preferência `America/Sao_Paulo`, documentado no painel | Aberto |
| `UX-71-019` | `#71` | `P3` | `problema_confirmado` | `feedback` | Ao abrir `/portal/#insights`, o mesmo `GET .../insights?period=7d` é feito 3 vezes (carga inicial e duas chamadas de `showSection('insights')`, uma vinda de `checkSession` e outra de `handleRouting`). Registro do mock; `web/portal/portal.js:209`, `:211`, `:696`, `:890-892` | Uma única consulta por combinação de vitrine e período (com memória durante a sessão) | Aberto |
| `UX-71-020` | `#71` | `P3` | `critica_ux` | `feedback` | O texto de ajuda "Pedidos sobre visitas" do cartão de conversão é trocado por "Anterior: x%" assim que os dados chegam, e a explicação do cálculo some. `web/portal/index.html:430`; `web/portal/portal.js:2288` | Cartão mantém a explicação do cálculo e mostra o período anterior em linha separada | Aberto |

Contagem: `P0` 0 · `P1` 5 · `P2` 8 · `P3` 7 (total 20).

## 6. Bloqueios e checklist de aceite

Nenhuma tela desta jornada ficou indisponível com o mock. Fica pendente a
validação com dados reais:

| Código | Bloqueio | Checklist de aceite (ação humana ou ambiente) |
| --- | --- | --- |
| `BLK-UX-61-PROD` (herdado) | Produção atrás do desafio da borda; sem acesso a `site_metrics_daily` real | [ ] Abrir `/portal/#insights` em produção com uma vitrine publicada há mais de 7 dias · [ ] Conferir que visitas, cliques no WhatsApp e curtidas batem com uma visita de teste feita no dia (sem enviar mensagem real: só o toque, com a conversa cancelada) · [ ] Repetir `UX-71-001` desligando a rede no navegador · [ ] Conferir `UX-71-018` com uma visita depois das 21h |

## 7. Recomendações

1. **Separar estados** (`UX-71-001`, `UX-71-012`, `UX-71-014`): três estados
   distintos no painel e no Início — carregando, falha (com "Tentar novamente") e
   "sem eventos ainda" (com o link da vitrine para divulgar).
2. **Honestidade dos números** (`UX-71-002`, `UX-71-003`, `UX-71-004`): todo número
   carrega o período a que se refere; respostas antigas são descartadas; o gráfico
   diário cobre o período inteiro.
3. **Vocabulário do funil** (`UX-71-006`): visita → item visto → item escolhido →
   envio para o WhatsApp. Pedido confirmado não é medido pela plataforma, e o
   painel deve dizer isso numa nota curta.
4. **Gráficos acessíveis** (`UX-71-007`, `UX-71-008`, `UX-71-009`): resumo textual
   gerado a partir dos dados, texto com tamanho mínimo e legenda para o destaque
   de pico.
5. **Ranking em telas estreitas** (`UX-71-015`) e **termo de reserva sem os termos
   proibidos** (`UX-71-016`).
