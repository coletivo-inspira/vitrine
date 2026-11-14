# Jornada `#64` — Início do painel e seleção de vitrines

Seção da Auditoria UX ([matriz central](../matriz-central.md), contrato
[`ux-audit-matrix-contract.md`](../../../specs/010-ux-audit-meta-readiness/contracts/ux-audit-matrix-contract.md)).

- **Issue**: `#64` — encontrar e abrir a vitrine correta desde o painel inicial.
- **Coleta**: 2026-11-14, 17:20–18:10 UTC.
- **Código auditado**: `main` em `bbafd95c13ab5142aa642287f788632cdd0c55e3`; build com hash `0911af34bd42`.
- **Evidências**: pasta `media/auditoria-ux/64-inicio-vitrines/` do Context do projeto
  (imagens não versionadas). Capturas citadas pelo nome do arquivo.

## 1. Escopo

| Superfície | Seletor / hash | Coberto |
| --- | --- | --- |
| Painel inicial | `#inicio` / `#inicio-section` (jornada de lançamento, cartões "Suas Vitrines", "Pedidos de Customização", "Destaques da Semana") | Sim |
| Minhas Vitrines | `#vitrines` / `#vitrines-section`, `#sites-list-container` | Sim |
| Cartões de vitrine | `.site-item` (nome, endereço, selo de papel, "Editar vitrine", "Leilões") | Sim |
| Seletor rápido no topo | Previsto em `specs/009-modular-admin-platform/spec.md:23` e `tasks.md:49` | Ausente na interface (`UX-64-004`) |
| Permissões por papel | `owner`, `admin`, `editor`, `viewer` (`site_memberships.role`) | Interface sim; servidor não verificado |
| Entrada no editor | `openEditor`, `#editor`, botão "Voltar" | Só a entrada e o retorno (o editor é das `#66`/`#67`) |

O conteúdo do cartão de Insights (zero × sem dados) fica com a `#71`; o assistente aberto
por "Criar Nova Vitrine" fica com a `#65`.

## 2. Ambiente e mocks

