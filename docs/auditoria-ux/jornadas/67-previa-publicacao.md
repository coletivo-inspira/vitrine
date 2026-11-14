# Jornada `#67` — Prévia, rascunho e publicação (`#editor`, `/__preview/:siteId`)

Seção da Auditoria UX para a issue `#67` ("Auditar prévia, rascunho e publicação"),
seguindo as convenções da [matriz central](../matriz-central.md) (seção 4) e o
[contrato da auditoria](../../../specs/010-ux-audit-meta-readiness/contracts/ux-audit-matrix-contract.md).

- **Data da coleta**: 2026-11-14, 17:30–17:55 UTC.
- **Commit auditado**: `main` em `bbafd95c13ab5142aa642287f788632cdd0c55e3`; build com hash `0911af34bd42`.
- **Superfície**: barra de ações do editor (Voltar, Ver, Salvar rascunho, Publicar
  vitrine, indicador de salvamento, revisão, medidores), faixa "Publicada", alerta de
  concorrência (`409`), "Versões publicadas" (restauração), prévia ao vivo, aba Prévia
  (móvel) e prévia assinada `/__preview/:siteId`.
- **Evidências**: pasta `media/auditoria-ux/67-publicacao/` do Context do projeto
  (imagens não versionadas).

## 1. Ambiente e simulação

- Preview local `PORT=4184 npm run preview` (sem Worker: `/__preview/` responde `404`
  com texto puro) e painel com `/api/*` simulado pelo Chrome DevTools Protocol:
  `internal/auditoria-ux/mock-65-67.mjs` (cenários `67` e `extra67`).
- O mock mantém estado:
  - `PUT /draft` com revisão otimista (`409 REVISION_CONFLICT` com `currentRevision`);
  - falhas forçadas (`409`, `500`) e atrasos de rede;
  - `POST /publish` (guarda até 5 versões) e `GET /releases`;
  - `POST /rollback`;
  - `POST /preview-token` em dois modos: URL (sem assinatura real) ou `503 PREVIEW_UNAVAILABLE`.
- O comportamento real do Worker para prévia, publicação e restauração foi conferido no
  código (`workers/api.mjs:3912-3939, 5027-5080, 5245-5300`) e nos testes existentes:
  - `test/cms-preview-rollback.test.mjs`: token preso a sessão, vitrine e revisão; validade de 30 min; prévia `404` após alteração do rascunho; restauração;
  - `test/portal-api-contract.test.mjs:317` e `test/e2e-full-journey.test.mjs:961`: `409 REVISION_CONFLICT`.

  Esses pontos ficam como `risco_codigo` ou `nao_verificado` quando não foram executados
  na interface.

## 2. Cenários executados

### 2.1 Matriz da jornada

| Jornada | 360 | 390 | 768 | 1024 | 1440 | Horizontal | Zoom 200% | Claro | Escuro | Teclado | Movimento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#67` Prévia e publicação | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |

- Larguras: barra de ações medida e capturada em todas as larguras, sem rolagem
  horizontal (`editor-barra-acoes-<largura>-claro.png`). Botões com 44 px de altura.
  A barra não é fixa e ocupa 441 px de 780 em 360 e 278 px de 390 na horizontal
  (`UX-67-015`).
- Claro e escuro: alerta de concorrência em 1280 e 375 nos dois temas
  (`editor-conflito-409-{1280,375}-{claro,escuro}.png`); faixa "Publicada" em 1280/375
  claro e 375 escuro (`editor-publicado-*.png`).
- Teclado: ordem Voltar → Tipo de vitrine → Ver → Salvar rascunho → Publicar vitrine →
  abas, com contorno de 3 px. Menu "Ver": ver `UX-67-010`.
- Movimento e transparência reduzidos: a barra de ações perde o `backdrop-filter` e fica
  com fundo sólido (`portal.css:204-208`); animações zeradas.
- Prévia assinada real: `bloqueado`. Sem Worker e sem `PREVIEW_HMAC_SECRET`
  (`BLK-CLOUD-01`); só a navegação até `/__preview/…` foi exercitada.

### 2.2 Estados e falhas cobertos

