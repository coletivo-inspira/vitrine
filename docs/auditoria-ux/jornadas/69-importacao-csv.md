# Jornada `#69` — Importação por planilha CSV

- **Issue**: [`#69`](https://github.com/coletivo-inspira/vitrine/issues/69) (2ª onda, AFK).
- **Coleta**: 2026-11-14, 17:20–18:10 UTC.
- **Código auditado**: `main` em `bbafd95c13ab5142aa642287f788632cdd0c55e3`; build `0911af34bd42`.
- **Superfícies**: `/portal/#editor`, aba **Itens**: menu "Planilha (CSV)", dica de modelos,
  prévia da importação, modos "Adicionar à vitrine" e "Substituir vitrine";
  `web/portal/csv-catalog.js`, `web/portal/modelo-produtos.csv`, `web/portal/modelo-servicos.csv`.
- **Contrato de referência**: [`catalog-csv-contract.md`](../../../specs/008-portal-redesign/contracts/catalog-csv-contract.md).
- **Evidências**: pasta `media/auditoria-ux/69-csv/` do Context do projeto (53 capturas,
  nomeadas `<tela>-<largura>-<tema>[-modo].png`). Resultados brutos de cada execução em
  `internal/auditoria-ux/resultados-69-70.json`.

## 1. Ambiente e mocks

- Preview local `PORT=4186 npm run preview` (só `dist/` estático).
- Painel aberto com o harness `internal/auditoria-ux/mock-69-70.mjs`, cópia estendida de
  `painel-mock-cdp.mjs` (matriz central, seção 1.3). Além dos mocks comuns (sessão
  `auditoria@example.test`, vitrine `site-teste-auditoria` com o rascunho de `/loja1`:
  3 categorias, 6 itens ativos), esta jornada simula:
  - `PUT /api/sites/:id/draft` respondendo `200` com a revisão seguinte e guardando o corpo,
    para observar o que o salvamento automático grava;
  - `catalogType` trocado para `booking` e `quote` (variável `CATALOG`);
  - seleção de arquivo por `DOM.setFileInputFiles`, teclado por `Input.dispatchKeyEvent`,
    cliques reais por `Input.dispatchMouseEvent` e captura de downloads (`Page.downloadWillBegin`).
- Arquivos de teste (gerados em `/tmp/csv69/`, não versionados):

| Arquivo | Conteúdo | Objetivo |
| --- | --- | --- |
| `00-modelo-produtos.csv` | Cópia do modelo oficial | Modelo importa sem erro |
| `01-bom-ponto-virgula.csv` | BOM, `;`, `24,5`, `R$ 18,00`, `ativo` vazio, campo entre aspas com `;`, `margherita  verace` (caixa e espaço diferentes) | Caminho feliz e upsert |
| `02-virgula.csv` | Cabeçalho com `,`; preço `"24,50"` entre aspas e `18,00` sem aspas | Separador vírgula |
| `03-colunas-faltando.csv` | Sem `quantidade_minima` e `ativo` | Colunas ausentes |
| `04-cabecalho-acentos.csv` | `Categoria;Nome;Descrição;Preço;Quantidade mínima;Ativo` | Cabeçalho digitado à mão |
| `05-erros-linha.csv` | `18.00`, `1.234,56`, linha em branco, nome vazio, `data:` na descrição, `ativo=talvez`, `0,00` e quantidade `0`, duplicata `Mousse`/`mousse` | Erros por linha |
| `06-windows-1252.csv` | Sem BOM, codificação Windows-1252 ("Pavê de Limão") | Formato padrão do Excel em português |
| `07-limite-21.csv` | 15 itens novos (6 + 15 = 21 ativos) | Limite de 20 ativos |
| `08-vazio.csv` | Só o BOM | Arquivo vazio |
| `09-substituir.csv` | 2 itens | Modo "Substituir vitrine" e cancelamento |
| `10-servicos.csv` | Modelo de serviços com `duracao_min=500` | Regras de `booking` |
| `11-orcamento.csv` | Preço vazio em `quote` | Regras de orçamento |

## 2. Resultado por arquivo

| Arquivo | Prévia ("válidas · com erro") | Mensagens exibidas | Após aplicar / cancelar |
| --- | --- | --- | --- |
| `00` modelo | 2 · 0 | — | Não aplicado |
| `01` BOM + `;` | 3 · 0 | — | "Adicionar": Margherita atualizada (R$ 52,90) sem duplicar; categoria "Sobremesas" criada. **Salvo automaticamente** (1 `PUT`) |
| `02` vírgula | 1 · 1 | `Linha 3: quantidade_minima: informe um número inteiro entre 1 e 99.` (a causa real é o preço `18,00` sem aspas) | Não aplicado |
| `03` colunas faltando | 0 · 1 | `Colunas obrigatórias ausentes na planilha: quantidade_minima, ativo`; "Aplicar" desabilitado | — |
| `04` cabeçalho acentuado | 0 · 1 | `Colunas obrigatórias ausentes na planilha: descricao, preco, quantidade_minima` | — |
| `05` erros por linha | 2 · 5 | Ver UX-69-006, UX-69-007 e UX-69-015 | Não aplicado |
| `06` Windows-1252 | 1 · 0 | — | Item gravado como `Pav� de Lim�o` e salvo automaticamente |
| `07` limite | 15 · 0 | Só ao clicar "Aplicar": `O resultado teria 21 itens ativos, acima do limite de 20 itens ativos no plano gratuito.` | Bloqueado; rascunho intacto (0 `PUT`) |
| `08` vazio | 0 · 1 | `Planilha vazia ou sem linhas válidas.` | — |
| `09` substituir | 2 · 0 | — | **Sem confirmação**: 6 itens viram 2 ("Ativos 2 / 20") e o resultado é salvo em ~1,2 s |
| `09` cancelar | 2 · 0 | — | Prévia fecha; rascunho intacto (0 `PUT`) |
| `10` serviços | 1 · 1 | `Linha 3: duracao_min: informe a duração em minutos (entre 5 e 480).` | — |
| `11` orçamento | 1 · 0 | — | Item com preço `0` aceito em `quote` |

Exportação: o item "Exportar vitrine" não gerou nenhum download (0 eventos). Os dois links
"Baixar modelo" baixaram `modelo-produtos.csv` e `modelo-servicos.csv`, ambos com BOM
(`EF BB BF`) e o cabeçalho do contrato.

## 3. Inventário de controles

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `#csv-menu-btn` "Planilha (CSV)" | Botão (menu) | default, focus-visible, aberto, fechado | 360, 375, 390, 768, 1024, 1280, 1440, horizontal, 200%, claro/escuro | Abrir ações de planilha | Abre e fecha por clique, `Enter`, `Esc`; setas entram no menu | Clique e `Enter` abrem. `Esc` não fecha; `↓` não move o foco; o menu continua aberto quando o foco sai por `Tab` (UX-69-012). 44 px de altura a partir de 768 px; 36 px em ≤ 390 px | `aria-haspopup="menu"` e `aria-expanded` atualizados; foco com contorno laranja de 3 px |
| `#csv-dropdown-menu` | Menu | aberto | 360–1440 | Agrupar ações | Cabe na tela | Em 360 e 375 px a borda direita vai a 380 px e a página ganha rolagem lateral (UX-69-013) | `role="menu"` sem navegação por setas |
| `#csv-upload-btn-item` "Importar planilha" | Item de menu | default, focus | 360–1440 | Abrir seletor de arquivo | Abre o seletor | Abre o seletor (`#csv-file-input`) | 42 px de altura (33 px em ≤ 390 px) |
| `#csv-export-btn-item` "Exportar vitrine" | Item de menu | default, clique | 1280 | Baixar a vitrine atual em CSV | Baixa um arquivo | **Nada acontece**: chama `#csv-export-btn`, que não existe (UX-69-004) | Nenhum |
| Links "Baixar modelo (produtos/serviços)" no menu | Link | default, focus, clique | 1280 | Baixar o modelo | Baixa o arquivo certo | Baixam os dois modelos com BOM | `role="menuitem"` em `<a download>` |
| Links da dica `.csv-models-hint a` | Link | default, focus | 360–1440 | Baixar modelo | Baixa | Baixam. Altura de 21 px (15 px em ≤ 390 px), texto em linha | Contraste 4,92:1 (claro) e 8,4:1 (escuro) |
| `#csv-file-input` | Campo (arquivo, oculto) | change | 1280 | Ler o CSV | Lê e mostra a prévia | Lê sempre como UTF-8 (UX-69-003); o foco permanece no botão do menu | `aria-label="Selecionar arquivo CSV da vitrine"` |
| `#csv-preview-container` | Região | oculto, visível, erro, vazio | 360–1440, 200%, claro/escuro | Mostrar prévia antes de aplicar | Resumo do que muda, anunciado | Só "N válidas · M com erro" (UX-69-010); sem `aria-live` ou `role` (UX-69-011) | Resumo em pílula, 13 px |
| `#csv-errors-list` | Lista | vazio, com erros | 360–1440, 200% | Listar erros por linha | Linha correta e causa real | Rolagem interna de 180 px (UX-69-019); números de linha deslocados (UX-69-006) | Contraste 13,27:1 (claro) e 13,81:1 (escuro) |
| `input[name="csv-import-mode"]` | Rádio | merge (padrão), replace | 360–1440 | Escolher modo | "Substituir" deixa claro o que será removido | Sem aviso nem confirmação (UX-69-001) | Rótulo clicável envolve o rádio |
| `#csv-cancel-btn` "Cancelar" | Botão | default, clique | 360–1440 | Descartar a importação | Fecha a prévia sem alterar | Fecha a prévia; 0 `PUT` | Sem mensagem; foco não é devolvido ao menu |
| `#csv-apply-btn` "Aplicar ao rascunho" | Botão | default, disabled, clique, erro de limite | 360–1440 | Aplicar ao rascunho | Aplica e informa o estado salvo | Desabilitado com 0 linhas válidas. Aplica e salva sozinho em ~1,2 s, mas a mensagem pede "Clique em Salvar Rascunho" (UX-69-002). No limite, erro no banner do topo e a prévia continua aberta | Banner `aria-live="polite"` some em 6 s |

## 4. Matriz de cenários da jornada

| Jornada | 360 | 390 | 768 | 1024 | 1440 | Horizontal | Zoom 200% | Claro | Escuro | Teclado | Movimento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#69` Importação CSV | executado | executado | executado | executado | executado | executado | executado | executado | executado | parcial | parcial |

- Larguras: menu e prévia com `05-erros-linha.csv` em 360×800, 390×844, 768×1024,
  1024×768, 1280×900 e 1440×900; também 375×812 nos dois temas. Horizontal em 844×390.
  Zoom 200% emulado com 720×450 px CSS e `deviceScaleFactor` 2 (equivale a 1440 px a 200%).
- Teclado **parcial**: menu, ordem de tabulação e foco verificados; o seletor de arquivo
  nativo do sistema não é acionável no Chrome headless (o arquivo foi injetado por CDP).
- Movimento **parcial**: `prefers-reduced-motion` e `prefers-reduced-transparency` emulados
  em 375 px (escuro) no caminho feliz; a rolagem suave do banner vem de JavaScript e foi
  analisada no código (UX-69-017).
- Toque: emulação de toque ativa abaixo de 768 px; medidas de alvo registradas no inventário.
- Contraste: todos os textos medidos passam em AA nos dois temas (menor razão 4,92:1, em
  texto em negrito de 13 px no tema claro).

## 5. Achados

| ID | Issue | Severidade | Natureza | Eixo | Descrição e Evidência | Critério de Aceite | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UX-69-001` | `#69` | `P1` | `problema_confirmado` | `formularios` | "Substituir vitrine" troca todo o conteúdo sem aviso nem confirmação, e o salvamento automático grava o resultado em ~1,2 s. Com `09-substituir.csv`, 6 itens viraram 2 e o `PUT` levou só os 2. `web/portal/editor.js:1038-1062` (aplica e chama `initializeEditorWorkspace()` sem `skipAutosave`), `editor.js:2703-2771` (salvamento em 1200 ms); `web/portal/index.html:1010-1012`. Capturas `csv-aplicado-replace-substituir-1280-claro.png` ("Ativos 2 / 20") | Antes de substituir, a interface mostra quantos itens e categorias serão removidos e pede confirmação explícita; cancelar a confirmação não envia `PUT`; depois de aplicar existe um "Desfazer" que restaura o rascunho anterior | Aberto |
| `UX-69-002` | `#69` | `P2` | `problema_confirmado` | `feedback` | Depois de aplicar, a mensagem diz "Importação aplicada ao rascunho (N itens processados). Clique em Salvar Rascunho para gravar.", mas o rascunho já foi salvo sozinho (indicador "✓ Todas as alterações foram salvas" e 1 `PUT`). `editor.js:1055-1058`. Capturas `csv-aplicado-merge-bom-1280-claro.png` | A mensagem descreve o estado real (por exemplo, "Importação aplicada e salva no rascunho. Publique para atualizar a vitrine.") e usa plural correto ("1 item") | Aberto |
| `UX-69-003` | `#69` | `P1` | `problema_confirmado` | `formularios` | Arquivos sem BOM em Windows-1252 (o "CSV" padrão do Excel em português) são lidos como UTF-8 sem aviso. "Pavê de Limão" virou `Pav� de Lim�o`, a prévia mostrou "1 válidas · 0 com erro" e o texto corrompido foi salvo. `editor.js:1066` (`readAsText(file, 'UTF-8')`); `csv-catalog.js:17-23`. Captura `csv-previa-windows-1252-1280-claro.png`; corpo do `PUT` em `resultados-69-70.json` (`r69/06.json`) | Um arquivo com caractere de substituição (`U+FFFD`) gera erro na prévia orientando a salvar como "CSV UTF-8", ou o arquivo é decodificado corretamente como Windows-1252; nenhum texto com `�` chega ao rascunho | Aberto |
| `UX-69-004` | `#69` | `P1` | `problema_confirmado` | `navegacao` | "Exportar vitrine" não faz nada. O item chama `document.getElementById('csv-export-btn')?.click()`, mas esse botão não existe no HTML, então `csvExportBtn` é `null` e o tratador de exportação nunca é ligado. 0 downloads no teste. `index.html:976`, `editor.js:150`, `editor.js:656-658`, `editor.js:972-984` | Clicar em "Exportar vitrine" baixa um CSV UTF-8 com BOM, `;` e o cabeçalho do tipo de vitrine; reimportar esse arquivo em "Adicionar" não muda nenhum item | Aberto |
| `UX-69-005` | `#69` | `P2` | `risco_codigo` | `navegacao` | Quando a exportação voltar a funcionar, o arquivo vai se chamar `cardapio-<endereço>.csv`, termo proibido em texto voltado ao usuário. O teste de terminologia só procura as formas acentuadas e por isso não pega o nome. `editor.js:979`; `test/portal-redesign-qa.test.mjs:135-136` | O arquivo exportado se chama `vitrine-<endereço>.csv`; o teste de terminologia também falha com a forma sem acento em nomes de arquivo | Aberto |
| `UX-69-006` | `#69` | `P2` | `problema_confirmado` | `formularios` | Os números de linha nos erros se deslocam depois de uma linha em branco, porque `parseCSV` descarta linhas vazias e o número é calculado pelo índice da linha lida. Em `05-erros-linha.csv`, o item sem nome está na linha 5 do arquivo e foi informado como "Linha 4"; "Pudim" (linha 6) como "Linha 5". O mesmo vale para campos com quebra de linha entre aspas. `csv-catalog.js:53-58`, `csv-catalog.js:171-177` | Cada erro informa a linha física do arquivo (a que aparece no Excel e no Google Planilhas), inclusive com linhas em branco e campos com várias linhas | Aberto |
| `UX-69-007` | `#69` | `P2` | `problema_confirmado` | `formularios` | Descrição com "data:" seguido de texto comum ("Escolha a data: sábado ou domingo") é rejeitada pelo filtro de conteúdo perigoso, com a mensagem enganosa "a descrição deve ter no máximo 280 caracteres válidos". O servidor aceita esse texto (o padrão dele tem uma exceção para "data:" seguido de palavra). `csv-catalog.js:7-8` e `csv-catalog.js:200-203`; `src/portal-validation.mjs:182-183` | A regra da planilha é a mesma do servidor; "data: sábado" é aceito; texto realmente bloqueado recebe uma mensagem própria ("remova links ou códigos da descrição"), separada da de tamanho | Aberto |
| `UX-69-008` | `#69` | `P2` | `problema_confirmado` | `formularios` | Um cabeçalho escrito à mão com acentos e espaços ("Descrição", "Preço", "Quantidade mínima") é rejeitado como "Colunas obrigatórias ausentes: descricao, preco, quantidade_minima", sem mostrar o cabeçalho esperado nem os nomes encontrados. `csv-catalog.js:142-149` | O cabeçalho é comparado sem acento, caixa ou espaço extra (`Preço` = `preco`, `Quantidade mínima` = `quantidade_minima`); se faltar coluna, a mensagem lista as encontradas, as esperadas e oferece o modelo para download | Aberto |
| `UX-69-009` | `#69` | `P2` | `problema_confirmado` | `formularios` | Com cabeçalho separado por vírgula, um preço sem aspas (`18,00`) parte a linha em uma coluna a mais; o erro aparece em `quantidade_minima` e não no preço. `csv-catalog.js:25-26` | Linha com número de colunas diferente do cabeçalho gera erro próprio ("a linha 3 tem 7 colunas, o cabeçalho tem 6: coloque o preço entre aspas ou use ponto e vírgula") | Aberto |
| `UX-69-010` | `#69` | `P2` | `critica_ux` | `feedback` | A prévia só mostra "N válidas · M com erro". O parser já calcula itens novos, itens atualizados e categorias novas (`summary`), mas nada disso aparece; também não aparece quantos itens o modo "Substituir" removerá, nem que o limite de 20 ativos será ultrapassado (só depois de clicar em "Aplicar", com `07-limite-21.csv`). `csv-catalog.js:308-318`; `editor.js:1013-1015`, `editor.js:1047-1051` | Antes de aplicar, a prévia mostra itens novos, atualizados, categorias novas e, no modo "Substituir", itens removidos; uma importação que passa do limite é sinalizada na prévia, com "Aplicar" desabilitado e o motivo visível | Aberto |
| `UX-69-011` | `#69` | `P2` | `problema_confirmado` | `feedback` | Quando o arquivo é lido, a prévia aparece sem anúncio: `#csv-preview-container` e `#csv-errors-list` não têm `aria-live` nem `role`, e o foco continua no botão "Planilha (CSV)". Leitor de tela não fica sabendo do resultado nem dos erros. `index.html:993-1002`; `editor.js:1012-1034`; `focoAposPrevia` em `resultados-69-70.json` | Depois da leitura, o foco vai para o título da prévia (ou o resumo é anunciado por região `role="status"`); a lista de erros é anunciada com a quantidade de erros | Aberto |
| `UX-69-012` | `#69` | `P2` | `problema_confirmado` | `navegacao` | O menu "Planilha (CSV)" não segue o padrão de menu: `Esc` não fecha, `↓` não entra no menu, e o menu continua aberto quando o foco sai por `Tab`. O menu da barra de ferramentas ao lado já trata essas teclas. `editor.js:641-646` (só clique) em contraste com `editor.js:557-590` | `Esc` fecha e devolve o foco ao botão; `↓`/`↑` percorrem os itens; sair por `Tab` ou clicar fora fecha o menu e atualiza `aria-expanded` | Aberto |
| `UX-69-013` | `#69` | `P2` | `problema_confirmado` | `navegacao` | Em 360 e 375 px, o menu aberto ultrapassa a borda direita (borda em 380 px) e a página passa a rolar para o lado (largura útil de 387/388 px). Captura `editor-csv-menu-aberto-360-claro.png` e `editor-csv-menu-aberto-375-claro.png` | Em 360 px o menu cabe inteiro na tela, sem rolagem horizontal da página | Aberto |
| `UX-69-014` | `#69` | `P2` | `problema_confirmado` | `formularios` | Alvos de toque abaixo de 44 px em ≤ 390 px: "+ Adicionar item" e "Planilha (CSV)" com 36 px, itens do menu com 33 px, links dos modelos com 15 px de altura. `alvosToolbar`/`alvosMenu` em `resultados-69-70.json` (`g69/ini-360.json`) | Em 360–390 px, botões e itens de menu têm pelo menos 44×44 px; os links de modelo ficam num botão ou têm área de toque de 44 px | Aberto |
| `UX-69-015` | `#69` | `P3` | `critica_ux` | `formularios` | `1.234,56` (milhar com ponto, formato brasileiro) é recusado com "use o formato brasileiro, ex: 25,00", e `18.00` recebe a mesma mensagem. `csv-catalog.js:89-92` | `1.234,56` é aceito como R$ 1.234,56; `18.00` recebe mensagem específica ("use vírgula para os centavos: 18,00") | Aberto |
| `UX-69-016` | `#69` | `P3` | `critica_ux` | `feedback` | Duas linhas com a mesma categoria e nome ("Mousse" e "mousse") contam como "2 válidas" e a última vence sem aviso. `csv-catalog.js:286-306` | A prévia avisa "a linha 9 repete o item da linha 8; vale a última" | Aberto |
| `UX-69-017` | `#69` | `P3` | `risco_codigo` | `movimento` | O banner de retorno sobe a página com `scrollTo({ behavior: 'smooth' })` mesmo com `prefers-reduced-motion: reduce` (o CSS só desliga animações e transições) e some em 6 s, o que pode esconder o erro de limite antes da leitura. `web/portal/portal.js:901-918`; `portal.css:2007-2011` | Com movimento reduzido, a rolagem é instantânea; mensagens de erro ficam visíveis até a pessoa fechar ou corrigir | Aberto |
| `UX-69-018` | `#69` | `P3` | `risco_codigo` | `navegacao` | Código morto sugere ligações perdidas: `#csv-download-primary-link` e `#csv-upload-btn` não existem no HTML, então `updateCsvModelLink()` nunca destaca o modelo do tipo de vitrine atual. `editor.js:149-151`, `editor.js:460-469`, `editor.js:986-988` | Os seletores usados em `editor.js` existem no HTML, ou o código sem uso é removido; o modelo indicado segue o tipo de vitrine (serviços para `booking`) | Aberto |
| `UX-69-019` | `#69` | `P3` | `critica_ux` | `feedback` | A lista de erros tem rolagem interna de 180 px; em 375 px e no zoom de 200% só 2 ou 3 erros ficam visíveis, e no zoom a barra inferior fixa cobre as opções de modo. `portal.css:2397-2405`. Capturas `csv-previa-erros-linha-375-escuro.png` e `csv-previa-erros-linha-720-claro-zoom200.png` | Em telas estreitas e no zoom de 200%, a lista de erros cresce com o conteúdo (ou tem link "ver todos") e nenhum controle da prévia fica sob a barra fixa | Aberto |
| `UX-69-020` | `#69` | `P3` | `nao_verificado` | `feedback` | No preview, os modelos são servidos como `application/octet-stream` (`scripts/serve.mjs`); no Worker, o tipo servido não foi verificado (checagem humana opcional `CHK-UX-61-PROD`) | Em produção, `modelo-*.csv` responde `Content-Type: text/csv; charset=utf-8` | Aberto |

Contagem: 0 P0, 3 P1, 11 P2, 6 P3.

Comportamentos que funcionaram como o contrato descreve: BOM removido; `;` e `,` detectados
pelo cabeçalho; vírgula decimal e `R$`; `ativo` vazio vira ativo; upsert sem diferenciar caixa e
espaços duplicados (a Margherita foi atualizada sem duplicar); categoria nova criada no fim;
limite de 20 ativos bloqueia antes do `PUT`; "Cancelar" preserva o rascunho; regras de
`booking` (5 a 480 min) e `quote` (preço vazio) respeitadas; modelos com BOM e cabeçalho exato.

## 6. Bloqueios e checklist de aceite

| Código | Bloqueio | Checklist de aceite |
| --- | --- | --- |
| `BLK-UX-61-AUTH` | Sem sessão real no ambiente de auditoria (o Worker publicado é `bbafd95`, mas o login Google exige navegador real): o `PUT` do rascunho foi simulado, então não foram verificadas as respostas reais (`409` de conflito durante o salvamento automático após importar, `ACTIVE_ITEMS_LIMIT_EXCEEDED` do servidor, limite de 256 KiB) | [ ] Importar `01-bom-ponto-virgula.csv` numa vitrine de teste real e conferir revisão + 1 · [ ] Importar com outra aba editando a mesma vitrine e verificar o aviso de conflito · [ ] Conferir o `Content-Type` dos modelos (UX-69-020) |
| Seletor de arquivo nativo | O Chrome headless não abre o seletor do sistema | [ ] Em um celular Android e um iPhone reais, "Importar planilha" abre o seletor de arquivos e aceita um `.csv` exportado do Google Planilhas |

## 7. Recomendações

Em ordem de prioridade (textos sugeridos sempre com "vitrine"):

1. **Proteger o modo "Substituir"** (UX-69-001, UX-69-002): confirmação com contagem
   ("Isso remove 4 itens e 2 categorias desta vitrine. Substituir?"), botão "Desfazer
   importação" por alguns segundos e mensagem final coerente com o salvamento automático.
2. **Consertar "Exportar vitrine"** (UX-69-004, UX-69-005): ligar o tratador ao item do menu e
   nomear o arquivo `vitrine-<endereço>.csv`; ampliar o teste de terminologia para a forma sem acento.
3. **Codificação** (UX-69-003): detectar `U+FFFD` após a leitura e tentar `windows-1252`, ou
   avisar "Salve a planilha como CSV UTF-8 (Excel: Arquivo › Salvar como › CSV UTF-8)".
4. **Prévia útil e acessível** (UX-69-010, UX-69-011, UX-69-016, UX-69-019): mostrar novos,
   atualizados, removidos, repetidos e o efeito no limite de 20 ativos; anunciar com `role="status"`
   e levar o foco ao título da prévia.
5. **Mensagens de erro precisas** (UX-69-006 a UX-69-009, UX-69-015): linha física do arquivo,
   regra de conteúdo igual à do servidor, cabeçalho tolerante a acentos e caixa, aviso de número
   de colunas e aceitação de `1.234,56`.
6. **Menu e toque** (UX-69-012 a UX-69-014): padrão de menu com teclado, posicionamento que
   respeita a borda em 360 px e alvos de 44 px.
