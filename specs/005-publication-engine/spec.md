# Feature Specification: Motor de Publicação Determinístico e Imutável (`005-publication-engine`)

**Feature Branch**: `005-publication-engine`

**Created**: 2026-11-11

**Status**: Active — módulo `src/publication-engine.mjs`, endpoint autenticado `POST /api/sites/:siteId/publish` em `workers/api.mjs`, pré-compilação estática em `scripts/build.mjs` e integração com o Portal Administrativo (`web/portal/`) implementados na Fase 4.

**Input**: Compilação determinística e imutável no servidor usando `src/public-menu.mjs`, gerando artefato público estático versionado por hash SHA-256 sem metadados privados nem chaves `service_role` em rotas públicas e preservando a publicação anterior intacta em caso de falha (Princípios I, II, III, IV e V da Constituição; ADRs 0001, 0002, 0003, 0005 e 0006).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publicar vitrine a partir de rascunho válido com projeção pública explícita (`005-US1`) (Priority: P1)

Como proprietário ou colaborador autorizado de uma vitrine, quero acionar a publicação do rascunho atual para gerar um artefato público imutável do cardápio validado por `publicMenu()`, para que meus clientes acessem apenas os itens ativos e dados públicos higienizados na vitrine pública.

**Why this priority**: Materializa o Princípio I da Constituição (Administração privada e publicação pública), garantindo que rascunhos privados jamais sejam expostos diretamente e que todo cardápio publicado passe pela projeção explícita de `src/public-menu.mjs`.

**Independent Test**: Executar `POST /api/sites/:siteId/publish` autenticado para uma vitrine com rascunho válido contendo itens ativos e ocultos e campos privados injetados; verificar retorno `200 OK` com hash SHA-256 determinístico, presença exclusiva dos itens ativos no JSON publicado e ausência total de campos privados (`owner_user_id`, `email`, `session`, `internalCost`, `service_role`, itens com `active: false`).

**Acceptance Scenarios**:

1. **Given** um proprietário ou membro autorizado autenticado com um rascunho válido contendo itens ativos (`active: true`) e itens ocultos (`active: false`), **When** envia `POST /api/sites/:siteId/publish`, **Then** o motor executa `publicMenu()` de `src/public-menu.mjs`, projeta exclusivamente os campos públicos (`schemaVersion: 1`, `template: "pizzeria-v1"`, `slug`, `name`, `whatsapp`, `currency: "BRL"`, `items` e `categories` ativos), calcula o hash SHA-256 canônico e retorna `200 OK` com os metadados da publicação e o artefato publicado.
2. **Given** um rascunho contendo propriedades internas ou sensíveis (como `ownerEmail`, `owner_user_id`, `accessToken`, `internalCost`, `internalNotes` ou `service_role`), **When** a publicação é compilada por `compilePublicStorefront()`, **Then** nenhuma dessas propriedades consta no artefato JSON publicado nem nas respostas de `/data/vitrines/:slug/menu.json`.
3. **Given** o mesmo conteúdo de rascunho compilado repetidas vezes, **When** `compilePublicStorefront()` gera o artefato público, **Then** o JSON serializado e o hash SHA-256 resultante (`hash`) são 100% idênticos e determinísticos.

---

### User Story 2 - Preservar publicação anterior em caso de falha de compilação ou validação (`005-US2`) (Priority: P1)

Como proprietário de uma vitrine já publicada, quero que qualquer falha ao tentar publicar um rascunho inválido ou sem itens visíveis aborte a operação com erro claro sem alterar nem remover a publicação ativa anterior, para garantir zero downtime no atendimento aos clientes.

**Why this priority**: Evita que erros operacionais (como desativar acidentalmente todos os itens ou corromper um campo do rascunho) derrubem o cardápio público em produção.

**Independent Test**: Publicar a revisão 1 válida de uma vitrine (`200 OK`), alterar o rascunho para um estado inválido para publicação (ex.: zero itens ativos ou preço inválido) e chamar `POST /api/sites/:siteId/publish`; verificar retorno `422 Unprocessable Entity` e confirmar que `GET /data/vitrines/:slug/menu.json` continua servindo intacto o artefato e o hash da revisão 1.