| Cenário | Resultado observado | Evidência |
| --- | --- | --- |
| Editar um item (autosave) | "Alterando..." → `PUT` (revisão 1) após 1,2 s → "✓ Todas as alterações foram salvas", "Revisão: 2" | resultado `67.autosave` |
| Salvar rascunho manualmente | Aviso de sucesso e um segundo `PUT` automático 1,2 s depois; o indicador volta a "Alterando..." | `UX-67-006` |
| Clique duplo em Salvar (rede lenta) | Dois `PUT` com a mesma revisão: `200` e `409`; alerta de concorrência falso | `editor-clique-duplo-salvar-1280-claro.png` |
| Conflito real (`409`, outra aba) | Alerta amarelo abaixo da barra; aviso global no topo; revisão "em conflito: 1 (servidor: 2)"; foco no `body` | `editor-conflito-409-*.png` |
| "Recarregar rascunho remoto" com edição local | Descarta a edição sem confirmação | `UX-67-004` |
| "Copiar alterações locais" | Copia JSON bruto; no Chrome sem interface, a permissão de área de transferência falhou ("Erro ao copiar rascunho local.") | resultado `67.conflitoAcoes` |
| Publicar com clique duplo | Uma publicação `200`, um `PUT` `409`; faixa "Publicada" e alerta de concorrência ao mesmo tempo | `editor-publicado-1280-claro.png` |
| Falha ao publicar (`500`) | Aviso de erro; a faixa da publicação anterior continua visível | resultado `67.publicarFalha` |
| Versões publicadas e "Restaurar" | `confirm()` "Publicar novamente a revisão 2?"; aviso "Revisão 2 restaurada."; faixa e lista não mudam | `editor-versoes-{1280,375}-claro.png` |
| "Abrir prévia salva" sem segredo configurado | Aviso "A prévia segura ainda não foi configurada." | `editor-previa-503-1280-claro.png` |
| "Abrir prévia salva" com alteração ainda não salva | Navega na mesma aba para `/__preview/…`; o autosave pendente nunca roda | `previa-segura-sem-worker-1280-claro.png` |
| "Abrir vitrine" antes da 1ª publicação | `href="/vitrine-teste"`, que responde `404` | resultado `67.abrirVitrineSemPublicacao` |
| Voltar com salvamento falhando (`500`) | Indicador "⚠️ Falha simulada ao salvar."; "Voltar" sai sem aviso; não há `beforeunload` | `editor-sair-com-falha-1280-claro.png` |

