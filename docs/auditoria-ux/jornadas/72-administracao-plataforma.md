# Jornada `#72` — Administração da plataforma com conta de teste

Seção da Auditoria UX para a issue `#72`, seguindo as convenções da
[matriz central](../matriz-central.md) (seção 4) e o
[contrato da matriz](../../../specs/010-ux-audit-meta-readiness/contracts/ux-audit-matrix-contract.md).

- **Data da coleta**: 2026-11-14, 17:20–17:50 UTC.
- **Commit auditado**: `main` em `bbafd95c13ab5142aa642287f788632cdd0c55e3`.
- **Build**: hash `0911af34bd42` (`npm run build`).
- **Superfícies**: botão `#platform-cms-open` em `/portal/#inicio` e a seção
  `#platform-cms-section` com `#platform-operations` (indicadores, pedidos de
  customização e atividade), `#platform-mila` (pedidos pela Mila),
  `#platform-templates` (modelos de vitrine) e o CMS institucional
  (`#platform-cms-fields`, `#platform-cms-publish`).
- **Tipo**: HITL. Esta entrega cobre a parte **AFK** com o papel
  `platform_admin` simulado; a sessão real fica no bloqueio `BLK-HITL-72`
  (seção 6), sem impedir o PR.
- **Evidências**: pasta `media/auditoria-ux/72-admin/` do Context do projeto (as
  imagens não são versionadas no repositório).

## 1. Escopo

Verificar a jornada de quem opera a plataforma: quem enxerga a administração
(por papel), se cada ação identifica o conteúdo afetado, e como ficam prévia,
confirmação, histórico e recuperação ao editar a página institucional, os
modelos de vitrine e as etapas dos pedidos de customização.

## 2. Ambiente e mocks

- Preview local `PORT=4187 npm run preview`.
- Painel autenticado simulado pelo Chrome DevTools Protocol com o script
  `internal/auditoria-ux/mock-71-72.mjs` do Context (cópia estendida de
  `painel-mock-cdp.mjs`, da `#61`). Parâmetro `platform`:
  - `platform_admin`: `/api/admin/*` responde `200` com dados de teste — 6 seções
    do CMS (abertura, benefícios, perguntas, comunicados, navegação, rodapé, com
    `publishedAt` de 2026-11-12), indicadores (41,2 de 500 MB, 12 vitrines, 87
    arquivos, 1 domínio ativo, 3 de 95 vagas), 2 pedidos de customização
    (`novo` e `respondido`), 2 registros de atividade, 2 modelos
    (`pizzeria-v1`, `booking-v1`) e um resultado da Mila.
  - `support_operator` e `nenhum` (dono comum): `403 FORBIDDEN_PLATFORM_ADMIN`,
    igual ao Worker (`workers/api.mjs:4154`, `private.is_platform_admin()` só
    aceita `platform_admin`).
  - `erro401`: sessão expirada em `/api/admin/*`.
  - Variações: publicação com conflito (`409 CMS_CHANGED`) e falha `500` em
    `/api/admin/overview`.
- As mutações (`PUT /api/admin/cms/:secao`, `POST /api/admin/cms/publish`,
  `PATCH /api/admin/customization-requests/:id`, `POST /api/admin/templates`)
  responderam no mock; **nenhum dado real foi alterado**. O link "Repassar ao
  dono no WhatsApp" foi validado só pelo `href`.
- Não verificado: RLS e RPCs no Supabase remoto, efeito real da publicação na
  home pública e propagação de um modelo editado para as vitrines.

## 3. Permissões por papel (RBAC)

