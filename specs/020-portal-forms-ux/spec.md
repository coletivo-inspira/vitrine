# Feature Specification: Portal da Vitrine no modelo Google Forms (Início, vitrine em três abas, equipe por link, perfil e paletas)

**Feature Branch**: `port/portal-forms-ux`

**Created**: 2026-11-26

**Status**: Approved for Implementation (plano aprovado pelo Lino em 2026-11-26; portado sobre `origin/main` depois das specs 009 a 018)

**Input**: Simplificar o portal (`/portal/`) seguindo o modelo do Google Forms: uma tela **Início** com **Começar nova vitrine** e **Vitrines recentes**, e cada vitrine com três abas (**Itens**, **Pedidos** e **Configurações**). Saem a barra lateral, a barra inferior do celular, os cartões do Painel Inicial, o assistente em 3 passos, as cinco abas do editor e a prévia lateral fixa. O trabalho original foi feito sobre uma base antiga (como `010-portal-forms-ux`); esta spec o porta para a base atual, reaproveitando o que a `main` já tem.

## Relação com outras especificações

| Spec | Situação nesta spec |
|---|---|
| **008** FR-001 (barra lateral e barra inferior) | Substituído por **FR-001** (barra superior com busca e menu do avatar). |
| **008** FR-003 (Painel Inicial com cartões) | Substituído por **FR-001** e **FR-002** (Começar nova vitrine e Vitrines recentes). |
| **008** FR-005 (assistente em 3 passos) | Substituído por **FR-003** (diálogo único com nome e endereço; a área de atuação vai para Configurações > Atendimento). |
| **008** FR-008 (barra fixa, abas e prévia lateral) | Substituído por **FR-005** a **FR-007**. |
| **008** FR-015 (Insights em seção própria) | A API `GET /api/sites/:id/insights` não muda; a apresentação vai para a aba **Pedidos** da vitrine (**FR-008**). |
| **009** (estrutura da vitrine: identidade, menus, páginas) | Mantida em Configurações > "Identidade, menus e páginas". A paleta entra em `structure.theme.palette` (**FR-017**), sem um segundo bloco de tema. |
| **010** (auditoria UX) | Atende `UX-64-005` (cada vitrine do Início abre em um clique), `UX-64-006` (cartões sem quebra no celular, alvos de 44 px) e `UX-64-007` (Publicada/Rascunho, data e endereço no cartão). Respeita a decisão `UX-64-004`: não há seletor rápido de vitrine no topo; a troca acontece no Início. Insights e Leilões perdem os seletores próprios porque passam a viver dentro da vitrine. |
| **011, 012, 013, 014, 016** e painéis da `main` (canais, pré-orçamento, SEO local, QR Code, comentário para vitrine, link de pagamento, página do item, pausar/arquivar, plano e cobrança, patrocinador, administração) | Todos continuam, só mudam de lugar (**FR-009** e **FR-010**). Nenhum recurso é removido. |
| **017** (login múltiplo, proposta) | Não muda. O avatar usa a foto do Google quando existe; sem foto, as iniciais. |
| **018** (convite de demonstração e equipe por link, só especificada) | O convite de colaboradores do trabalho original (por e-mail) **foi alinhado à 018**: esta spec implementa só a parte **equipe** da 018 (US5; FR-006, FR-007, FR-010, FR-011, FR-018 a FR-021 e FR-023 para eventos de equipe). Demonstração, convite de dono, cortesia e `growth_operator` continuam na 018. Ver **FR-012** a **FR-015** e "Divergências". |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Encontrar e começar vitrines no Início (`020-US1`) (Priority: P1)

Como pessoa autenticada, quero uma tela inicial com uma linha **Começar nova vitrine** (Produtos, Serviços e produtos, Agendamento, Orçamento e Sob medida) e uma grade **Vitrines recentes** (capa, nome, endereço, Publicada/Rascunho, papel quando não sou proprietária e menu de 3 pontos), com busca e um menu do avatar, para chegar à vitrine certa ou criar uma nova sem painéis intermediários.

