# Feature Specification: HTML puro em página emoldurada e em bloco, projeto externo e configurações por cliente

**Feature Branch**: `cursor/spec-html-puro-projeto-externo-e24b`

**Created**: 2026-11-21

**Status**: Draft

**Input**: Pedido do usuário: permitir que o proprietário publique conteúdo em HTML puro na vitrine, tanto como uma página quanto como um bloco dentro de uma página existente, com validação automática e revisão de um Operador Inspira na primeira publicação de cada versão; a página não ocupa a tela inteira, e sim uma área emoldurada pelo próprio site da vitrine. Para alguns clientes o projeto fica num site externo, e a vitrine precisa redirecionar para ele; esse vínculo só é configurado pelo Operador Inspira, por cliente e por vitrine, quando a customização foi contratada. Modelar tudo na visão de administração da plataforma (lista de clientes e, por cliente, as customizações) e melhorar a usabilidade das telas de configuração do operador e do proprietário. Caso de referência: o protótipo "Orbit" (`exemplos/orbit-prototipo.html`).

Pesquisa de apoio: [`research-usabilidade.md`](research-usabilidade.md) (auditoria num navegador real e maquete da página emoldurada). Vocabulário em [`CONTEXT.md`](../../CONTEXT.md); decisões em [ADR 0010](../../docs/adr/0010-opaque-sandbox-custom-components.md) (sandbox em origem opaca), [ADR 0009](../../docs/adr/0009-dynamic-cms-immutable-snapshots.md) (rascunho → prévia → publicação imutável → reversão; Operador Inspira e Equipe da Vitrine) e [ADR 0008](../../docs/adr/0008-multi-tenant-edge-routing.md) (roteamento na borda). Estende a `009-US5` e o `FR-008` da [especificação 009](../009-modular-admin-platform/spec.md).

## Ponto de partida

O que já existe e esta especificação reaproveita ou muda (detalhes técnicos ficam para o plano):

- A seção "Componente aprovado" (`custom_sandbox`) referencia um componente e a impressão digital (hash) do pacote; a vitrine pública mostra o pacote numa moldura isolada em `sandbox.inspira.dev.br`, sem acesso à origem da vitrine.
- Só o Operador Inspira registra pacotes, e só pela API; não há tela, fila de revisão nem estado "aguardando revisão" (U-03).
- O pacote tem limite de 64 KiB; o Orbit tem 162 KiB (M-10).
- A política do pacote bloqueia qualquer host externo; o Orbit fica sem estilo (M-04). Sem permissão de formulário, os formulários tratados por script do Orbit não funcionam (M-05).
- Não existe página emoldurada: as páginas extras da vitrine são renderizadas como trechos do mesmo documento, sem endereço próprio.
- `sandbox.inspira.dev.br` não tem rota configurada nem DNS, e a autenticação na Cloudflare não está configurada. Nada aqui afirma deploy remoto.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Proprietário publica o Orbit como página emoldurada da vitrine (Priority: P1)

O proprietário envia pelo painel o arquivo HTML do Orbit, cria a página "Protótipo Orbit" na sua vitrine, confere a prévia em computador e celular e envia para revisão. Depois que um Operador Inspira aprova essa versão, a página entra no ar com o cabeçalho, o menu, a identidade e o rodapé da vitrine em volta do conteúdo.

**Why this priority**: é o caso que motivou o pedido e entrega sozinho o valor principal: colocar um projeto interativo próprio dentro da vitrine, com segurança e sem pedir desenvolvimento à equipe Inspira.

**Independent Test**: com a conta de teste do proprietário (preenchida no quickstart), enviar `exemplos/orbit-prototipo.html`, criar a página emoldurada, abrir a prévia em 1280 e 375 px, enviar para revisão, aprovar com uma conta de Operador Inspira e abrir a página publicada como visitante. A ação mínima de aprovar ou recusar faz parte desta fatia; a fila completa é a US3.

**Acceptance Scenarios**:

1. **Given** um proprietário com uma vitrine e o arquivo do Orbit (162 KiB, com Tailwind por CDN e fontes do Google), **When** envia o arquivo em "Conteúdo HTML", **Then** a validação automática termina com "Pronto para revisão", lista os hosts externos usados (`cdn.tailwindcss.com`, `fonts.googleapis.com`, `fonts.gstatic.com`) como permitidos, informa tamanho e impressão digital e avisa que formulários só funcionam por script e não enviam dados.
2. **Given** o pacote validado, **When** o proprietário cria uma página do tipo "Página HTML emoldurada" com título "Protótipo Orbit" e endereço `prototipo-orbit`, **Then** a página aparece no menu da vitrine (se ele marcar essa opção) e a prévia autenticada mostra o Orbit dentro da moldura, marcada como "Aguardando revisão" e invisível para visitantes.
3. **Given** a prévia aberta a 1280 × 900, **When** o proprietário a observa, **Then** vê o cabeçalho da vitrine, a barra de título da página e uma moldura com margem lateral de 24 px e cerca de 1230 × 754 px, sem rolagem horizontal, e o rodapé da vitrine depois da moldura (M-01).
4. **Given** a prévia aberta a 375 × 812, **When** o proprietário a observa, **Then** vê cabeçalho compacto, título curto e moldura com margem lateral de 8 px e cerca de 357 × 702 px, com o Orbit ocupando a área com o próprio layout de altura total (M-01).
5. **Given** a versão enviada para revisão, **When** um Operador Inspira a aprova, **Then** o proprietário é avisado no painel, a página pode ser publicada e, publicada, fica visível no endereço `/<endereço-da-vitrine>/prototipo-orbit`.
6. **Given** a versão recusada com motivo, **When** o proprietário abre "Conteúdo HTML", **Then** vê o motivo, a data e quem revisou, e pode enviar uma nova versão; a página não vai ao ar com a versão recusada.