| Papel | Origem | Botão "Administração da plataforma" | Observado no mock | Natureza |
| --- | --- | --- | --- | --- |
| Visitante | Sem sessão | Não aparece (tela de login) | — | `problema_confirmado` (ok) |
| `owner`, `admin`, `editor`, `viewer` da vitrine | `site_members.role` | Oculto | `GET /api/admin/cms → 403`; botão continua `hidden` (`inicio-owner-sem-admin-1280-claro.png`) | `problema_confirmado` (ok) |
| `support_operator` | `platform_operators.role` | Oculto | `403` em toda a administração; nenhum aviso (`UX-72-013`) | `problema_confirmado` |
| `platform_admin` | `platform_operators.role` | Visível no topo do Início | Acesso a tudo (`inicio-platform-admin-1280-claro.png`) | `nao_verificado` com conta real (`BLK-HITL-72`) |
| Sessão expirada | `401` | Oculto, sem aviso | `GET /api/admin/cms → 401`; botão some sem explicação (`UX-72-013`) | `problema_confirmado` |

O papel na vitrine não muda nada na administração: a autorização depende só de
`platform_operators` (`supabase/migrations/202611120005_multi_tenant_rbac_audit.sql:28-44`).
O botão só aparece depois de uma resposta positiva do servidor
(`web/portal/platform-cms.js:162-188`), o que evita mostrar controles a quem não
tem permissão.

## 4. Inventário de controles

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `#platform-cms-open` | Botão | hidden (403/401), default, focus-visible | 360–1440, horizontal, 200% | Entrar na administração | Abrir uma rota própria e marcar a navegação | Abre a seção sem mudar o endereço (continua `#inicio`); nenhum item da navegação fica ativo; o foco vai para `body` (`UX-72-001`, `UX-72-007`) | Troca de seção, sem anúncio |
| `.nav-link[href="#inicio"]` dentro da administração | Link | default | 1280 | Voltar ao Início | Sair da administração | Não sai: o endereço já é `#inicio` e não há `hashchange` (`UX-72-001`) | Nenhum |
| `#platform-operations > summary` | Disclosure | fechado, aberto, loading, error | 360–1440, 200% | Indicadores, pedidos e atividade | Carregar ao abrir | Mostra "Carregando administração…" e depois as listas; com falha mostra a mensagem, sem "tentar de novo" (`UX-72-015`) | `role="status"` |
| `#platform-requests button` ("Marcar como em análise" / "respondido" / "encerrado") | Botão | default, disabled, focus-visible | 360–1440 | Avançar a etapa de um pedido | Identificar o pedido e confirmar | Avança direto, sem confirmação nem volta; a linha não mostra vitrine, pessoa nem data (`UX-72-006`) | Botão desativado durante a requisição; a lista é redesenhada e o foco se perde |
| `#platform-audit` | Lista (leitura) | default, empty | 360–1440 | Histórico de ações | Quem fez o quê, em quê | "12/11/2026, 19:00:00 · publish · platform_cms" — códigos técnicos, sem autor nem alvo legível (`UX-72-008`) | Texto |
| `#platform-mila-message`, `#platform-mila-customer`, `.mila-console-submit` | Campos + botão | default, error (sem código), loading, sucesso | 375, 1280 | Localizar a vitrine de um pedido pela Mila | Encontrar a vitrine e montar o repasse | Funciona; sem código explica o formato e devolve o foco ao campo; com código mostra "Vitrine encontrada para #VI-PIZZAR-7F3K." (`admin-mila-resultado-1280-claro.png`) | `role="status"`; máscara de WhatsApp |
| `.mila-console-match a` ("Repassar ao dono no WhatsApp") | Link | default | 1280 | Repassar o pedido | `https://wa.me/<dono>?text=<codificado>` em nova aba | `href` com `encodeURIComponent` correto e `target="_blank"` `rel="noopener noreferrer"`; não foi aberto | — |
| `#platform-template-select` | Campo (select) | default, loading | 360–1440 | Escolher o modelo | Listar os modelos | Lista; visual nativo sem o estilo do painel (30 px em 375) (`UX-72-005`) | `<label>` envolvente "Modelo" |
| `#platform-template-copy` ("Criar a partir deste modelo") | Botão | default, focus-visible | 1280 | Criar um modelo derivado | Pedir identificador e nome | Mostra o campo "Identificador do novo modelo" com foco; placeholder usa termo proibido (`UX-72-012`) | Foco no campo |
| Editor do modelo (`renderStructureFields`) e "Salvar modelo" | Formulário | default, sucesso, error | 375, 1280 | Ajustar cores, tipografia e seções padrão | Dizer quantas e quais vitrines serão afetadas e confirmar | Salva direto; a mensagem diz que vale "na próxima prévia ou publicação", sem dizer quais vitrines (`UX-72-003`) | `role="status"` no topo do painel de modelos |
| `#platform-cms-fields > details` (Abertura, Benefícios, …) | Disclosure + formulário | fechado, aberto | 360–1440, 200% | Editar uma seção da página institucional | Campos legíveis e indicação do que já está publicado | Campos sem estilo, de 21 px de altura, rótulos colados ("Exibir seçãoOrdem") (`UX-72-005`) | — |
| `input[type=checkbox]` "Exibir seção" e `input[type=number]` "Ordem" | Campos | default | 1280, 375 | Visibilidade e posição da seção | Explicar o efeito na home | Número de 0 a 99 sem explicação | — |
| "Adicionar" / "Remover" em listas do CMS | Botões | default, limite | 1280 | Gerir itens de listas | Avisar o limite | "Remover" tira o item na hora (recuperável recarregando antes de salvar); "Adicionar" para em 20 sem aviso (`UX-72-014`) | Foco volta para "Adicionar" ao remover |
| "Salvar rascunho" (por seção) | Botão (submit) | default, disabled, error (campo vazio), sucesso | 1280 | Gravar o rascunho da seção | Confirmar perto do botão | Campo obrigatório vazio: o navegador bloqueia com o balão nativo. Sucesso: "Rascunho salvo em Abertura." no topo da lista do CMS, longe do botão (`UX-72-004`) | `role="status"` compartilhado |
| `#platform-cms-publish` ("Publicar página institucional") | Botão | default, disabled, sucesso, conflito (409) | 360–1440 | Publicar a home institucional | Prévia, confirmação, data da última publicação e como desfazer | Publica direto (nenhuma confirmação); "Página institucional publicada."; no 409 pede "Recarregue e tente novamente" (`UX-72-002`, `UX-72-010`) | `role="status"` no topo |

