# Feature Specification: Oferta comercial, portfólio e pedidos de orçamento

**Feature Branch**: `002-commercial-portfolio`

**Created**: 2026-11-07

**Status**: Draft — catálogo estático e projeção pública implementados (`src/portfolio.mjs`, `content/portfolio.json`, `content/contact.json`); controle operacional de assinaturas e painel de operadores pendentes.

**Input**: Oferta básica gratuita com endereço por caminho, assinaturas opcionais de endereço personalizado (subdomínio Inspira ou domínio próprio sob análise), customizações sob orçamento via WhatsApp e portfólio de cases mantido pela equipe Inspira (ADRs 0005, 0006 e 0007).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compreender a oferta comercial e limites do plano gratuito (`002-US1`) (Priority: P1)

Como visitante da página de divulgação, quero visualizar uma comparação clara entre a vitrine básica gratuita, os serviços opcionais de endereço personalizado e os projetos sob medida, para compreender o que é gratuito, o que envolve mensalidade e quais despesas não estão incluídas antes de solicitar adesão.

**Why this priority**: Evita expectativas incorretas sobre gratuidade, franquia de itens, registro de domínio e disponibilidade durante o piloto de custo zero (ADR 0005 e ADR 0007).

**Independent Test**: O visitante consulta a seção de oferta no site de divulgação e identifica sem ambiguidade a franquia gratuita (1 vitrine, template `pizzeria-v1`, até 20 itens ativos, link WhatsApp, endereço `vitrine.inspira.dev.br/loja1`), as propostas de endereço (R$ 10/mês subdomínio Inspira e R$ 15/mês vínculo de domínio próprio) e a ausência de cobrança automática ou compra de domínio incluída.

**Acceptance Scenarios**:

1. **Given** um visitante acessando a seção de planos e ofertas na página de divulgação, **When** analisa a coluna da vitrine básica gratuita, **Then** visualiza claramente que inclui 1 vitrine por proprietário, modelo padrão de pizzaria (`pizzeria-v1`), até 20 itens ativos no cardápio, botão de pedido via WhatsApp e endereço público no formato `vitrine.inspira.dev.br/loja1`.
2. **Given** um visitante comparando a vitrine gratuita com os serviços opcionais de endereço personalizado, **When** lê as condições de Endereço Inspira (R$ 10/mês sugerido, ex.: `loja1.inspira.dev.br`) e Domínio do Cliente (R$ 15/mês sugerido para vínculo e manutenção), **Then** compreende que o registro e a renovação anual de um domínio próprio (como `.com.br`) são adquiridos à parte pelo cliente e não estão incluídos na mensalidade.
3. **Given** o produto em fase piloto sem gateway financeiro integrado, **When** o visitante examina as ações das ofertas comerciais, **Then** encontra a indicação explícita de proposta em preparação, sem checkout automático, sem captura de cartão de crédito e com contratação mediada diretamente pelos Operadores Inspira.

---

### User Story 2 - Explorar cases e solicitar orçamento com referência via WhatsApp (`002-US2`) (Priority: P1)

Como potencial cliente interessado em uma vitrine personalizada ou projeto similar a um trabalho realizado, quero clicar em "Quero algo parecido" no card de um case publicado ou acionar o pedido de orçamento geral, para iniciar conversa no WhatsApp comercial da equipe Inspira com mensagem pré-preenchida contendo o nome e o identificador de referência do case.

**Why this priority**: É o canal primário de conversão comercial e atendimento assistido do MVP sem depender de formulários com backend pago, filas ou gateways de mensagens (ADR 0005 e ADR 0007).

**Independent Test**: Com `teamWhatsapp` configurado, `quoteContactLink()` gera um link `https://wa.me/<teamWhatsapp>?text=...` devidamente codificado com o título e o `id` do case; com `teamWhatsapp: null`, retorna `null` e a interface mantém a ação indisponível sem apontar para número fictício.

**Acceptance Scenarios**:

1. **Given** `teamWhatsapp` configurado com dígitos internacionais válidos em `content/contact.json` e um case publicado no portfólio, **When** o visitante aciona "Quero algo parecido" naquele case, **Then** o navegador direciona para `https://wa.me/<teamWhatsapp>?text=...` contendo a mensagem pré-preenchida com o `title` e o `id` do case codificados via `encodeURIComponent`, exigindo ação explícita do visitante no WhatsApp para envio.
2. **Given** `teamWhatsapp` definido como `null` em `content/contact.json`, **When** o pacote público é construído e exibido ao visitante, **Then** `quoteContactLink()` retorna `null` e a interface exibe estado informativo/indisponível ("Em preparação"), sem gerar links quebrados, números inventados ou parâmetros inválidos.
3. **Given** uma tentativa de configurar `teamWhatsapp` com caracteres não numéricos, query strings injetadas ou formato fora do padrão E.164 sem sinal (`^[1-9]\d{7,14}$`), **When** `quoteContactLink()` é executado durante o build ou testes, **Then** a função rejeita a entrada lançando `TypeError('Invalid team phone')`.

---

### User Story 3 - Manter catálogo público do portfólio com projeção segura (`002-US3`) (Priority: P2)

Como Operador Inspira, quero manter o catálogo `content/portfolio.json` versionado e validado estritamente durante o build, para que apenas cases explicitamente autorizados (`published: true`) sejam exportados para `dist/data/portfolio.json`, com URLs públicas HTTPS sem credenciais, ordenação determinística e descarte completo de notas ou metadados internos.

**Why this priority**: Garante o Princípio I da Constituição (projeção pública explícita) e impede vazamento de rascunhos, metadados internos ou links inseguros (`javascript:`, `http:`, URLs com credenciais) na página pública.

**Independent Test**: Executar `publishedPortfolio()` e `npm run build` sobre entradas contendo rascunhos (`published: false`), campos internos (`internalNotes`) e URLs inválidas verifica que apenas os campos públicos autorizados saem ordenados em `dist/data/portfolio.json` e que URLs inseguras falham o build.

**Acceptance Scenarios**:

1. **Given** `content/portfolio.json` contendo entradas com `published: true`, entradas com `published: false` e propriedades internas como `internalNotes`, **When** `publishedPortfolio()` projeta o catálogo para `dist/data/portfolio.json`, **Then** todas as entradas com `published: false` são omitidas e cada item exportado contém exclusivamente as chaves públicas `id`, `title`, `url`, `summary`, `category`, `tags`, `order` e `featured`, ordenadas por `order` ascendente e desempate alfabético por `id`.
2. **Given** uma entrada marcada com `published: true` cuja `url` utilize protocolo `http:`, `javascript:` ou contenha `username`/`password` embutidos, **When** `publishedPortfolio()` valida o catálogo, **Then** a execução falha imediatamente com `TypeError('Use a public HTTPS URL without credentials')`.
3. **Given** entradas com `id` fora do formato slug (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), `id` duplicado, `order` negativo ou `tags` acima de 8 itens, **When** `publishedPortfolio()` processa o catálogo, **Then** lança `TypeError` impedindo a geração de artefato público inconsistente.

---

### User Story 4 - Gerenciar vigência de benefício de endereço e suspensão reversível (`002-US4`) (Priority: P2)

Como Operador Inspira, quero registrar manualmente a vigência de uma assinatura de endereço personalizado (subdomínio Inspira ou domínio próprio verificado) e suspender o benefício após 7 dias de tolerância em caso de expiração, para que a vitrine retorne ao endereço básico gratuito (`vitrine.inspira.dev.br/loja1`) preservando integralmente seus rascunhos e dados.

**Why this priority**: Viabiliza a monetização manual de identidade personalizada no piloto (ADR 0007) sem contratar gateways pagos e sem risco de perda de dados do proprietário ou escalada de privilégios pelo próprio cliente.

**Independent Test**: Verificar no modelo de dados e nas regras de autorização que mutações em assinaturas, benefícios de endereço e vínculos de domínio são restritas a Operadores Inspira, que um endereço personalizado ativo atua como endereço canônico, e que a transição para `suspended` ou `canceled` restaura o endereço básico por caminho sem remover `sites` ou `drafts`.

**Acceptance Scenarios**:

1. **Given** um proprietário de vitrine autenticado no painel administrativo, **When** tenta criar ou alterar diretamente seu plano de assinatura, status de pagamento, vigência ou status de verificação de domínio, **Then** a operação é negada pela camada de autorização, permanecendo exclusiva de Operadores Inspira ou rotinas administrativas de servidor.
2. **Given** uma vitrine com assinatura ativa (`status = 'active'`) e hostname verificado (`loja1.inspira.dev.br` ou domínio próprio do cliente), **When** o benefício está vigente, **Then** o hostname personalizado é registrado como endereço canônico da vitrine e o caminho básico `vitrine.inspira.dev.br/loja1` permanece reservado para redirecionamento canônico sem duplicidade indexável.
3. **Given** uma assinatura cujo período pago venceu e ultrapassou os 7 dias corridos de tolerância sem renovação confirmada, **When** o Operador Inspira suspende o vínculo personalizado (`status = 'suspended'`), **Then** o hostname premium deixa de ser ativo, a vitrine volta a responder canonicamente em `vitrine.inspira.dev.br/<slug>` e nenhum registro em `sites` ou `drafts` é excluído.

---

### Edge Cases

- **Subdomínio já utilizado no inventário DNS**: Mesmo que não exista vitrine cadastrada com determinado slug, nomes já ocupados na zona `inspira.dev.br` (inventariados em `docs/dns-review.md`) permanecem indisponíveis para reserva comercial.
- **Domínio externo pendente de análise técnica**: Domínios de clientes incompatíveis com TLS/CNAME na Cloudflare Free permanecem em status `pending_verification` ou `rejected`, sem cobrança nem promessa de ativação instantânea.
- **Repositório público vs. rascunhos de portfólio**: `published: false` em `content/portfolio.json` impede exibição no bundle gerado em `dist/`, mas não confere sigilo criptográfico em repositório Git público; dados sensíveis de clientes ou orçamentos nunca devem ser inseridos em `content/portfolio.json`.
- **Quarentena de hostname após cancelamento**: Ao cancelar ou suspender um subdomínio personalizado, o hostname não é reatribuído automaticamente a outro negócio para evitar confusão de identidade ou takeover.
- **Case removido ou arquivado**: Um case despublicado deixa de ser exportado no próximo build, evitando novos cliques de orçamento sobre referências obsoletas, enquanto conversas já iniciadas no WhatsApp contêm o título e o `id` textual na própria mensagem.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A apresentação da oferta comercial DEVE distinguir explicitamente a vitrine básica gratuita (`vitrine.inspira.dev.br/<slug>`, 1 vitrine, modelo `pizzeria-v1`, até 20 itens ativos, contato WhatsApp), as assinaturas opcionais de endereço personalizado e os projetos de customização sob orçamento.
- **FR-002**: O registro e a renovação de domínios próprios NÃO DEVEM ser descritos como gratuitos ou embutidos nas mensalidades de endereço personalizado.
- **FR-003**: A projeção pública do portfólio (`publishedPortfolio` em `src/portfolio.mjs`) DEVE validar `schemaVersion: 1`, exportar apenas entradas com `published === true` e produzir exclusivamente os campos `id`, `title`, `url`, `summary`, `category`, `tags`, `order` e `featured` ordenados por `order` e `id`.
- **FR-004**: Toda `url` de case exportada no portfólio DEVE utilizar protocolo `https:` e NÃO DEVE conter credenciais (`username` ou `password`), rejeitando esquemas inseguros no build.
- **FR-005**: O gerador de link de orçamento (`quoteContactLink` em `src/portfolio.mjs`) DEVE validar `teamWhatsapp` no formato `^[1-9]\d{7,14}$`, retornar `null` quando ausente e codificar opcionalmente a referência do case (`title` e `id`) em `https://wa.me/<teamWhatsapp>?text=...`.
- **FR-006**: A ausência de telefone comercial configurado (`teamWhatsapp: null` em `content/contact.json`) NÃO DEVE expor link ativo nem número fictício na interface pública.
- **FR-007**: Somente Operadores Inspira autorizados DEVEM poder publicar cases no portfólio global e registrar, ativar, renovar ou suspender assinaturas e vínculos de domínio; proprietários e membros de vitrine NÃO DEVEM ter permissão de autoaprovação comercial.
- **FR-008**: A ativação de um endereço personalizado DEVE exigir disponibilidade do hostname, validação técnica de DNS/TLS e confirmação manual do período pago pelo Operador Inspira.
- **FR-009**: A suspensão ou cancelamento de assinatura de endereço (após aviso e tolerância de 7 dias no vencimento) DEVE reverter a vitrine ao endereço básico gratuito (`vitrine.inspira.dev.br/<slug>`) sem apagar a vitrine, seus membros ou seus rascunhos.
- **FR-010**: Nenhuma rotina desta funcionalidade DEVE contratar planos pagos na Cloudflare/Supabase, comprar domínios automaticamente ou buscar URLs arbitrárias no servidor para gerar prévias (prevenção de SSRF e garantia de custo zero do ADR 0005).