---

### User Story 2 - Proprietário insere um bloco HTML dentro de uma página existente (Priority: P2)

O proprietário adiciona um "Bloco HTML" entre as seções nativas de uma página (por exemplo, depois do cabeçalho do Início) e escolhe como a altura funciona: pela altura do próprio conteúdo ou por uma área fixa.

**Why this priority**: amplia o uso para widgets menores (calculadora, galeria, mapa interativo) sem trocar a página inteira, reaproveitando o mesmo pacote, validação e revisão da US1.

**Independent Test**: inserir um pacote de altura variável e o Orbit como blocos numa página, publicar após aprovação e conferir altura, carregamento e rolagem em 1280 e 375 px.

**Acceptance Scenarios**:

1. **Given** um pacote aprovado que informa a própria altura, **When** é usado como bloco no modo "Altura do conteúdo", **Then** o bloco cresce e diminui conforme o conteúdo, entre 120 e 4000 px, sem barra de rolagem interna (M-08).
2. **Given** o Orbit, que ocupa 100% da altura disponível, **When** é usado como bloco no modo "Altura fixa", **Then** o bloco tem até 640 px de altura e no máximo 75% da altura visível da tela (cerca de 1070 × 640 em 1280 e 349 × 609 em 375) e a seção seguinte continua acessível (M-08).
3. **Given** um bloco ainda fora da área visível, **When** o visitante rola até ele, **Then** vê um estado de carregamento com as cores da vitrine (nunca um retângulo preto ou vazio) até o conteúdo aparecer (M-09).
4. **Given** o editor de estrutura, **When** o proprietário adiciona um bloco HTML, **Then** o cartão do bloco mostra nome, versão, situação da revisão, modo de altura, uma miniatura ou prévia e o link "Ver em tela de celular", em vez de só uma lista de nomes (U-04).

---

### User Story 3 - Operador Inspira revisa a primeira publicação de cada versão (Priority: P3)

O Operador Inspira tem uma fila "Revisões" com todas as versões aguardando decisão, de todos os clientes, e decide cada uma com base no relatório da validação automática e numa prévia isolada.

**Why this priority**: é a barreira humana que torna o envio pelo próprio proprietário aceitável; com a fila, o autosserviço escala para todos os clientes.

**Independent Test**: com três versões pendentes de clientes diferentes, uma delas com alerta de campo de senha, abrir a fila, revisar cada uma em 1280 e 375 px de prévia, aprovar, recusar com motivo e pedir ajuste, e conferir avisos ao proprietário e registros de auditoria.

**Acceptance Scenarios**:

1. **Given** versões pendentes, **When** o operador abre "Revisões", **Then** vê cliente, vitrine, nome do pacote, versão, tamanho, hosts externos, alertas, se é a primeira versão ou uma atualização, e há quanto tempo espera, da mais antiga para a mais nova.
2. **Given** uma versão aberta para revisão, **When** o operador a analisa, **Then** vê o relatório da validação, a comparação com a última versão aprovada (tamanho, hosts e alertas que mudaram), a prévia isolada alternável entre computador e celular e uma lista de conferência (conteúdo coerente com o negócio, sem coleta de dados pessoais ou senhas, sem imitação de marca de terceiros, sem conteúdo proibido pelos termos).
3. **Given** a decisão "Recusar" ou "Pedir ajustes", **When** o operador tenta confirmar sem motivo, **Then** o sistema exige o motivo, que fica visível ao proprietário.
4. **Given** uma versão aprovada, **When** o mesmo arquivo (mesma impressão digital) é enviado de novo para a mesma vitrine, **Then** não volta para a fila; qualquer alteração no arquivo gera uma nova versão pendente.
5. **Given** uma versão já publicada, **When** o operador descobre abuso, **Then** pode "Retirar do ar" com motivo; a página ou o bloco passam a mostrar o estado de indisponível em até 5 minutos, e o proprietário é avisado.

---

### User Story 4 - Operador Inspira configura o projeto externo de um cliente (Priority: P4)

Para um cliente que contratou a customização "Projeto externo", o Operador Inspira abre a ficha do cliente, escolhe a vitrine e configura o endereço externo para onde a vitrine inteira ou uma página específica redireciona. O proprietário vê a configuração, mas não a altera.

**Why this priority**: atende clientes cujo projeto vive fora da Vitrine, preservando o endereço já divulgado e mantendo o controle e a responsabilidade com a equipe Inspira.

**Independent Test**: com um cliente com a customização contratada e outro sem, configurar o redirecionamento da vitrine inteira e de uma página, testar endereços inválidos, ativar, desativar, restaurar uma versão anterior, conferir a visão somente leitura do proprietário, o registro de auditoria, os metadados e a contagem nos Insights.

**Acceptance Scenarios**:

1. **Given** um cliente com a customização "Projeto externo" vigente, **When** o operador informa `https://orbit.cliente.com.br`, escolhe o alcance "Vitrine inteira", marca a confirmação de que o domínio pertence ao cliente ou foi contratado por ele, escreve o motivo e ativa, **Then** em até 5 minutos todo acesso aos endereços da vitrine leva o visitante direto ao endereço externo por redirecionamento temporário, e a alteração fica registrada com autor, data, valor anterior e novo.
2. **Given** o alcance "Página da vitrine", **When** o operador escolhe a página "Protótipo Orbit", **Then** só o endereço dessa página redireciona, o item de menu correspondente aponta direto para o endereço externo e o restante da vitrine continua normal.
3. **Given** um cliente sem a customização contratada, **When** o operador abre a vitrine dele, **Then** a área "Projeto externo" aparece desabilitada com a explicação "Disponível quando a customização Projeto externo estiver contratada" e o atalho para registrar a contratação.
4. **Given** um endereço `http://`, com IP, porta, usuário e senha, encurtador, um endereço da própria plataforma ou de um domínio vinculado à vitrine, **When** o operador tenta salvar, **Then** o sistema recusa com a mensagem do motivo ao lado do campo.
5. **Given** o redirecionamento ativo, **When** o proprietário abre "Domínio e projeto externo" em Ajustes, **Then** vê situação, destino, alcance, desde quando está ativo e como pedir mudança à equipe Inspira, sem nenhum controle de edição; membros da equipe da vitrine veem o mesmo.
6. **Given** um histórico com versões anteriores do vínculo, **When** o operador desativa ou restaura uma versão anterior, **Then** a vitrine volta a ser exibida normalmente ou passa a usar o destino restaurado em até 5 minutos, e as duas ações ficam no registro de auditoria.

---

### User Story 5 - Telas de configuração por cliente mais claras (Priority: P5)

O Operador Inspira encontra qualquer cliente e vê, numa ficha organizada, plano, vitrines, customizações contratadas, pacotes HTML, revisões, projeto externo, domínios e histórico. O proprietário encontra os ajustes da vitrine agrupados por assunto, cada grupo com situação, estado vazio, mensagens de validação e prévia quando couber.

**Why this priority**: sem essa organização, as novas configurações se somariam a telas já longas e sem caminho por cliente (U-01, U-05, U-06).

**Independent Test**: medir o tempo e o número de interações para tarefas fixas (encontrar o cliente X e ver se tem revisão pendente; mudar o horário de funcionamento; achar onde enviar um pacote HTML) antes e depois, em 1280 e 375 px, e conferir estados vazios, de erro e de bloqueio por plano em cada grupo.

**Acceptance Scenarios**:

1. **Given** o operador em "Administração da plataforma", **When** abre "Clientes", **Then** vê a lista de clientes com busca por nome do negócio, endereço da vitrine ou código da vitrine e filtros "Com revisão pendente", "Com projeto externo" e "Com customização contratada", e cada linha leva à ficha do cliente.
2. **Given** a ficha de um cliente, **When** o operador a abre, **Then** vê os grupos Resumo, Vitrines, Customizações contratadas, Conteúdo HTML, Projeto externo, Domínios e Histórico, cada um com situação e estado vazio próprios.
3. **Given** o proprietário na aba "Ajustes", **When** a abre, **Then** vê os grupos Dados do negócio; Endereço e horários; Google e compartilhamento; Canais; Identidade e páginas; Conteúdo HTML; Equipe; Domínio e projeto externo; Versões publicadas, recolhidos, cada um com resumo de uma linha, selo de situação ("Configurado", "Incompleto", "Aguardando revisão", "Disponível no plano X") e salvamento próprio.
4. **Given** um campo inválido em qualquer grupo, **When** o usuário salva, **Then** a mensagem aparece junto do campo, o grupo fica marcado e o foco vai para o primeiro erro.
5. **Given** uma falha ao carregar um grupo, **When** ela acontece, **Then** o grupo mostra o motivo em linguagem simples e "Tentar novamente" (U-10).

---

### User Story 6 - Proprietário substitui e reverte uma versão do pacote (Priority: P6)

O proprietário envia uma nova versão do Orbit, que passa pela validação e pela revisão sem tirar do ar a versão aprovada em uso. Se algo der errado depois de publicar, ele volta para a versão aprovada anterior em uma ação.

**Why this priority**: projetos interativos mudam com frequência; trocar versões sem deixar a página fora do ar é necessário para o uso contínuo.

**Independent Test**: com a versão 1 publicada, enviar a versão 2, conferir que a 1 continua no ar durante a revisão, aprovar e publicar a 2, depois reverter para a 1 e conferir o efeito para o visitante e no histórico.

**Acceptance Scenarios**:

1. **Given** a versão 1 publicada, **When** a versão 2 está aguardando revisão, **Then** visitantes continuam vendo a versão 1 e o proprietário vê as duas, com a situação de cada uma.
2. **Given** a versão 2 aprovada, **When** o proprietário publica a vitrine, **Then** a página passa a usar a versão 2 e a versão 1 fica no histórico como "Aprovada, fora de uso".
3. **Given** a versão 2 publicada, **When** o proprietário escolhe "Voltar para esta versão" na versão 1, **Then** a página volta a usar a versão 1 em até 5 minutos, sem nova revisão, e a ação fica registrada.
4. **Given** um pacote em uso por uma página ou bloco, **When** o proprietário tenta excluí-lo, **Then** o sistema impede e mostra onde ele é usado; fora de uso, a exclusão pede confirmação.

