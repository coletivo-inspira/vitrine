# Feature Specification: Repaginação do Portal em Liquid Glass, Catálogo por Componentes, Planilha CSV, Fluxo Público em Etapas e Painel de Insights

**Feature Branch**: `008-portal-redesign`

**Created**: 2026-11-12

**Status**: Approved for Implementation (Phase 4 — Sequência de PRs `a`, `b`, `c`, `e`, `d`)

**Input**: Repaginação completa do portal administrativo da Vitrine (`painel.inspira.dev.br` / `/portal/`) com estrutura de aplicativo e estética Liquid Glass, painel inicial inspirado no hub `inspira.dev.br`, perfil e interesses, assistente de nova vitrine em 3 passos, pedidos de customização salvos com link opcional para WhatsApp, editor reorganizado com barra de ações fixa e abas, catálogo por componentes (`products`, `booking`, `quote`), importação e exportação de cardápio por planilha CSV no cliente, fotos redimensionadas para WebP no navegador rumo ao plano gratuito de armazenamento, fluxo público em etapas compartilhando o renderizador com a prévia do editor, migração sem perda das vitrines `pizzeria-v1`, e coleta de métricas agregadas sem dados pessoais (`POST /api/events` + `site_metrics_daily`) com aba **Insights** no portal (`GET /api/sites/:id/insights?period=7d|30d|90d`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navegar no Shell do Aplicativo e Visualizar o Painel Inicial (`008-US1`) (Priority: P1)

Como pessoa autenticada no portal da Vitrine, quero navegar por uma estrutura de aplicativo com barra lateral translúcida no computador e barra inferior com ícones no celular, visualizando um painel inicial com cartões das minhas vitrines, status de publicação, último pedido de customização, completude do meu perfil, card de destaque de insights da semana e atalhos rápidos, sem logotipos duplicados no cabeçalho, para gerenciar minha presença digital de forma clara em qualquer dispositivo e tema (claro ou escuro).

**Why this priority**: Corrige o defeito crítico de marca no cabeçalho (`AUD-001`) e substitui a tela única atual por uma arquitetura de aplicativo escalável (`AUD-002`, `AUD-006`) que ancora todas as demais funcionalidades do portal.

**Independent Test**: Acessar `/portal/` em desktop (`1440px`) e celular (`390px`) nos modos claro e escuro (com e sem suporte a `backdrop-filter` / `prefers-reduced-transparency`), confirmar que apenas a variante correta da logo aparece no cabeçalho, alternar pelas seções **Início**, **Minhas vitrines**, **Insights**, **Perfil e interesses** e **Pedidos de customização**, e verificar os cartões de resumo no Painel Inicial.

**Acceptance Scenarios**:

1. **Given** que o usuário abre `/portal/` no tema claro ou escuro, **When** o cabeçalho é renderizado, **Then** apenas uma única logo oficial da Vitrine (`.brand-logo-light` no claro, `.brand-logo-dark` no escuro) fica visível, com controle de tema e ação de conta com alvo mínimo de `44×44px`.
2. **Given** um usuário autenticado em tela desktop (`>= 900px`), **When** navega pelo portal, **Then** vê uma barra lateral em Liquid Glass com links para **Início**, **Minhas vitrines**, **Insights**, **Perfil e interesses** e **Pedidos de customização**; em telas móveis (`< 900px`), vê uma barra inferior fixa com ícones e rótulos acessíveis.
3. **Given** um usuário autenticado na visão **Início (Painel inicial)**, **When** os dados carregam, **Then** o painel exibe cartões no estilo do hub Inspira (linha superior com categoria e status, eyebrow, título, descrição e rodapé com tags) mostrando o resumo de vitrines, status de publicação, destaque da semana de insights, último pedido de customização, percentual/estado de completude do perfil e atalhos para criar vitrine ou pedir customização.
4. **Given** um navegador sem suporte a `backdrop-filter` ou com preferência do sistema `prefers-reduced-transparency: reduce`, **When** o portal é aberto, **Then** todas as superfícies Liquid Glass usam automaticamente o fallback sólido sem perda de legibilidade e com contraste mínimo WCAG AA (`4.5:1`).

---

### User Story 2 - Gerenciar Perfil do Empreendedor e Interesses (`008-US2`) (Priority: P1)

Como pessoa dona de um negócio no portal, quero preencher e atualizar meu perfil (nome de exibição, nome do negócio, cidade e WhatsApp) e selecionar meus interesses em chips de múltipla escolha com isolamento exclusivo para minha conta, para que a plataforma conheça meu contexto e pré-preencha meus dados nos fluxos de criação e atendimento.

**Why this priority**: Alimenta o indicador de completude do painel inicial, reduz atrito na criação de vitrines e pedidos de customização, e estabelece a persistência individual protegida por proprietário.

**Independent Test**: Consultar e salvar o perfil e a lista de interesses, recarregar a sessão e verificar que os dados persistem exclusivamente para o próprio usuário autenticado, sendo inacessíveis para outros usuários.

**Acceptance Scenarios**:

1. **Given** um usuário autenticado na seção **Perfil e interesses**, **When** informa nome de exibição, negócio, cidade, WhatsApp válido e seleciona chips de interesses (como cardápio digital, agendamento, domínio próprio, identidade visual, fotografia) e aciona salvar, **Then** os dados são persistidos na conta do usuário e o indicador de completude do painel inicial é atualizado.
2. **Given** dois usuários autenticados distintos (`User A` e `User B`), **When** `User B` tenta ler ou alterar o perfil ou os interesses de `User A`, **Then** o sistema garante isolamento estrito por conta e nunca retorna nem modifica registros de terceiros.
3. **Given** uma tentativa de salvar perfil sem sessão válida, de outra origem ou com dados inválidos (como WhatsApp fora do formato internacional de dígitos), **Then** o sistema rejeita a operação com mensagem clara em português sem gravar dados parciais.

---

### User Story 3 - Criar Nova Vitrine em 3 Passos ou Solicitar Customização (`008-US3`) (Priority: P1)

Como empreendedor no portal, quero criar uma nova vitrine por meio de um assistente em 3 passos (1. Tipo/Área de atuação, 2. Modelo/Tipo de catálogo disponível ou sob customização, 3. Nome e endereço), e quero poder registrar e acompanhar pedidos de customização salvos na minha conta com link opcional para continuar a conversa no WhatsApp, para lançar minha vitrine padrão imediatamente ou encomendar um projeto sob medida.

**Why this priority**: Substitui o formulário rígido atual (`AUD-003`) pelo fluxo guiado alinhado às cinco áreas da página principal e conecta a demanda por modelos personalizados a registros estruturados.

**Independent Test**: Percorrer os 3 passos do assistente escolhendo área (Alimentação, Arte & design, Fotografia & mídia, Saúde ou Tecnologia), selecionar um modelo disponível para criar a vitrine ou escolher um modelo "sob customização" para abrir o pedido pré-preenchido, salvar o pedido e verificar sua listagem com status e link opcional para WhatsApp.

**Acceptance Scenarios**:

1. **Given** um usuário autenticado acionando **Nova vitrine**, **When** percorre o Passo 1, **Then** pode escolher entre as cinco áreas oficiais: **Alimentação**, **Arte & design**, **Fotografia & mídia**, **Saúde** ou **Tecnologia**.
2. **Given** que o usuário selecionou a área no Passo 1, **When** avança ao Passo 2, **Then** visualiza os modelos disponíveis para criação imediata (Cardápio / Produtos, Agendamento de serviços, Lista de interesse / Orçamento) e os modelos marcados como **Sob customização**; ao selecionar um modelo disponível e preencher nome e endereço (`slug`) válido no Passo 3, a vitrine e seu rascunho inicial são criados com o tipo e modelo escolhidos.
3. **Given** que o usuário seleciona um modelo marcado como **Sob customização** no Passo 2 ou acessa a seção **Pedidos de customização**, **When** preenche tipo, modelo de interesse, objetivo, referências (links HTTPS válidos) e prazo desejado e envia o formulário, **Then** o pedido é salvo com status inicial `novo`, aparece na lista de pedidos do usuário com seu status (`novo`, `em_analise`, `respondido` ou `encerrado`) e oferece um botão opcional para abrir a conversa no WhatsApp com o resumo preenchido.

---

### User Story 4 - Configurar Catálogo por Componentes e Fotos no Editor Reorganizado (`008-US4`) (Priority: P1)

Como responsável por uma vitrine, quero editar meu catálogo em um editor com barra de ações de vidro fixa (voltar, status, revisão, salvar, publicar e abrir vitrine), seções organizadas em abas (Configurações, Categorias, Itens, Pedido & Mensagem) e prévia ao vivo ao lado no computador ou em aba no celular, podendo ligar ou desligar componentes do item (nome, descrição, foto, preço, quantidade mínima, seletor de quantidade, duração), configurar campos opcionais do pedido (data, lista de horários, endereço ou retirada, nome, observação), personalizar textos e variáveis da mensagem do WhatsApp (`{itens}`, `{total}`, `{data}`, `{horario}`, `{endereco}`, `{nome}`) e enviar fotos reduzidas no navegador para WebP de até cerca de 200 KB, para adaptar a vitrine ao meu modelo de atendimento sem custos de infraestrutura.

**Why this priority**: Transforma o editor fixo de pizzaria (`AUD-004`, `AUD-005`, `AUD-007`) em um construtor modular que atende produtos, agendamentos (como barbearias e clínicas) e orçamentos dentro da cota gratuita.

**Independent Test**: Abrir uma vitrine no editor, alternar entre as abas, ativar/desativar componentes de item e campos de pedido, personalizar o template da mensagem do WhatsApp com variáveis, fazer upload de uma imagem (verificando conversão cliente para WebP `<= 200 KB` e armazenamento apenas da URL no rascunho), salvar e validar que a barra de ações permanece fixa e a prévia ao vivo reflete imediatamente cada alteração.

**Acceptance Scenarios**:

1. **Given** o editor aberto em desktop ou celular, **When** o usuário rola a lista de configurações, categorias ou itens, **Then** a barra de ações em Liquid Glass permanece fixa e acessível com os controles de salvar rascunho, publicar vitrine, abrir vitrine pública e indicador compacto de revisão e limites (20 itens ativos, 100 totais, 256 KiB).
2. **Given** uma vitrine configurada como **Produtos/Cardápio**, **Agendamento de serviços** ou **Lista de interesse/Orçamento**, **When** o proprietário ativa ou desativa componentes do item (descrição, foto, preço, quantidade mínima, seletor de quantidade, duração em minutos) e campos do pedido (data, lista de horários configurada pelo dono, endereço/retirada, nome, observação), **Then** o editor valida as regras do tipo de catálogo (permitindo itens sem preço obrigatório no modo orçamento e duração em serviços) e atualiza a prévia ao vivo.
3. **Given** que o proprietário edita os textos personalizáveis (título, boas-vindas, texto do botão e mensagem de abertura do WhatsApp com `{itens}`, `{total}`, `{data}`, `{horario}`, `{endereco}`, `{nome}`), **When** salva o rascunho, **Then** os textos são validados contra marcação insegura e aplicados na prévia e na publicação.
4. **Given** que o proprietário seleciona uma foto para um item do catálogo, **When** o arquivo é processado no navegador, **Then** a imagem é redimensionada e convertida no cliente para WebP de até cerca de 200 KB antes do envio para o bucket gratuito de imagens da vitrine, gravando apenas a URL HTTPS pública no rascunho (mantendo o JSON dentro do teto de 256 KiB).

---

### User Story 5 - Importar e Exportar Cardápio por Planilha CSV no Editor (`008-US5`) (Priority: P2)

Como pessoa dona de vitrine que já organiza seus produtos ou serviços em planilhas, quero baixar no editor um modelo CSV compatível com Excel e Google Planilhas em português (UTF-8 com BOM, separador `;` e decimais com vírgula), importar minha planilha preenchida com leitura e validação no navegador vendo o total de linhas válidas e os erros detalhados por linha e coluna, escolher entre adicionar/atualizar itens no rascunho (sem duplicar itens de mesma categoria e nome) ou substituir todo o cardápio, e exportar meu cardápio atual no mesmo formato CSV, para cadastrar e revisar dezenas de itens em lote com rapidez antes de salvar e publicar.

**Why this priority**: Elimina o trabalho repetitivo de digitar item por item (`AUD-005`) sem exigir novas rotas de servidor nem pacotes externos.

**Independent Test**: Baixar `modelo-produtos.csv` e `modelo-servicos.csv`, importar planilhas válidas e com erros de formatação no editor, verificar a tabela de prévia com contagem de válidos e mensagens por linha/coluna, aplicar tanto "Adicionar ao cardápio" (validando atualização por `categoria + nome` e criação de categorias novas) quanto "Substituir cardápio", confirmar que apenas o rascunho é alterado respeitando os tetos de 20 ativos / 100 totais / 256 KiB, e testar "Exportar cardápio" gerando CSV idêntico ao modelo.

**Acceptance Scenarios**:

1. **Given** o proprietário no editor de uma vitrine, **When** aciona **Baixar modelo**, **Then** recebe o arquivo estático correspondente ao tipo de catálogo (`modelo-produtos.csv` com colunas `categoria;nome;descricao;preco;quantidade_minima;ativo` ou `modelo-servicos.csv` com colunas `categoria;nome;descricao;preco;duracao_min;ativo`), codificado em UTF-8 com BOM (`\uFEFF`), separador `;`, preço com vírgula (`25,00`), uma linha de cabeçalho e duas linhas de exemplo.
2. **Given** um arquivo CSV selecionado pelo proprietário para importação no navegador, **When** o parser analisa o arquivo, **Then** exibe uma prévia antes de alterar o rascunho contendo a quantidade de linhas válidas, a lista de erros por linha e coluna (por exemplo: `"Linha 7, preço: use o formato 25,00"`) e a escolha entre **Adicionar ao cardápio** e **Substituir cardápio**.
3. **Given** uma importação confirmada no modo **Adicionar ao cardápio**, **When** uma linha possui a mesma `categoria` e o mesmo `nome` (comparação normalizada sem diferenciar maiúsculas/minúsculas e espaços extras) de um item existente no rascunho, **Then** o item existente é atualizado sem criar duplicata (preservando sua foto caso já tenha uma), categorias inexistentes são criadas automaticamente e a alteração ocorre apenas no rascunho (exigindo salvar/publicar separadamente).
4. **Given** uma planilha cujo resultado ultrapasse 20 itens ativos, 100 itens no total ou 256 KiB de rascunho, **When** o usuário tenta aplicar ou salvar a importação, **Then** o editor sinaliza a violação com a mesma regra de validação do servidor e impede um rascunho inválido.
5. **Given** um cardápio já preenchido no editor, **When** o proprietário aciona **Exportar cardápio**, **Then** o navegador gera e baixa um arquivo CSV com UTF-8 BOM e separador `;` no mesmo esquema de colunas do tipo de catálogo, permitindo editar em lote e reimportar sem perda dos campos tabulares.

---

### User Story 6 - Realizar Pedido ou Agendamento Público em Etapas com Migração Transparente (`008-US6`) (Priority: P1)

Como visitante de uma vitrine pública (ou pessoa testando a prévia ao vivo no editor), quero navegar por um fluxo claro em etapas — primeiro escolher os produtos, serviços ou itens de orçamento, depois preencher os dados solicitados do pedido (como data, horário, endereço/retirada, nome e observação) e revisar o resumo, e por fim abrir o WhatsApp (`wa.me`) com a mensagem completa montada — funcionando tanto para novas vitrines por componentes quanto para vitrines existentes no formato `pizzeria-v1` migradas sem perda de dados.

**Why this priority**: Entrega a experiência final ao cliente do pequeno negócio (`AUD-004`, `AUD-009`), alinhada à referência de fluxo guiado com identidade visual e tokens da Vitrine Inspira.

**Independent Test**: Abrir uma vitrine pública de produtos, uma de agendamento de serviços e uma vitrine legada `pizzeria-v1` migrada, percorrer as etapas (Escolher → Dados e Revisão → Enviar no WhatsApp), verificar que o link `https://wa.me/<numero>?text=...` interpola todas as variáveis configuradas (`{itens}`, `{total}`, `{data}`, `{horario}`, `{endereco}`, `{nome}`) e confirmar que a prévia do editor renderiza exatamente o mesmo fluxo.

**Acceptance Scenarios**:

1. **Given** um visitante em uma vitrine pública ou na prévia ao vivo do editor, **When** seleciona itens na Etapa 1 (respeitando quantidade mínima ou seleção de serviço com duração), avança para a Etapa 2 (preenchendo os campos habilitados pelo dono, como data, horário da lista configurada, endereço/retirada, nome e observação) e revisa o pedido na Etapa 3, **Then** o botão final abre `https://wa.me/<whatsapp>?text=<mensagem_codificada>` com as variáveis `{itens}`, `{total}`, `{data}`, `{horario}`, `{endereco}` e `{nome}` substituídas pelos valores escolhidos.
2. **Given** uma vitrine existente criada anteriormente com `template: "pizzeria-v1"`, **When** seu rascunho é carregado no editor ou compilado para publicação, **Then** seus dados (nome do negócio, WhatsApp, categorias, itens, preços e descrições) são migrados automaticamente para o catálogo de produtos por componentes sem perda de nenhum item ou preço.
3. **Given** qualquer vitrine pública renderizada ou pré-visualizada, **When** a página é inspecionada, **Then** utiliza exclusivamente os tokens tipográficos e cromáticos da Vitrine Inspira (sem Tailwind CDN, sem scripts inline, sem emojis na interface e sem bloqueio de horário no servidor, pois a confirmação ocorre via WhatsApp).

---

### User Story 7 - Coletar Métricas sem Dados Pessoais e Consultar o Painel de Insights (`008-US7`) (Priority: P2)

Como proprietário ou membro de uma vitrine publicada, quero visualizar uma aba **Insights** no portal (com períodos de 7, 30 e 90 dias, comparação com o período anterior, cards de resumo de visitas, pedidos, conversão e valor estimado, ranking de itens e categorias, gráficos próprios em SVG/CSS por dia e por horário e frases automáticas de variação semanal) e um card de destaque da semana no painel inicial, alimentados por eventos em lote enviados pela vitrine pública sem guardar IP, cookie nem dado pessoal, para entender o comportamento da minha clientela respeitando a LGPD e o custo zero.

**Why this priority**: Transforma as vitrines publicadas em ferramenta de inteligência acionável para o pequeno negócio sem rastreadores de terceiros, cookies invasivos ou custos adicionais no Cloudflare/Supabase.

**Independent Test**: Navegar em uma vitrine publicada gerando eventos de visita, visualização de item, adição à seleção e envio ao WhatsApp via `POST /api/events` (testando também rejeição de bots, vitrines não publicadas, itens inexistentes e lotes acima do limite), consultar `GET /api/sites/:id/insights?period=7d|30d|90d` como membro autorizado e como terceiro não autorizado, e validar a renderização da aba **Insights**, do card de destaque no painel inicial e do aviso de privacidade no rodapé da vitrine.

**Acceptance Scenarios**:

1. **Given** um visitante interagindo com uma vitrine publicada, **When** a página envia eventos em lote via `navigator.sendBeacon` (ou `fetch` JSON) para `POST /api/events`, **Then** o Worker valida que o `Content-Type` é `application/json`, o `User-Agent` não é de robô, o lote respeita o teto máximo, a vitrine está publicada e os `itemId` pertencem à publicação ativa, incrementando apenas contadores diários/horários agregados em `public.site_metrics_daily` via função `security definer` sem gravar IP, cookie ou dado pessoal.
2. **Given** uma requisição para `POST /api/events` com `User-Agent` de bot/crawler, vitrine inexistente/não publicada, item inexistente na vitrine publicada, lote acima do limite ou payload não-JSON, **When** o Worker processa a chamada, **Then** ignora ou rejeita o lote sem poluir os contadores de `site_metrics_daily`.
3. **Given** um proprietário ou membro autenticado acessando `GET /api/sites/:id/insights?period=7d` (ou `30d` / `90d`) e abrindo a aba **Insights** no portal, **When** os dados são carregados, **Then** visualiza cards de resumo (visitas, pedidos enviados ao WhatsApp, taxa de conversão de pedidos sobre visitas e valor estimado em BRL), ranking de itens e categorias mais escolhidos, gráficos em SVG e CSS próprios por dia e por faixa de horário, e frases automáticas comparativas (ex.: `"Refrigerante foi o item mais escolhido nesta semana, 40% a mais que na anterior"`, `"Seus pedidos se concentram entre 18h e 20h"`), além de um card com o destaque da semana no Painel Inicial.
4. **Given** um usuário autenticado que não é proprietário nem membro da vitrine `:id`, **When** requisita `GET /api/sites/:id/insights`, **Then** o servidor retorna `404 SITE_NOT_FOUND` (e o RLS em `site_metrics_daily` bloqueia leitura direta), garantindo que cada membro enxergue exclusivamente suas próprias vitrines.
5. **Given** qualquer vitrine pública renderizada, **When** o visitante visualiza o rodapé da vitrine, **Then** encontra um aviso claro de privacidade informando que a vitrine contabiliza apenas estatísticas agregadas de visitas e escolhas de itens, sem cookies de rastreamento nem coleta de dados pessoais.

---

### Edge Cases

- **Planilhas CSV salvas com separador `,` ou `;`, com ou sem UTF-8 BOM, quebras de linha CRLF/LF e campos entre aspas**: O parser cliente deve remover o BOM inicial (`\uFEFF`) se presente, suportar quebras `\r\n` e `\n`, respeitar campos escapados entre aspas (`"Texto com ; e ""aspas"""`), detectar ou aceitar `;` (padrão BR) e `,` (quando o cabeçalho usa vírgula), ignorar linhas em branco ao final do arquivo e reportar erro claro quando colunas obrigatórias estiverem ausentes.
- **Preços em CSV e modo Orçamento**: No modelo de produtos e serviços com preço ativo, `preco` usa formato decimal brasileiro com vírgula (ex.: `25,00` ou `49,90` -> `2500` / `4990` centavos); no modo `quote` (lista de interesse/orçamento) com componente de preço desligado ou opcional, `preco` vazio ou `0,00` é permitido sem erro.
- **Fotos na importação por planilha**: A planilha CSV não inclui coluna de imagem; ao atualizar um item já existente via "Adicionar ao cardápio" (mesma `categoria` + `nome`), a URL de foto já cadastrada naquele item deve ser preservada, e novas fotos são adicionadas posteriormente no cartão do item no editor.
- **Agendamento sem controle de estoque/agenda no servidor**: Conforme restrição de custo zero e escopo do produto, horários exibidos no modo `booking` são uma lista de preferência configurada pelo dono; não há trava de concorrência de agenda nem bloqueio de horário duplicado no banco de dados.
- **Métricas sem eventos no período ou semana anterior zerada**: Quando uma vitrine recém-publicada ainda não possui eventos (ou a semana anterior teve zero ocorrências), a taxa de conversão e as frases automáticas não devem gerar divisão por zero (`NaN`/`Infinity`), exibindo estado vazio informativo ou frase de primeiro período.
- **Escopo por vitrine vs. visão global do Coletivo**: O painel de Insights neste escopo é restrito aos membros/proprietários de cada vitrine (cada usuário enxerga apenas suas próprias vitrines). Uma visão administrativa cross-vitrine para o Coletivo Inspira fica registrada explicitamente como evolução futura fora deste escopo.
- **Navegadores sem suporte a `backdrop-filter` ou com transparência/movimento reduzidos**: O portal em Liquid Glass deve continuar 100% legível aplicando fundo sólido via `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` e `@media (prefers-reduced-transparency: reduce)`, e removendo animações em `@media (prefers-reduced-motion: reduce)`.
- **Preservação do site de divulgação ("no glass")**: Os tokens Liquid Glass são exclusivos do portal (`/portal/`); a página inicial de divulgação (`/`) e a página `404.html` mantêm superfícies sólidas da Direção A.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (Shell & Tema do Portal)**: O portal (`/portal/`) DEVE apresentar uma estrutura de aplicativo com barra lateral em Liquid Glass no desktop (`>= 900px`), barra inferior fixa com ícones no celular (`< 900px`) e barra superior com marca oficial (exibindo exclusivamente a logo do tema ativo), alternador claro/escuro e ação de conta.
- **FR-002 (Design System Portal Liquid Glass)**: O arquivo `DESIGN.md` DEVE documentar a seção normativa **"Portal"** com superfícies translúcidas (`background: rgb(var(--glass) / .55)`, `backdrop-filter: blur(20px) saturate(140%)`, borda de `1px` com brilho interno e sombra ambiente suave), fallbacks sólidos para `@supports not (backdrop-filter)` e `prefers-reduced-transparency`, paleta monocromática em tons de floresta e grafite com único acento laranja (claro) / pêssego (escuro), raios de superfície de `20–28px`, botões em pílula, alvos mínimos de `44px`, contraste mínimo WCAG AA e declaração explícita de que o efeito de vidro se aplica somente ao portal (mantendo o site de divulgação sem vidro).
- **FR-003 (Painel Inicial)**: O portal DEVE oferecer uma visão inicial (**Início**) com cartões inspirados no hub `inspira.dev.br` exibindo resumo das vitrines do usuário, status de publicação, destaque da semana de insights, último pedido de customização, completude do perfil e atalhos rápidos.
- **FR-004 (Perfil e Interesses)**: O sistema DEVE permitir ler e salvar o perfil do usuário autenticado (`displayName`, `businessName`, `city`, `whatsapp`) e seus interesses (`interests[]`) por meio de `GET /api/profile` e `PUT /api/profile`, armazenados nas tabelas `public.profiles` (1:1 com `auth.uid()`) e `public.profile_interests` com políticas RLS restritas ao próprio usuário.
- **FR-005 (Assistente de Nova Vitrine em 3 Passos)**: O fluxo de criação de vitrine DEVE guiar o usuário em 3 passos: (1) Área/Tipo do negócio (`food`, `art`, `photo`, `health`, `tech`), (2) Modelo/Catálogo (`products` / Cardápio, `booking` / Agendamento de serviços, `quote` / Lista de interesse e orçamento, além de modelos exibidos como "Sob customização" que encaminham ao formulário de pedido preenchido), e (3) Nome e endereço (`slug`). `POST /api/sites` DEVE aceitar e validar `storefrontType` e `template`.
- **FR-006 (Pedidos de Customização)**: O sistema DEVE permitir criar e listar pedidos de customização (`GET /api/customization-requests` e `POST /api/customization-requests`) salvos em `public.customization_requests` com `storefront_type`, `template_interest`, `goal`, `reference_urls` (array de URLs HTTPS seguras), `desired_deadline` e `status` (`novo`, `em_analise`, `respondido`, `encerrado`), oferecendo após o envio e na listagem um link opcional para abrir conversa no WhatsApp.
- **FR-007 (Segurança das Rotas do Worker)**: Todas as rotas administrativas de mutação na API do portal (`PUT /api/profile`, `POST /api/customization-requests`, `POST /api/sites`, `PUT /api/sites/:id/draft`, `POST /api/sites/:id/publish`) DEVEM exigir sessão autenticada válida (`auth.uid()`), verificação de cabeçalho `Origin` igual à origem da requisição e `Content-Type: application/json` (quando houver corpo JSON).
- **FR-008 (Editor Reorganizado)**: O editor DEVE possuir barra de ações em Liquid Glass fixa (voltar, revisão, status, medidores compactos de itens/tamanho, salvar rascunho, publicar vitrine e abrir vitrine pública), navegação interna em abas (**Configurações**, **Categorias**, **Itens**, **Pedido & Mensagem**) e prévia ao vivo posicionada lado a lado no desktop e em aba dedicada no celular.
- **FR-009 (Catálogo por Componentes)**: O rascunho e o artefato publicado DEVEM suportar `catalogType` (`"products"`, `"booking"`, `"quote"`), configuração de componentes visíveis do item (`name`, `description`, `photo`, `price`, `minQuantity`, `quantitySelector`, `durationMinutes`), campos opcionais do pedido (`date`, `timeSlots[]`, `deliveryOrPickup`, `customerName`, `notes`) e textos customizáveis (`heroTitle`, `welcomeText`, `ctaLabel`, `whatsappTemplate` com variáveis `{itens}`, `{total}`, `{data}`, `{horario}`, `{endereco}`, `{nome}`).
- **FR-010 (Upload de Fotos Gratuito e CSP)**: O editor DEVE redimensionar e converter imagens de itens no navegador para WebP com tamanho alvo de até cerca de `200 KB` antes de enviá-las ao bucket `catalog-images` no Supabase Storage (com RLS restrita a membros/proprietário da vitrine), gravando apenas a URL HTTPS da imagem no rascunho, e a política `Content-Security-Policy` do portal e das vitrines públicas DEVE permitir `img-src 'self' https://qawlpsrfewosxsfgmmpm.supabase.co data: blob:` (no portal para prévia local) e `img-src 'self' https://qawlpsrfewosxsfgmmpm.supabase.co` (na vitrine pública).
- **FR-011 (Modelos Estáticos e Exportação CSV)**: O portal DEVE disponibilizar em `web/portal/` os arquivos estáticos `modelo-produtos.csv` (`categoria;nome;descricao;preco;quantidade_minima;ativo`) e `modelo-servicos.csv` (`categoria;nome;descricao;preco;duracao_min;ativo`) em UTF-8 com BOM, separador `;`, preço com vírgula (`25,00`), 1 linha de cabeçalho e 2 linhas de exemplo, além do botão **Exportar cardápio** que gera e baixa o cardápio atual do rascunho exatamente nesse formato.
- **FR-012 (Importação CSV no Navegador com Prévia e Upsert)**: O editor DEVE permitir importar arquivo CSV lido no cliente por um parser próprio (sem novas dependências npm), exibindo antes da aplicação: total de linhas válidas, erros detalhados por linha e coluna, e a opção entre **Adicionar ao cardápio** (atualizando itens com mesma `categoria + nome` sem duplicar e criando categorias novas) ou **Substituir cardápio**, alterando apenas o rascunho e respeitando os limites de 20 itens ativos, 100 itens totais e 256 KiB.
- **FR-013 (Fluxo Público em Etapas e Renderizador Compartilhado)**: A página pública da vitrine (`web/vitrine/`) e a prévia ao vivo do editor DEVEM compartilhar o mesmo módulo renderizador do fluxo em etapas (1. Escolher itens → 2. Preencher dados do pedido → 3. Revisar e enviar para `wa.me`), e todas as vitrines `pizzeria-v1` existentes DEVEM ser migradas sem perda de dados.
- **FR-014 (Coleta de Eventos em Lote sem Dados Pessoais)**: A vitrine pública DEVE enviar em lote via `navigator.sendBeacon` (com fallback `fetch` `keepalive`) para `POST /api/events` os eventos `visit`, `item_view`, `item_select` e `whatsapp_order` (com valor estimado em centavos). A rota pública `POST /api/events` DEVE aceitar apenas `Content-Type: application/json`, filtrar `User-Agent` de robôs/crawlers, limitar o tamanho do lote (ex.: máx. 25 eventos por requisição), validar que a vitrine está publicada e que todo `itemId` pertence à publicação ativa, e persistir apenas contadores agregados diários/horários em `public.site_metrics_daily` por função `security definer`, sem armazenar IP, cookie ou dado pessoal, com retenção de 13 meses e aviso de privacidade no rodapé da vitrine.
- **FR-015 (API e Painel de Insights por Vitrine)**: O endpoint `GET /api/sites/:id/insights?period=7d|30d|90d` DEVE ser restrito a proprietários e membros da vitrine (RLS), retornando totais do período e do período anterior equivalente, série por dia e por hora (0–23h), ranking de itens e categorias e frases automáticas de variação semanal; o portal DEVE exibir a aba **Insights** com cards de resumo (visitas, pedidos, conversão e valor estimado), rankings, gráficos em SVG/CSS próprios e frases automáticas, além do card de destaque da semana no Painel Inicial.

### Key Entities

- **Perfil do Usuário (`Profile` / `public.profiles`)**: Registro 1:1 com `auth.uid()` contendo `user_id`, `display_name`, `business_name`, `city`, `whatsapp`, `created_at` e `updated_at`.
- **Interesse do Perfil (`ProfileInterest` / `public.profile_interests`)**: Associação `(user_id, interest_slug)` representando áreas e recursos de interesse selecionados pelo usuário em chips multi-seleção.
- **Pedido de Customização (`CustomizationRequest` / `public.customization_requests`)**: Solicitação vinculada a `user_id` (e opcionalmente `site_id`) com `id`, `storefront_type`, `template_interest`, `goal`, `reference_urls`, `desired_deadline`, `status` (`novo`, `em_analise`, `respondido`, `encerrado`), `created_at` e `updated_at`.
- **Vitrine Estendida (`Site` / `public.sites`)**: Registro da vitrine acrescido de `storefront_type` (`food`, `art`, `photo`, `health`, `tech`) e `template` expandido (`catalog-v1` / `products-v1`, `booking-v1`, `quote-v1` e compatibilidade `pizzeria-v1`).
- **Conteúdo do Catálogo por Componentes (`ComponentDraftContent`)**: Estrutura JSON de `drafts.content` (máx. 256 KiB) contendo `schemaVersion`, `template`, `storefrontType`, `catalogType` (`products` | `booking` | `quote`), `slug`, `businessName`, `whatsapp`, `components`, `orderFields`, `messages`, `categories` e `items` (com `imageUrl`, `minQuantity`, `durationMinutes`, `priceCents`, `active`).
- **Linha de Planilha de Cardápio (`CatalogCsvRow`)**: Representação tabular de item importado/exportado com colunas `categoria;nome;descricao;preco;quantidade_minima;ativo` (produtos/orçamento) ou `categoria;nome;descricao;preco;duracao_min;ativo` (serviços).
- **Métrica Diária Agregada (`SiteMetricDaily` / `public.site_metrics_daily`)**: Contador agregado por `(site_id, metric_date, metric_hour, item_key, metric_name)` armazenando `count_value` e `estimated_cents` sem qualquer identificador pessoal, com retenção de 13 meses.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das telas do portal (`/portal/`), divulgação (`/`), `404.html` e vitrine pública (`/loja1`) renderizam sem duplicação de logotipo, sem overflow horizontal e com contraste mínimo WCAG AA (`4.5:1` para texto normal, `3:1` para texto grande) em `1440px` e `390px`, nos temas claro e escuro.
- **SC-002**: 100% das chamadas às rotas administrativas (`/api/profile`, `/api/customization-requests`, `/api/sites` e `/api/sites/:id/insights`) sem sessão válida retornam `401`, chamadas de mutação sem `Origin` correspondente retornam `403`, e um usuário jamais lê ou modifica perfil, interesses, pedidos de customização ou insights de vitrines de outro usuário nos testes de isolamento.
- **SC-003**: O empreendedor consegue concluir os 3 passos do assistente de nova vitrine ou registrar um pedido de customização completo em menos de 3 interações de tela, e consegue importar uma planilha CSV de até 100 itens visualizando imediatamente a contagem de linhas válidas e eventuais erros por linha e coluna.
- **SC-004**: 100% das vitrines existentes no formato `pizzeria-v1` continuam abrindo, editando e publicando sem perda de categorias, itens, preços ou número de WhatsApp após a migração para o renderizador de catálogo por componentes.
- **SC-005**: 100% dos lotes válidos enviados a `POST /api/events` atualizam os contadores agregados sem persistir IP, cookie ou dado pessoal, enquanto lotes de bots, vitrines não publicadas ou itens inexistentes são rejeitados/ignorados sem alterar `site_metrics_daily`.
- **SC-006**: `npm test`, `npm run build` e `npx --yes wrangler@4.158.0 deploy --dry-run` executam com 100% de aprovação sem adicionar nenhuma dependência paga nem quebrar a restrição de custo zero.

## Assumptions & Out of Scope

- O agendamento de serviços (`booking`) funciona como montador estruturado de pedido para confirmação via conversa no WhatsApp (`wa.me`); controle de disponibilidade em tempo real e bloqueio de horários duplicados estão explicitamente fora de escopo.
- O envio de fotos de itens utiliza o bucket gratuito `catalog-images` no Supabase Storage (dentro do limite de 1 GB do plano Free), com redimensionamento e codificação para WebP realizados no navegador antes do upload; no modo local de demonstração (offline), o editor permite pré-visualizar imagens e testar todas as abas sem exigir conexão remota.
- A importação e exportação de cardápio por planilha CSV ocorrem integralmente no navegador sob a responsabilidade do editor (`web/portal/`), reaproveitando o salvamento de rascunho existente (`PUT /api/sites/:siteId/draft`) sem criar endpoint dedicado de upload de CSV no Cloudflare Worker.
- **Fora de escopo (Follow-up explícito)**: O painel de Insights é restrito aos membros/proprietários de cada vitrine (cada usuário enxerga apenas suas próprias vitrines). Uma visão administrativa cross-vitrine para o Coletivo Inspira consolidar métricas de todas as vitrines da plataforma fica explícita como follow-up fora deste escopo.