## 5. Matriz de cenários da jornada

| Cenário | 360 | 390 | 768 | 1024 | 1440 | Horizontal | Zoom 200% | Claro | Escuro | Teclado | Movimento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#72` Administração (mock `platform_admin`) | executado | executado | executado | executado | executado | executado | executado | executado | executado | parcial | executado |
| `#72` Administração (conta real) | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado |

Detalhes:

- **Larguras** (`admin-<largura>-claro.png`): sem rolagem horizontal em 360, 375,
  390, 768, 1024, 1280, 1440, 844×390 e 720 px a 200%. Com tudo aberto, o botão de
  publicar fica a 3.414 px do topo em 1280 e a 3.525 px em 375
  (`admin-aberto-1280-claro-inteira.png`, `admin-aberto-375-claro-inteira.png`).
- **Claro/escuro**: `admin-fechado-1280-claro.png`, `admin-fechado-1280-escuro.png`,
  `admin-fechado-375-claro.png`, `admin-fechado-375-escuro.png`,
  `inicio-platform-admin-375-escuro.png`. Os campos do CMS usam o visual nativo do
  navegador nos dois temas.
- **Teclado** (`admin-foco-teclado-1280-claro.png`): `Enter` no botão abre a
  seção, mas o foco cai em `body`; o `Tab` seguinte vai para o primeiro `summary`
  (contorno laranja de 3 px visível); `Enter` abre o painel. Parcial porque o
  editor de modelos (`showcase-structure.js`) não foi percorrido inteiro.