---

### User Story 7 - Visitante usa o conteúdo HTML no celular e no computador (Priority: P2)

O visitante da vitrine abre a página emoldurada ou uma página com bloco HTML e usa o conteúdo interativo sem perder o contexto do negócio: continua vendo marca, menu, botão do WhatsApp e rodapé.

**Why this priority**: é o resultado que justifica as US1 e US2; os cenários abaixo são o aceite de visitante dessas duas histórias.

**Independent Test**: como visitante, abrir a página publicada em 1280 e 375 px (e em 375 com o aparelho deitado), navegar por teclado, rolar até o rodapé, simular a falha dos hosts externos e um pacote retirado do ar.

**Acceptance Scenarios**:

1. **Given** a página emoldurada publicada, **When** o visitante a abre, **Then** vê primeiro a identidade e o menu da vitrine e, enquanto o conteúdo carrega, um estado de carregamento com o título da página.
2. **Given** o visitante com teclado ou leitor de tela, **When** chega à página, **Then** encontra o link "Pular conteúdo interativo", a moldura tem nome acessível igual ao título da página e o foco entra e sai da moldura com Tab.
3. **Given** o visitante no celular, **When** termina de usar o conteúdo, **Then** consegue rolar até o rodapé da vitrine pelas margens, pelo título ou pelo próprio gesto sobre a moldura (M-02).
4. **Given** o celular deitado (altura visível menor que 480 px), **When** o visitante abre a página, **Then** a moldura mantém 480 px de altura mínima e a página rola, sem cortar o conteúdo.
5. **Given** os hosts externos permitidos fora do ar, **When** o conteúdo não fica pronto em 10 segundos, **Then** a moldura mostra "O conteúdo interativo não carregou" com "Tentar novamente" e o botão de contato da vitrine.

---

### Edge Cases

- **Pacote acima do limite**: arquivo com mais de 512 KiB é recusado no envio com o tamanho medido e o limite, sem gravar nada.
- **Host não permitido**: referência a script, estilo, fonte, imagem ou moldura de host fora da lista (por exemplo `unpkg.com`) gera erro com o host e a linha; o envio para revisão fica bloqueado até corrigir. Imagens devem vir embutidas no próprio arquivo.
- **Tentativa de navegar a janela da vitrine** (`top.location`, `window.open`, `<meta http-equiv="refresh">`, `<base>`): a validação aponta como alerta e, se publicado, o navegador bloqueia (M-06); a vitrine continua no endereço original.
- **Mensagem inválida do pacote**: qualquer mensagem que não venha da própria moldura, tenha tipo desconhecido ou altura fora de 120–4000 px é ignorada sem erro visível (M-07); mensagens em excesso (mais de 10 por segundo) também.
- **Formulários no pacote**: o evento de envio funciona para o script do pacote, mas nenhum dado sai do navegador (M-05); campo de senha ou de cartão gera alerta obrigatório na revisão.
- **Leitura de cookies, armazenamento ou API da vitrine**: bloqueada pela origem opaca e pela política de conteúdo (M-06).
- **Host externo permitido fora do ar ou lento**: estado de falha após 10 s (US7, cenário 5); o restante da vitrine não é afetado.
- **Pacote retirado do ar ou excluído enquanto referenciado**: a página ou o bloco mostram "Conteúdo indisponível no momento" com o botão de contato; a vitrine continua publicada e o proprietário vê o aviso com o motivo.
- **Publicação com versão não aprovada**: a publicação da vitrine é recusada apontando a página ou o bloco, com as saídas "Usar a última versão aprovada" ou "Ocultar este conteúdo".
- **Phishing ou abuso no pacote**: imitação de banco, login de terceiros ou coleta de dados pessoais leva à recusa ou à retirada do ar com motivo, registro de auditoria e aviso ao proprietário; reincidência permite ao operador suspender o envio de pacotes daquela vitrine.
- **Endereço externo inválido**: fora de `https://`, com IP, porta, credenciais, encurtador ou domínio internacional confuso é recusado; domínios com caracteres internacionais são mostrados também na forma codificada para conferência.
- **Endereço externo fora do ar**: a verificação periódica avisa operador e proprietário depois de 3 falhas seguidas; o redirecionamento continua até o operador decidir desativar.
- **Laço de redirecionamento**: destino que aponta, direto ou depois de redirecionamentos, para um endereço da plataforma ou para domínio vinculado à vitrine é recusado ao salvar e na verificação periódica.
- **Cliente sem a customização contratada, ou contrato encerrado**: a área fica desabilitada com explicação; ao fim da vigência e da tolerância de 7 dias, o redirecionamento é desativado automaticamente, a vitrine volta a ser exibida e operador e proprietário são avisados.
- **Página com redirecionamento e conteúdo HTML ao mesmo tempo**: o redirecionamento prevalece enquanto ativo; o conteúdo continua salvo.
- **Cota de armazenamento**: ao atingir a cota de versões da vitrine, o envio é recusado com a orientação de excluir versões fora de uso.

## Requirements *(mandatory)*

### Functional Requirements

**Pacote HTML, validação e versões**