## 3. Inventário de controles

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `#back-to-dashboard` "Voltar" | Botão | default, focus-visible | todas | Sair do editor para Minhas Vitrines | Avisar se houver alteração não salva ou falha | Sai sempre, sem aviso | `UX-67-012` |
| `#editor-revision-indicator` "Revisão: N" | Selo | default, conflito | todas | Mostrar a revisão do rascunho | Linguagem de pessoa usuária | "Revisão em conflito: 1 (servidor: 2)" | Visual (`UX-67-014`) |
| `#autosave-indicator` | Status | saved, saving, error | todas | Estado do salvamento automático | Refletir o estado real | `role="status"` e `aria-live="polite"`; diz "Todas as alterações foram salvas" ou "Alterando..." durante conflito | `UX-67-005` |
| `#editor-view-menu-btn` "Ver" + `#editor-view-menu` | Botão + menu | default, expanded | todas | Abrir a vitrine publicada ou a prévia | Menu com foco e `Esc` | Abre; foco não entra; `Esc` não fecha | `aria-expanded` (`UX-67-010`) |
| `#editor-open-public-link` "Abrir vitrine" | Item de menu (link) | default | 1280 | Ver a página publicada | Indisponível antes da 1ª publicação | Aponta para `/<endereço>` mesmo sem publicação (`404`) | `UX-67-011` |
| `#secure-preview-button` "Abrir prévia salva" | Item de menu (botão) | default, disabled, error | 1280 | Prévia privada temporária da revisão salva | Salvar antes, abrir em nova aba | Mesma aba via `location.assign`; não salva antes | `UX-67-003`, `UX-67-007` |
| `#save-draft-button` "Salvar rascunho" | Botão | default, disabled (>256 KiB), loading | todas | Gravar o rascunho | Desabilitar durante o envio | Nunca desabilita durante o envio; gera `PUT` extra | `UX-67-001`, `UX-67-006` |
| `#publish-site-button` "Publicar vitrine" | Botão | default, loading, error | todas | Publicar o rascunho | Confirmar, desabilitar durante o envio e mostrar resultado | Sem confirmação; sem trava; clique duplo gera conflito falso | `UX-67-002`, `UX-67-016` |
| Medidores Ativos / Total / Rascunho (`progress`) | Medidor | default, acima do limite | todas | Limites do plano gratuito | Aviso antes de bloquear | Avisos `#active-items-warning` etc.; Salvar desabilita acima de 256 KiB | Texto |
| `#publication-status-bar` + `#publication-view-link` | Faixa + link | visível | 1280, 375 | Confirmar publicação | Texto claro e link correto | "Revisão 2 publicada em /vitrine-teste (SHA-256: ab12…)"; não atualiza após restaurar | `aria-live="polite"` (`UX-67-008`, `UX-67-014`) |
| `#conflict-banner` | Alerta | visível | 1280, 375 | Avisar conflito de revisão | Anunciado, visível e com saída segura | Sem `role="alert"`; em 375 começa a 663 px de 812 | `UX-67-004`, `UX-67-005` |
| `#reload-conflict-button` "Recarregar rascunho remoto" | Botão | default | 1280 | Trazer a versão do servidor | Confirmar perda das edições | Descarta sem confirmar | `UX-67-004` |
| `#copy-conflict-button` "Copiar alterações locais" | Botão | default, error | 1280 | Preservar edições locais | Recuperação utilizável | Copia JSON bruto | `UX-67-004` |
| `#publication-history` "Versões publicadas" | `details` | fechado, aberto, carregando, vazio | 1280, 375 | Listar as últimas 5 versões | Fácil de achar; versão no ar marcada | Fim da aba Ajustes (~2.200 px); lista sem estilo; sem marca da versão atual | `role="status"` (`UX-67-009`) |
| "Restaurar" (por versão, só `owner/admin`) | Botão | default, disabled, loading | 1280, 375 | Republicar uma versão anterior | Explicar o efeito e atualizar a tela | `confirm()` nativo; só republica; não atualiza lista, faixa nem rascunho | `aria-label="Restaurar revisão N"` (`UX-67-008`) |
| `.editor-preview-pane` "Pré-visualização Instantânea" / aba "Prévia" (móvel) | Painel / aba | default | 1280, 375 | Prévia ao vivo do rascunho | Fiel à vitrine publicada | Renderizador do cliente com `isPreview: true`; fidelidade com a publicação real não verificada | `UX-67-018` |
| `/__preview/:siteId?token=…` | Página | 404 (sem Worker) | 1280 | Prévia privada da revisão salva | Página explicativa em erro | `404` sem corpo no Worker quando o token expira ou a revisão muda | `UX-67-007` |

## 4. Achados