- **Toque**: `summary` com 26 px de altura, campos do CMS com 21 px e botões
  "Remover"/"Salvar rascunho" com 36 px — abaixo dos 44 px do painel.
- **Movimento reduzido**: a seção não tem animações próprias; a regra global
  (`web/portal/portal.css:2007`) zera as transições.
- **Estados**: rascunho salvo (`admin-rascunho-salvo-1280-claro.png`), publicado
  (`admin-publicado-1280-claro.png`), conflito
  (`admin-publicar-conflito-1280-claro.png`), falha nos indicadores
  (`admin-operacoes-erro-1280-claro.png`), pedido avançado
  (`admin-pedido-avancado-1280-claro.png`), modelos
  (`admin-modelos-1280-claro.png`, `admin-modelo-novo-1280-claro.png`), Mila
  (`admin-mila-resultado-1280-claro.png`), seções do CMS
  (`admin-cms-secoes-1280-claro.png`, `admin-cms-publicar-1280-claro.png`) e
  navegação (`admin-apos-clicar-inicio-1280-claro.png`).

### 5.1 Prévia, confirmação, histórico e recuperação

| Ação | Prévia | Confirmação | Histórico | Recuperação |
| --- | --- | --- | --- | --- |
| Salvar rascunho de seção do CMS | Não | Não (é rascunho) | Não | Editar de novo antes de publicar |
| Publicar página institucional | **Não** | **Não** | Só um registro "publish · platform_cms" na atividade, sem conteúdo | **Não há** desfazer nem versão anterior na interface |
| Salvar modelo de vitrine | Não | **Não** | "template_updated · template" na atividade | **Não** |
| Avançar etapa de pedido de customização | — | **Não** | Registro na atividade | **Não** (a etapa só avança) |
| Repassar pedido da Mila | Mensagem montada no link | Abre o WhatsApp (a pessoa confere antes de enviar) | Não é registrado | — |

## 6. Achados