- **FR-001**: O proprietário e os administradores da vitrine DEVEM poder enviar pelo painel um Pacote HTML: um único arquivo HTML em UTF-8, com estilos, scripts e imagens embutidos, de até 512 KiB.
- **FR-002**: O sistema DEVE executar a validação automática no envio e mostrar um relatório com três níveis: erros (impedem a revisão), alertas (vão para o revisor) e informações (tamanho, impressão digital, hosts externos usados).
- **FR-003**: A validação DEVE recusar referências a recursos externos fora da lista de hosts permitidos (ver Assumptions), indicando host e linha, e DEVE recusar molduras, objetos e incorporações de outros endereços.
- **FR-004**: A validação DEVE gerar alertas para: navegação da janela principal, abertura de novas janelas, redirecionamento automático, campos de senha ou de cartão e formulários com destino externo. Imitação de marcas de terceiros e coleta de dados pessoais são conferidas pelo revisor na lista de conferência (FR-028), não pela validação automática.
- **FR-005**: Cada envio com conteúdo diferente DEVE gerar uma nova Versão identificada pela impressão digital do arquivo; reenviar um arquivo idêntico para a mesma vitrine DEVE reaproveitar a versão existente e sua situação.
- **FR-006**: Cada versão DEVE ter uma das situações: "Com erros", "Pronta para revisão", "Aguardando revisão", "Ajustes pedidos", "Recusada", "Aprovada", "Em uso", "Aprovada, fora de uso" ou "Retirada do ar", e o painel DEVE mostrar a situação, quem decidiu, quando e o motivo.
- **FR-007**: Nenhuma versão pode aparecer para visitantes sem estar aprovada por um Operador Inspira; uma vez aprovada, a mesma versão pode ser publicada, despublicada e republicada sem nova revisão.
- **FR-008**: O proprietário DEVE ver a prévia de qualquer versão sem erros, inclusive pendente, só na prévia autenticada da vitrine, que não é indexada.
- **FR-009**: O proprietário DEVE declarar no envio que tem direito sobre o conteúdo e que ele não coleta dados de visitantes; a declaração fica registrada com a versão.
- **FR-010**: O sistema DEVE limitar o armazenamento a 5 versões aprovadas mais as pendentes por pacote e a uma cota por vitrine (ver Assumptions), recusando novos envios acima da cota com a orientação de excluir versões fora de uso; versões recusadas DEVEM ser apagadas automaticamente 30 dias depois da decisão.

**Execução isolada**

- **FR-011**: Todo conteúdo de Pacote HTML DEVE ser executado só numa moldura isolada em origem opaca, conforme o ADR 0010: sem acesso a cookies, armazenamento, documento ou API da vitrine e do painel, sem abrir janelas, sem navegar a janela principal e sem conexões de rede próprias.
- **FR-012**: O conteúdo DEVE poder usar formulários tratados pelo próprio script, sem que nenhum envio de dados saia do navegador.
- **FR-013**: A vitrine DEVE aceitar do conteúdo apenas a mensagem de altura (FR-024), e só quando vier da própria moldura; todas as outras mensagens DEVEM ser ignoradas.
- **FR-014**: O conteúdo DEVE ser servido com a impressão digital conferida a cada entrega; divergência entre a versão publicada e o arquivo armazenado DEVE resultar em "Conteúdo indisponível", nunca em outro conteúdo.

**Página HTML emoldurada**

- **FR-015**: O proprietário DEVE poder criar, numa vitrine, uma página do tipo "Página HTML emoldurada" com título, endereço próprio (`/<endereço-da-vitrine>/<página>`), descrição curta opcional, Pacote HTML e versão aprovada, e escolher se ela aparece no menu do cabeçalho.
- **FR-016**: A página emoldurada NÃO DEVE ocupar a tela inteira: DEVE mostrar o cabeçalho, o menu, a identidade e o botão de contato da vitrine, uma barra com o título da página, a moldura com o conteúdo e o rodapé da vitrine depois da moldura.
- **FR-017**: Em telas de 1024 px ou mais (referência 1280 px), a área de conteúdo DEVE ter no máximo 1280 px de largura, margem lateral de 24 px, cantos arredondados e altura igual à altura visível menos cabeçalho, barra de título e 24 px, com mínimo de 560 px.
- **FR-018**: Entre 640 e 1023 px, a margem lateral DEVE ser de 16 px; abaixo de 640 px (referência 375 px), de 8 px, com cabeçalho compacto, barra de título de uma linha sem descrição e altura igual à altura visível menos cabeçalho, barra de título e 8 px, com mínimo de 480 px.
- **FR-019**: A altura DEVE acompanhar a altura visível real do aparelho, inclusive quando as barras do navegador móvel aparecem ou somem, sem cortar a moldura, e nenhuma largura entre 320 e 1440 px pode ter rolagem horizontal.
- **FR-020**: O modo de altura padrão da página DEVE ser "Altura da tela" (próprio para conteúdos de altura total com rolagem interna, como o Orbit); o proprietário PODE escolher "Altura do conteúdo" (FR-024) quando o conteúdo flui como um documento.
- **FR-021**: A página DEVE ter link "Pular conteúdo interativo", nome acessível da moldura igual ao título da página, estado de carregamento com as cores da vitrine e estado de falha depois de 10 s com "Tentar novamente" e o botão de contato.
- **FR-022**: A página DEVE ter metadados próprios para busca e compartilhamento (título, descrição, imagem), tirados do título, da descrição e da imagem de compartilhamento da vitrine; o conteúdo do pacote não é considerado para indexação.

**Bloco HTML**

