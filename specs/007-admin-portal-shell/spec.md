# Feature Specification: Shell do Portal Administrativo e Gestão de Sessão e Vitrines

**Feature Branch**: `007-admin-portal-shell`

**Created**: 2026-11-11

**Status**: Active — endpoints de sessão (`/api/auth/session`, `/api/auth/logout`), listagem e criação de vitrines (`GET /api/sites`, `POST /api/sites`) em `workers/api.mjs`, validação de slugs em `src/portal-validation.mjs` e migração incremental `supabase/migrations/202611110001_portal_schema.sql` implementados para a Fase 3.

**Input**: Shell administrativo em `painel.inspira.dev.br` com autenticação Google OAuth PKCE via Supabase Auth, uso exclusivo do identificador opaco `auth.uid()`, cookie host-only `__Host-vitrine_session`, listagem isolada de vitrines próprias e associadas, criação de novas vitrines com reserva única de `slug` e inicialização atômica de rascunho (ADRs 0001 a 0006).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Validar sessão autenticada e encerrar acesso com segurança (`007-US1`) (Priority: P1)

Como proprietário ou membro de uma vitrine acessando o portal administrativo, quero que minha sessão seja validada no servidor via token Bearer ou cookie host-only `__Host-vitrine_session` identificando exclusivamente meu `auth.uid()`, e quero encerrar minha sessão com limpeza imediata do cookie, para proteger meus negócios em dispositivos compartilhados sem depender de email como chave de autorização.

**Why this priority**: Estabelece a fronteira de identidade no servidor (Princípios II e III da Constituição e ADR 0004/0006), impedindo acesso anônimo às rotas administrativas e prevenindo vazamento de cookies entre subdomínios.

**Independent Test**: Chamar `GET /api/auth/session` sem credenciais (`401 UNAUTHORIZED`), com Bearer token ou cookie `__Host-vitrine_session` válido (`200 OK` com `{ authenticated: true, user: { id } }` sem expor email como chave), e `POST /api/auth/logout` (`200 OK` com `{ ok: true }` e header `Set-Cookie` expirando `__Host-vitrine_session`).

**Acceptance Scenarios**:

1. **Given** uma requisição com token JWT válido no header `Authorization: Bearer <jwt>` ou no cookie `__Host-vitrine_session=<jwt>`, **When** consulta `GET /api/auth/session`, **Then** o Worker responde `200 OK` com `{ "authenticated": true, "user": { "id": "<auth_uid_uuid>" } }`, utilizando exclusivamente o identificador opaco `auth.uid()`.
2. **Given** uma requisição sem credenciais ou com token inválido/expirado, **When** consulta `GET /api/auth/session` ou qualquer rota administrativa `/api/sites*`, **Then** o Worker responde `401 Unauthorized` com `{ "error": { "code": "UNAUTHORIZED", "message": "Sessão inválida ou expirada." } }`.
3. **Given** um usuário no portal administrativo, **When** aciona `POST /api/auth/logout`, **Then** o Worker responde `200 OK` com `{ "ok": true }` e envia o header `Set-Cookie: __Host-vitrine_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`.

---

### User Story 2 - Listar vitrines próprias e vinculadas com isolamento estrito (`007-US2`) (Priority: P1)

Como pessoa autenticada no portal, quero visualizar na tela inicial do painel exclusivamente as vitrines das quais sou proprietário (`role: "owner"`) ou membro autorizado (`role: "member"`), para alternar entre meus negócios com clareza sem visualizar vitrines de terceiros.

**Why this priority**: Atende diretamente à separação multi-tenant por vitrine (ADR 0002 e especificação `001-site-access`).

**Independent Test**: Consultar `GET /api/sites` autenticado como proprietário, membro e terceiro sem vínculo, confirmando que cada identidade recebe apenas suas respectivas vitrines com o papel correto (`owner` ou `member`).

**Acceptance Scenarios**:

1. **Given** um usuário autenticado proprietário da vitrine A e membro da vitrine B, **When** requisita `GET /api/sites`, **Then** recebe `200 OK` contendo apenas as vitrines A (`role: "owner"`) e B (`role: "member"`), com `id`, `slug`, `name`, `template` e `updatedAt`.
2. **Given** um usuário autenticado recém-cadastrado que ainda não possui vitrines nem vínculos em `site_memberships`, **When** requisita `GET /api/sites`, **Then** recebe `200 OK` com `{ "sites": [] }`, sem acessar dados de outros usuários.

---

### User Story 3 - Criar nova vitrine com validação de slug e rascunho inicial (`007-US3`) (Priority: P1)

Como empreendedor autenticado no portal, quero criar uma nova vitrine informando o nome do negócio e um identificador de endereço (`slug`) válido e disponível no modelo `pizzeria-v1`, para que minha vitrine e seu rascunho inicial (`revision: 1`) sejam provisionados imediatamente para edição.

**Why this priority**: É o ponto de entrada funcional para que novos negócios iniciem a configuração do cardápio no piloto.

**Independent Test**: Enviar `POST /api/sites` com `name` e `slug` válidos (`201 Created` retornando `site` e `draft` na revisão 1), tentar repetir o mesmo `slug` (`409 SLUG_TAKEN`) e tentar slugs reservados ou fora do padrão (`400 INVALID_SLUG`).

**Acceptance Scenarios**:

1. **Given** um usuário autenticado enviando `POST /api/sites` com `{ "name": "Pizzaria Bella", "slug": "pizzaria-bella", "template": "pizzeria-v1" }`, **When** o `slug` tem entre 3 e 40 caracteres no formato `^[a-z0-9]+(?:-[a-z0-9]+)*$`, não é reservado e está livre, **Then** o servidor cria a vitrine vinculada ao `auth.uid()` do usuário e seu rascunho inicial (`revision: 1`), respondendo `201 Created` com os objetos `site` e `draft`.
2. **Given** uma tentativa de criar vitrine com um `slug` reservado (`admin`, `api`, `auth`, `app`, `www`, `portal`, `assets`, `data`, `login`, `logout`) ou fora do formato alfanumérico minúsculo de 3 a 40 caracteres, **When** `POST /api/sites` é chamado, **Then** o servidor rejeita a requisição com `400 Bad Request` e código `INVALID_SLUG` (e o banco impõe constraint `23514` em caso de inserção direta).
3. **Given** um `slug` já utilizado por qualquer vitrine existente na plataforma, **When** um usuário envia `POST /api/sites` com esse mesmo `slug`, **Then** o servidor rejeita a operação com `409 Conflict` e código `SLUG_TAKEN`.

---

### User Story 4 - Servir ativos estáticos e API no mesmo Worker com zero vazamento de credenciais (`007-US4`) (Priority: P2)

Como arquiteto da plataforma, quero que o Cloudflare Worker processe todas as rotas `/api/*` validando sessão e encaminhando o token JWT do próprio usuário ao Supabase PostgREST (sem jamais expor `service_role`), delegando as demais rotas ao binding estático `env.ASSETS`, para operar gratuitamente no Cloudflare Workers Free com Static Assets.

**Why this priority**: Conecta a hospedagem estática aprovada no ADR 0001/0005 aos endpoints autenticados do portal sem custos adicionais de infraestrutura.

**Independent Test**: Invocar o default export `worker.fetch(request, env, ctx)` para rotas `/api/*` e rotas estáticas (`/`, `/portal/`), e executar `npx --yes wrangler@4.158.0 deploy --dry-run`.

**Acceptance Scenarios**:

1. **Given** uma requisição cujo `pathname` inicia com `/api/`, **When** o Worker recebe a chamada em `fetch(request, env, ctx)`, **Then** processa a rota pelo handler da API sem delegar para arquivos estáticos.
2. **Given** uma requisição para qualquer caminho público ou estático fora de `/api/*`, **When** o Worker recebe a chamada, **Then** delega a resposta para `env.ASSETS.fetch(request)`.

---

### Edge Cases