| ID | Issue | Severidade | Natureza | Eixo | Descrição e Evidência | Critério de Aceite | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UX-72-001` | `#72` | `P1` | `problema_confirmado` | `navegacao` | A administração não tem rota: abrir mantém o endereço `#inicio`, nenhum item da navegação fica ativo, clicar em "Início" não sai da administração (o endereço não muda, então não há `hashchange`), recarregar volta ao Início e "voltar" do navegador não funciona. `web/portal/portal.js:123-137` (sem hash para a seção), `:870`, `:2500`; `web/portal/platform-cms.js:157-160`; captura `admin-apos-clicar-inicio-1280-claro.png` | A administração tem hash próprio (por exemplo `#administracao`), aparece na navegação para `platform_admin`, sobrevive a recarregar e "Início" sempre volta ao Início | Aberto |
| `UX-72-002` | `#72` | `P1` | `problema_confirmado` | `feedback` | "Publicar página institucional" publica a home pública na hora: sem prévia, sem confirmação (`window.confirm` chamado 0 vezes no teste), sem mostrar a data da última publicação (o servidor devolve `publishedAt`, a interface ignora) nem se há rascunho não publicado, e sem desfazer. `web/portal/platform-cms.js:142-153`; `workers/api.mjs:2181`; `web/portal/index.html:378`; capturas `admin-cms-publicar-1280-claro.png`, `admin-publicado-1280-claro.png` | Antes de publicar: prévia da home com o rascunho, lista das seções alteradas e confirmação. Depois: data e autor da publicação e opção de restaurar a versão anterior | Aberto |
| `UX-72-003` | `#72` | `P1` | `critica_ux` | `formularios` | "Salvar modelo" altera os padrões usados por todas as vitrines daquele modelo "na próxima prévia ou publicação", mas a interface não diz quantas nem quais vitrines serão afetadas, não pede confirmação e não guarda versão anterior. `web/portal/platform-cms.js:302-322`; captura `admin-modelos-1280-claro.png` | Antes de salvar, o painel mostra "Este modelo é usado por N vitrines" (com a lista) e pede confirmação; a atividade registra o nome do modelo e há como voltar à versão anterior | Aberto |
| `UX-72-004` | `#72` | `P2` | `problema_confirmado` | `feedback` | O resultado das ações aparece longe delas: "Rascunho salvo em Abertura." e "Página institucional publicada." usam o mesmo `#platform-cms-status`, acima de todas as seções do CMS, fora da tela quando a pessoa clica em "Salvar rascunho" de uma seção mais abaixo ou em "Publicar" no fim. A mensagem antiga continua lá depois de outras ações. `web/portal/platform-cms.js:128-130`, `:146-147`; `web/portal/index.html:376`; captura `admin-rascunho-salvo-1280-claro.png` | Cada formulário mostra o resultado junto do botão (e via `aria-live`); mensagens antigas somem na ação seguinte | Aberto |
| `UX-72-005` | `#72` | `P2` | `problema_confirmado` | `formularios` | Os formulários do CMS não seguem o visual do painel: campos nativos de 21 px de altura, rótulos colados ao campo anterior ("Exibir seçãoOrdem", "TítuloSubtítulo"), campo "Ordem" numérico sem explicação e select "Modelo" sem estilo. Alvos abaixo de 24 px arriscam falhar o WCAG 2.5.8. `web/portal/platform-cms.js:71-79`, `:104-117`; `web/portal/index.html:372`; capturas `admin-cms-secoes-1280-claro.png`, `admin-aberto-375-claro-inteira.png` | Campos com o estilo do painel (`item-input`, 44 px), um rótulo por linha, "Posição na página" explicado e prévia do efeito na home | Aberto |
| `UX-72-006` | `#72` | `P2` | `problema_confirmado` | `feedback` | Avançar a etapa de um pedido de customização é imediato e não tem volta. A linha só mostra etapa e objetivo: falta a vitrine, quem pediu, a data e o tipo (o servidor devolve `storefront_type` e `created_at`). `web/portal/platform-cms.js:230-248`; `workers/api.mjs:2126`; captura `admin-1440-claro.png` | Cada pedido mostra vitrine, pessoa, data e tipo; avançar pede confirmação ou oferece "desfazer" por alguns segundos | Aberto |
| `UX-72-007` | `#72` | `P2` | `problema_confirmado` | `navegacao` | O foco se perde: ao abrir a administração vai para `body` (medido com `document.activeElement`), e ao avançar um pedido a lista é redesenhada e o botão focado deixa de existir. `web/portal/platform-cms.js:157-160`, `:230-248`; captura `admin-foco-teclado-1280-claro.png` | Ao abrir, o foco vai para o título da administração; depois de avançar um pedido, o foco vai para a linha atualizada | Aberto |
| `UX-72-008` | `#72` | `P2` | `critica_ux` | `feedback` | A atividade recente mostra códigos internos ("publish · platform_cms", "template_updated · template"), sem autor, sem nome do item afetado e sem o resumo que o servidor já devolve (`summary`, `entity_id`). `web/portal/platform-cms.js:250-252`; `workers/api.mjs:2125`; captura `admin-1440-claro.png` | Cada registro diz, em português, quem fez, o quê e em qual item ("Lino publicou a página institucional", "Modelo Pizzaria atualizado") | Aberto |
| `UX-72-009` | `#72` | `P2` | `critica_ux` | `navegacao` | A página junta três ferramentas (operações, Mila, modelos) e as seções do CMS no mesmo formato de cartão, sem um título "Página institucional" separando o CMS; o botão de publicar fica no fim da página (3.414 px em 1280 com tudo aberto). A entrada é só um botão no topo do Início. `web/portal/index.html:257`, `:341-379`; capturas `admin-fechado-1280-claro.png`, `admin-aberto-1280-claro-inteira.png` | Áreas separadas com títulos (Operações, Pedidos pela Mila, Modelos, Página institucional) e a ação de publicar sempre visível no grupo do CMS | Aberto |
| `UX-72-010` | `#72` | `P2` | `problema_confirmado` | `feedback` | No conflito de publicação (`409`), a mensagem pede "Recarregue e tente novamente", mas recarregar tira a pessoa da administração (`UX-72-001`) e descarta campos editados e não salvos. Não há botão para recarregar só o CMS. `workers/api.mjs:4290-4292`; captura `admin-publicar-conflito-1280-claro.png` | O conflito oferece "Atualizar rascunho" que recarrega as seções sem sair da página e avisa se há campos não salvos | Aberto |
| `UX-72-011` | `#72` | `P2` | `risco_codigo` | `feedback` | Dados iniciais com termos proibidos chegam à interface: os modelos `products-v1` e `catalog-bio-v1` têm nomes com os dois termos proibidos (aparecem no select "Modelo"), e o subtítulo inicial da seção `hero` do CMS, exibido na home pública por `/api/public/platform-cms` (`web/app.js:273`), também usa os dois termos. `supabase/migrations/202611120006_cms_pages_sections_releases.sql:32`, `:63`, `:66`. Depende do conteúdo atual do banco remoto | Nomes e textos iniciais usam "vitrine"; o teste de terminologia passa a cobrir os textos iniciais das migrações e o placeholder; conferido no banco remoto (seção 7) | Aberto |
| `UX-72-012` | `#72` | `P3` | `problema_confirmado` | `formularios` | O placeholder do identificador de um novo modelo usa um dos termos proibidos (sem acento, por isso o teste de terminologia não pega). `web/portal/platform-cms.js:293`; `test/portal-redesign-qa.test.mjs:135-139`; captura `admin-modelo-novo-1280-claro.png` | Placeholder como `vitrine-bistro`; o teste também verifica as formas sem acento | Aberto |
| `UX-72-013` | `#72` | `P3` | `critica_ux` | `conta_tema` | `support_operator` existe no banco mas recebe `403` em tudo, e uma sessão expirada (`401`) também só esconde o botão. Em nenhum dos casos a pessoa recebe explicação. `web/portal/platform-cms.js:186-188`; `workers/api.mjs:2151-2153` | Decidir o escopo de `support_operator` (por exemplo, só leitura de operações e Mila); com `401`, avisar que a sessão expirou | Aberto |
| `UX-72-014` | `#72` | `P3` | `risco_codigo` | `formularios` | "Adicionar" em listas do CMS para em 20 itens sem nenhum aviso. `web/portal/platform-cms.js:60-62` | O botão fica desativado no limite com o texto "Limite de 20 itens" | Aberto |
| `UX-72-015` | `#72` | `P3` | `problema_confirmado` | `feedback` | Com falha em uma das três consultas de operações, aparece só "Falha ao consultar a administração da plataforma." e as três listas ficam vazias; para tentar de novo é preciso fechar e abrir o painel. `web/portal/platform-cms.js:214-258`; captura `admin-operacoes-erro-1280-claro.png` | Botão "Tentar novamente" e exibição das listas que carregaram | Aberto |