- **FR-023**: O proprietário DEVE poder inserir um "Bloco HTML" em qualquer página da vitrine, entre as seções nativas, com até 3 blocos HTML por página, dentro do limite de seções já existente.
- **FR-024**: No modo "Altura do conteúdo", a vitrine DEVE ajustar a altura do bloco conforme a mensagem de altura do conteúdo, aceitando valores entre 120 e 4000 px e no máximo 10 mensagens por segundo; sem mensagem, o bloco usa 320 px.
- **FR-025**: No modo "Altura fixa", o bloco DEVE ter altura de até 640 px e no máximo 75% da altura visível, e a página DEVE continuar rolando antes e depois dele.
- **FR-026**: Blocos fora da área visível DEVEM mostrar estado de carregamento até o conteúdo aparecer, sem área preta ou vazia.

**Revisão pelo Operador Inspira**

- **FR-027**: A Administração da plataforma DEVE ter a fila "Revisões" com todas as versões "Aguardando revisão", de todos os clientes, ordenada pela espera, com cliente, vitrine, pacote, versão, tamanho, hosts, alertas, primeira versão ou atualização e tempo de espera.
- **FR-028**: A tela de revisão DEVE mostrar o relatório da validação, a comparação com a última versão aprovada, a prévia isolada alternável entre computador e celular e a lista de conferência; as decisões são "Aprovar", "Pedir ajustes" e "Recusar", as duas últimas com motivo obrigatório visível ao proprietário.
- **FR-029**: O Operador Inspira DEVE poder retirar do ar uma versão aprovada com motivo, com efeito para visitantes em até 5 minutos, e suspender o envio de novos pacotes de uma vitrine em caso de reincidência.
- **FR-030**: O proprietário DEVE ser avisado no painel (Início e Conteúdo HTML) de cada decisão; o aviso DEVE trazer a decisão, o motivo quando houver e o próximo passo.
- **FR-031**: Toda decisão, retirada e suspensão DEVE ficar no registro de auditoria com autor, cliente, vitrine, pacote, versão, decisão, motivo e data.

**Projeto externo**

- **FR-032**: Cada vitrine DEVE ter um Vínculo de projeto externo configurável só por Operador Inspira na ficha do cliente, e só quando a customização "Projeto externo" estiver vigente para aquele cliente e aquela vitrine.
- **FR-033**: O vínculo DEVE ter destino, alcance ("Vitrine inteira" ou "Página da vitrine", com a página escolhida), abertura do item de menu ("Mesma aba", padrão, ou "Nova aba"), situação ("Ativo" ou "Desativado"), confirmação do operador de que o domínio pertence ao cliente ou foi contratado por ele e motivo da alteração.
- **FR-034**: O destino DEVE ser um endereço `https://` completo, sem usuário e senha, sem porta, sem IP no lugar do nome, fora de encurtadores conhecidos, fora dos domínios da plataforma e dos domínios vinculados à vitrine, com até 2048 caracteres; nomes com caracteres internacionais DEVEM ser exibidos também na forma codificada.
- **FR-035**: Ao salvar e ativar, o sistema DEVE verificar que o destino responde e não volta para um endereço da plataforma ou da vitrine em até 5 redirecionamentos; falha na verificação impede a ativação, com o motivo.
- **FR-036**: Com alcance "Vitrine inteira" ativo, todo acesso aos endereços públicos da vitrine (endereço básico, páginas e domínio próprio, se houver) DEVE levar direto ao destino por redirecionamento temporário, sem página intermediária, preservando só os parâmetros de campanha (`utm_*`).
- **FR-037**: Com alcance "Página da vitrine" ativo, só o endereço daquela página DEVE redirecionar; o item de menu que leva a ela DEVE apontar direto para o destino, na aba escolhida, e, em "Nova aba", com indicação visível e acessível de que abre em outra aba e sem repassar a página de origem.
- **FR-038**: Endereços que redirecionam NÃO DEVEM ser indexados, NÃO DEVEM entrar em mapa do site nem em `vitrine.json`, e a vitrine não DEVE declarar endereço canônico para eles; ao compartilhar um endereço redirecionado, a prévia exibida é a do destino.
- **FR-039**: Cada redirecionamento DEVE ser contado nos Insights da vitrine como "Levados ao projeto externo", somado por dia e por origem de campanha, sem dados pessoais; o que acontece no destino não é medido.
- **FR-040**: O vínculo DEVE guardar as últimas 5 configurações; o operador DEVE poder desativar ou restaurar uma configuração anterior em uma ação, com efeito em até 5 minutos.
- **FR-041**: O sistema DEVE verificar diariamente os vínculos ativos e avisar operador e proprietário depois de 3 falhas seguidas ou ao detectar laço; a desativação continua sendo decisão do operador.
- **FR-042**: O proprietário e os membros da equipe da vitrine DEVEM ver o vínculo somente leitura em Ajustes ("Domínio e projeto externo"): situação, destino, alcance, desde quando e como pedir mudança; nenhum controle de edição.
- **FR-043**: Toda alteração do vínculo (criar, editar, ativar, desativar, restaurar, desativação automática por fim de contrato) DEVE ficar no registro de auditoria com autor, cliente, vitrine, valor anterior, valor novo, motivo e data.

**Administração por cliente**

