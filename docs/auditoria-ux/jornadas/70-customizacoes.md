# Jornada `#70` — Solicitação e acompanhamento de customizações

- **Issue**: [`#70`](https://github.com/coletivo-inspira/vitrine/issues/70) (2ª onda, AFK).
- **Coleta**: 2026-11-14, 17:20–18:10 UTC.
- **Código auditado**: `main` em `bbafd95c13ab5142aa642287f788632cdd0c55e3`; build `0911af34bd42`.
- **Superfícies**: `/portal/#pedidos` (o contrato cita `#customizacoes`; o hash real é `#pedidos`):
  formulário `#customization-request-form`, lista `#requests-list-container`, botão
  "Conversar no WhatsApp" de cada cartão, resumo no `#inicio` e o atalho do assistente
  (modelo "Personalizado" em `#wizard`). Código em `web/portal/portal.js`,
  `web/portal/index.html`, `src/portal-validation.mjs` e `workers/api.mjs`.
- **Evidências**: pasta `media/auditoria-ux/70-pedidos/` do Context do projeto (48 capturas).
  Resultados brutos em `internal/auditoria-ux/resultados-69-70.json`.
- **WhatsApp**: só o `href` foi inspecionado; nenhuma conversa foi aberta e nenhuma mensagem foi enviada.

## 1. Ambiente e mocks

- Preview local `PORT=4186 npm run preview`, painel com o harness
  `internal/auditoria-ux/mock-69-70.mjs` (cópia estendida de `painel-mock-cdp.mjs`).
- Mocks específicos desta jornada:
  - `GET /api/customization-requests`: lista vazia, ou 5 pedidos de teste com os 4 status do
    banco (`novo`, `em_analise`, `respondido`, `encerrado`) e um status fora do mapa (`aguardando`);
  - `POST /api/customization-requests`: `201` com o registro, `422` (mensagem igual à do
    servidor para mais de 10 links), `500`, falha de rede (`Fetch.failRequest`) e atraso de 1,5 s;
  - recarga real da página (`Page.reload`) para verificar o que sobrevive.
- Respostas reais do Worker e do Supabase (RLS, gatilhos de status) não foram exercitadas;
  achados que dependem delas estão marcados como `risco_codigo` ou `nao_verificado`.

## 2. Cenários de envio

| Cenário | Dados | Pedidos enviados (`POST`) | Mensagem exibida | Formulário depois | Lista depois |
| --- | --- | --- | --- | --- | --- |
| Sucesso | Saúde, "Agenda de consultas", objetivo de 50 caracteres, 1 link `https` | 1 → `201` | "Pedido de customização registrado com sucesso!" | Limpo; área volta a "Alimentação" | 1 cartão "Novo" |
| Formulário vazio | — | 0 | "Insira o nome do modelo/recurso desejado (máx. 120 caracteres)." | Preservado | Inalterada |
| Objetivo curto ("Curto") | 375 px | 0 | "O objetivo do projeto deve ter entre 10 e 2000 caracteres." | Preservado | Inalterada |
| Link `http://` | 2 links, um sem `https` | 0 | "Todos os links de referência devem usar o protocolo seguro HTTPS…" + erro junto ao campo | Preservado | Inalterada |
| 11 links `https` | Servidor responde `422` | 1 → `422` | **"Pedido registrado com sucesso no navegador (modo offline)."** | **Limpo** | Cartão "Novo" que **some ao recarregar** ("Nenhuma solicitação enviada ainda.") |
| Erro do servidor | Servidor responde `500` (375 px, escuro) | 1 → `500` | Mesma mensagem de sucesso "modo offline" | Limpo | Cartão "Novo" que some ao recarregar |
| Queda de rede | `Fetch.failRequest` | 1 → falha | Mesma mensagem de sucesso "modo offline" | Limpo | Cartão "Novo" só neste navegador |
| Clique duplo | Atraso de 1,5 s no servidor | **2 → `201`, `201`** | Sucesso | Limpo | **2 cartões idênticos** |
| Movimento reduzido | 375 px, `prefers-reduced-motion: reduce` | 1 → `201` | Sucesso | Limpo | 1 cartão |

Em todos os casos o banner de retorno some depois de 6 s, e o foco fica no botão "Enviar Pedido".

## 3. Lista de status e link do WhatsApp

| Status no banco | Selo exibido | Observação |
| --- | --- | --- |
| `novo` | "Novo" | Texto simples, mesmo estilo para todos |
| `em_analise` | "Em Análise" | — |
| `respondido` | "Respondido" | Nada mostra a resposta nem onde ela foi enviada |
| `encerrado` | "Encerrado" | O botão de WhatsApp continua aparecendo |
| fora do mapa (`aguardando`) | "Pendente" | O banco só aceita os 4 status acima (`supabase/migrations/202611120002_portal_profiles.sql:110`) |

Todos os 5 cartões têm o mesmo destino: `https://wa.me/5511999999999?text=…`, um número
fictício. O texto é montado com `encodeURIComponent` (acentos, `&` e aspas chegaram corretos
ao decodificar) e sempre termina com "...", mesmo quando o objetivo é curto. O site público já
tem o contato real da equipe em `content/contact.json` (servido em `/data/contact.json`), que o
painel não usa.

## 4. Inventário de controles

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Link de navegação `a[href="#pedidos"]` | Link | default, ativo | 360–1440, claro/escuro | Abrir a seção | Mesmo nome em todas as larguras | "Customizações" na barra lateral; "Pedidos" na barra inferior (≤ 1024 px) (UX-70-006) | Item ativo destacado |
| `#request-storefront-type` "Área de Atuação" | Campo (select) | default, focus, após envio | 360–1440, 200% | Área do negócio | Mantém a escolha | 44 px de altura; volta a "Alimentação" depois de qualquer envio | `<label for>` correto |
| `#request-template-interest` "Modelo / Recurso Desejado" | Campo (texto) | default, focus, vazio, preenchido | 360–1440 | O que se quer | Erro junto ao campo quando vazio | Erro só no banner do topo (UX-70-004). 48 px de altura; **30 px em ≤ 390 px** (UX-70-007) | `required`, `maxlength=120`, sem `aria-invalid` |
| `#request-goal` "Objetivo do Projeto (mínimo 10 caracteres)" | Campo (textarea) | vazio, curto, válido | 360–1440 | Descrever o objetivo | Erro junto ao campo, contador | Erro só no banner; regra de mínimo já está no rótulo | `minlength=10`, `maxlength=2000`, sem `aria-invalid` |
| `#request-reference-urls` "Links de Referência" | Campo (textarea) | vazio, `http`, 11 links | 360–1440 | Referências | Erro junto ao campo; limite de 10 avisado | `http://` mostra `#request-reference-error`; 11 links passam no navegador e o servidor recusa (UX-70-005) | Erro sem `aria-describedby` nem `aria-invalid` |
| `#request-desired-deadline` "Prazo Desejado" | Campo (texto) | vazio, preenchido | 360–1440 | Prazo | — | Opcional; 30 px de altura em ≤ 390 px | `maxlength=120` |
| `button[type=submit]` "Enviar Pedido" | Botão | default, focus-visible, envio em andamento, erro | 360–1440, horizontal, 200% | Registrar o pedido | Desabilitado e com indicação durante o envio | Continua habilitado; clique duplo gera 2 pedidos (UX-70-003) | Contraste 4,92:1 (claro) e 9,61:1 (escuro); 44 px |
| `#global-feedback` | Banner | sucesso, erro | 360–1440 | Retorno do envio | Distingue registrado no servidor de não registrado | Falhas do servidor aparecem como sucesso "modo offline" (UX-70-001); some em 6 s | `aria-live="polite"` |
| `#requests-list-container` | Lista | vazia, 5 status, após falha, após recarga | 360–1440, horizontal, 200%, claro/escuro | Acompanhar pedidos | Status distinguíveis, histórico real | Status só em texto; item não registrado some ao recarregar (UX-70-001, UX-70-008) | Vazio: "Nenhuma solicitação enviada ainda." |
| `.request-card-wa-btn` "Conversar no WhatsApp 💬" | Link externo | default, focus-visible | 360–1440 | Falar com o Coletivo | Número real da equipe; aviso de nova aba | Número fictício `5511999999999` (UX-70-002); `target="_blank"` sem aviso; emoji no nome acessível (UX-70-009) | 44 px; contraste 13,27:1 |
| `#custom-requests-summary-text` (em `#inicio`) | Texto | 0, 1, 5 pedidos | 1280 | Resumo na página inicial | Conta só os pedidos registrados | "5 pedidos enviados ao coletivo."; inclui os não registrados após falha | — |
| Atalho do assistente (modelo "Personalizado") | Fluxo | código | — | Levar ao formulário pré-preenchido | URL e histórico coerentes | Troca de seção sem mudar o hash (UX-70-010) | Banner "Preencha os detalhes do seu pedido personalizado abaixo." |

Ordem de tabulação verificada: Área → Modelo → Objetivo → Links → Prazo → "Enviar Pedido" →
primeiro "Conversar no WhatsApp". Todos com contorno de foco laranja de 3 px.

## 5. Matriz de cenários da jornada

| Jornada | 360 | 390 | 768 | 1024 | 1440 | Horizontal | Zoom 200% | Claro | Escuro | Teclado | Movimento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#70` Customizações | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | parcial |

- Lista com 5 pedidos em 360×800, 375×812 (claro e escuro), 390×844, 768×1024, 1024×768,
  1280×900 (claro e escuro), 1440×900, horizontal 844×390 e zoom 200% (720×450 px CSS com
  `deviceScaleFactor` 2). Envio nos cenários da seção 2, em 375 e 1280 px, nos dois temas.
- Sem rolagem horizontal em nenhuma largura.
- Contraste AA em todos os textos medidos (menor razão 4,92:1, botão "Enviar Pedido" no tema claro).
- Movimento **parcial**: movimento reduzido emulado no envio em 375 px; a rolagem suave do
  banner vem de JavaScript (ver `UX-69-017`, `web/portal/portal.js:915-917`).

## 6. Achados

| ID | Issue | Severidade | Natureza | Eixo | Descrição e Evidência | Critério de Aceite | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UX-70-001` | `#70` | `P1` | `risco_codigo` | `feedback` | Qualquer resposta que não seja `2xx` (`422`, `500`, sessão expirada `401`) ou falha de rede é tratada como sucesso: aparece "Pedido registrado com sucesso no navegador (modo offline).", o formulário é limpo e um cartão "Novo" entra na lista. O pedido não chegou ao Coletivo, e ao recarregar o cartão some ("Nenhuma solicitação enviada ainda."), levando junto o texto que a pessoa digitou. `web/portal/portal.js:1328-1367` (grava em `localStorage` antes do `POST`, ignora `res.ok === false`, chama `customizationForm.reset()`) e `portal.js:1170-1188` (a lista do servidor substitui a local). Reproduzido com respostas simuladas. Capturas `pedidos-apos-envio-servidor-500-375-escuro.png`, `pedidos-apos-envio-servidor-422-1280-claro.png`, `pedidos-apos-envio-rede-1280-claro.png` | Com `4xx`, `5xx` ou falha de rede, a interface mostra erro (com a mensagem do servidor quando houver), mantém os campos preenchidos e não cria cartão; só uma resposta `201` mostra "registrado" e adiciona o cartão; recarregar a página nunca faz sumir um pedido mostrado como registrado | Aberto |
| `UX-70-002` | `#70` | `P1` | `problema_confirmado` | `navegacao` | "Conversar no WhatsApp" aponta para o número fictício `5511999999999` em todos os cartões, com o objetivo do cliente no texto. Se a pessoa confirmar o envio no WhatsApp, a mensagem vai para um número que não é da equipe. O contato real já existe em `content/contact.json` (publicado em `/data/contact.json`). `portal.js:1256-1258`. Classificado como `P1`, e não `P0`, porque o envio exige confirmação no próprio WhatsApp | O link usa o número de `content/contact.json` (o mesmo do site público) ou some quando não há contato configurado; nenhum `href` do painel contém `5511999999999` | Aberto |
| `UX-70-003` | `#70` | `P2` | `problema_confirmado` | `formularios` | O botão "Enviar Pedido" continua habilitado durante o envio; dois cliques com o servidor lento geraram 2 `POST` e 2 pedidos idênticos. O Worker não deduplica. `portal.js:1283-1367`; `workers/api.mjs:4498-4511`. Capturas `pedidos-apos-envio-clique-duplo-1280-claro.png`, `pedidos-lista-apos-clique-duplo-1280-claro.png` | Durante o envio o botão fica desabilitado, com `aria-busy="true"` e texto "Enviando…"; um clique duplo gera um único `POST` | Aberto |
| `UX-70-004` | `#70` | `P2` | `problema_confirmado` | `formularios` | Os erros de validação (nome vazio, objetivo curto) só aparecem no banner do topo, que some em 6 s; o campo não é marcado (`aria-invalid` ausente), não há mensagem junto a ele e o foco continua no botão. Para mostrar o banner, a página sobe até o topo; em 375 px o campo com erro fica fora da tela. Os dados digitados são preservados. `portal.js:1290-1313`, `portal.js:901-918`. Capturas `pedidos-apos-envio-objetivo-curto-375-claro.png`, `pedidos-apos-envio-vazio-1280-claro.png` | Cada campo inválido recebe `aria-invalid="true"`, mensagem própria ligada por `aria-describedby` e o foco vai para o primeiro campo com erro; a mensagem de erro não some sozinha | Aberto |
| `UX-70-005` | `#70` | `P2` | `risco_codigo` | `formularios` | O navegador só confere se cada link começa com `https://` e não limita a quantidade; o servidor recusa mais de 10 links e URLs que não passam em `validateSafePublicHttpsUrl`. Por isso o caso de 11 links cai em `UX-70-001`. `portal.js:1300-1313`; `src/portal-validation.mjs:1171-1182` | O navegador aplica as mesmas regras do servidor (até 10 links, URL válida) e mostra o erro junto ao campo antes de enviar | Aberto |
| `UX-70-006` | `#70` | `P2` | `critica_ux` | `navegacao` | A seção tem três nomes: "Customizações" (barra lateral e título), "Pedidos" (barra inferior em telas estreitas e hash `#pedidos`) e "Enviar Pedido" / "Acompanhar Pedidos" nos cartões. No resto do painel, "pedidos" são os pedidos de clientes pelo WhatsApp (Insights, editor). `web/portal/index.html:164-167`, `index.html:1428-1431`, `index.html:589-638` | Mesmo nome em todas as larguras (por exemplo, "Customizações" na navegação, "Enviar solicitação" no botão e "Minhas solicitações" na lista); "pedido" fica reservado aos pedidos de clientes | Aberto |
| `UX-70-007` | `#70` | `P2` | `problema_confirmado` | `formularios` | Em 360, 375 e 390 px, os campos de texto "Modelo / Recurso Desejado" e "Prazo Desejado" ficam com 30 px de altura (48 px a partir de 768 px). `campos` em `resultados-69-70.json` (`p70/lista-360.json`). Captura `pedidos-lista-360-claro.png` | Em 360–390 px, todos os campos têm pelo menos 44 px de altura | Aberto |
| `UX-70-008` | `#70` | `P3` | `critica_ux` | `feedback` | Os selos de status são texto sem cor, ícone ou ordem de etapas, e "Respondido" não mostra a resposta nem por onde ela foi enviada; não há data de atualização. `portal.js:1223-1226`, `portal.js:1272-1280`. Captura `pedidos-lista-cartoes-1280-escuro.png` | Cada status tem cor e ícone próprios (sem depender só da cor), o cartão mostra a data da última atualização e, quando respondido, onde a resposta está | Aberto |
| `UX-70-009` | `#70` | `P3` | `critica_ux` | `navegacao` | "Conversar no WhatsApp 💬" abre em nova aba sem aviso; o emoji entra no nome lido pelo leitor de tela; o texto sempre termina com "..." mesmo para objetivos curtos; o botão continua em pedidos "Encerrado". `portal.js:1251-1259` | O nome acessível é "Conversar no WhatsApp (abre em nova aba)", o emoji fica `aria-hidden`; "..." só aparece quando o texto é cortado | Aberto |
| `UX-70-010` | `#70` | `P3` | `risco_codigo` | `navegacao` | O atalho do assistente (modelo "Personalizado") preenche o formulário e chama `showSection('pedidos')` sem trocar o hash: a URL continua em `#wizard`, recarregar perde o pré-preenchimento e "voltar" não leva ao assistente. `portal.js:340-352` | O atalho leva a `#pedidos` com o pré-preenchimento preservado; "voltar" retorna ao passo 2 do assistente | Aberto |
| `UX-70-011` | `#70` | `P3` | `nao_verificado` | `feedback` | Mudança de status pelo operador (`PATCH /api/admin/customization-requests/:id`) e o reflexo na lista da pessoa não foram verificados: dependem de conta de operador (`BLK-HITL-72`) e de Supabase real | Depois que um operador muda o status para "Em análise", a lista da pessoa mostra o novo status ao recarregar | Bloqueado HITL |

Contagem: 0 P0, 2 P1, 5 P2, 4 P3.

Comportamentos que funcionaram: todos os campos têm `<label for>`; a ordem de tabulação segue
a ordem visual com foco visível; erros de validação no navegador preservam o que foi digitado;
o erro de link `http://` aparece junto ao campo; a lista vazia tem mensagem própria; textos com
`&`, aspas e acentos são exibidos e codificados corretamente; a solicitação (o `POST`) e a
conversa no WhatsApp (link opcional em cada cartão) são ações separadas.

## 7. Bloqueios e checklist de aceite

| Código | Bloqueio | Checklist de aceite |
| --- | --- | --- |
| `BLK-UX-61-AUTH` | Sem sessão real no ambiente de auditoria (login Google exige navegador real); respostas do `POST` simuladas | [ ] Enviar um pedido numa conta de teste real e conferir a linha em `customization_requests` (status `novo`) · [ ] Enviar com 11 links e confirmar que a interface mostra o erro do servidor · [ ] Com a sessão expirada, o envio pede novo login e não limpa o formulário |
| `BLK-HITL-72` | Sem conta em `platform_operators` | [ ] Operador muda o status de um pedido de teste; a pessoa vê o novo selo ao recarregar (UX-70-011) |
| WhatsApp | Nenhuma conversa aberta por regra da auditoria | [ ] Depois de corrigir UX-70-002, conferir num aparelho que o link abre a conversa com o número da equipe, sem enviar |

## 8. Recomendações

1. **Separar "registrado" de "não registrado"** (UX-70-001, UX-70-005): só adicionar o cartão
   após `201`; em erro, manter o formulário e mostrar "Não foi possível enviar sua solicitação.
   Seus dados continuam no formulário. Tente de novo." Se o modo sem conexão continuar, marcar o
   cartão como "Não enviado" com botão "Tentar de novo", sem contá-lo no resumo do início.
2. **Usar o contato real da equipe** (UX-70-002, UX-70-009): ler o mesmo número de
   `content/contact.json` usado no site público e esconder o botão quando não houver contato.
3. **Envio único** (UX-70-003): desabilitar o botão durante o envio; opcionalmente, recusar no
   servidor um pedido idêntico enviado em poucos segundos.
4. **Erros junto aos campos** (UX-70-004, UX-70-007): `aria-invalid`, mensagem por campo, foco no
   primeiro erro, campos de 44 px no celular.
5. **Nomes consistentes e status legíveis** (UX-70-006, UX-70-008, UX-70-010): um nome só para a
   seção, selos com cor e ícone, data de atualização e atalho do assistente pelo hash `#pedidos`.