**Independent Test**: abrir `/portal/` em 1440 px e 390 px, nos temas claro e escuro; filtrar pela busca; abrir o menu de um cartão; criar uma vitrine a partir de um modelo; confirmar que não existem barra lateral, barra inferior nem cartões de painel.

**Acceptance Scenarios**:

1. **Given** uma pessoa autenticada, **When** abre `/portal/`, **Then** vê a barra superior (logo, busca e avatar), a linha **Começar nova vitrine** e a grade **Vitrines recentes**, ordenada pela edição mais recente.
2. **Given** a tela Início, **When** a pessoa toca num modelo, **Then** um diálogo pede Nome e Endereço e, ao confirmar, a vitrine é criada e aberta na aba **Itens**; **Sob medida** leva a Customizações já preenchido.
3. **Given** a tela Início, **When** a pessoa abre o menu do avatar, **Then** encontra Perfil, Customizações, Plano e cobrança, Impacto (só patrocinador), Administração (só `platform_admin`), Tema e Sair.
4. **Given** um cartão, **When** a pessoa abre o menu de 3 pontos, **Then** encontra Abrir, Pedidos, Copiar link e Abrir vitrine pública (só quando publicada) e as ações de ciclo de vida que o papel permite (Pausar, Retomar, Arquivar, Restaurar, Excluir de vez).

### User Story 2 - Editar a vitrine com salvamento automático e aba Itens (`020-US2`) (Priority: P1)

Como responsável por uma vitrine, quero um cabeçalho com seta de voltar, nome editável, indicador "Salvando... / Salvo", **Personalizar**, **Visualizar**, **Publicar** e um menu de 3 pontos, e quero editar os itens numa lista única em que cada categoria é uma seção.

**Acceptance Scenarios**:

1. **Given** uma vitrine aberta, **When** a pessoa edita e para por cerca de 1,5 s, **Then** o indicador mostra "Salvando..." e depois "Salvo"; um conflito de revisão pausa o salvamento automático e mostra o aviso para recarregar.
2. **Given** a aba **Itens**, **When** é exibida, **Then** cada categoria aparece como seção (nome editável, quantidade, + Item, Subir, Descer, Excluir e Ocultar/Reativar) seguida dos cartões de item, que abrem ao toque; a barra flutuante oferece adicionar item (com os modos à venda, lance, doação, troca e cotas), adicionar categoria, item com foto e importar planilha.
3. **Given** o uso de itens ou bytes do rascunho, **When** passa de 80% de um limite (20 ativos, 100 totais, 256 KiB), **Then** o medidor aparece; abaixo disso fica oculto.
4. **Given** o cabeçalho, **When** a pessoa toca em **Visualizar**, **Then** vê a prévia em tela cheia com o renderizador compartilhado; ao tocar em **Publicar**, o rascunho é salvo, publicado e um diálogo mostra o link com o botão Copiar.
5. **Given** a pessoa sai da vitrine (voltar, outra rota ou Sair), **When** há alterações pendentes, **Then** o rascunho é salvo antes de sair.

### User Story 3 - Acompanhar pedidos da vitrine aberta (`020-US3`) (Priority: P2)

Como responsável ou membro, quero a aba **Pedidos** com os Insights só da vitrine aberta (períodos 7/30/90 dias, destaque, 3 números, gráfico por dia e itens mais escolhidos) e, quando gerencio lances, os **Leilões** dessa vitrine; gráfico por hora, categorias, origem das visitas e curtidas ficam em "Ver mais".

### User Story 4 - Ajustar a vitrine em seções recolhíveis (`020-US4`) (Priority: P2)

Como responsável, quero a aba **Configurações** com seções recolhidas que mostram um resumo: **Atendimento**, **Pedido**, **Itens**, **Local e horário**, **Google, WhatsApp e QR Code**, **Canais**, **Identidade, menus e páginas**, **Biblioteca de arquivos**, **Domínios e publicação**, **Versões publicadas** e **Acesso**.