- **FR-044**: A Administração da plataforma DEVE ter a área "Clientes" com a lista de organizações clientes e suas vitrines, busca por nome do negócio, endereço ou código da vitrine, filtros "Com revisão pendente", "Com projeto externo" e "Com customização contratada", e acesso direto pelo endereço do painel.
- **FR-045**: A ficha do cliente DEVE agrupar: Resumo (plano, situação da assinatura, vitrines), Vitrines, Customizações contratadas, Conteúdo HTML (pacotes, versões e revisões), Projeto externo (por vitrine), Domínios e Histórico, cada grupo com situação, estado vazio com ação e erros com "Tentar novamente".
- **FR-046**: O Operador Inspira DEVE poder registrar, editar e encerrar uma Customização contratada por cliente e vitrine, com tipo ("Projeto externo", "Conteúdo HTML sob medida" ou outros já oferecidos), vigência, pedido de customização de origem e observação interna; o encerramento segue a tolerância de 7 dias.
- **FR-047**: Pedidos de customização, atividade recente e revisões DEVEM mostrar o cliente e a vitrine e levar à ficha correspondente; o pedido feito pelo proprietário DEVE indicar a vitrine.
- **FR-048**: O Operador Inspira DEVE poder enviar um Pacote HTML em nome do cliente, como parte de uma customização contratada; a versão segue a mesma validação e precisa da aprovação de outro Operador Inspira quando houver mais de um.
- **FR-049**: Só Operadores Inspira com o papel de administrador da plataforma acessam essas áreas; o servidor DEVE recusar, inclusive em chamadas diretas, qualquer leitura ou escrita de proprietários, membros, patrocinadores e operadores de suporte.

**Configurações do proprietário**

- **FR-050**: A aba "Ajustes" DEVE ter o mesmo nome no título do painel e organizar as configurações nos grupos da US5, cenário 3, com o mesmo padrão visual de grupo recolhível, resumo de uma linha, selo de situação e selo do plano quando o recurso for pago.
- **FR-051**: Cada grupo DEVE salvar de forma independente e mostrar "Salvo", "Alterações não salvas" ou o erro; o editor de páginas e seções DEVE mostrar cada seção recolhida com um resumo e permitir abrir uma por vez.
- **FR-052**: O grupo "Conteúdo HTML" DEVE listar os pacotes da vitrine com versões, situação, onde cada versão é usada e ações (enviar nova versão, prévia, voltar para versão, excluir quando fora de uso); sem pacotes, DEVE explicar o que é, o que é permitido e mostrar "Enviar primeiro pacote".
- **FR-053**: O destino de link de menu DEVE ser escolhido por lista (página da vitrine, seção da página, conversa no WhatsApp ou endereço externo), com o endereço externo validado como em FR-034 e a opção de abrir em nova aba.
- **FR-054**: Em 1280 px, o formulário de configuração DEVE ter largura suficiente para não cortar o conteúdo dos campos; a prévia ao vivo pode ser recolhida.
- **FR-055**: Todo grupo que depende do servidor DEVE ter estados de carregando, vazio, erro com motivo e "Tentar novamente", e bloqueado pelo plano com o plano que libera o recurso.

### Key Entities *(include if feature involves data)*

- **Pacote HTML**: conteúdo interativo de uma vitrine, com nome, descrição, vitrine dona, quem enviou e situação de envio (ativo ou suspenso pelo operador). Tem várias versões.
- **Versão do pacote**: um arquivo específico do pacote, identificado pela impressão digital, com tamanho, relatório da validação, hosts externos usados, declaração do proprietário, situação e datas. Só a versão aprovada pode ir ao ar.
- **Revisão**: decisão de um Operador Inspira sobre uma versão (aprovar, pedir ajustes, recusar, retirar do ar), com motivo, lista de conferência respondida, autor e data.
- **Página HTML emoldurada**: página da vitrine com endereço próprio, título, descrição, versão do pacote em uso, modo de altura e presença no menu; o conteúdo aparece dentro da moldura do site da vitrine.
- **Bloco HTML**: seção de uma página da vitrine que exibe uma versão aprovada, com modo de altura ("Altura do conteúdo" ou "Altura fixa") e posição entre as seções.
- **Vínculo de projeto externo**: configuração por vitrine com destino, alcance, página, abertura do menu, situação, confirmação do operador, últimas 5 configurações e resultado da última verificação.
- **Customização contratada do cliente**: registro, por organização cliente e vitrine, de uma customização com tipo, vigência, origem (pedido de customização) e situação; libera o projeto externo e o envio de conteúdo sob medida pelo operador.
- **Registro de auditoria**: já existente; passa a receber as ações de revisão, retirada, suspensão, vínculo de projeto externo e customização contratada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com a conta de teste do proprietário, enviar o Orbit, criar a página emoldurada e enviá-la para revisão leva menos de 5 minutos, sem ajuda.
- **SC-002**: Em 1280 × 900 e 375 × 812, a página emoldurada não tem rolagem horizontal, mostra cabeçalho e título da vitrine, a moldura ocupa pelo menos 80% da altura visível abaixo do cabeçalho e o rodapé é alcançável.
- **SC-003**: 100% das tentativas do pacote de teste hostil (ler cookies, armazenamento e página da vitrine, navegar a janela principal, abrir janela, conexões de rede, script e imagem de host não permitido, envio de formulário e mensagens inválidas) são bloqueadas ou ignoradas.
- **SC-004**: 90% das versões enviadas recebem decisão em até 2 dias úteis, e a revisão de uma versão leva no máximo 10 minutos de trabalho do operador na mediana.
- **SC-005**: O operador chega à ficha de qualquer cliente e vê se ele tem revisão pendente, projeto externo e customização contratada em até 3 interações e 30 segundos.
- **SC-006**: Ativar, desativar, restaurar um vínculo de projeto externo, retirar uma versão do ar ou voltar para uma versão anterior tem efeito para os visitantes em até 5 minutos, e 100% dessas ações aparecem no registro de auditoria com autor, motivo e valores anterior e novo.
- **SC-007**: 100% dos destinos inválidos dos casos de teste (sem `https://`, com IP, porta, credenciais, encurtador, domínio da plataforma, domínio da vitrine e laço) são recusados antes de ativar.
- **SC-008**: Na aba "Ajustes" com os grupos recolhidos, a lista inteira cabe em até 2 telas em 375 px (hoje são 6,9 telas abertas, U-05), e 9 em cada 10 participantes de teste encontram onde enviar um pacote HTML na primeira tentativa.
- **SC-009**: As versões de pacotes de todas as vitrines permanecem dentro das cotas definidas, e o painel do operador avisa quando o uso do banco gratuito passa de 80%.
- **SC-010**: Nenhum visitante vê conteúdo de uma versão que não esteja aprovada, verificado nos testes de publicação e de prévia.