**Acceptance Scenarios**:

1. **Given** uma vitrine que possui uma publicação ativa válida (revisão 1, hash `H1`), **When** o usuário tenta publicar um rascunho sem nenhum item ativo (`items` vazio ou todos com `active: false`), **Then** o servidor rejeita a publicação com `422 Unprocessable Entity` (`code: "EMPTY_PUBLIC_MENU"`) e mantém a publicação anterior (`H1`) integralmente disponível em `/data/vitrines/:slug/menu.json`.
2. **Given** uma vitrine com publicação ativa (`H1`), **When** uma tentativa de compilação falha por erro de validação em `publicMenu()` ou `validateDraftContent()` (ex.: WhatsApp inválido, preço inválido ou limite de 20 itens ativos excedido), **Then** o motor aborta atomicamente antes de substituir o ponteiro público e preserva a publicação `H1`.

---

### User Story 3 - Bloquear publicações não autorizadas e isolar vitrines entre usuários (`005-US3`) (Priority: P1)

Como arquiteto de segurança da plataforma, quero que apenas o proprietário ou membro autorizado possa acionar `POST /api/sites/:siteId/publish`, rejeitando visitantes anônimos com `401 Unauthorized` e usuários autenticados sem vínculo com `404 Not Found`.

**Why this priority**: Cumpre o Princípio II da Constituição (Isolamento entre vitrines) na transição crítica do ambiente administrativo privado para o artefato público.

**Independent Test**: Enviar `POST /api/sites/:siteId/publish` sem sessão (`401 UNAUTHORIZED`) e com sessão de outro usuário sem vínculo (`404 SITE_NOT_FOUND`), verificando que nenhuma publicação é criada ou modificada.

**Acceptance Scenarios**:

1. **Given** uma requisição sem token JWT válido no header `Authorization` nem no cookie `__Host-vitrine_session`, **When** envia `POST /api/sites/:siteId/publish`, **Then** o Worker responde `401 Unauthorized` (`code: "UNAUTHORIZED"`).
2. **Given** um usuário autenticado que não é proprietário nem colaborador da vitrine `:siteId`, **When** envia `POST /api/sites/:siteId/publish`, **Then** o Worker responde `404 Not Found` (`code: "SITE_NOT_FOUND"`) sem revelar se a vitrine existe.

---

### User Story 4 - Pré-compilar vitrine pública piloto estática no build e distribuir com cache imutável (`005-US4`) (Priority: P2)

Como operador da plataforma no Cloudflare Workers Free com Static Assets, quero que `npm run build` pré-compile a vitrine piloto `/loja1` via motor de publicação para `dist/data/vitrines/loja1/menu.json` e que artefatos versionados por hash sejam servidos com cabeçalhos de cache CDN agressivos sem consultar o Supabase em rotas públicas.

**Why this priority**: Atende ao Princípio IV e ao ADR 0005 (Custo Zero no MVP), garantindo que o tráfego público de clientes seja absorvido pela CDN/memória estática sem consumir conexões ou franquia do Supabase Free.

**Independent Test**: Executar `npm run build`, verificar a existência e validade de `dist/data/vitrines/loja1/menu.json` e `dist/loja1/index.html`, e requisitar `/data/vitrines/:slug/releases/:hash.json` verificando `Cache-Control: public, max-age=31536000, immutable`.

**Acceptance Scenarios**:

1. **Given** o catálogo público da vitrine piloto em `content/vitrines/loja1.json`, **When** `npm run build` é executado, **Then** `scripts/build.mjs` valida e projeta os dados via `compilePublicStorefront()` (`publicMenu()`), gerando `dist/data/vitrines/loja1/menu.json` e `dist/loja1/index.html`.
2. **Given** um artefato publicado versionado por hash em `/data/vitrines/:slug/releases/:hash.json`, **When** um cliente público realiza `GET`, **Then** o Worker responde `200 OK` com `Cache-Control: public, max-age=31536000, immutable` sem realizar nenhuma chamada ao Supabase.