Contagem: `P0` 0 · `P1` 3 · `P2` 8 · `P3` 4 (total 15).

## 7. Bloqueio `BLK-HITL-72` e roteiro para validação com conta real

A sessão real de operador depende de ação humana: inserir o `user_id` de uma conta
de teste em `public.platform_operators` com `role = 'platform_admin'` no Supabase
remoto. A parte AFK acima não depende disso. **Pendência humana**: o Lino executa
o roteiro abaixo e anexa o resultado a esta seção (ou a um comentário na `#73`).

### 7.1 Preparação (Lino)

- [ ] Abrir `https://painel.inspira.dev.br/` num navegador real (o desafio de bots da Cloudflare só afeta clientes automatizados; versão publicada `bbafd95`).
- [ ] Criar ou escolher uma conta Google de teste e entrar uma vez no painel para gerar o `user_id`.
- [ ] No SQL Editor do Supabase: `insert into public.platform_operators (user_id, role) values ('<uuid>', 'platform_admin');` — sem colar tokens ou senhas em issues e capturas.
- [ ] Ter uma segunda conta comum (dona de uma vitrine de teste) para o contraste de papéis.

### 7.2 Roteiro (marcar e anotar o observado)

1. [ ] **Papel comum**: com a conta comum, o botão "Administração da plataforma" não aparece e `GET /api/admin/cms` responde `403` (aba Rede do navegador).
2. [ ] **`platform_admin`**: com a conta de teste, o botão aparece no topo do Início.
3. [ ] **Indicadores**: abrir "Indicadores, solicitações e auditoria"; os números de banco, vitrines, arquivos e domínios conferem com o painel do Supabase.
4. [ ] **Pedido de customização**: criar um pedido com a conta comum (`#pedidos`); com a conta de teste, avançar para "em análise" e conferir que a conta comum vê a nova etapa e que a atividade registra a mudança (`UX-72-006`, `UX-72-008`).
5. [ ] **Modelos**: abrir "Modelos de vitrine", conferir os nomes exibidos (`UX-72-011`) e, sem salvar, anotar se há indicação de vitrines afetadas (`UX-72-003`). Salvar só em um modelo derivado criado para o teste.
6. [ ] **CMS**: editar o comunicado (seção oculta por padrão) para um texto de teste, salvar o rascunho, conferir que a home pública **não** mudou; publicar e conferir que mudou; depois restaurar o texto original e publicar de novo (registrar como foi a recuperação — `UX-72-002`).
7. [ ] **Conflito**: com duas abas da administração, salvar em uma e publicar na outra; anotar a mensagem e o que acontece ao recarregar (`UX-72-010`).
8. [ ] **Mila**: colar uma mensagem com o código de uma vitrine de teste; conferir o resultado e o `href` do botão de repasse **sem enviar** a mensagem.
9. [ ] **Navegação**: dentro da administração, clicar em "Início", recarregar e usar "voltar" (`UX-72-001`).
10. [ ] **Sessão expirada**: sair em outra aba e tentar uma ação na administração; anotar a mensagem (`UX-72-013`).
11. [ ] **Larguras**: repetir os passos 2, 3 e 6 em um celular (cerca de 390 px) e em tema escuro.
12. [ ] **Limpeza**: remover a conta de teste de `platform_operators` ou registrar que ela fica para as próximas ondas.