- **Colisão de slugs com caminhos internos do portal e pacote estático**: Além de `admin`, `api`, `www`, `app` e `auth`, os caminhos `portal`, `assets`, `data`, `login` e `logout` são bloqueados tanto no Worker (`src/portal-validation.mjs`) quanto na constraint SQL (`202611110001_portal_schema.sql`).
- **Requisições concorrentes para o mesmo slug**: A constraint `UNIQUE` na coluna `public.sites.slug` garante que apenas uma transação vença, convertendo violações SQLSTATE `23505` em `409 Conflict` (`SLUG_TAKEN`).
- **Rotas `/api/*` inexistentes ou métodos HTTP não suportados**: Retornam JSON padronizado (`404 NOT_FOUND` ou `405 METHOD_NOT_ALLOWED`) com `Content-Type: application/json; charset=utf-8`, nunca HTML genérico.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O Worker (`workers/api.mjs`) DEVE extrair o token de sessão prioritariamente do header `Authorization: Bearer <jwt>` ou do cookie `__Host-vitrine_session=<jwt>`.
- **FR-002**: `GET /api/auth/session` DEVE retornar `200 OK` com `{ authenticated: true, user: { id } }` para sessões válidas e `401 Unauthorized` (`code: "UNAUTHORIZED"`) para sessões ausentes ou inválidas.
- **FR-003**: `POST /api/auth/logout` DEVE retornar `200 OK` com `{ ok: true }` e limpar o cookie `__Host-vitrine_session` com `Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`.
- **FR-004**: `GET /api/sites` DEVE retornar apenas vitrines onde o usuário autenticado é proprietário (`role: "owner"`) ou membro (`role: "member"`).
- **FR-005**: `POST /api/sites` DEVE validar `slug` (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3 a 40 caracteres, excluindo `admin`, `api`, `auth`, `app`, `www`, `portal`, `assets`, `data`, `login`, `logout`), `name` (1 a 160 caracteres após `trim`) e `template` (`"pizzeria-v1"`), retornando `400 INVALID_SLUG` quando o slug for inválido e `409 SLUG_TAKEN` quando já existir.
- **FR-006**: `POST /api/sites` bem-sucedido DEVE retornar `201 Created` com a vitrine criada e seu rascunho inicial na `revision: 1`.
- **FR-007**: A migração `supabase/migrations/202611110001_portal_schema.sql` DEVE ser estritamente append-only e idempotente, adicionando a proteção aos novos slugs reservados do portal em `public.sites` sem editar `202611070001_site_access.sql`.
- **FR-008**: `wrangler.jsonc` DEVE apontar `main` para `"workers/api.mjs"` preservando Static Assets em `./dist` e compatibilidade com `wrangler deploy --dry-run`.

### Key Entities

- **Sessão Autenticada (`PortalSession`)**: Identidade verificada no servidor contendo exclusivamente `user.id` (`auth.uid()` UUID opaco).
- **Vitrine (`SiteSummary`)**: Representação administrativa da vitrine com `id`, `slug`, `name`, `template` (`"pizzeria-v1"`), `role` (`"owner"` ou `"member"`) e `updatedAt`.
- **Vínculo de Equipe (`SiteMembership`)**: Associação `(site_id, user_id)` que concede papel `"member"` restrito a uma única vitrine (ADR 0002).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das chamadas sem token ou com token inválido para `/api/auth/session` e `/api/sites*` retornam `401 UNAUTHORIZED`.
- **SC-002**: 100% dos slugs reservados (`admin`, `api`, `auth`, `app`, `www`, `portal`, `assets`, `data`, `login`, `logout`) ou fora de 3–40 caracteres são rejeitados com `400 INVALID_SLUG` na API e com SQLSTATE `23514` no PostgreSQL/PGlite.
- **SC-003**: 100% das tentativas de cadastro de `slug` duplicado retornam `409 SLUG_TAKEN`.
- **SC-004**: `npx --yes wrangler@4.158.0 deploy --dry-run` executa com sucesso empacotando `workers/api.mjs` e os ativos estáticos de `./dist`.
