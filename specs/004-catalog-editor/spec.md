# Feature Specification: Editor de Cardápio e Gestão de Rascunhos (`pizzeria-v1`)

**Feature Branch**: `004-catalog-editor`

**Created**: 2026-11-11

**Status**: Active — validação de domínio (`src/portal-validation.mjs`), migração incremental (`supabase/migrations/202611110001_portal_schema.sql`) e endpoints de rascunho no Worker (`workers/api.mjs`) implementados para a Fase 3.

**Input**: Editor administrativo autenticado para o modelo `pizzeria-v1` com preços inteiros em centavos (`priceCents`), limite comercial gratuito de 20 itens ativos, teto técnico de 100 itens totais, limite de payload de 256 KiB, validação de WhatsApp internacional e controle de concorrência otimista por `revision` (ADRs 0002, 0003, 0005 e 0007).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Editar itens, categorias e preços em centavos do cardápio (`004-US1`) (Priority: P1)

Como proprietário de uma vitrine de pizzaria, quero cadastrar, editar, ordenar e ativar/ocultar pizzas e bebidas com preços validados em centavos de real (`priceCents`) e telefone de WhatsApp internacional, para que meu rascunho de cardápio permaneça íntegro, sem erros de arredondamento de ponto flutuante e pronto para projeção pública via `src/public-menu.mjs`.

**Why this priority**: A integridade financeira dos preços em centavos e a compatibilidade estrita com o schema `pizzeria-v1` são requisitos essenciais do MVP antes de qualquer publicação pública.

**Independent Test**: Enviar `PUT /api/sites/:siteId/draft` ou validar via `src/portal-validation.mjs` rascunhos com preços inteiros positivos em centavos (`200 OK`) e rascunhos com preços decimais, zero, negativos ou WhatsApp malformado (`422 Unprocessable Entity` com `INVALID_PRICE_CENTS` ou `INVALID_WHATSAPP`).

**Acceptance Scenarios**:

1. **Given** um proprietário autenticado editando o rascunho de sua vitrine `pizzeria-v1`, **When** salva itens com `priceCents` inteiro positivo seguro (ex.: `4590` para R$ 45,90) e `whatsapp` no formato internacional de dígitos (`^[1-9]\d{7,14}$`), **Then** a API valida o payload, persiste o rascunho com incremento de `revision` e retorna `200 OK` com o rascunho atualizado.
2. **Given** um payload de rascunho contendo qualquer item com `priceCents` igual a `0`, negativo, decimal (`45.9`), string ou fora de `Number.isSafeInteger`, **When** a requisição `PUT /api/sites/:siteId/draft` é processada, **Then** o servidor rejeita a operação com `422 Unprocessable Entity` e código `INVALID_PRICE_CENTS` sem alterar o banco.
3. **Given** um payload de rascunho cujo campo `whatsapp` esteja vazio, contenha símbolos (`+`, espaços, query string) ou não respeite `^[1-9]\d{7,14}$`, **When** a validação do rascunho é executada, **Then** o servidor rejeita a requisição com `422 Unprocessable Entity` e código `INVALID_WHATSAPP`.

---

### User Story 2 - Respeitar limites do plano básico gratuito e tetos operacionais (`004-US2`) (Priority: P1)

Como proprietário utilizando o plano básico gratuito, quero visualizar e ter garantido no servidor o limite de até 20 itens ativos para publicação, podendo manter itens adicionais ocultos em rascunho até o teto técnico de 100 itens totais e 256 KiB por rascunho, para operar dentro das cotas gratuitas da plataforma sem perda de itens sazonais desativados.

**Why this priority**: Materializa os limites operacionais e comerciais definidos no ADR 0005 e ADR 0007, protegendo o armazenamento no Supabase Free e a franquia do plano gratuito.

**Independent Test**: Submeter rascunhos com 20 itens ativos e 80 itens inativos (`200 OK`), 21 itens ativos (`422 ACTIVE_ITEMS_LIMIT_EXCEEDED`), 101 itens totais (`422 TOTAL_ITEMS_LIMIT_EXCEEDED`) e JSON superior a 262.144 bytes UTF-8 (`413 DRAFT_TOO_LARGE`).

**Acceptance Scenarios**:

1. **Given** um rascunho contendo 20 itens marcados como ativos (`active !== false` e `available !== false`) e até 80 itens marcados como ocultos (`active: false` ou `available: false`), **When** o proprietário salva o rascunho em `PUT /api/sites/:siteId/draft`, **Then** a operação é aceita com `200 OK` por respeitar simultaneamente a franquia de 20 ativos e o teto técnico de 100 itens.
2. **Given** um rascunho contendo 21 ou mais itens ativos, **When** o proprietário tenta salvar o rascunho, **Then** o servidor rejeita a operação com `422 Unprocessable Entity` e código `ACTIVE_ITEMS_LIMIT_EXCEEDED`.
3. **Given** um rascunho contendo 101 ou mais itens no total (somando ativos e ocultos), **When** o proprietário tenta salvar o rascunho, **Then** o servidor rejeita a operação com `422 Unprocessable Entity` e código `TOTAL_ITEMS_LIMIT_EXCEEDED`.
4. **Given** um rascunho cujo conteúdo serializado em UTF-8 ultrapassa `262144` bytes (256 KiB), **When** a requisição `PUT /api/sites/:siteId/draft` é enviada, **Then** o Worker rejeita imediatamente com `413 Payload Too Large` e código `DRAFT_TOO_LARGE`.

---

### User Story 3 - Prevenir perda de trabalho com concorrência otimista por revisão (`004-US3`) (Priority: P1)

Como proprietário com o painel aberto em mais de uma aba ou dispositivo, quero que cada salvamento de rascunho exija o número exato da revisão atual (`revision`), para que uma aba desatualizada seja bloqueada com aviso de conflito em vez de sobrescrever silenciosamente alterações mais recentes.

**Why this priority**: Cumpre a invariante de controle de concorrência da especificação `001-site-access` e evita perda silenciosa de edições no cardápio.

**Independent Test**: Executar dois `PUT /api/sites/:siteId/draft` consecutivos enviando `revision: 1`; o primeiro retorna `200 OK` com `revision: 2` e o segundo retorna `409 Conflict` com `code: "REVISION_CONFLICT"` e `currentRevision: 2`.

**Acceptance Scenarios**:

1. **Given** um rascunho armazenado na `revision: 1`, **When** o proprietário envia `PUT /api/sites/:siteId/draft` com `revision: 1` e conteúdo válido, **Then** o rascunho é atualizado atomicamente para `revision: 2`, `updatedAt` é renovado e a resposta `200 OK` devolve `revision: 2`.
2. **Given** um rascunho que já avançou para `revision: 2`, **When** outra aba ou cliente envia `PUT /api/sites/:siteId/draft` ainda informando `revision: 1`, **Then** o servidor recusa a escrita com `409 Conflict`, código `REVISION_CONFLICT` e `currentRevision: 2`, preservando intacto o conteúdo da revisão 2.
3. **Given** uma requisição `PUT /api/sites/:siteId/draft` com `revision` ausente, zero, negativa ou não inteira, **When** o Worker valida o payload, **Then** responde com `400 Bad Request` e código `INVALID_REVISION`.

---

### User Story 4 - Isolar leitura e escrita de rascunhos por vitrine (`004-US4`) (Priority: P2)

Como proprietário ou membro autorizado de uma vitrine, quero consultar o rascunho apenas das vitrines às quais tenho vínculo e restringir a gravação ao proprietário, enquanto terceiros recebem `404 Not Found` sem descobrir se o identificador da vitrine existe.

**Why this priority**: Garante o Princípio II da Constituição (Isolamento entre vitrines) na camada HTTP do Cloudflare Worker em conjunto com o RLS do Postgres.

**Independent Test**: Usuário autenticado sem vínculo tenta `GET` ou `PUT` em `/api/sites/:siteId/draft` de outra pessoa e recebe `404 Not Found` (`SITE_NOT_FOUND`).

**Acceptance Scenarios**:

1. **Given** um usuário autenticado que não é proprietário nem membro da vitrine `:siteId`, **When** executa `GET /api/sites/:siteId/draft` ou `PUT /api/sites/:siteId/draft`, **Then** a API responde `404 Not Found` com código `SITE_NOT_FOUND`, sem vazar metadados nem confirmar a existência do UUID.
2. **Given** uma requisição sem token de sessão válido em `Authorization: Bearer` ou cookie `__Host-vitrine_session`, **When** acessa qualquer rota `/api/sites/:siteId/draft`, **Then** recebe `401 Unauthorized` com código `UNAUTHORIZED`.

---

### Edge Cases