| ID | Issue | Severidade | Natureza | Eixo | Descrição e Evidência | Critério de Aceite | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UX-67-001` | `#67` | `P1` | `problema_confirmado` | `feedback` | O clique duplo em "Salvar rascunho" envia dois `PUT` com a mesma revisão. O primeiro grava (`200`) e o segundo recebe `409`. A tela mostra "Alerta de Concorrência" e "Revisão em conflito: 5 (servidor: 5)", sem que exista outra aba. O botão não é desabilitado durante o envio (`editor.js:483-485, 2937-2995`). Captura: `editor-clique-duplo-salvar-1280-claro.png`; resultado `67.cliqueDuploSalvar`. | Durante o salvamento, Salvar fica `disabled` com `aria-busy="true"`. Salvamentos manuais e automáticos passam por uma fila única, de modo que dois cliques geram um único `PUT` (ou `PUT`s sequenciais com a revisão atualizada) e nenhum alerta. | Aberto |
| `UX-67-002` | `#67` | `P1` | `problema_confirmado` | `feedback` | O clique duplo em "Publicar vitrine" publica com sucesso e mostra ao mesmo tempo a faixa "Publicada" e o "Alerta de Concorrência", porque o segundo `PUT` prévio recebe `409` (`editor.js:487-489, 2998-3068`). A pessoa não sabe se publicou. Captura: `editor-publicado-1280-claro.png`; resultado `67.publicarCliqueDuplo`. | Publicar fica desabilitado, com texto "Publicando…", do clique até a resposta. Dois cliques geram uma única publicação e nenhum alerta de conflito. | Aberto |
| `UX-67-003` | `#67` | `P1` | `problema_confirmado` | `feedback` | "Abrir prévia salva" chama `location.assign` na mesma aba (`editor.js:3141-3152`). Se a última edição ainda está no intervalo de 1,2 s do autosave (`editor.js:2703-2771`), a navegação cancela o salvamento: o único pedido registrado foi `POST /preview-token`. A edição se perde sem aviso. Não existe `beforeunload` (`window.onbeforeunload === null`). Resultado `67.previa`. | Antes de pedir o token, o editor conclui o salvamento pendente (ou pergunta). A prévia abre em nova aba (`window.open` com `noopener`). Com alterações não salvas, sair da página dispara `beforeunload`. | Aberto |
| `UX-67-004` | `#67` | `P1` | `problema_confirmado` | `formularios` | No alerta de concorrência, "Recarregar rascunho remoto" chama `loadEditor` e descarta as edições locais sem confirmação (`editor.js:957-960`). A alternativa "Copiar alterações locais" copia o rascunho inteiro em JSON (`editor.js:962-970`), inútil para quem edita a vitrine. Nenhuma opção mostra o que mudou nem permite manter a versão local. Resultado `67.conflitoAcoes`. | O alerta oferece "Ver diferenças", "Manter minhas alterações" (regravar sobre a revisão do servidor, com confirmação) e "Usar a versão salva" (com confirmação de descarte). Nenhuma ação descarta edição sem confirmação. | Aberto |
| `UX-67-005` | `#67` | `P2` | `problema_confirmado` | `feedback` | O alerta de concorrência (`index.html:885-894`) não tem `role="alert"` e o foco não é movido. Em 375 px, ele começa a 663 px de 812, abaixo da barra de ações, e só o aviso global (que some em 6 s) fica visível. Durante o conflito, o indicador diz "✓ Todas as alterações foram salvas" ou "Alterando...", porque `handleSaveDraft` termina chamando `updateDraftAndPreview()` (`editor.js:2995`). Capturas: `editor-conflito-409-375-claro.png`, `editor-conflito-409-1280-claro.png`. | Em conflito: o alerta tem `role="alert"`, aparece no topo visível em todas as larguras e recebe o foco. O indicador mostra "Não salvo: conflito com outra versão" até a resolução. | Aberto |
| `UX-67-006` | `#67` | `P2` | `problema_confirmado` | `feedback` | Cada "Salvar rascunho" bem-sucedido agenda mais um autosave: `updateDraftAndPreview()` sem `skipAutosave` em `editor.js:2995`. Resultado: um `PUT` extra 1,2 s depois e o indicador voltando a "Alterando...". A revisão sobe duas vezes por clique, o que aumenta os conflitos com outras abas e invalida a prévia aberta (ver `UX-67-007`). Resultado `67.salvarManual`. | Salvar manualmente gera exatamente um `PUT` e deixa o indicador em "Todas as alterações foram salvas". | Aberto |
| `UX-67-007` | `#67` | `P2` | `risco_codigo` | `feedback` | A prévia assinada responde `404` sem corpo quando o token expira (30 min) ou quando a revisão do rascunho muda (`workers/api.mjs:3912-3939`). Isso é confirmado por `test/cms-preview-rollback.test.mjs:62,72`. Como o autosave cria revisão a cada edição, uma prévia aberta em outra aba fica em branco na primeira alteração, sem explicação nem caminho de volta. No preview local a rota não existe (`previa-segura-sem-worker-1280-claro.png`). | Com token vencido ou revisão nova, `/__preview/` mostra uma página do painel ("Esta prévia mostra uma versão anterior. Abra uma nova prévia.") com link de volta ao editor, mantendo `no-store` e `noindex`. | Aberto |
| `UX-67-008` | `#67` | `P2` | `problema_confirmado` | `feedback` | "Restaurar" só republica uma versão antiga: o Worker troca a publicação e não altera o rascunho (`workers/api.mjs:1290-1300, 5043-5058`). Na tela (`editor.js:3154-3192`), a confirmação é um `confirm()` nativo "Publicar novamente a revisão 2?". Depois do aviso "Revisão 2 restaurada.", a faixa continua "Revisão 4 publicada", a lista não marca a versão no ar e o rascunho segue na revisão 4. A próxima publicação desfaz a restauração sem aviso. Resultado `67.versoes`. | Após restaurar: a faixa e a lista mostram qual versão está no ar (`aria-current`). O texto explica que o rascunho não mudou e oferece "Trazer esta versão para o rascunho". A confirmação usa um diálogo do painel com esse efeito descrito. | Aberto |
| `UX-67-009` | `#67` | `P2` | `problema_confirmado` | `navegacao` | "Versões publicadas" fica no fim da aba Ajustes, dentro de "Administração e Estrutura da Vitrine", a ~2.200 px do topo em 1280 (`index.html:1198-1204`). Aparece como lista sem estilo e não indica o limite de 5 versões. Capturas: `editor-versoes-1280-claro.png`, `editor-versoes-375-claro.png`. | O histórico é alcançável a partir da faixa "Publicada" ou do menu "Ver" em um clique. Itens com data, autor e marca "No ar". Texto "Guardamos as 5 últimas publicações". | Aberto |
| `UX-67-010` | `#67` | `P2` | `problema_confirmado` | `navegacao` | O menu "Ver" (`editor.js:625-639`) abre sem levar o foco à primeira opção, `Esc` não o fecha e as setas não navegam, ao contrário do menu da barra flutuante. Resultado `67.previa` (`focoNoMenu: false`, `menuAbertoAposEsc: true`). | Ao abrir, o foco vai ao 1º item; setas navegam; `Esc` fecha e devolve o foco a "Ver". | Aberto |
| `UX-67-011` | `#67` | `P2` | `risco_codigo` | `navegacao` | "Abrir vitrine" aponta para `/<endereço>` desde o carregamento (`editor.js:376-378`), mesmo sem nenhuma publicação. No preview, `/vitrine-teste` responde `404`. O Worker também não tem publicação para servir. Resultado `67.abrirVitrineSemPublicacao`. | Antes da 1ª publicação, o item mostra "Ainda não publicada" desabilitado (ou leva à prévia). Depois de publicar, aponta para a URL devolvida pela publicação. | Aberto |
| `UX-67-012` | `#67` | `P2` | `problema_confirmado` | `feedback` | Com o autosave falhando ("⚠️ Falha simulada ao salvar."), "Voltar" e a navegação lateral saem do editor sem aviso. `hasUnsavedDraftChanges` (`editor.js:44-46`) só é consultado ao trocar de vitrine (`portal.js:1751`). Ao reabrir, o rascunho vem do servidor e a edição se perde. Captura: `editor-sair-com-falha-1280-claro.png`. | Com alterações não salvas ou falha de salvamento, sair do editor (Voltar, menu, recarregar, fechar) pede confirmação e oferece "Tentar salvar de novo". | Aberto |
| `UX-67-013` | `#67` | `P2` | `critica_ux` | `feedback` | Publicar é imediato: não há confirmação nem resumo do que vai mudar na vitrine pública, embora a ação seja pública e só reversível pelo histórico escondido (`UX-67-009`). | Antes de publicar, um diálogo resume as mudanças (itens adicionados, removidos e alterados desde a última publicação) e confirma "Publicar agora". | Aberto |
| `UX-67-014` | `#67` | `P3` | `critica_ux` | `formularios` | Jargão técnico na barra: "Revisão: N", "Revisão em conflito: 1 (servidor: 2)", "Alerta de Concorrência" e "(SHA-256: ab12cd34ef56...)" na faixa de publicação (`editor.js:3046-3049`; `index.html:810, 887`). | Textos como "Salvo às 17:34", "Esta vitrine foi alterada em outra aba" e "Publicada às 17:34 em vitrine.inspira.dev.br/<endereço>", sem hash. | Aberto |
| `UX-67-015` | `#67` | `P3` | `critica_ux` | `navegacao` | A barra de ações ("Liquid Glass" fixa, segundo o comentário em `index.html:802`) é `static`/`relative`. Ela ocupa 441 px de 780 em 360 e 278 px de 390 na horizontal. Ao rolar uma lista longa de itens, Salvar e Publicar saem da tela. Resultado `67.grade`. | Em larguras estreitas, a barra fica compacta (até ~120 px) e as ações Salvar e Publicar ficam acessíveis durante a rolagem (barra inferior ou fixa compacta), sem cobrir campos em zoom 200%. | Aberto |
| `UX-67-016` | `#67` | `P3` | `risco_codigo` | `feedback` | `refreshPublicationHistory` (`editor.js:3154-3188`) limpa a lista antes de esperar a resposta. Duas chamadas simultâneas (abrir o histórico enquanto uma publicação termina) duplicam as linhas. Isso foi observado no harness ao disparar o evento `toggle` duas vezes (`editor-versoes-375-claro.png`), não em uso normal. | Chamadas concorrentes descartam a resposta antiga (geração ou `AbortController`), e a lista nunca mostra linhas repetidas. | Aberto |
| `UX-67-017` | `#67` | `P3` | `risco_codigo` | `feedback` | O temporizador do autosave (`editor.js:2703`) não é cancelado em "Recarregar rascunho remoto" nem ao trocar de vitrine. Depois de recarregar, um `PUT` agendado antes ainda é enviado com o rascunho recém-carregado (observado: `GET /draft` seguido de `PUT rev=2`), o que sobe a revisão sem alteração real. | `loadEditor` e `clearEditor` cancelam o autosave pendente. Recarregar não gera `PUT`. | Aberto |
| `UX-67-018` | `#67` | `P2` | `nao_verificado` | `feedback` | A fidelidade entre prévia e publicação não pôde ser comparada. A prévia ao vivo usa `StorefrontRenderer` no cliente ("Renderizador idêntico à vitrine pública"). A prévia assinada renderiza `interactive: false` (`workers/api.mjs:3935`). A publicação passa por `compilePublicStorefront` com projeção de campos públicos. Sem Worker, não houve comparação lado a lado. | Com Worker e `PREVIEW_HMAC_SECRET`: publicar uma vitrine de teste e comparar, em 375 e 1280, prévia ao vivo, prévia assinada e `/<endereço>` (itens ocultos, modalidades, repasse pela Mila). As diferenças intencionais (prévia não interativa) ficam indicadas na própria prévia. | Bloqueado HITL |