### 7.3 Critério de aceite do bloqueio

- [ ] Passos 1 a 10 executados com conta real e o observado registrado.
- [ ] Achados `nao_verificado`/`risco_codigo` desta seção confirmados ou descartados.
- [ ] Nenhum dado de produção alterado sem restauração (passo 6) e nenhuma mensagem real enviada.

## 8. Recomendações

1. **Rota e navegação próprias** (`UX-72-001`, `UX-72-007`, `UX-72-009`): item
   "Administração" na navegação, só para `platform_admin`, com subáreas tituladas.
2. **Publicação segura** (`UX-72-002`, `UX-72-010`): estado "rascunho com
   alterações / publicado em", prévia, confirmação com a lista das seções
   alteradas e restauração da versão anterior (o banco já guarda
   `published_content` separado de `draft_content`).
3. **Impacto visível** (`UX-72-003`, `UX-72-006`, `UX-72-008`): toda ação diz o
   que será afetado (vitrines de um modelo, a pessoa de um pedido) e a atividade
   fala português.
4. **Formulários com o sistema visual do painel** (`UX-72-004`, `UX-72-005`):
   mesmos campos, rótulos e mensagens junto do botão usados no editor de vitrine.
5. **Terminologia** (`UX-72-011`, `UX-72-012`): migração de dados nova (as
   migrações são só acrescentadas) renomeando os textos iniciais e ampliação do
   teste para formas sem acento.