- **Duplicidade de identificadores de itens ou categorias**: Itens com `id` repetido dentro do mesmo rascunho são rejeitados com `422 Unprocessable Entity` (`DUPLICATE_ITEM_ID`), mantendo paridade com `publicMenu()` em `src/public-menu.mjs`.
- **Compatibilidade entre formatos de itens em categorias ou lista plana**: O validador aceita tanto a organização por `categories` (com itens aninhados em `categories[].items`) quanto a lista `items`, convertendo de forma determinística para a projeção pública `publicMenu()`.
- **Caracteres multibyte UTF-8 no limite de 256 KiB**: O cálculo de tamanho utiliza `Buffer.byteLength(json, 'utf8')` / `TextEncoder().encode(json).byteLength` (equivalente a `octet_length(content::text)` no Postgres), evitando discrepâncias entre contagem de caracteres UTF-16 e bytes reais UTF-8.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O módulo `src/portal-validation.mjs` DEVE validar o conteúdo de rascunho do template `pizzeria-v1`, garantindo compatibilidade integral com `publicMenu()` de `src/public-menu.mjs`.
- **FR-002**: Todo item do cardápio DEVE possuir `priceCents` como inteiro seguro estritamente positivo (`Number.isSafeInteger(priceCents) && priceCents > 0`); valores inválidos DEVEM resultar em `422 Unprocessable Entity` (`code: "INVALID_PRICE_CENTS"`).
- **FR-003**: O rascunho DEVE impor o limite comercial gratuito de no máximo **20 itens ativos** (`active !== false && available !== false`), rejeitando excessos com `422 Unprocessable Entity` (`code: "ACTIVE_ITEMS_LIMIT_EXCEEDED"`).
- **FR-004**: O rascunho DEVE impor o teto técnico de no máximo **100 itens totais** (ativos + ocultos), rejeitando excessos com `422 Unprocessable Entity` (`code: "TOTAL_ITEMS_LIMIT_EXCEEDED"`).
- **FR-005**: O tamanho serializado UTF-8 de `content` NÃO DEVE exceder `262144` bytes (256 KiB), tanto na camada do Worker (`413 Payload Too Large`, `code: "DRAFT_TOO_LARGE"`) quanto na constraint `check` da tabela `public.drafts`.
- **FR-006**: O número de `whatsapp` no rascunho DEVE obedecer ao formato internacional de dígitos `^[1-9]\d{7,14}$`, retornando `422 Unprocessable Entity` (`code: "INVALID_WHATSAPP"`) quando inválido.
- **FR-007**: O endpoint `PUT /api/sites/:siteId/draft` DEVE exigir `revision` inteiro positivo (`>= 1`) e aplicar concorrência otimista: se `revision` divergir da revisão atual armazenada, DEVE retornar `409 Conflict` com `code: "REVISION_CONFLICT"` e `currentRevision`.
- **FR-008**: Os endpoints `GET /api/sites/:siteId/draft` e `PUT /api/sites/:siteId/draft` DEVEM retornar `404 Not Found` (`code: "SITE_NOT_FOUND"`) quando a vitrine não pertencer nem estiver associada ao usuário autenticado.

### Key Entities

- **Rascunho de Cardápio (`CatalogDraft`)**: Envelope persistido em `public.drafts` contendo `siteId`, `revision` (inteiro incremental >= 1), `updatedAt` (ISO-8601 UTC) e `content` (JSONB <= 256 KiB).
- **Conteúdo do Catálogo (`PizzeriaDraftContent`)**: Estrutura JSON com `schemaVersion: 1`, `template: "pizzeria-v1"`, `slug`, `businessName` (ou `name`), `whatsapp`, `categories` e/ou `items`.
- **Categoria de Cardápio (`CatalogCategory`)**: Agrupamento lógico do cardápio (ex.: Pizzas Tradicionais, Pizzas Especiais, Bebidas) com `id`, `name`, `order` opcional e lista de `items`.
- **Item de Cardápio (`CatalogItem`)**: Produto com `id` único, `name`, `description` opcional, `priceCents` (inteiro positivo em centavos) e flag de disponibilidade (`active` / `available`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos rascunhos com `priceCents <= 0`, decimais ou não inteiros são rejeitados com `422 INVALID_PRICE_CENTS`.
- **SC-002**: 100% dos rascunhos com mais de 20 itens ativos são rejeitados com `422 ACTIVE_ITEMS_LIMIT_EXCEEDED`, e 100% dos rascunhos com mais de 100 itens totais são rejeitados com `422 TOTAL_ITEMS_LIMIT_EXCEEDED`.
- **SC-003**: 100% dos payloads `content` acima de 262.144 bytes UTF-8 são barrados com `413 DRAFT_TOO_LARGE`.
- **SC-004**: 100% das tentativas de salvar um rascunho com `revision` obsoleta retornam `409 REVISION_CONFLICT` informando `currentRevision` sem sobrescrever os dados.
- **SC-005**: 0 vazamentos de existência ou conteúdo de rascunhos entre usuários distintos (`404 SITE_NOT_FOUND` em 100% dos acessos cruzados).