---

### Edge Cases

- **Rascunho válido no editor mas com todos os itens desativados (`active: false`)**: Embora permitido como rascunho em elaboração (`PUT /draft`), a publicação (`POST /publish`) exige ao menos 1 item ativo visível, retornando `422 EMPTY_PUBLIC_MENU` e preservando a publicação anterior.
- **Categorias vazias ou contendo apenas itens ocultos**: Categorias sem itens ativos são omitidas automaticamente do artefato público projetado, evitando seções vazias na vitrine pública.
- **Rascunho com itens planos sem categorias explícitas**: Quando o rascunho contém apenas `items` ativos sem `categories`, o motor agrupa automaticamente os itens visíveis em uma categoria padrão (`Cardápio`), mantendo compatibilidade total com `publicMenu()` e com a renderização por categoria da vitrine.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O módulo `src/publication-engine.mjs` DEVE invocar obrigatoriamente `publicMenu()` de `src/public-menu.mjs` para validar e projetar explicitamente os campos públicos do cardápio (`schemaVersion: 1`, `template: "pizzeria-v1"`, `slug`, `name`, `whatsapp`, `currency: "BRL"`, `items`).
- **FR-002**: O motor de publicação DEVE filtrar itens ocultos (`active: false` ou `available: false`) e categorias sem itens ativos, projetando nas categorias públicas apenas `{ id, name, items: [{ id, name, priceCents, description? }] }`.
- **FR-003**: O motor de publicação DEVE rejeitar com `422 Unprocessable Entity` (`code: "EMPTY_PUBLIC_MENU"`) rascunhos que não possuam ao menos 1 item ativo após a projeção.
- **FR-004**: O motor de publicação DEVE calcular um hash SHA-256 hexadecimal determinístico (`64` caracteres) sobre a serialização JSON canônica do artefato público.
- **FR-005**: O endpoint `POST /api/sites/:siteId/publish` DEVE exigir autenticação (`401 UNAUTHORIZED` para anônimos) e autorização por vitrine (`404 SITE_NOT_FOUND` para usuários sem vínculo).
- **FR-006**: Em caso de falha de validação ou compilação durante `POST /api/sites/:siteId/publish`, a publicação anterior da vitrine DEVE permanecer intacta e ativa (atomicidade / rollback automático).
- **FR-007**: Nenhum metadado privado (`owner_user_id`, `ownerEmail`, `email`, `session`, `token`, `internalCost`, `internalNotes`, `service_role`) DEVE constar no JSON publicado.
- **FR-008**: O script `scripts/build.mjs` DEVE pré-compilar a vitrine piloto `loja1` a partir de `content/vitrines/loja1.json` em `dist/data/vitrines/loja1/menu.json` e `dist/loja1/index.html`.

### Key Entities

- **Artefato de Cardápio Público (`PublicMenuArtifact`)**: Objeto JSON imutável contendo exclusivamente `{ schemaVersion: 1, template: "pizzeria-v1", slug, name, whatsapp, currency: "BRL", items, categories }`.
- **Registro de Publicação (`PublicationRecord`)**: Envelope imutável associando `siteId`, `slug`, `revision` de origem, `hash` SHA-256, `publishedAt`, `url` (`/:slug`), `menuUrl` (`/data/vitrines/:slug/menu.json`), `immutableMenuUrl` (`/data/vitrines/:slug/releases/:hash.json`) e `menu` (`PublicMenuArtifact`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos artefatos emitidos por `POST /api/sites/:siteId/publish` e pelo build estático passam na validação de `publicMenu()` e `whatsappLink()` de `src/public-menu.mjs`.
- **SC-002**: 0 campos privados ou itens inativos estão presentes nos JSONs publicados em 100% dos casos de teste.
- **SC-003**: 100% das falhas de publicação (`422`) preservam o artefato e o hash SHA-256 da publicação anterior sem interrupção de leitura em `/data/vitrines/:slug/menu.json`.
- **SC-004**: 0 chamadas ao banco Supabase são realizadas durante requisições públicas de leitura de cardápios publicados.