Mesmo ambiente da [`#63`](63-entrada-conta.md#2-ambiente-e-mocks): preview na porta `4183`,
Chrome headless e harness `internal/auditoria-ux/mock-63-64.mjs` do Context. Cenários de
`GET /api/sites` simulados:

| Cenário | Dados |
| --- | --- |
| 0 vitrines | `{ sites: [] }` |
| 1 vitrine | `Vitrine de Teste 1`, `owner` |
| 2–4 vitrines com papéis | `owner`, `admin`, `editor`, `viewer` em rodízio |
| 12 vitrines com nomes longos | "Ateliê de Cerâmica Artesanal e Utilidades Domésticas da Serra Gaúcha Família Bertolucci N" (88 caracteres), endereço de 40 caracteres |
| Falha | `500` |

O rascunho da vitrine vem de `/data/vitrines/loja1/menu.json`. Insights, customizações e
leilões respondem vazio ou `404`. As permissões reais (RLS do Supabase e checagens do Worker)
**não** foram exercitadas: tudo o que depende delas está classificado como `nao_verificado`.

## 3. Inventário de controles

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `#onboarding-checklist-card` `.checklist-link` ("Complete seu perfil", "Crie sua vitrine", "Publique") | Link | default, focus-visible, concluído (✓), pendente (○) | 360–1440, claro/escuro | Guiar até a primeira publicação | Status real por conta e por vitrine; some quando tudo estiver pronto | Perfil e criação refletem os dados; "Publique" depende de `localStorage['vitrine_has_published']`; o cartão nunca some. Links com 21 px de altura (`UX-64-008`, `UX-64-012`) | Só glifo ✓/○ |
| `#vitrines-summary-text` | Texto | carregando, 0, 1, N, erro | 1280, 375 | Resumo da quantidade | Quantidade correta ou erro | "Você possui 12 vitrines cadastradas."; com `500` mostra "Você não possui nenhuma vitrine cadastrada." (`UX-64-003`) | — |
| `#hub-vitrines-list .hub-list-item` | Texto (não interativo) | 0, 1, 3+, nomes longos, papéis | 360–1440 | Atalho para as vitrines | Abrir a vitrine ao clicar | Mostra só as 3 primeiras, sem link nem "ver todas"; nada é clicável (`UX-64-005`). Nomes longos quebram em várias linhas sem transbordar | Selo "Proprietário"/"Colaborador" |
| `#hub-create-site-btn` "Criar Nova Vitrine" | Botão | default, focus-visible, active | todas | Abrir o assistente | Ir para `#wizard` | Vai para `#wizard`; é a única ação principal (laranja) do cartão mesmo com vitrines existentes (`UX-64-011`) | — |
| `#hub-new-request-btn` "Fazer Solicitação" | Botão | default, focus-visible | todas | Abrir customizações | `#pedidos` | Vai para `#pedidos` | — |
| `#hub-open-insights-btn` "Ver Painel de Insights" | Botão | default, focus-visible | todas | Abrir Insights | `#insights` | Vai para `#insights` | — |
| `#wizard-open-btn` "+ Nova Vitrine" | Botão | default, focus-visible | todas | Abrir o assistente | `#wizard` | Vai para `#wizard` | — |
| `.site-item` (cartão) | Cartão | 0, 1, 4 papéis, 12 longos, erro | 360–1440, horizontal, 200%, claro/escuro | Identificar a vitrine | Nome, endereço, papel, situação de publicação | Nome, endereço em texto (não é link) e selo; sem situação de publicação nem data. Em 360 e 375 px os botões saem do cartão (`UX-64-006`, `UX-64-007`) | — |
| `.site-role-badge` | Selo | `owner`, `admin`, `editor`, `viewer` | todas, claro/escuro | Mostrar o papel | Rótulo por papel | "Proprietário" para `owner`; "Colaborador" para todos os demais. Contraste 4,30:1 no claro (`UX-64-001`, `UX-64-002`) | Só texto |
| `.site-item-actions` "Editar vitrine" | Botão | default, focus-visible, active, por papel | todas | Abrir o editor | Rótulo e ações conforme o papel | Igual para todos os papéis; `viewer` entra no editor com "Salvar rascunho" e "Publicar vitrine" (`UX-64-001`). Captura `editor-aberto-por-viewer-1280-claro.png` | — |
| `.site-item-actions` "Leilões" | Botão | default, por papel | todas | Abrir leilões da vitrine | Só para quem gerencia | Só aparece para `owner`/`admin` (`web/portal/portal.js:1594`); `Enter` leva a `#leiloes` | — |
| `#back-to-dashboard` "Voltar" (editor) | Botão | default | 1280 | Voltar à lista | `#vitrines` | Volta para `#vitrines` | — |
| `/portal/#editor` sem vitrine selecionada (link direto ou recarga) | Rota | — | 1280 | Abrir o editor | Reabrir a última vitrine ou explicar | Redireciona em silêncio para `#vitrines` (`UX-64-010`) | Nenhum |
| `#sites-list-container` (vazio / erro) | Lista | vazio, carregando, erro | 375, 1280 | Lista de vitrines | Estado vazio com orientação; erro com nova tentativa | Vazio: "Nenhuma vitrine ativa cadastrada." sem ação no lugar. Erro: "Carregando vitrines..." para sempre (`UX-64-003`, `UX-64-013`) | Banner de 6 s no erro |
| Seletor rápido de vitrines | Menu | — | — | Trocar de vitrine em qualquer seção | Presente no cabeçalho ou na barra lateral (spec 009) | Não existe; `.top-bar-middle` só tem o selo do modo local (`web/portal/index.html:184-190`) (`UX-64-004`) | — |

## 4. Matriz de cenários

| Cenário | 360 | 390 | 768 | 1024 | 1440 | Horizontal | Zoom 200% | Claro | Escuro | Teclado | Movimento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#inicio` com 3 vitrines de papéis variados e nomes longos | executado | executado | executado | executado | executado | n/a | n/a | executado | executado | executado | executado |
| `#inicio` com 0, 1 e 12 vitrines; falha `500` | executado (375) | n/a | n/a | n/a | executado (1280) | n/a | n/a | executado | executado | n/a | n/a |
| Atalhos do início (criar, publique, Insights, solicitação) | n/a | n/a | n/a | n/a | executado (1280) | n/a | n/a | executado | n/a | executado | n/a |
| `#vitrines` com 4 papéis e nomes longos | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |
| `#vitrines` vazia, 12 itens, falha `500` | executado (375) | n/a | n/a | n/a | executado (1280) | n/a | n/a | executado | n/a | n/a | n/a |
| Abrir editor pelo cartão, Voltar, `#editor` direto | n/a | n/a | n/a | n/a | executado (1280) | n/a | n/a | executado | n/a | executado | n/a |
| Seletor rápido no topo | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado |
| Permissões aplicadas pelo servidor (RLS, Worker) | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado |

"Bloqueado" no seletor rápido significa que o controle não existe (achado `UX-64-004`), não uma
falta de ambiente. Resumo para a matriz central (linha `#64`): 360, 390, 768, 1024, 1440,
horizontal, zoom 200%, claro, escuro, teclado e movimento **executados**; seletor rápido
ausente; permissões no servidor sem verificação (`BLK-UX-64-RBAC`).

Medições que passaram e não geram achado:

- Sem rolagem horizontal em `#inicio` e `#vitrines` em nenhuma largura, na horizontal (844×390) nem no zoom 200%.
- A grade do início passa de 3 colunas para 1 em ≤ 1100 px (`web/portal/portal.css:1491`), sem sobreposição.
- Ordem de tabulação: atalho de conteúdo → marca → navegação → tema → Sair → jornada → botões dos cartões; nos cartões de vitrine, "Editar vitrine" → "Leilões" por cartão. Foco visível (3 px laranja) em todos.
- Contraste ≥ 4,5:1 em todos os textos medidos no tema escuro (selos: 8,06:1) e em todos os textos do claro, exceto os selos (`UX-64-002`).
- Movimento e transparência reduzidos: sem animação de entrada (`fadeIn`) e com superfície sólida, nos dois temas.

## 5. Achados

| ID | Issue | Severidade | Natureza | Eixo | Descrição e Evidência | Critério de Aceite | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UX-64-001` | `#64` | `P1` | `problema_confirmado` | `navegacao` | A lista não distingue editar, visualizar e publicar por papel. O selo é binário (`site.role === 'owner' ? 'Proprietário' : 'Colaborador'`, `web/portal/portal.js:1432` e `:1577`), e o Worker também devolve `collaborator` para papéis desconhecidos (`workers/api.mjs:2504-2505`). "Editar vitrine" aparece para todos (`web/portal/portal.js:1583-1589`), e um `viewer` entra no editor vendo "+ Adicionar item", "Salvar rascunho" e "Publicar vitrine". O editor já tem rótulos por papel (`teamRoleLabels`, `web/portal/editor.js:3201`), mas os cartões não os usam. Capturas `vitrines-papeis-1280-claro.png` e `editor-aberto-por-viewer-1280-claro.png` | O selo mostra "Proprietário", "Administrador", "Editor" ou "Leitor". Para `viewer`, a ação é "Ver vitrine" e o editor abre sem salvar nem publicar. Publicar aparece só para os papéis que o servidor permite | Aberto |
| `UX-64-002` | `#64` | `P1` | `problema_confirmado` | `navegacao` | No tema claro, os selos de papel (`.site-role-badge`, `web/portal/portal.css:852-861`, e `.hub-list-item span`, `:719-726`) usam laranja `#C74414` sobre damasco `#FBEDE5`: contraste de **4,30:1** em texto de 11 px, abaixo dos 4,5:1 do WCAG 1.4.3. No escuro, 8,06:1. Capturas `vitrines-papeis-375-claro.png` e `inicio-1-vitrine-1280-claro.png` | Contraste dos selos ≥ 4,5:1 nos dois temas (ex.: texto em `#A9360E` ou `--ink` sobre damasco) | Aberto |
| `UX-64-003` | `#64` | `P1` | `problema_confirmado` | `feedback` | Com `GET /api/sites` → `500`, a lista de `#vitrines` fica em "Carregando vitrines..." para sempre (`web/portal/portal.js:1483-1499`), e o início afirma "Você não possui nenhuma vitrine cadastrada." e "Nenhuma vitrine ativa.", com "Crie sua vitrine" pendente na jornada. O único aviso é um banner que some em 6 s. Isso induz a criar uma vitrine duplicada. Capturas `inicio-erro-500-1280-claro.png` e `vitrines-erro-500-1280-claro.png` | Com falha, o início e a lista mostram "Não foi possível carregar suas vitrines" com botão "Tentar de novo", e nenhum texto afirma que não há vitrines | Aberto |
| `UX-64-004` | `#64` | `P2` | `problema_confirmado` | `navegacao` | Não existe o seletor rápido de vitrines previsto na spec 009 (história 1, `specs/009-modular-admin-platform/spec.md:23`), embora a tarefa `T009` esteja marcada como concluída (`specs/009-modular-admin-platform/tasks.md:49`). O cabeçalho só tem o selo do modo local, o tema e Sair (`web/portal/index.html:184-198`). Para trocar de vitrine no editor, é preciso voltar a Minhas Vitrines; Insights e Leilões têm seletores próprios e separados (`#insights-site-select`, `#auctions-site-select`) | Com 2 ou mais vitrines, um seletor no cabeçalho ou na barra lateral mostra a vitrine atual e troca o contexto de editor, Insights e Leilões em uma ação, com aviso de alterações não salvas | Aberto |
| `UX-64-005` | `#64` | `P2` | `critica_ux` | `navegacao` | O cartão "Suas Vitrines" do início lista só as 3 primeiras (`sites.slice(0, 3)`, `web/portal/portal.js:1424`) como texto, sem link para abri-las nem "Ver todas (12)". Para abrir a vitrine é preciso ir à barra de navegação. Captura `inicio-12-vitrines-nomes-longos-375-claro.png` | Cada vitrine do cartão abre o editor (ou a visão por papel) e, com mais de 3, aparece "Ver todas as N vitrines" levando a `#vitrines` | Aberto |
| `UX-64-006` | `#64` | `P2` | `problema_confirmado` | `navegacao` | Em 360 e 375 px, os botões "Editar vitrine" e "Leilões" ultrapassam a borda direita do cartão, e "Editar vitrine" quebra em duas linhas: `.site-item` é `flex` em linha, sem quebra nem regra para celular (`web/portal/portal.css:829-839`). Em 390 px já cabe. Capturas `vitrines-papeis-375-claro.png` e `vitrines-12-nomes-longos-375-claro.png` (confirma a pista da `#61`) | Em 360 px, ações empilhadas abaixo das informações, dentro do cartão, cada uma em uma linha e com ≥ 44 px | Aberto |
| `UX-64-007` | `#64` | `P2` | `critica_ux` | `feedback` | O cartão não informa se a vitrine está publicada nem quando foi alterada, e o endereço é texto, não link. A API de lista não devolve a publicação (`workers/api.mjs:2486-2507`). O título "Suas Vitrines Ativas" e o vazio "Nenhuma vitrine ativa cadastrada." sugerem que todas estão no ar | Cada cartão mostra "Publicada" (com link para o endereço público, em nova aba e com aviso) ou "Rascunho", mais a data da última alteração. O título passa a "Suas vitrines" | Aberto |
| `UX-64-008` | `#64` | `P2` | `risco_codigo` | `feedback` | O passo "Publique" da jornada lê `localStorage['vitrine_has_published']` (`web/portal/portal.js:1378`): vale por navegador, não por conta nem por vitrine, e não é limpo ao sair. Outro aparelho mostra "○ Publique" com a vitrine no ar, e outra conta no mesmo navegador herda "✓". O cartão nunca some depois de completo (`web/portal/portal.js:1397`). O link "Publique" leva a `#vitrines`, não à vitrine que falta publicar | O status vem do servidor por vitrine. Com tudo concluído, a jornada some ou vira um resumo. "Publique" abre o editor da vitrine pendente | Aberto |
| `UX-64-009` | `#64` | `P3` | `critica_ux` | `navegacao` | Lista extensa: com 12 vitrines de nome longo, `#vitrines` em 375 px vira uma coluna muito comprida, sem busca, filtro ou ordenação (ordem de criação, `workers/api.mjs:2488`). Os nomes quebram por inteiro (sem cortes), o que preserva a leitura. Captura `vitrines-12-nomes-longos-375-claro.png` | Com mais de 6 vitrines, há busca por nome ou endereço e ordenação por "alterada recentemente" | Aberto |
| `UX-64-010` | `#64` | `P2` | `problema_confirmado` | `navegacao` | Recarregar a página no editor ou abrir `/portal/#editor` direto leva, em silêncio, a `#vitrines`: a vitrine ativa só existe em memória (`web/portal/portal.js:169-174`). No editor, nenhum item da navegação fica ativo (`editor` não está nas barras), então a pessoa perde a referência de onde está. Captura `editor-aberto-por-viewer-1280-claro.png` | O hash do editor identifica a vitrine (ex.: `#editor/<id>`) e reabre a mesma vitrine após recarregar. No editor, "Minhas Vitrines" fica marcada como ativa | Aberto |
| `UX-64-011` | `#64` | `P3` | `critica_ux` | `navegacao` | No início, a única ação principal (laranja) do cartão "Suas Vitrines" é "Criar Nova Vitrine", mesmo quando a pessoa já tem vitrine e o próximo passo é editar ou publicar. Os títulos dos três cartões ficam desalinhados verticalmente em 1280 px. Captura `inicio-1-vitrine-1280-claro.png` | Com ao menos uma vitrine, a ação principal é "Continuar editando <nome>" e "Criar nova vitrine" passa a secundária. Os títulos dos cartões ficam alinhados no topo | Aberto |
| `UX-64-012` | `#64` | `P3` | `problema_confirmado` | `navegacao` | Os links da jornada de lançamento têm 21 px de altura (`.checklist-link`), abaixo da meta de 44 px do `DESIGN.md`. O status é transmitido só pelos glifos "✓"/"○" dentro de uma lista com marcadores | Cada passo é um alvo ≥ 44 px, e o status tem texto acessível ("concluído"/"pendente") | Aberto |
| `UX-64-013` | `#64` | `P3` | `critica_ux` | `feedback` | Lista vazia em `#vitrines`: só "Nenhuma vitrine ativa cadastrada.", sem explicação nem botão no lugar (o "+ Nova Vitrine" fica no cabeçalho da seção). Captura `vitrines-vazia-375-claro.png` | O estado vazio explica o próximo passo e tem o botão "Criar minha primeira vitrine" | Aberto |
| `UX-64-014` | `#64` | `P3` | `risco_codigo` | `navegacao` | O endereço do cartão é montado com o domínio fixo `vitrine.inspira.dev.br/` (`web/portal/portal.js:1573`), ignorando `PUBLIC_SITE_ORIGIN` lido de `/api/auth/config` (`web/portal/portal.js:754-756`). Em outro ambiente ou domínio próprio, o endereço mostrado fica errado | O endereço usa a origem pública configurada (ou o domínio próprio da vitrine, quando houver) | Aberto |
| `UX-64-015` | `#64` | `P2` | `nao_verificado` | `navegacao` | As ações exibidas por papel não foram confrontadas com o servidor: não se sabe se `editor` pode publicar nem se `viewer` recebe `403` ao salvar (o mock aceita tudo). A RLS de `site_memberships` aceita `owner`, `admin`, `editor`, `viewer` e `collaborator` (`supabase/migrations/202611120005_multi_tenant_rbac_audit.sql:103`) | Teste de ponta a ponta (PGlite) cobre salvar, publicar e abrir leilões para cada papel, e a interface mostra só o que o servidor aceita | Bloqueado HITL |

Contagem: `P0` 0 · `P1` 3 (`UX-64-001`, `002`, `003`) · `P2` 7 · `P3` 5.

## 6. Bloqueios e checklist de aceite

| Código | Bloqueio | Checklist de aceite |
| --- | --- | --- |
| `BLK-UX-64-RBAC` | Sem contas reais com papéis `admin`, `editor` e `viewer` numa mesma vitrine; o harness não aplica permissões | [ ] Criar no ambiente de teste (ou em `test/e2e-full-journey.test.mjs`) uma vitrine com quatro membros, um por papel · [ ] Para cada papel, registrar o que `GET /api/sites` devolve, se salvar o rascunho e publicar respondem `200` ou `403` e quais botões o painel mostra (valida `UX-64-001` e `UX-64-015`) |
| `CHK-UX-61-PROD` (opcional) | Clientes automatizados recebem o desafio de bots da Cloudflare; a versão publicada (`bbafd95`) é a mesma auditada localmente | [ ] Opcional: repetir `#inicio` e `#vitrines` em `painel.inspira.dev.br` com conta real, num navegador real |
| Seletor rápido | Controle inexistente (não é bloqueio de ambiente) | [ ] Depois de implementar `UX-64-004`, auditar o seletor nas 5 larguras, com teclado (`Enter`, setas, `Esc`) e com alterações não salvas |

## 7. Recomendações

1. **Permissões visíveis** (`UX-64-001`, `015`): reaproveitar `teamRoleLabels` nos cartões e no
   início; derivar as ações (ver, editar, publicar, leilões) de uma tabela única por papel,
   compartilhada com o editor e validada contra o Worker.
2. **Estados de carregamento e erro** (`UX-64-003`, `013`): separar "carregando", "vazio" e "erro"
   na lista e no resumo do início, com nova tentativa.
3. **Seleção da vitrine** (`UX-64-004`, `005`, `010`): seletor rápido no cabeçalho (ou no topo da
   barra lateral), atalhos clicáveis no início e o identificador da vitrine no hash do editor.
4. **Cartão da vitrine** (`UX-64-006`, `007`, `014`): empilhar as ações no celular, mostrar
   publicada/rascunho com link público e usar a origem configurada.
5. **Jornada de lançamento** (`UX-64-008`, `011`, `012`): status vindo do servidor, ação principal
   conforme o progresso e alvos maiores.
6. **Contraste dos selos** (`UX-64-002`): escurecer o texto do selo no tema claro e revisar, com
   a `#66`, os demais selos do painel que usam laranja sobre damasco.