### User Story 5 - Montar a equipe da vitrine por link (`020-US5`, = 018-US5) (Priority: P2)

Como proprietária (ou administradora) da vitrine, quero gerar um convite por link com papel (Administrador, Funcionário ou Somente leitura), copiar o link ou abrir o WhatsApp com a mensagem pronta, ver a equipe pelo nome de exibição, mudar papéis, remover pessoas e revogar convites abertos.

**Acceptance Scenarios**:

1. **Given** Configurações > Acesso, **When** a proprietária abre a seção, **Then** vê os membros pelo nome de exibição (ou "Pessoa sem nome", nunca e-mail, telefone ou identificador interno), os convites abertos com prazo e o botão "Convidar pessoa".
2. **Given** "Convidar pessoa", **When** escolhe o papel, **Then** recebe o link uma única vez, com "Copiar link" e "Abrir no WhatsApp"; o convite vale 7 dias e é de uso único. A Vitrine não envia mensagens.
3. **Given** uma administradora da vitrine, **When** convida, **Then** só pode escolher Funcionário ou Somente leitura.
4. **Given** uma pessoa com o link, **When** abre `/convite/<token>` e depois entra no painel e aceita, **Then** passa a ver só aquela vitrine com o papel do convite; se já é membro ou proprietária, vê "Você já faz parte desta vitrine" e nada muda.
5. **Given** um link inválido, vencido, revogado ou já usado, **When** alguém o abre, **Then** vê a mesma resposta "Este convite não está mais disponível".

### User Story 6 - Perfil com foto, Estado e Cidade (`020-US6`) (Priority: P3)

Como pessoa autenticada, quero ver a foto da minha conta Google no avatar e no Perfil, e escolher Estado e Cidade de uma lista (IBGE) em vez de digitar "Cidade / Estado".

### User Story 7 - Cores da vitrine em Personalizar (`020-US7`) (Priority: P3)

Como responsável, quero escolher uma de 8 paletas com contraste AA (tema claro e escuro) no painel **Personalizar**, junto com título, boas-vindas e texto do botão, e ver a mudança na prévia e na vitrine publicada depois de publicar.

### Edge Cases