### Key Entities *(include if feature involves data)*

- **Case de Portfólio (`PortfolioEntry` / `PublishedCase`)**: Exemplo autorizado de trabalho realizado pela Inspira, armazenado inicialmente em `content/portfolio.json` e projetado para `dist/data/portfolio.json`.
- **Configuração de Contato Comercial (`CommercialContact`)**: Configuração do canal oficial de atendimento da equipe Inspira em `content/contact.json` (`teamWhatsapp`), projetada para `dist/data/contact.json` (`href`).
- **Assinatura Comercial (`CommercialSubscription`)**: Registro administrativo da modalidade comercial de uma vitrine (`free_basic`, `inspira_subdomain`, `custom_domain`), status (`active`, `grace_period`, `suspended`, `canceled`), período pago e vencimento com tolerância de 7 dias.
- **Vínculo de Domínio / Endereço (`AddressBinding` / `DomainBinding`)**: Associação entre uma vitrine e seu hostname personalizado (`<slug>.inspira.dev.br` ou domínio próprio do cliente), incluindo status de verificação DNS/TLS, direção de canonicalização e quarentena pós-suspensão.
- **Pedido de Orçamento (`QuoteRequest`)**: Intenção de contato gerada a partir do site de divulgação (com ou sem referência a um `PublishedCase`), formalizada em conversa via WhatsApp e registrada manualmente pelo Operador Inspira.
- **Operador Inspira (`InspiraOperator`)**: Papel administrativo interno da equipe Inspira, estritamente separado do papel de proprietário ou membro de vitrine (`CONTEXT.md`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das entradas com `published: false` ou campos privados (`internalNotes`) em `content/portfolio.json` são excluídas de `dist/data/portfolio.json` na suíte automatizada (`test/portfolio.test.mjs` e `test/marketing-build.test.mjs`).
- **SC-002**: 100% das URLs com protocolo diferente de `https:` ou com credenciais embutidas, bem como telefones fora do padrão `^[1-9]\d{7,14}$`, são rejeitados com `TypeError` nos testes unitários.
- **SC-003**: Quando `teamWhatsapp` é `null`, 0 links quebrados ou números inventados são gerados em `dist/data/contact.json`; quando configurado, 100% dos links de case incluem `title` e `id` codificados na query `text` de `https://wa.me/`.
- **SC-004**: 100% dos cenários de especificação e modelo de dados para suspensão de assinatura preservam os registros de `sites` e `drafts` e restauram o endereço básico `vitrine.inspira.dev.br/<slug>`.
- **SC-005**: 0 tentativas de proprietários ou membros comuns de vitrine de alterar seu próprio plano comercial, vínculo de domínio ou catálogo de portfólio são permitidas pelo contrato de autorização.

## Assumptions

- Os valores de R$ 10/mês (Endereço Inspira) e R$ 15/mês (Domínio do Cliente) e a franquia inicial de 20 itens ativos (com teto técnico de 100 itens e piloto de até 10 vitrines) seguem a proposta operacional de `docs/commercial-offer.md` e ADR 0007.
- No MVP e durante o piloto de 10 vitrines, o catálogo de portfólio e o telefone comercial são mantidos via arquivos versionados (`content/portfolio.json` e `content/contact.json`) revisados em Pull Request, enquanto a conciliação de pagamentos e vigências ocorre sob controle administrativo dos Operadores Inspira sem gateway de pagamento.
- Domínios personalizados de terceiros dependem de verificação manual de compatibilidade técnica e de cotas gratuitas da Cloudflare antes de qualquer ativação em produção.