**Resumo**: 18 achados — `P0` 0, `P1` 4 (`UX-67-001` a `UX-67-004`), `P2` 10, `P3` 4.
O temporizador do aviso global (mensagem nova escondida em ~2 s, resultado
`67.temporizadorFeedback`) está registrado em `UX-65-015`.

## 5. Bloqueios e checklist de aceite

| Código | Bloqueio | Checklist de aceite |
| --- | --- | --- |
| `BLK-CLOUD-01` | Sem `PREVIEW_HMAC_SECRET` nem Worker publicado: a prévia assinada real responde `503 PREVIEW_UNAVAILABLE` | [ ] Segredo `PREVIEW_HMAC_SECRET` configurado no Worker (sem valor em repositório) · [ ] "Abrir prévia salva" abre `/__preview/<id>?token=…` com `cache-control: no-store` e `x-robots-tag: noindex, nofollow` · [ ] Editar um item e recarregar a prévia: conferir a mensagem mostrada (hoje, `404` sem corpo) · [ ] Esperar 30 min e conferir a expiração |
| `BLK-UX-61-PROD` / `BLK-UX-61-AUTH` | Sem sessão real nem domínio publicado: publicação, restauração e conflito entre duas abas reais não executados | [ ] Publicar a vitrine de teste e abrir `https://vitrine.inspira.dev.br/<endereço>` · [ ] Publicar 6 vezes e conferir que o histórico mostra 5 · [ ] Restaurar a penúltima e conferir a página pública e o cache · [ ] Abrir o editor em duas abas, salvar na primeira e editar na segunda: conferir `409` e as ações do alerta · [ ] Repetir a publicação com papel `editor` e conferir a mensagem |

## 6. Recomendações

1. Criar uma fila única de salvamento (manual, automático e antes de publicar), com
   botões desabilitados e `aria-busy` durante o envio. Isso elimina os conflitos falsos
   (`UX-67-001`, `UX-67-002`, `UX-67-006`, `UX-67-017`).
2. Proteger edições: concluir o salvamento antes da prévia, abrir a prévia em nova aba e
   pedir confirmação ao sair com alterações não salvas (`UX-67-003`, `UX-67-012`).
3. Redesenhar o alerta de concorrência com diferenças e escolhas explícitas, anunciado e
   visível no móvel (`UX-67-004`, `UX-67-005`).
4. Deixar claro o que está no ar: histórico acessível a partir da faixa "Publicada",
   versão atual marcada, restauração que explica o efeito no rascunho e confirmação antes
   de publicar (`UX-67-008`, `UX-67-009`, `UX-67-013`).
5. Dar à prévia assinada uma página de erro útil e desabilitar "Abrir vitrine" antes da
   1ª publicação (`UX-67-007`, `UX-67-011`).
6. Trocar revisão, hash e "concorrência" por linguagem da pessoa usuária e compactar a
   barra de ações no móvel (`UX-67-014`, `UX-67-015`).