- Rotas antigas (`#inicio`, `#vitrines`, `#dashboard`, `#perfil`, `#pedidos`, `#plano`, `#administracao`, `#impacto`, `#profile-gate`, `#insights`, `#leiloes`, `#editor`, `#wizard`) redirecionam para as novas sem quebrar links salvos; `#insights` vai para Pedidos da vitrine ativa (ou da primeira), `#leiloes` para Pedidos da primeira vitrine em que a pessoa gerencia lances, `#wizard` abre o diálogo de nova vitrine.
- Vitrine inexistente ou sem acesso em `#/v/:id/...`: aviso e volta ao Início.
- Funcionário e Somente leitura não veem **Publicar**; o servidor continua recusando com `403`.
- Renomear no cabeçalho só chama `PATCH /api/sites/:id` para proprietário e administrador; para os demais, o nome exibido na vitrine (rascunho) muda, o nome da vitrine na lista não.
- Paleta padrão não entra na publicação: rascunhos sem paleta mantêm o mesmo artefato e o mesmo hash.
- Foto do Google fora de `https://lh3.googleusercontent.com/` é ignorada (CSP).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (Início)**: O portal DEVE abrir no Início com barra superior (logo, busca e avatar), **Começar nova vitrine** e **Vitrines recentes**. A barra lateral, a barra inferior e os cartões do Painel Inicial NÃO DEVEM existir. O menu do avatar DEVE reunir Perfil, Customizações, Plano e cobrança, Impacto (só patrocinador), Administração (só `platform_admin`), Tema e Sair.
- **FR-002 (Vitrines recentes)**: Cada cartão DEVE mostrar capa por tipo, nome, endereço, Publicada/Rascunho (a partir de `publishedAt` da API), data da última edição, papel quando não é proprietária e menu de 3 pontos com as ações do papel; o filtro Ativas/Arquivadas aparece quando há vitrine arquivada. A busca DEVE filtrar por nome ou endereço, sem diferenciar acentos.
- **FR-003 (Criação por modelo)**: Tocar num modelo DEVE abrir um diálogo único com Nome e Endereço que usa `POST /api/sites`; Sob medida leva a Customizações já preenchido.
- **FR-004 (Rotas)**: `#/`, `#/v/:id/itens`, `#/v/:id/pedidos`, `#/v/:id/config`, `#/perfil`, `#/customizacoes`, `#/plano`, `#/administracao`, `#/impacto`, `#/primeiro-acesso` e `#/convite`, com redirecionamento das hashes antigas.
- **FR-005 (Cabeçalho e salvamento automático)**: Seta de voltar, nome editável, indicador "Salvando... / Salvo" sem emojis, salvamento cerca de 1,5 s após a última edição com `PUT /api/sites/:id/draft` e o tratamento de revisão atual; o botão "Salvar rascunho" NÃO DEVE existir; o rascunho DEVE ser salvo antes de sair da vitrine.
- **FR-006 (Aba Itens)**: Lista única com categorias como seções, cartões de item expansíveis, barra flutuante e medidores só acima de 80% ou quando um limite é ultrapassado; sem prévia lateral fixa.
- **FR-007 (Personalizar, Visualizar, Publicar e menu)**: Personalizar (painel lateral com paleta, título, boas-vindas e texto do botão), Visualizar (prévia em tela cheia), Publicar (só proprietário e `admin`, diálogo com link e Copiar) e menu com Importar planilha, Exportar planilha, Baixar modelos, Abrir vitrine publicada e Abrir prévia salva.
- **FR-008 (Aba Pedidos)**: Insights só da vitrine aberta (sem seletor) e Leilões dessa vitrine para proprietário e `admin`; gráfico por hora, categorias, origem e curtidas em "Ver mais".
- **FR-009 (Aba Configurações)**: As seções recolhíveis listadas na US4, com resumo dinâmico em Atendimento, Pedido, Itens e Acesso. A área de atuação fica em Atendimento.
- **FR-010 (Preservação)**: Todos os painéis da `main` (canais, pré-orçamento, SEO local, QR Code, comentário para vitrine, horário, endereço, página por cidade, Mila, estrutura, biblioteca, domínios, versões, pausar/arquivar, plano e cobrança, administração, patrocinador, importação do Linktree) DEVEM continuar acessíveis.
- **FR-011 (Renomear e publicação na lista)**: O Worker DEVE aceitar `PATCH /api/sites/:id` com `{ name }` para quem pode alterar a vitrine e devolver `publishedAt` (ou `null`) na lista e no detalhe de vitrines.
- **FR-012 (Convite de equipe, = 018 FR-006/007/018)**: Token aleatório de 256 bits gerado no Worker; o banco guarda só o SHA-256 em `private.site_invitations` (tabela da 018, com `kind`); convite `team` com papel, prazo de 7 dias, uso único, até 20 abertos por vitrine; proprietária convida `admin`, `editor` e `viewer`, `admin` só `editor` e `viewer`.
- **FR-013 (Aceite, = 018 FR-010/011/019)**: `GET /convite/:token` (sem sessão, `noindex`, `no-store`, `no-referrer`, mesma resposta para qualquer token indisponível, limite por IP), `POST /api/invitations/lookup` e `POST /api/invitations/accept` (sessão obrigatória; `409 ALREADY_MEMBER`). O token não vai para logs, auditoria nem mensagens de erro.
- **FR-014 (Equipe, = 018 FR-020/021)**: `GET /api/sites/:id/team` (só proprietário e `admin`) devolve nomes de exibição e papéis, e convites abertos; mudar papel e remover usam as rotas de membros que já existem. Permissões por papel são as do banco atual.
- **FR-015 (Auditoria, = 018 FR-023)**: Criação, abertura (primeira), revogação e aceite de convite de equipe vão para `audit_logs`, sem token nem hash.
- **FR-016 (Perfil)**: Avatar e cartão do Perfil usam a foto do Google quando a URL começa com `https://lh3.googleusercontent.com/` (CSP do portal com `img-src` para esse host); Estado e Cidade com listas estáticas do IBGE em `web/portal/data/municipios/{UF}.json`, gravadas no mesmo campo `city` ("Cidade, UF"); a máscara de WhatsApp e os interesses próprios (`outro:`) continuam os da `main`.
- **FR-017 (Paletas)**: 8 paletas com contraste AA nos dois temas, guardadas em `structure.theme.palette`; a projeção pública só inclui a paleta quando não é a padrão; a vitrine aplica `data-palette` e variáveis `--sf-*`; uma `accentColor` escolhida continua valendo por cima da paleta.
- **FR-018 (QA)**: Campos de texto longos com raio de 12 px (não pílula), erros de formulário com contraste AA nos dois temas, alvos de toque de 44 px no celular, cabeçalho da vitrine sem estouro em 360 px e textos sem emojis.