## Assumptions

- **Conta de teste**: o proprietário de teste é a conta do próprio usuário; nesta especificação ela aparece como "conta de teste do proprietário" e é preenchida no quickstart do plano. Nenhum e-mail é versionado.
- **Limite do pacote**: 512 KiB por versão, com estilos, scripts e imagens embutidos. O Orbit (162 KiB) cabe com folga.
- **Hosts externos permitidos**: só `cdn.tailwindcss.com` (scripts), `fonts.googleapis.com` (estilos) e `fonts.gstatic.com` (fontes). Conexões de rede próprias do conteúdo continuam bloqueadas, e o envio de formulários não sai do navegador. Imagens só embutidas no arquivo; usar a biblioteca de arquivos da vitrine fica para uma fatia futura. Os visitantes passam a ser atendidos também por esses hosts de terceiros; a política de privacidade deve citá-los antes de liberar o recurso.
- **Restrições técnicas herdadas do ADR 0010** (aceito): moldura com `sandbox="allow-scripts"` e, para a FR-012, `allow-forms` combinado com `form-action 'none'` (verificado em M-05); **nunca** `allow-same-origin`, `allow-top-navigation` ou `allow-popups`; conteúdo servido no host isolado `sandbox.inspira.dev.br`, com `referrerpolicy="no-referrer"`. A mensagem de altura é `{ type: "vitrine:resize", height }`, aceita só quando a origem é opaca e a fonte é a própria moldura (M-07).
- **Redirecionamento**: temporário (HTTP 302), com cache curto na borda (até 5 minutos, como as vitrines), para ser reversível; sem página intermediária, porque o destino é verificado e confirmado por um Operador Inspira. Não há mapeamento de caminhos no alcance "Vitrine inteira": todos os endereços levam ao mesmo destino.
- **Sem tela cheia**: a página emoldurada não tem modo de tela cheia nesta versão.
- **Cotas e custo zero**: as versões ficam no banco gratuito do Supabase (500 MB); cota inicial de 3 MiB por vitrine (5 versões de 512 KiB mais pendentes). Cada visita à página emoldurada soma pelo menos duas requisições ao Workers Free (vitrine e pacote); a entrega do pacote tem cache imutável pela impressão digital. Planos gratuitos não são SLA (Princípio IV).
- **Prazo de revisão**: meta de 2 dias úteis, sem compromisso contratual.
- **Planos**: o envio de pacotes pelo proprietário fica liberado conforme a decisão pendente abaixo; o projeto externo depende só da customização contratada, não do plano.
- **Dependências**: (1) rota e DNS de `sandbox.inspira.dev.br` e autenticação na Cloudflare, hoje não configuradas (`BLK-CLOUD-01`); (2) endereço próprio para páginas da vitrine, que hoje são renderizadas no mesmo documento; (3) estado "aguardando revisão" no cadastro de componentes, que hoje exige aprovador no registro; (4) contas de Operador Inspira com papel de administrador para o aceite (`BLK-HITL-72`); (5) atualização da política de privacidade e dos termos (seção de conteúdo enviado pelo proprietário).
- **Fora do escopo**: integração com repositórios GitHub para pacotes, pacotes com vários arquivos, edição de HTML dentro do painel, domínio próprio para o pacote, tela cheia, e convite de equipe por e-mail (U-11, registrado para o backlog).
- **Decisões pendentes**:
  - Quais planos liberam o envio de Pacotes HTML pelo próprio proprietário, e com quantos pacotes ativos por vitrine? [NEEDS CLARIFICATION: liberar no Gratuito/Social com 1 pacote ativo e mais nos planos pagos, ou só a partir do Essencial ou do Profissional?]
  - Para ativar o projeto externo, basta a confirmação do operador de que o domínio pertence ao cliente, ou o cliente precisa comprovar a posse do domínio de destino? [NEEDS CLARIFICATION: confirmação do operador registrada na auditoria, ou comprovação técnica (registro DNS ou arquivo no site de destino) antes da primeira ativação?]
