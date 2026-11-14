# Relatório consolidado da Auditoria UX (`#73`)

Fechamento do programa de Auditoria UX (issues `#61` a `#73`, especificação
[`010-ux-audit-meta-readiness`](../../specs/010-ux-audit-meta-readiness/spec.md)).
Este relatório confere e consolida as 11 jornadas, deduplica os achados que se
repetem entre elas, prioriza o backlog em ondas e reúne todos os bloqueios e
passos humanos num só lugar.

- **Data**: 2026-11-14.
- **Fontes**: [matriz central](matriz-central.md) (`#61`) e os 11 arquivos de
  jornada em [`jornadas/`](jornadas/), todos já em `main`.
- **Versão auditada**: `main` em `bbafd95c13ab5142aa642287f788632cdd0c55e3`, build
  `0911af34bd42`. É a versão publicada em produção pelo workflow `deploy.yml`
  (14/11/2026, 16:20Z). O preview local do mesmo commit é evidência equivalente;
  o `403` que clientes automatizados recebem é o desafio de bots da Cloudflare, não
  falha (ver [matriz central, seção 1.1](matriz-central.md#11-comparativo-produção--desenvolvimento)).
- **Contrato**: [`ux-audit-matrix-contract.md`](../../specs/010-ux-audit-meta-readiness/contracts/ux-audit-matrix-contract.md)
  e [`data-model.md`](../../specs/010-ux-audit-meta-readiness/data-model.md).
- Nenhum código de produto foi alterado pela auditoria: os achados viram backlog.

## Resumo

- **Cobertura**: 11 de 11 jornadas executadas. Na grade alta da matriz, 121
  cenários aplicáveis (nenhum `n/a`): 116 executados, 5 parciais, 0 bloqueados.
  Todos os 7 formatos de tela (360 a 1440, horizontal e zoom 200%) e os dois temas
  foram executados nas 11 jornadas.
- **Achados**: 191 contados — `P0` 0 · `P1` 35 · `P2` 92 · `P3` 64. Mais 1
  decisão de produto registrada (`UX-64-004`), fora da contagem.
- **P0/P1 pendentes**: nenhum `P0`; 35 `P1`, todos com status `Aberto`
  (seção 4).
- **Temas transversais**: 14 causas comuns explicam 100 dos 191 achados (seção 5).
- **Backlog**: 27 pacotes em 3 ondas — corrigir já (12 pacotes, 76 achados),
  próximo ciclo (12 pacotes, 91 achados) e depois (3 pacotes, 24 achados)
  (seção 6).
- **Passos humanos**: 13 bloqueios ou checagens, nenhum impede o início da
  primeira onda (seção 8).

---

## 1. Conferência das jornadas

Critérios conferidos em cada arquivo, conforme as convenções da
[matriz central (seção 4)](matriz-central.md#4-convenções-comuns): cabeçalho com
commit e build, ambiente e mocks, inventário de controles no formato do contrato,
matriz de cenários, achados com severidade, natureza, eixo, evidência e critério
de aceite, e bloqueios com checklist.

| Jornada | Arquivo | PR | Inventário | Matriz | Achados com critério de aceite | Bloqueios com checklist | Contagem confere |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `#62` Descoberta | [62-descoberta-site.md](jornadas/62-descoberta-site.md) | [#102](https://github.com/coletivo-inspira/vitrine/pull/102) | Sim (6 tabelas) | Sim | 23 de 23 | Sim | Sim |
| `#63` Entrada e conta | [63-entrada-conta.md](jornadas/63-entrada-conta.md) | [#105](https://github.com/coletivo-inspira/vitrine/pull/105) | Sim | Sim | 21 de 21 | Sim | Sim |
| `#64` Início e vitrines | [64-inicio-selecao-vitrines.md](jornadas/64-inicio-selecao-vitrines.md) | [#105](https://github.com/coletivo-inspira/vitrine/pull/105) | Sim | Sim | 14 de 14 (+ `UX-64-004`, decisão) | Sim | Sim |
| `#65` Criação | [65-criacao-vitrine.md](jornadas/65-criacao-vitrine.md) | [#106](https://github.com/coletivo-inspira/vitrine/pull/106) | Sim | Sim | 17 de 17 | Sim | Sim |
| `#66` Edição manual | [66-edicao-manual.md](jornadas/66-edicao-manual.md) | [#106](https://github.com/coletivo-inspira/vitrine/pull/106) | Sim | Sim | 12 de 12 | Sim | Sim |
| `#67` Prévia e publicação | [67-previa-publicacao.md](jornadas/67-previa-publicacao.md) | [#106](https://github.com/coletivo-inspira/vitrine/pull/106) | Sim | Sim | 18 de 18 | Sim | Sim |
| `#68` Vitrine pública | [68-vitrine-publica.md](jornadas/68-vitrine-publica.md) | [#101](https://github.com/coletivo-inspira/vitrine/pull/101) | Sim | Sim | 20 de 20 | Sim | Sim |
| `#69` Importação CSV | [69-importacao-csv.md](jornadas/69-importacao-csv.md) | [#103](https://github.com/coletivo-inspira/vitrine/pull/103) | Sim | Sim | 20 de 20 | Sim | Sim |
| `#70` Customizações | [70-customizacoes.md](jornadas/70-customizacoes.md) | [#103](https://github.com/coletivo-inspira/vitrine/pull/103) | Sim | Sim | 11 de 11 | Sim | Sim |
| `#71` Insights | [71-insights.md](jornadas/71-insights.md) | [#104](https://github.com/coletivo-inspira/vitrine/pull/104) | Sim | Sim | 20 de 20 | Sim (só `CHK-UX-61-PROD`) | Sim |
| `#72` Administração | [72-administracao-plataforma.md](jornadas/72-administracao-plataforma.md) | [#104](https://github.com/coletivo-inspira/vitrine/pull/104) | Sim | Sim | 15 de 15 | Sim (roteiro de 12 passos) | Sim |

As contagens foram recalculadas a partir das tabelas de achados e coincidem com o
resumo de cada arquivo. Nenhum documento cita `BLK-UX-61-PROD`; a checagem em
produção aparece sempre como `CHK-UX-61-PROD`, opcional.

Observações da conferência (não mudam severidade nem contagem):

1. `UX-62-023` usa o status "Checagem humana opcional", fora dos três status da
   convenção. No consolidado, conta como `P2` `nao_verificado` e fica ligado a
   `CHK-UX-61-PROD`.
2. `UX-64-004` usa a natureza `decisao_produto`, que não existe no contrato. É a
   decisão de produto sobre o seletor rápido e fica fora da contagem (decisão 2).
3. `UX-64-015` está como `Bloqueado HITL`, mas o próprio critério de aceite pede
   um teste de ponta a ponta sobre PGlite, que pode ser feito sem ação humana. O
   consolidado o coloca na primeira onda (pacote `PB-05`).
4. `#65` repete a linha `BLK-UX-61-AUTH` duas vezes na tabela de bloqueios; a
   seção 8 junta as duas checklists.
5. `UX-71-008` (texto dos gráficos com 7–8 px) está no eixo `movimento`, embora
   trate de legibilidade. A classificação foi mantida; na seção 7 ele aparece em
   feedback.
6. Três `P1` não são `problema_confirmado`: `UX-62-001` e `UX-70-001`
   (`risco_codigo`, reproduzidos só com mocks) e `UX-72-003` (`critica_ux`, efeito
   em todas as vitrines de um modelo). A severidade das jornadas foi mantida.

## 2. Cobertura por jornada e modo

Legenda: `executado` (verificado com captura ou medição), `parcial` (com limite
registrado na jornada), `bloqueado`, `n/a`. A mesma grade está na
[matriz central, seção 5](matriz-central.md#5-matriz-de-cenários-alto-nível).

| Jornada | 360 | 390 | 768 | 1024 | 1440 | Horizontal | Zoom 200% | Claro | Escuro | Teclado | Movimento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#62` Descoberta | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |
| `#63` Entrada e conta | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |
| `#64` Início e vitrines | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |
| `#65` Criação | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |
| `#66` Edição manual | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | parcial |
| `#67` Prévia e publicação | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |
| `#68` Vitrine pública | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |
| `#69` Importação CSV | executado | executado | executado | executado | executado | executado | executado | executado | executado | parcial | parcial |
| `#70` Customizações | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | parcial |
| `#71` Insights | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |
| `#72` Administração | executado | executado | executado | executado | executado | executado | executado | executado | executado | parcial | executado |

### 2.1 Totais

| Coluna | Executado | Parcial | Bloqueado | `n/a` | Jornadas concluídas |
| --- | --- | --- | --- | --- | --- |
| 360, 390, 768, 1024, 1440 (cada) | 11 | 0 | 0 | 0 | 11 de 11 |
| Horizontal 844×390 | 11 | 0 | 0 | 0 | 11 de 11 |
| Zoom 200% | 11 | 0 | 0 | 0 | 11 de 11 |
| Claro / Escuro (cada) | 11 | 0 | 0 | 0 | 11 de 11 |
| Teclado (foco e contraste) | 9 | 2 (`#69`, `#72`) | 0 | 0 | 9 de 11 completas |
| Movimento (e transparência reduzidos) | 8 | 3 (`#66`, `#69`, `#70`) | 0 | 0 | 8 de 11 completas |
| **Total** | **116** | **5** | **0** | **0** | **121 aplicáveis** |

Motivos das células parciais, conforme as jornadas: em `#69` o seletor de arquivo
nativo não abre no Chrome headless e o movimento reduzido foi emulado só no caminho
feliz; em `#72` o editor de modelos não foi percorrido inteiro por teclado; em
`#66` a transparência reduzida só foi conferida na barra de ações; em `#70` o
movimento reduzido foi emulado só no envio em 375 px. Em `#62`, as páginas sem
controles próprios (`/como-funciona/`, `/orcamento/`, `/privacidade/`, `/termos/`)
têm teclado parcial porque só cabeçalho e rodapé existem para percorrer; a linha
da jornada fica `executado` porque as páginas com controles foram cobertas.

### 2.2 Subcenários bloqueados (fora da grade alta)

Estes cenários não cabem no preview local e dependem de passo humano (seção 8). Não
impedem as células acima porque o mesmo comportamento foi exercitado com mocks.

| Jornada | Subcenário | Código |
| --- | --- | --- |
| `#62` | Destinos externos (`painel`, `inspira.dev.br`, 4 exemplos) | `CHK-UX-61-PROD` (opcional) |
| `#63`, `#65`, `#66`, `#67`, `#69`, `#70` | Login Google real e respostas reais do Worker e do Supabase | `BLK-UX-61-AUTH` |
| `#64` | Permissões aplicadas pelo servidor para cada papel | `BLK-UX-64-RBAC` |
| `#67` | Prévia assinada `/__preview/:siteId` real | `BLK-CLOUD-01` |
| `#68` | Cartão de compartilhamento e curtidas em produção | `BLK-UX-68-OG`, `BLK-UX-68-LIKES` |
| `#69` | Seletor de arquivo em celular real | `CHK-UX-69-ARQUIVO` |
| `#72` | Administração com conta real de operador | `BLK-HITL-72` |

## 3. Contagem de achados

### 3.1 Por issue e severidade

| Issue | Total | `P0` | `P1` | `P2` | `P3` |
| --- | --- | --- | --- | --- | --- |
| `#62` Descoberta | 23 | 0 | 2 | 10 | 11 |
| `#63` Entrada e conta | 21 | 0 | 6 | 10 | 5 |
| `#64` Início e vitrines | 14 | 0 | 3 | 6 | 5 |
| `#65` Criação | 17 | 0 | 2 | 11 | 4 |
| `#66` Edição manual | 12 | 0 | 2 | 6 | 4 |
| `#67` Prévia e publicação | 18 | 0 | 4 | 10 | 4 |
| `#68` Vitrine pública | 20 | 0 | 3 | 7 | 10 |
| `#69` Importação CSV | 20 | 0 | 3 | 11 | 6 |
| `#70` Customizações | 11 | 0 | 2 | 5 | 4 |
| `#71` Insights | 20 | 0 | 5 | 8 | 7 |
| `#72` Administração | 15 | 0 | 3 | 8 | 4 |
| **Total** | **191** | **0** | **35** | **92** | **64** |

`UX-64-004` (decisão de produto) não entra nesta tabela.

### 3.2 Por issue e natureza

| Issue | `problema_confirmado` | `risco_codigo` | `critica_ux` | `nao_verificado` |
| --- | --- | --- | --- | --- |
| `#62` | 11 | 1 | 9 | 2 |
| `#63` | 15 | 2 | 4 | 0 |
| `#64` | 6 | 2 | 5 | 1 |
| `#65` | 12 | 1 | 4 | 0 |
| `#66` | 7 | 0 | 4 | 1 |
| `#67` | 10 | 4 | 3 | 1 |
| `#68` | 13 | 4 | 3 | 0 |
| `#69` | 12 | 3 | 4 | 1 |
| `#70` | 4 | 3 | 3 | 1 |
| `#71` | 13 | 4 | 3 | 0 |
| `#72` | 9 | 2 | 4 | 0 |
| **Total** | **112** | **26** | **46** | **7** |

### 3.3 Por eixo e status

| Eixo | Achados | | Status | Achados |
| --- | --- | --- | --- | --- |
| `feedback` | 76 | | `Aberto` | 185 |
| `navegacao` | 64 | | `Bloqueado HITL` | 5 (`UX-62-008`, `UX-64-015`, `UX-66-011`, `UX-67-018`, `UX-70-011`) |
| `formularios` | 39 | | Checagem humana opcional | 1 (`UX-62-023`) |
| `conta_tema` | 8 | | `Resolvido` | 0 |
| `movimento` | 4 | | | |

## 4. P0 e P1 pendentes

Nenhum `P0`. Os 35 `P1` estão abertos. O critério de aceite completo está no
arquivo da jornada; aqui ele aparece resumido. A coluna "Pacote" liga cada achado
ao backlog da seção 6.

| ID | Achado | Critério de aceite (resumo) | Pacote |
| --- | --- | --- | --- |
| `UX-62-001` | Publicar o conteúdo institucional quebra o site: a abertura vai para o fim da home, o laço para com `TypeError` e o texto-semente tem termos proibidos | Com as 10 seções publicadas, abertura no topo, nenhuma exceção, cada seção só na página que tem o alvo e texto-semente sem termos proibidos (teste automatizado) | `PB-12` |
| `UX-62-002` | `/orcamento/` fica para sempre em "carregando" quando não há canal de contato | Em até 5 s, mensagem de indisponibilidade com outro caminho e `role="status"` | `PB-02` |
| `UX-63-001` | "Entrar com Google" fica preso em "Redirecionando..." quando falta configuração | O botão volta habilitado em até 1 s, com mensagem visível | `PB-02` |
| `UX-63-002` | Mensagens da tela de login nunca aparecem (o banner fica na área autenticada) | Região de mensagens no login; configuração ausente, PKCE e Sair ficam visíveis e são anunciados | `PB-01` |
| `UX-63-003` | Sessão expirada (`401`) deixa a pessoa no painel com dados antigos | Qualquer `401` leva ao login com aviso e devolve ao hash anterior depois de entrar | `PB-04` |
| `UX-63-004` | Sair não apaga perfil e pedidos do `localStorage` | Nenhuma chave `vitrine_*` com dados pessoais depois de Sair | `PB-04` |
| `UX-63-005` | "Pular para o conteúdo" do painel troca a tela para Início | O atalho mantém a seção e foca o conteúdo sem mudar o hash | `PB-09` |
| `UX-63-008` | Erros do perfil obrigatório não identificam o campo (WCAG 3.3.1) | Mensagem por campo com `aria-describedby`, `aria-invalid` e foco no primeiro inválido | `PB-09` |
| `UX-64-001` | Lista e editor não distinguem papéis; `viewer` vê Salvar e Publicar | Selo por papel; `viewer` vê "Ver vitrine" sem salvar nem publicar | `PB-05` |
| `UX-64-002` | Selos de papel com contraste de 4,30:1 no tema claro | Contraste ≥ 4,5:1 nos dois temas | `PB-07` |
| `UX-64-003` | Falha em `/api/sites` vira "nenhuma vitrine" e "Carregando..." eterno | Mensagem de falha com "Tentar de novo"; nenhum texto afirma que não há vitrines | `PB-02` |
| `UX-65-001` | Clique duplo em "Criar Vitrine" cria a vitrine e mostra erro `409` | Botão desabilitado com `aria-busy`, um único `POST` e mensagem de sucesso | `PB-03` |
| `UX-65-009` | Passos inativos do assistente com contraste de 2,15:1 | Contraste ≥ 4,5:1; estado marcado por peso, ícone ou borda | `PB-07` |
| `UX-66-001` | Editor não se adapta ao papel: `viewer` edita e `editor` vê Publicar | `viewer` em modo leitura com aviso; `editor` sem Publicar ou com explicação | `PB-05` |
| `UX-66-002` | Validação do editor só ao salvar, mostrando só o último erro | Erro no campo com `aria-invalid`, resumo com links, foco no primeiro erro e indicador "Há campos a corrigir" | `PB-09` |
| `UX-67-001` | Clique duplo em "Salvar rascunho" gera alerta de conflito falso | Fila única de salvamento; um `PUT` e nenhum alerta | `PB-03` |
| `UX-67-002` | Clique duplo em "Publicar" mostra "Publicada" e conflito ao mesmo tempo | "Publicando…" desabilitado; uma publicação e nenhum alerta | `PB-03` |
| `UX-67-003` | "Abrir prévia salva" na mesma aba descarta a edição pendente | Concluir o salvamento antes, abrir em nova aba e usar `beforeunload` | `PB-03` |
| `UX-67-004` | "Recarregar rascunho remoto" descarta edições sem confirmação | Opções "Ver diferenças", "Manter minhas alterações" e "Usar a versão salva", com confirmação | `PB-10` |
| `UX-68-001` | Nome e endereço da etapa 2 não vão na mensagem do WhatsApp (`/loja1`) | Todo campo da etapa 2 aparece na mensagem; teste cobre `pizzeria-v1` com entrega | `PB-06` |
| `UX-68-002` | Cada interação na vitrine pública joga o foco para `body` | Foco continua no controle equivalente; ao trocar de etapa, vai para o título | `PB-09` |
| `UX-68-003` | Rótulo superior, selo de modalidade, link da cidade e placeholder abaixo de 4,5:1 | Contraste ≥ 4,5:1 nos dois temas | `PB-07` |
| `UX-69-001` | "Substituir vitrine" troca tudo sem confirmação e salva em 1,2 s | Contagem do que será removido, confirmação, cancelar sem `PUT` e "Desfazer" | `PB-08` |
| `UX-69-003` | CSV em Windows-1252 é corrompido e salvo sem aviso | Erro orientando "CSV UTF-8" ou decodificação correta; nenhum `�` no rascunho | `PB-08` |
| `UX-69-004` | "Exportar vitrine" não faz nada | Baixa CSV UTF-8 com BOM; reimportar em "Adicionar" não muda nenhum item | `PB-08` |
| `UX-70-001` | Falha do servidor no pedido de customização aparece como sucesso e some ao recarregar | Erro mantém os campos e não cria cartão; só `201` registra | `PB-02` |
| `UX-70-002` | "Conversar no WhatsApp" usa o número fictício `5511999999999` | Número de `content/contact.json` ou botão oculto; nenhum `href` com o número fictício | `PB-06` |
| `UX-71-001` | Falha nos Insights aparece como zero e "Ainda sem visitas" | Erro distinto do zero, com "Tentar novamente"; `401` leva ao login | `PB-02` |
| `UX-71-002` | Cartão do Início diz "7 dias" com números de 30 ou 90 dias | Rótulo e dados sempre concordam | `PB-11` |
| `UX-71-003` | Gráfico diário mostra só 14 dias em `30d` e `90d` | Cobre o período escolhido ou informa o intervalo exibido | `PB-11` |
| `UX-71-004` | Cliques rápidos exibem dados de outro período | Só a resposta do último período e vitrine pedidos é aplicada | `PB-11` |
| `UX-71-007` | Gráficos sem alternativa textual (WCAG 1.1.1) | Resumo textual com os valores de cada gráfico | `PB-09` |
| `UX-72-001` | Administração sem rota própria: "Início" não sai e recarregar perde a tela | Hash próprio, item na navegação para `platform_admin` e tela preservada ao recarregar | `PB-12` |
| `UX-72-002` | "Publicar página institucional" sem prévia, confirmação nem desfazer | Prévia, lista de seções alteradas, confirmação, data e autor da publicação e restauração | `PB-12` |
| `UX-72-003` | "Salvar modelo" afeta vitrines sem dizer quais nem pedir confirmação | "Este modelo é usado por N vitrines", confirmação e versão anterior | `PB-12` |

## 5. Temas transversais (deduplicação)

Achados de jornadas diferentes com a mesma causa ficam agrupados aqui. Os IDs
originais continuam valendo; nenhum achado foi renumerado nem excluído. Um mesmo
achado pode aparecer em mais de um tema; no backlog (seção 6) cada um entra em um
único pacote.

| Tema | Causa comum | Achados | Correção única sugerida | Pacote |
| --- | --- | --- | --- | --- |
| `TT-01` Contraste de 4,30:1 em selos e textos pequenos | Laranja `#C74414` (`--primary`) sobre damasco ou com opacidade reduzida em textos de 11–14 px no tema claro | `UX-64-002` (4,30), `UX-68-003` (4,30 / 4,27 / placeholder 4,29), `UX-65-009` (2,15) | Um token de texto de destaque acessível (ex.: `#A9360E` ou `--ink`) para textos menores que 18 px e cor própria de placeholder; teste automatizado de contraste nos selos | `PB-07` |
| `TT-02` Clique duplo e envio duplicado | Botões sem trava durante a requisição; salvamento manual e automático em paralelo | `UX-65-001`, `UX-67-001`, `UX-67-002`, `UX-70-003`, `UX-67-006`, `UX-67-017`, `UX-67-016` | Utilitário único de envio (desabilita, `aria-busy`, texto "Enviando…") e fila única de salvamento do rascunho | `PB-03` |
| `TT-03` Falha do servidor exibida como sucesso, zero ou vazio | O `catch` cai num estado "normal" (sucesso local, dataset vazio, lista vazia, carregando eterno) | `UX-70-001` (sucesso), `UX-71-001` (zero), `UX-64-003` (nenhuma vitrine), `UX-62-002` (carregando eterno), `UX-63-001` (botão preso), `UX-63-015` (login normal), `UX-65-012` (troca de modelo como sucesso), `UX-71-012`, `UX-72-015`, `UX-71-014`, `UX-68-009`, `UX-68-018` | Componente de estado com quatro casos distintos — carregando, vazio, erro com "Tentar de novo" e sucesso — usado por painel, Insights, lista de vitrines e site | `PB-02` |
| `TT-04` Papéis não respeitados na interface | Selo binário "Proprietário/Colaborador" e ações iguais para todos; o servidor tem regras que a interface ignora | `UX-64-001`, `UX-66-001`, `UX-64-015`, `UX-72-013` | Tabela única de ações por papel (`owner`, `admin`, `editor`, `viewer`, `support_operator`), compartilhada por cartões, editor e administração e verificada contra o Worker em teste PGlite | `PB-05` |
| `TT-05` Número fictício `5511999999999` | Número de exemplo usado como contato real e como reserva do renderizador | `UX-70-002` (painel), `UX-68-010` (`/loja1` e reserva do renderizador) | Ler o contato do coletivo de `content/contact.json`; sem contato, esconder o link; nenhum número inventado | `PB-06` |
| `TT-06` Foco perdido | Re-renderização com `replaceChildren`/`innerHTML` e troca de seção sem mover o foco | `UX-68-002`, `UX-66-004`, `UX-65-006`, `UX-72-007`, `UX-63-005`, `UX-69-011`, `UX-68-004`, `UX-67-005`, `UX-67-010`, `UX-69-012`, `UX-65-010` | Utilitário de foco: guardar o identificador do controle ativo antes de redesenhar e restaurá-lo; ao trocar de etapa ou seção, focar o título (`tabindex="-1"`) | `PB-09`, `PB-17` |
| `TT-07` Banner global efêmero | `#global-feedback` dentro da área autenticada, `aria-live="polite"` também para erros, temporizador de 6 s sem cancelamento e rolagem suave forçada | `UX-63-002`, `UX-63-016`, `UX-65-015`, `UX-69-017`, `UX-69-002`, `UX-72-004` | Região de mensagens reescrita: fora da área autenticada, `role="alert"` para erros que ficam até serem dispensados, temporizador reiniciado e sem rolagem quando o erro tem lugar no campo | `PB-01` |
| `TT-08` Erros de formulário sem vínculo com o campo | Validação só por banner, sem `aria-invalid`, `aria-describedby` nem foco; regras do cliente diferentes das do servidor | `UX-63-008`, `UX-63-007`, `UX-63-006`, `UX-65-002`, `UX-65-003`, `UX-65-007`, `UX-66-002`, `UX-68-005`, `UX-70-004`, `UX-70-005`, `UX-69-007` | Utilitário de validação por campo e regras importadas de `src/portal-validation.mjs` (endereços reservados, links, conteúdo) | `PB-09`, `PB-13` |
| `TT-09` Alvos e campos pequenos no celular | Regra compacta do editor (`portal.css:4228-4235`) vazando para todo o painel em ≤ 520 px (30 px, fonte de 12 px) e botões de ícone abaixo de 44 px | `UX-63-009`, `UX-65-008`, `UX-70-007`, `UX-66-006`, `UX-69-014`, `UX-63-010`, `UX-72-005`, `UX-64-006`, `UX-69-013`, `UX-62-017`, `UX-64-012` | Restringir a regra compacta a `#editor-section`; mínimo de 44 px e fonte de 16 px em campos e botões do painel | `PB-14` |
| `TT-10` Tela e URL divergentes | `showSection` chamado sem mudar o hash; vitrine ativa só em memória | `UX-63-013`, `UX-64-010`, `UX-65-005`, `UX-65-011`, `UX-70-010`, `UX-72-001` | Roteador único: toda troca de tela passa pelo hash (`#editor/<id>`, `#administracao`, `#pedidos`) | `PB-12`, `PB-15` |
| `TT-11` Navegação lateral e inferior diferentes | Barra inferior sem Leilões, "Pedidos" × "Customizações", sem `aria-current`; nomes diferentes para o painel no site | `UX-63-011`, `UX-63-012`, `UX-66-008`, `UX-70-006`, `UX-62-016`, `UX-62-020` | Uma lista de destinos gerando as duas barras (com "Mais" no celular), `aria-current="page"` e um nome por destino ("painel", "Customizações") | `PB-16`, `PB-19` |
| `TT-12` Ação pública ou destrutiva sem confirmação nem desfazer | Publicação e substituição imediatas; `confirm()` nativo sem descrever o efeito | `UX-69-001`, `UX-67-013`, `UX-67-004`, `UX-67-008`, `UX-72-002`, `UX-72-003`, `UX-72-006`, `UX-66-005`, `UX-66-003` | Diálogo do painel padronizado (o que muda, quantos itens, "Confirmar") e "Desfazer" por alguns segundos nas exclusões | `PB-08`, `PB-10`, `PB-12`, `PB-20` |
| `TT-13` Sessão e dados locais | Sem tratamento de `401` fora de `checkSession`; `localStorage` por navegador decide estado de conta; código do modo local ainda ativo | `UX-63-003`, `UX-63-004`, `UX-64-008`, `UX-63-020` | Interceptar `401` num único `fetch` do painel, limpar `vitrine_*` ao sair, estado de publicação vindo do servidor e remover o modo local morto | `PB-04` |
| `TT-14` Termos proibidos fora do alcance dos testes | O teste de terminologia só procura formas acentuadas e não lê migrações, títulos da casca nem mensagens do Worker | `UX-62-001` (semente), `UX-72-011`, `UX-68-007`, `UX-68-020`, `UX-69-005`, `UX-71-016`, `UX-72-012`, `UX-62-021` (imagem) | Ampliar o teste para formas sem acento, `supabase/migrations/`, `web/vitrine/index.html` e mensagens de `workers/api.mjs`; migração nova renomeando os textos iniciais | `PB-08`, `PB-12`, `PB-18` |

Os 14 temas somam 100 achados distintos. Os outros 91 são específicos de uma
jornada (por exemplo, os rótulos do funil dos Insights ou o cabeçalho de desktop
entre 801 e 900 px) e entram no backlog pelo pacote da jornada.

## 6. Backlog priorizado

Cada achado está em exatamente um pacote. As ondas seguem a severidade: todo `P1`
está na primeira onda e nenhum `P2` ficou para a terceira. Achados `P2` e `P3` com
a mesma correção de um `P1` sobem junto com ele.

| Onda | Pacotes | Achados | `P1` · `P2` · `P3` |
| --- | --- | --- | --- |
| 1. Corrigir já | `PB-01` a `PB-12` | 76 | 35 · 27 · 14 |
| 2. Próximo ciclo | `PB-13` a `PB-24` | 91 | 0 · 65 · 26 |
| 3. Depois | `PB-25` a `PB-27` | 24 | 0 · 0 · 24 |

### 6.1 Onda 1 — corrigir já

Ordem sugerida de execução; a coluna "Depende de" indica o que precisa vir antes.

| Pacote | Objetivo | Achados | `P1` · `P2` · `P3` | Depende de | Validação humana |
| --- | --- | --- | --- | --- | --- |
| `PB-01` Região de mensagens do painel | Mensagens visíveis no login e no painel; erros com `role="alert"` que não somem sozinhos; temporizador reiniciado; sem rolagem suave com movimento reduzido | `UX-63-002`, `UX-63-016`, `UX-65-015`, `UX-69-017`, `UX-72-004`, `UX-69-002` | 1 · 4 · 1 | — | `BLK-UX-63-AT` (leitor de tela) |
| `PB-03` Trava de envio e fila de salvamento | Um utilitário de envio para todos os formulários e uma fila única para salvar, publicar e abrir a prévia; aviso ao sair com alterações não salvas | `UX-65-001`, `UX-67-001`, `UX-67-002`, `UX-70-003`, `UX-67-006`, `UX-67-017`, `UX-67-003`, `UX-67-012`, `UX-67-016` | 4 · 3 · 2 | — | — |
| `PB-02` Falha ≠ vazio ≠ sucesso | Componente de estado (carregando, vazio, erro com "Tentar de novo", sucesso) aplicado a vitrines, Insights, customizações, login, contato e vitrine pública | `UX-70-001`, `UX-71-001`, `UX-64-003`, `UX-62-002`, `UX-63-001`, `UX-63-015`, `UX-71-012`, `UX-65-012`, `UX-72-015`, `UX-71-014`, `UX-64-013`, `UX-68-008`, `UX-68-009`, `UX-68-018` | 5 · 5 · 4 | `PB-01` | — |
| `PB-04` Sessão e dados locais | `401` sempre leva ao login com aviso e retorno; Sair limpa `vitrine_*`; estado de publicação vindo do servidor; remover o modo local morto | `UX-63-003`, `UX-63-004`, `UX-64-008`, `UX-63-020` | 2 · 1 · 1 | `PB-01` | `BLK-UX-61-AUTH` (expiração real) |
| `PB-05` Permissões por papel | Tabela única de ações por papel; selo com os quatro papéis; editor em modo leitura para `viewer`; Publicar só para `owner`/`admin`; escopo de `support_operator` decidido; teste PGlite por papel | `UX-64-001`, `UX-66-001`, `UX-64-015`, `UX-72-013` | 2 · 1 · 1 | — | `BLK-UX-64-RBAC` (convites reais) |
| `PB-06` Contato real e mensagem completa | Nenhum número fictício; mensagem do WhatsApp com todos os campos da etapa 2 e um rótulo por linha; link de conversa com aviso de nova aba | `UX-70-002`, `UX-68-010`, `UX-68-001`, `UX-68-017`, `UX-70-009` | 2 · 1 · 2 | — | Conferir o `href` num aparelho, sem enviar |
| `PB-07` Contraste | Token de destaque acessível para textos pequenos, cor de placeholder própria e indicador de passos sem opacidade | `UX-64-002`, `UX-68-003`, `UX-65-009` | 3 · 0 · 0 | — | — |
| `PB-08` Planilha segura | Confirmação com contagem e "Desfazer" no modo Substituir; exportação funcionando com nome `vitrine-<endereço>.csv`; detecção de codificação; prévia com novos, atualizados, removidos e efeito no limite | `UX-69-001`, `UX-69-003`, `UX-69-004`, `UX-69-005`, `UX-69-010`, `UX-69-018` | 3 · 2 · 1 | `PB-03` (o Desfazer usa a fila de salvamento) | `CHK-UX-69-ARQUIVO` |
| `PB-09` Foco e erros acessíveis (base) | Utilitários de foco e de erro por campo, aplicados primeiro aos `P1`: vitrine pública, atalho de conteúdo, perfil obrigatório, editor e resumo textual dos gráficos | `UX-68-002`, `UX-63-005`, `UX-63-008`, `UX-66-002`, `UX-71-007` | 5 · 0 · 0 | `PB-01` | `BLK-UX-63-AT` |
| `PB-10` Conflito e publicação no editor | Alerta de conflito com diferenças e escolhas, anunciado e visível no celular; confirmação com resumo antes de publicar; restauração que explica o efeito no rascunho; prévia vencida com página útil; "Abrir vitrine" só depois da 1ª publicação | `UX-67-004`, `UX-67-005`, `UX-67-013`, `UX-67-008`, `UX-67-007`, `UX-67-011` | 1 · 5 · 0 | `PB-03` | `BLK-CLOUD-01`, `BLK-UX-61-AUTH` |
| `PB-11` Insights honestos | Todo número com o período a que se refere; respostas antigas descartadas; gráfico diário cobrindo o período; rótulos do funil ("cliques para enviar no WhatsApp"); estado de carregamento e anúncio da troca | `UX-71-002`, `UX-71-003`, `UX-71-004`, `UX-71-006`, `UX-71-005`, `UX-71-013`, `UX-71-019`, `UX-71-017` | 3 · 3 · 2 | `PB-02` | `CHK-UX-61-PROD` (dados reais) |
| `PB-12` Administração e conteúdo institucional seguros | Rota `#administracao`; publicação da página institucional com prévia, confirmação e restauração; impacto visível ao salvar modelo; mapeamento do conteúdo institucional por página; migração nova com textos iniciais sem termos proibidos; conflito sem sair da tela | `UX-72-001`, `UX-72-002`, `UX-72-003`, `UX-62-001`, `UX-72-011`, `UX-72-010` | 4 · 2 · 0 | `PB-01`; `UX-62-001` antes de qualquer publicação real do conteúdo institucional | `BLK-HITL-72`, `BLK-UX-62-CMS` |

### 6.2 Onda 2 — próximo ciclo

| Pacote | Objetivo | Achados | `P1` · `P2` · `P3` | Depende de |
| --- | --- | --- | --- | --- |
| `PB-13` Validação por campo e paridade com o servidor | Erros no campo em todo o painel e na vitrine; regras importadas do servidor; dados preservados entre modalidades; CSV com linha física, cabeçalho tolerante e aviso de colunas | `UX-63-006`, `UX-63-007`, `UX-65-002`, `UX-65-003`, `UX-65-004`, `UX-65-007`, `UX-68-005`, `UX-70-004`, `UX-70-005`, `UX-69-006`, `UX-69-007`, `UX-69-008`, `UX-69-009`, `UX-66-003` | 0 · 14 · 0 | `PB-09` |
| `PB-14` Alvos de toque e campos no celular | Regra compacta restrita ao editor; 44 px e 16 px em campos e botões; ações do cartão empilhadas em 360 px; menu CSV dentro da tela | `UX-63-009`, `UX-63-010`, `UX-65-008`, `UX-66-006`, `UX-69-014`, `UX-70-007`, `UX-72-005`, `UX-64-006`, `UX-69-013`, `UX-62-017`, `UX-64-012`, `UX-63-018` | 0 · 9 · 3 | — |
| `PB-15` Roteador e URL coerente | Toda troca de tela pelo hash; `#editor/<id>` reabre a vitrine; assistente retoma o passo; sob medida e atalho do assistente em `#pedidos` | `UX-63-013`, `UX-64-010`, `UX-65-005`, `UX-65-011`, `UX-70-010` | 0 · 4 · 1 | `PB-12` (mesmo roteador da rota `#administracao`) |
| `PB-16` Navegação consistente no painel | Barras geradas da mesma lista, com "Mais" no celular; `aria-current`; um nome por destino; um único "Adicionar item"; menus com teclado; histórico de versões a um clique; links do login para o site e as políticas | `UX-63-011`, `UX-63-012`, `UX-66-008`, `UX-70-006`, `UX-66-007`, `UX-67-009`, `UX-67-010`, `UX-69-012`, `UX-63-019`, `UX-72-009`, `UX-64-005`, `UX-63-021` | 0 · 11 · 1 | `PB-15` |
| `PB-17` Foco após troca e re-renderização | Aplicar o utilitário de foco ao editor, ao assistente, à administração, à prévia CSV e às etapas da vitrine; anunciar quantidades; abrir o editor depois de criar a vitrine | `UX-66-004`, `UX-65-006`, `UX-72-007`, `UX-69-011`, `UX-68-004`, `UX-68-006`, `UX-65-010` | 0 · 7 · 0 | `PB-09` |
| `PB-18` Terminologia coberta por testes | Títulos e mensagens com "vitrine"; categoria de reserva "Itens da vitrine"; placeholder `vitrine-bistro`; imagem de destaque recortada; teste ampliado | `UX-68-007`, `UX-68-020`, `UX-71-016`, `UX-72-012`, `UX-62-021` | 0 · 2 · 3 | — |
| `PB-19` Site público: navegação, rodapé e tema | Cabeçalho entre 801 e 1100 px; camadas fixas sem cobrir o rodapé; links de privacidade e termos em todas as páginas; variáveis do tema escuro; um `h1` por página; próximas ações em "Como funciona" e "Planos" | `UX-62-003`, `UX-62-004`, `UX-62-005`, `UX-62-007`, `UX-62-009`, `UX-62-010`, `UX-62-011`, `UX-62-012`, `UX-62-013`, `UX-62-014`, `UX-62-016`, `UX-62-020` | 0 · 7 · 5 | — |
| `PB-20` Ações com impacto no painel | "Desfazer" em exclusões; pedido de customização com vitrine, pessoa e data e etapa reversível; atividade em português; um único controle de visibilidade | `UX-66-005`, `UX-72-006`, `UX-72-008`, `UX-66-012` | 0 · 3 · 1 | `PB-12` (diálogo padronizado) |
| `PB-21` Gráficos e leitura dos Insights | Texto dos gráficos com tamanho mínimo; visitas e cliques separados com legenda; ranking legível em 360 px; variação neutra; números em `pt-BR` | `UX-71-008`, `UX-71-009`, `UX-71-015`, `UX-71-010`, `UX-71-011`, `UX-71-020` | 0 · 3 · 3 | `PB-11` |
| `PB-22` Cartão da vitrine e lista | Publicada ou rascunho com link público; busca acima de 6 vitrines; ação principal conforme o progresso; origem pública configurada | `UX-64-007`, `UX-64-009`, `UX-64-011`, `UX-64-014` | 0 · 1 · 3 | `PB-04` (estado de publicação do servidor) |
| `PB-23` Movimento no site | Carrossel sem botão sem efeito com movimento reduzido; contagem anunciada; repouso da bolinha conferido | `UX-62-006`, `UX-62-015`, `UX-62-022` | 0 · 1 · 2 | — |
| `PB-24` Itens que dependem de checagem humana | Corrigir só depois da checagem correspondente: certificado do exemplo, destinos externos, upload de foto, fidelidade da prévia, status pelo operador, `Content-Type` dos modelos e cartão de compartilhamento | `UX-62-008`, `UX-62-023`, `UX-66-011`, `UX-67-018`, `UX-70-011`, `UX-69-020`, `UX-68-019` | 0 · 3 · 4 | Seção 8 |

### 6.3 Onda 3 — depois

| Pacote | Objetivo | Achados | `P1` · `P2` · `P3` |
| --- | --- | --- | --- |
| `PB-25` Linguagem sem jargão | "Endereço da vitrine" no lugar de "slug"; "Salvo às 17:34" no lugar de revisão e hash; rótulos de item sem nome coerentes; emoji fora dos nomes acessíveis; mensagem do WhatsApp neutra; links do coletivo com comportamento único | `UX-65-014`, `UX-67-014`, `UX-65-017`, `UX-65-013`, `UX-66-010`, `UX-66-009`, `UX-62-019`, `UX-62-018` | 0 · 0 · 8 |
| `PB-26` Vitrine pública: acabamento | Paridade preview × Worker para 404 e `/vitrine/`; 404 com segundo caminho; rodapé em 768–1440 px; selo de modalidade único; motivo no limite de cotas | `UX-68-011`, `UX-68-012`, `UX-68-013`, `UX-68-014`, `UX-68-015`, `UX-68-016` | 0 · 0 · 6 |
| `PB-27` Painel: acabamento | Tema no login; conta no cabeçalho; modelos ordenados pela área; barra de ações compacta no celular; CSV com milhar e aviso de repetidos; lista de erros sem rolagem interna; selos de status com ícone; fuso único nos Insights; limite de 20 itens no CMS avisado | `UX-63-014`, `UX-63-017`, `UX-65-016`, `UX-67-015`, `UX-69-015`, `UX-69-016`, `UX-69-019`, `UX-70-008`, `UX-71-018`, `UX-72-014` | 0 · 0 · 10 |

### 6.4 Os 10 primeiros itens

1. `PB-01` — região de mensagens do painel (base para `PB-02`, `PB-04`, `PB-09` e `PB-12`).
2. `PB-03` — trava de envio e fila única de salvamento (elimina os conflitos falsos e a perda de edição).
3. `PB-02` — falha distinta de vazio e de sucesso em todo o produto.
4. `PB-06` — remover o número fictício e completar a mensagem do WhatsApp.
5. `PB-05` — permissões por papel visíveis e testadas.
6. `PB-04` — sessão expirada e limpeza ao sair.
7. `PB-07` — contraste dos textos pequenos (troca de token).
8. `PB-08` — planilha segura (Substituir, exportação e codificação).
9. `PB-09` — foco e erros acessíveis nos fluxos `P1`.
10. `PB-12` — administração e conteúdo institucional seguros (antes de qualquer publicação real).

`PB-10` e `PB-11` completam a primeira onda logo em seguida.

## 7. Oportunidades de simplificação nos 5 eixos

Cada oportunidade troca vários comportamentos parecidos por um só. Os textos
sugeridos usam sempre "vitrine".

### 7.1 Navegação

1. **Um roteador para todas as telas.** Hoje há telas sem hash (administração),
   telas que trocam sem mudar o hash (perfil salvo, sob medida) e o editor sem
   identificador. Com `#editor/<id>`, `#administracao` e `#pedidos` sempre no
   endereço, recarregar, voltar e compartilhar passam a funcionar sem casos
   especiais (`TT-10`).
2. **Uma lista de destinos para as duas barras.** A barra lateral e a inferior
   passam a sair da mesma lista, com "Mais" no celular, `aria-current` e o mesmo
   nome em todas as larguras (`TT-11`).
3. **Um nome por destino.** "Painel" no site (no lugar de "portal" e "Entrar no
   portal") e "Customizações" no painel; "pedido" fica só para os pedidos de clientes.
4. **Um único "Adicionar item"**, com a modalidade como primeira escolha, no lugar
   dos dois menus com tipos diferentes; "Adicionar categoria" para o que cria
   categoria (`UX-66-007`).
5. **Menos camadas fixas no site.** Pílula de orçamento e bolinha dividem o canto
   inferior em ≤ 800 px; esconder a pílula perto do rodapé ou do CTA da Mila evita a
   sobreposição sem novas regras (`UX-62-004`).
6. **Atalhos clicáveis no Início.** As vitrines do cartão abrem o editor, com "Ver
   todas" (`UX-64-005`), mantendo a troca em Minhas Vitrines (decisão 2).

### 7.2 Conta e tema

1. **Sessão num só lugar.** Um `fetch` do painel trata `401`, limpa os dados locais
   ao sair e volta ao hash anterior depois de entrar (`TT-13`).
2. **Remover o modo local.** O código sem controle na interface ainda decide
   mensagens; retirá-lo elimina os ramos `!isOnline` (`UX-63-020`).
3. **Tema e conta visíveis em todas as telas.** Botão de tema também no login e
   identificação da conta no cabeçalho (`UX-63-014`, `UX-63-017`).
4. **Variáveis do tema escuro existentes.** Trocar as três variáveis inexistentes
   pelas do tema e usar o logo inverso do coletivo (`UX-62-007`, `UX-62-012`).
5. **Um token de destaque acessível** para textos pequenos, no lugar de ajustes caso
   a caso (`TT-01`).

### 7.3 Formulários

1. **Um utilitário de validação por campo**, com `aria-invalid`, `aria-describedby`,
   foco no primeiro erro e regras importadas de `src/portal-validation.mjs`. Ele
   substitui as validações por banner do perfil, assistente, editor, customizações e
   vitrine pública (`TT-08`).
2. **Um tamanho de campo para o painel** (44 px, fonte de 16 px), com a regra
   compacta restrita ao editor (`TT-09`).
3. **Um diálogo de confirmação do painel**, que diz o que muda e quantos itens, no
   lugar do `confirm()` nativo e das ações sem confirmação (`TT-12`).
4. **Um controle de visibilidade** para item e categoria, com o mesmo texto de efeito
   ("Some da vitrine na próxima publicação") (`UX-66-012`).
5. **Dados preservados entre modalidades** do item, sem apagar preço ou
   encerramento ao trocar o tipo (`UX-66-003`).
6. **Planilha tolerante**: cabeçalho sem acento ou caixa, milhar brasileiro e linha
   física nos erros (`UX-69-006` a `UX-69-009`, `UX-69-015`).

### 7.4 Feedback

1. **Um componente de estado** com carregando, vazio, erro com "Tentar de novo" e
   sucesso, reaproveitado no painel, nos Insights, na lista de vitrines, no site e na
   vitrine pública (`TT-03`).
2. **Uma região de mensagens** fora da área autenticada, com erro persistente e
   sucesso educado (`TT-07`).
3. **Um utilitário de envio** que desabilita o botão, marca `aria-busy` e impede o
   segundo envio (`TT-02`).
4. **Mensagens perto da ação.** O resultado aparece junto do botão que o gerou
   (administração, CSV, assistente) (`UX-72-004`, `UX-65-002`).
5. **Linguagem da pessoa usuária.** "Salvo às 17:34", "Esta vitrine foi alterada em
   outra aba" e "Publicada às 17:34" no lugar de revisão, concorrência e hash
   (`UX-67-014`).
6. **Números com contexto.** Todo número dos Insights diz o período e usa formato
   `pt-BR`; o funil diz "cliques para enviar no WhatsApp", não "pedidos" (`PB-11`).

### 7.5 Movimento

1. **Rolagem que respeita a preferência.** A rolagem suave do banner global passa a
   ser instantânea com `prefers-reduced-motion: reduce` (`UX-69-017`, `UX-65-015`).
2. **Foco no lugar de rolagem animada.** Ao trocar de etapa ou de passo, focar o
   título resolve a posição sem animação (`UX-68-004`, `UX-65-006`).
3. **Nenhum controle sem efeito.** Com movimento reduzido, o botão de pausa do
   carrossel some ou "Retomar" funciona sem animação (`UX-62-006`).
4. **Sem novas animações** nos próximos ciclos; a regra global
   (`portal.css:2007`) e o `vitrine.css` já zeram transições e funcionaram em todas
   as jornadas.

## 8. Bloqueios e passos humanos

Nenhum item abaixo impede começar a primeira onda: as correções podem ser feitas e
testadas localmente. Os passos servem para confirmar em ambiente real.

| N.º | Código | Responsável | Tipo | Libera | Checklist de aceite |
| --- | --- | --- | --- | --- | --- |
| 1 | `CHK-UX-61-PROD` | Lino | Checagem opcional (não bloqueia) | `UX-62-023`, `UX-69-020`, validação de `PB-11` | [ ] Abrir `https://vitrine.inspira.dev.br/`, `/loja1` e `https://painel.inspira.dev.br/` num navegador real em 1280 e 375 px e comparar com as capturas locais · [ ] Abrir os 6 destinos externos de `#62` e o clique em "Criar minha vitrine" chegar ao login · [ ] Conferir `Content-Type: text/csv; charset=utf-8` dos modelos CSV · [ ] Insights de uma vitrine com mais de 7 dias batem com uma visita de teste (checklist de `#71`) |
| 2 | `BLK-UX-61-AUTH` | Lino, com conta Google de teste | Bloqueio | Validação de `PB-03`, `PB-04`, `PB-08`, `PB-10` e `UX-66-011` | [ ] Entrar, cancelar o consentimento e deixar a sessão expirar (≥ 1 h) antes de salvar o perfil · [ ] Sair e entrar com outra conta no mesmo navegador · [ ] Criar a vitrine `auditoria-65-<data>`, repetir com endereço em uso (`409`) e excluir · [ ] Importar `01-bom-ponto-virgula.csv` e importar com outra aba editando · [ ] Enviar um pedido de customização, outro com 11 links e outro com a sessão expirada · [ ] Enviar foto de 3 MB, salvar uma cor da estrutura, publicar 6 vezes, restaurar a penúltima e provocar conflito entre duas abas |
| 3 | `BLK-HITL-72` | Lino | Bloqueio | Validação de `PB-12`, `UX-70-011` e `BLK-UX-62-CMS` | [ ] Inserir o `user_id` de uma conta de teste em `public.platform_operators` com `role = 'platform_admin'` · [ ] Executar os passos 1 a 12 da [seção 7 de `#72`](jornadas/72-administracao-plataforma.md#7-bloqueio-blk-hitl-72-e-roteiro-para-validação-com-conta-real) · [ ] Restaurar qualquer conteúdo alterado e não enviar mensagens reais |
| 4 | `BLK-UX-62-CMS` | Lino, depois do item 3 | Bloqueio | `UX-62-001` em produção | [ ] Só depois de corrigir `UX-62-001`: publicar uma seção de teste pelo painel de plataforma · [ ] Conferir a home e `/planos/` em produção, com o console sem exceções |
| 5 | `BLK-UX-64-RBAC` | Equipe Vitrine (teste PGlite) e Lino (convites reais) | Bloqueio parcial | `UX-64-015`, validação de `PB-05` | [ ] Teste de ponta a ponta com uma vitrine e quatro membros (`owner`, `admin`, `editor`, `viewer`) cobrindo salvar, publicar e leilões · [ ] Convites reais para os quatro papéis e registro dos botões exibidos e das respostas `200`/`403` |
| 6 | `BLK-CLOUD-01` (`#44`) | Lino (administrador Cloudflare) | Bloqueio | `UX-67-007`, `UX-67-018` | [ ] Configurar `PREVIEW_HMAC_SECRET` no Worker (sem valor no repositório), zona e `sandbox.inspira.dev.br`, Cloudflare for SaaS e `CF_SAAS_*` · [ ] "Abrir prévia salva" com `no-store` e `noindex` · [ ] Editar e recarregar a prévia; esperar 30 min e conferir a expiração · [ ] Comparar prévia ao vivo, prévia assinada e `/<endereço>` em 375 e 1280 |
| 7 | `BLK-UX-62-TLS` | Dono do site `felipecarvalhopsi.com`; Lino decide a retirada | Bloqueio externo | `UX-62-008` | [ ] Ativar HTTPS no domínio personalizado · [ ] `curl -sI https://felipecarvalhopsi.com/` sem erro de certificado · [ ] Sem correção, retirar o exemplo de `/possibilidades/` |
| 8 | `BLK-UX-63-AT` | Lino ou voluntário com VoiceOver/NVDA e iPhone | Checagem | `UX-63-016`, `UX-63-011`, `UX-63-009`, validação de `PB-01` e `PB-09` | [ ] Confirmar o anúncio de erros, sucessos e da seção atual · [ ] Confirmar no iPhone se campos de 12 px ampliam a tela ao focar |
| 9 | `BLK-UX-68-OG` | Lino | Checagem | `UX-68-019` | [ ] Depurador de compartilhamento da Meta lê `og:title`, `og:description` e `og:image` de uma vitrine real · [ ] Cartão no WhatsApp mostra nome e imagem |
| 10 | `BLK-UX-68-LIKES` | Lino | Checagem | Curtidas em produção | [ ] Curtir e descurtir num navegador comum · [ ] A curtida persiste depois de recarregar · [ ] O limite mostra a mensagem do `429` |
| 11 | `CHK-UX-69-ARQUIVO` | Pessoa com Android e iPhone | Checagem | Validação de `PB-08` | [ ] "Importar planilha" abre o seletor de arquivos e aceita um `.csv` exportado do Google Planilhas nos dois aparelhos |
| 12 | `CHK-UX-70-WHATSAPP` | Lino | Checagem | Validação de `PB-06` | [ ] Depois de corrigir `UX-70-002` e `UX-68-010`, conferir num aparelho que os links abrem a conversa com o número da equipe, sem enviar |
| 13 | `BLK-META-01` e `BLK-META-02` (`#48`) | Dono da conta `@ganjastudio.br` e Lino | Bloqueio fora da auditoria | Integração Instagram (`#49`, `#50`) | [ ] Itens pendentes de [`docs/instagram/configuracao-meta.md`](../instagram/configuracao-meta.md) (tipo da conta, responsável pelo app, configuração do login, testador, URLs no console, verificação da empresa e revisão do app) · [ ] Os links de privacidade e termos em todas as páginas (`UX-62-005`) e no login (`UX-63-019`) ajudam a revisão |

Os códigos `CHK-UX-69-ARQUIVO` e `CHK-UX-70-WHATSAPP` nomeiam as checagens sem
código que as jornadas `#69` e `#70` registraram ("Seletor de arquivo nativo" e
"WhatsApp").

## 9. Decisões registradas

1. **Produção equivalente ao preview.** A versão publicada é `bbafd95` (workflow
   `deploy.yml`, 14/11/2026, 16:20Z) e o preview local do mesmo commit é evidência
   equivalente. O `403` com `cf-mitigated: challenge` é o desafio de bots da
   Cloudflare. A checagem visual num navegador real é o passo humano opcional
   `CHK-UX-61-PROD`; qualquer menção a `BLK-UX-61-PROD` deve ser lida como
   `CHK-UX-61-PROD`.
2. **Seletor rápido fora do topo (`UX-64-004`).** O `#showcase-switcher` foi removido
   do topo a pedido do Lino no PR [#75](https://github.com/coletivo-inspira/vitrine/pull/75);
   a troca de vitrine fica em Minhas Vitrines. É decisão de produto, não lacuna da
   `T009`, fica fora da contagem e a `#39` continua entregue.
3. **Contagem.** Só entram achados com severidade `P0`–`P3`: 191 no total. A
   severidade, a natureza e o eixo definidos pelas jornadas foram mantidos.
4. **Deduplicação sem renumerar.** Achados repetidos entre jornadas são agrupados
   em temas `TT-01` a `TT-14`; os IDs `UX-<issue>-NNN` continuam sendo a referência.
5. **Ondas por severidade.** Todo `P1` está na onda 1; `P2` e `P3` com a mesma
   correção de um `P1` sobem junto; nenhum `P2` fica para a onda 3.
6. **`UX-62-023` como checagem opcional.** O status fora da convenção é tratado como
   `CHK-UX-61-PROD`, sem bloquear nada.
7. **`UX-64-015` sem depender de pessoa.** O teste PGlite por papel resolve a parte
   automática; os convites reais ficam como validação humana (item 5 da seção 8).
8. **Correção antes da publicação institucional.** `UX-62-001` deve ser corrigido
   antes de qualquer publicação real do conteúdo institucional, porque o texto-semente
   tem termos proibidos e o mapeamento quebra a home.
9. **Sem código de produto nesta auditoria.** Os achados viram backlog; a
   implementação de cada pacote deve ter issue própria, com os critérios de aceite
   dos achados que reúne.
10. **Imagens fora do repositório.** As capturas citadas ficam em
    `media/auditoria-ux/<issue>-<tema>/` no Context do projeto.
11. **Matriz central como índice.** Esta consolidação atualiza na
    [matriz central](matriz-central.md) só o índice das jornadas (seção 3) e a matriz
    de cenários (seção 5); o detalhe fica nos arquivos de jornada e neste relatório.