### Key Entities

- **Convite de equipe (`private.site_invitations`, `kind = 'team'`)**: autorização de uso único, com papel e prazo, criada por proprietária ou `admin`; estados `open`, `accepted`, `revoked`, `expired`.
- **Membro (`public.site_memberships`)**: vínculo `(site_id, user_id, role)` criado pelo aceite ou pela administração.
- **Paleta da vitrine (`structure.theme.palette`)**: identificador de uma das 8 paletas.

## Success Criteria *(mandatory)*

- **SC-001**: Do Início, a pessoa chega à aba Itens de uma vitrine existente em 1 toque e cria uma vitrine em no máximo 2 interações.
- **SC-002**: O editor não tem botão Salvar e nenhuma edição se perde ao sair depois do "Salvo".
- **SC-003**: 100% das tentativas de convidar, revogar ou listar a equipe feitas por `editor`, `viewer` ou terceiros são negadas na API e no banco; nenhuma resposta de equipe contém e-mail, telefone, hash ou token.
- **SC-004**: Todos os tokens indisponíveis recebem a mesma resposta, com os três cabeçalhos de privacidade.
- **SC-005**: `npm test` e `npm run build` passam sem novas dependências npm nem serviços pagos.

## Divergências e decisões de porte

- **Convite por e-mail → convite por link (018)**: o trabalho original convidava por e-mail e aceitava no `/api/auth/session` quando o e-mail verificado coincidia. A `main` já tem papéis por vitrine e a 018 escolheu link de uso único, sem e-mail nem identificador na tela; seguimos a 018. O aceite automático por e-mail foi descartado.
- **Publicação só da proprietária → proprietária e `admin`**: o trabalho original restringia publicar e gerir Acesso à proprietária. A `main` já permite publicar e gerir equipe a `admin` (018 FR-020); seguimos a `main`.
- **Colaborador salva rascunho**: já existia na `main` (`editor`); a migração `collaborator_draft_edit` do trabalho original não é necessária.
- **Interesses próprios e máscara de WhatsApp**: já existiam na `main` (`202611120009_profile_custom_interests.sql`, `multi-select.mjs`, `phone-mask.mjs`); reaproveitados, nada portado.
- **Link de aceite**: a 018 propõe um formulário `POST /portal/convite` que guarda o token na sessão do navegador. Aqui a página `/convite/<token>` leva a `/portal/#/convite/<token>`; o portal move o token para `sessionStorage` e limpa a URL na hora. O fragmento não vai ao servidor nem ao `Referer`. A 018 pode trocar pelo formulário sem mudar a API.

## Assumptions

- O login continua o da `main` (Google; 017 proposta).
- Nenhum e-mail ou mensagem é enviado pela plataforma (ADR 0005).
- **Fora de escopo**: demonstrações, convite de dono, cortesia e `growth_operator` (018); relatório combinado de várias vitrines no Início.
