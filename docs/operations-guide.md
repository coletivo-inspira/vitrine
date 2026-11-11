# Guia Operacional do Piloto — Vitrine Inspira

Este guia consolida os procedimentos operacionais da **Fase 6 (Piloto Controlado de 10 Vitrines)** da plataforma **Vitrine Inspira**, estabelecendo as regras de governança em custo zero (ADR 0005), conciliação comercial manual e ciclo de vigência de endereços personalizados (ADR 0006, ADR 0007 e `002-US4`), rotinas semanais de salvaguarda contra pausa por inatividade do Supabase Free (`qawlpsrfewosxsfgmmpm`) e auditoria de Row Level Security (RLS), além do checklist assistido para configuração remota no Cloudflare Workers Free com Static Assets.

---

## 1. Vocabulário Canônico de Operação (`CONTEXT.md`)

Toda comunicação operacional, registro de atendimento e documentação técnica deve empregar estritamente os termos canônicos definidos em `CONTEXT.md`:

- **Operador Inspira**: Pessoa da equipe Inspira responsável por portfólio, atendimento, conciliação comercial, ativação/suspensão de assinaturas e execução das rotinas de salvaguarda; nunca se confunde com o **Proprietário** de uma **Vitrine**.
- **Portal** e **Painel**: O **Portal** (`painel.inspira.dev.br`) é o ambiente central onde pessoas autenticadas acessam o **Painel** para administrar suas vitrines.
- **Vitrine**: Site individual de um negócio, criado a partir de um **Modelo** (`pizzeria-v1` no MVP). Evitar os termos *conta* ou *portal* para designar a vitrine.
- **Proprietário**: Pessoa responsável por uma **Vitrine**, identificada no banco exclusivamente pelo UUID opaco imutável `auth.uid()` (ADR 0004). Um mesmo **Proprietário** pode administrar mais de uma **Vitrine**.
- **Equipe da vitrine / Membro**: Conjunto de pessoas autorizadas a consultar uma **Vitrine** específica em `public.site_memberships`. Ser **Membro** de uma **Equipe da vitrine** não transfere propriedade nem concede acesso horizontal às demais vitrines do **Proprietário** (ADR 0002).
- **Rascunho**: Conteúdo editável de uma **Vitrine** ainda não publicado, armazenado em `public.drafts` com controle de concorrência otimista por `revision`.
- **Publicação**: Versão imutável e explícita do conteúdo disponibilizada aos visitantes públicos, contendo apenas campos públicos aprovados e itens marcados como **Item ativo**, sem metadados privados.
- **Vínculo de domínio**: Associação administrativa de um endereço personalizado verificado (`<slug>.inspira.dev.br` ou domínio próprio do cliente) a uma **Vitrine**, sem transferência de propriedade do domínio.

---

## 2. Governança e Onboarding do Piloto Controlado de Até 10 Vitrines (ADR 0005)

O piloto inaugural opera sob restrição estrita de **custo zero de infraestrutura** (Princípio IV da Constituição e ADR 0005), utilizando exclusivamente as camadas gratuitas do **Cloudflare Workers Free com Static Assets** e do **Supabase Free** (projeto oficial `qawlpsrfewosxsfgmmpm` em `https://qawlpsrfewosxsfgmmpm.supabase.co`), sem cartão de crédito cadastrado, sem upgrades automáticos e sem APIs pagas.

### 2.1 Limites Operacionais do Lote Piloto e do Plano Básico Gratuito

| Parâmetro Operacional | Limite Canônico no Piloto | Aplicação e Verificação |
|---|---|---|
| **Capacidade total do lote piloto** | **Até 10 vitrines** (`PILOT_MAX_VITRINES = 10`) | Controle de admissão pelo **Operador Inspira** e validação automatizada em `scripts/validate-pilot-pack.mjs`. |
| **Franquia do Plano Básico Gratuito** | **1 Vitrine** gratuita por **Proprietário** no endereço por caminho `vitrine.inspira.dev.br/<slug>` | Criação autenticada via `POST /api/sites` com `slug` único e não reservado. |
| **Modelo (Template) homologado** | Exclusivamente `pizzeria-v1` | Validado em `src/portal-validation.mjs`, `src/public-menu.mjs` e constraint SQL em `public.sites`. |
| **Limite comercial de itens ativos** | **Até 20 itens ativos** (`active: true`) por **Vitrine** | Aplicado no editor do **Painel**, na API (`validateDraftContent`) e no validador do piloto (`ACTIVE_ITEMS_LIMIT_EXCEEDED`). |
| **Teto técnico total por Rascunho** | **Até 100 itens totais** (somando itens ativos e itens ocultos em elaboração) e máximo de **256 KiB** (`262.144 bytes`) em JSONB | Aplicado em `src/portal-validation.mjs` (`TOTAL_ITEMS_LIMIT_EXCEEDED` / `DRAFT_TOO_LARGE`) e constraint SQL em `public.drafts`. |
| **Canal de pedidos dos visitantes** | Link direto `https://wa.me/<whatsapp>?text=...` | Gerado de forma determinística por `whatsappLink()` (`src/public-menu.mjs`). Abrir o link não envia mensagem automaticamente nem confirma pedido sem ação do visitante. |
| **Armazenamento de mídia** | Zero upload de imagens ou vídeos de clientes no banco | Uso exclusivo de texto estruturado e ativos estáticos do próprio **Modelo** centralizado. |

### 2.2 Passo a Passo de Onboarding Assistido pelo Operador Inspira

1. **Triagem e Reserva de Identificador (`slug`)**:
   - Confirmar que o lote ativo possui no máximo **10 vitrines**.
   - Verificar que o `slug` pretendido (3 a 40 caracteres, `^[a-z0-9]+(?:-[a-z0-9]+)*$`) não colide com slugs reservados (`admin`, `api`, `auth`, `app`, `www`, `portal`, `assets`, `data`, `login`, `logout`) nem com subdomínios pré-existentes inventariados em `docs/dns-review.md`.
2. **Acesso Inicial do Proprietário**:
   - O **Proprietário** autentica-se em `https://painel.inspira.dev.br/portal/` via login Google OAuth 2.0 com PKCE conectado ao projeto `https://qawlpsrfewosxsfgmmpm.supabase.co` (callback `https://qawlpsrfewosxsfgmmpm.supabase.co/auth/v1/callback`).
   - O **Proprietário** cria a **Vitrine** com o **Modelo** `pizzeria-v1` e telefone WhatsApp internacional apenas em dígitos (`^[1-9]\d{7,14}$`, DDI + DDD + número).
3. **Cadastro do Rascunho e Primeira Publicação**:
   - O **Proprietário** cadastra categorias e itens com preços inteiros em centavos de Real (`priceCents` em BRL), mantendo no máximo **20 itens ativos** (podendo manter itens sazonais como `active: false` até o teto técnico de **100 itens totais**).
   - Ao acionar **Publicar**, o motor (`src/publication-engine.mjs`) projeta apenas os campos públicos autorizados e os itens ativos, calcula o hash SHA-256 determinístico e disponibiliza a **Publicação** em `https://vitrine.inspira.dev.br/<slug>`.

---

## 3. Operação Comercial, Conciliação Manual e Ciclo de 7 Dias de Tolerância (ADR 0007 e `002-US4`)

Durante o piloto, não há gateway de pagamento, checkout automático ou captura de cartão. Toda contratação de assinatura opcional de endereço personalizado ou projeto de **Customização** sob orçamento é conduzida manualmente por um **Operador Inspira**.

### 3.1 Modalidades Comerciais Disponíveis

1. **Plano Básico Gratuito (`free_basic` — R$ 0/mês)**:
   - Inclui 1 **Vitrine** no modelo `pizzeria-v1`, até **20 itens ativos** (teto técnico de 100 itens totais), botão de pedido via `https://wa.me/...` e endereço público canônico por caminho: `https://vitrine.inspira.dev.br/<slug>`.
2. **Assinatura de Endereço Inspira (`inspira_subdomain` — R$ 10/mês sugerido)**:
   - Direito de uso de subdomínio sob o domínio do coletivo (ex.: `https://<slug>.inspira.dev.br`), sujeito à disponibilidade no inventário DNS (`docs/dns-review.md`).
3. **Assinatura de Vínculo de Domínio Próprio (`custom_domain` — R$ 15/mês sugerido)**:
   - Configuração, verificação técnica de DNS/TLS (dentro das cotas gratuitas da Cloudflare) e manutenção do **Vínculo de domínio** para um endereço próprio do cliente (ex.: `https://cardapio.pizzariadojoao.com.br`).
   - **Regra comercial explícita (`002-US1` / FR-002)**: O registro e a renovação anual do domínio próprio (como `.com.br` no Registro.br) são adquiridos e pagos à parte pelo **Proprietário** diretamente ao registrador e **não estão incluídos** na mensalidade de R$ 15/mês.

### 3.2 Fronteira de Autorização Comercial

- Nenhum **Proprietário** ou **Membro** da **Equipe da vitrine** possui permissão para criar, aprovar, renovar ou alterar o próprio plano comercial, status de pagamento ou **Vínculo de domínio** (`002-US4`, Cenário 1).
- As alterações de vigência (`paid_until`, `grace_until`, `status`) e de verificação de hostname (`verification_status`, `is_canonical`) são executadas exclusivamente por **Operador Inspira**.

### 3.3 Máquina de Estados de Vigência, Tolerância de 7 Dias e Reversão Segura (`002-US4`)

```
[free_basic / active]
   │  Canônico: https://vitrine.inspira.dev.br/<slug>
   ▼  (Confirmação manual de pagamento + DNS/TLS verificado pelo Operador Inspira)
[inspira_subdomain | custom_domain : status = 'active']
   │  Vigência: now <= paid_until
   │  Canônico: https://<hostname-personalizado> (caminho /<slug> redireciona para o hostname)
   ▼  (Vencimento atingido: paid_until < now <= paid_until + 7 dias)
[status = 'grace_period' (Janela de Tolerância de 7 Dias)]
   │  Tolerância: 7 dias corridos após paid_until
   │  Canônico: https://<hostname-personalizado> permanece ativo sem interrupção
   │  Ação: Operador Inspira notifica o Proprietário sobre a renovação pendente
   ▼  (Expiração após o 7º dia sem renovação: now > paid_until + 7 dias)
[status = 'suspended' -> Reversão Automática ao Endereço Gratuito]
      Canônico revertido: https://vitrine.inspira.dev.br/<slug>
      Hostname personalizado: desativado (is_canonical = false) e posto em quarentena
      Dados preservados: 100% de sites, site_memberships, drafts (ativos + ocultos) e publicações intactos
```

### 3.4 Procedimento Operacional de Reversão Segura (Pós-7 Dias de Vencimento)

Quando uma **Assinatura** de endereço personalizado ultrapassa `paid_until` + **7 dias corridos de tolerância** (`grace_until`) sem confirmação de pagamento:

1. **Verificação de Vencimento**: O **Operador Inspira** confirma que a data atual ultrapassou o 7º dia após `paid_until` e que não há comprovante de conciliação pendente.
2. **Suspensão do Vínculo de Domínio**:
   - Atualizar o status da assinatura para `suspended` e o **Vínculo de domínio** para `verification_status = 'suspended'`, `is_canonical = false`, definindo `quarantined_until` (quarentena contra reatribuição imediata a terceiros).
3. **Restauração Imediata do Endereço Gratuito**:
   - A **Vitrine** volta imediatamente a responder de forma canônica em `https://vitrine.inspira.dev.br/<slug>`.
4. **Garantia Absoluta de Preservação de Dados**:
   - **Proibido excluir** registros em `public.sites`, `public.site_memberships` ou `public.drafts`.
   - O **Rascunho** (incluindo sua `revision`, categorias, itens ativos e itens inativos/ocultos) e a **Publicação** ativa permanecem 100% íntegros.
   - Caso o **Proprietário** regularize a assinatura posteriormente, basta ao **Operador Inspira** registrar o novo `paid_until` (`+ 7 dias` em `grace_until`) e reativar `is_canonical = true`.

---

## 4. Rotinas Semanais Obrigatórias: Migrações, Salvaguarda Supabase Free (`qawlpsrfewosxsfgmmpm`) e Auditoria RLS

Projetos no plano **Supabase Free** sofrem pausa automática após **7 dias consecutivos sem atividade**. Conforme o **Princípio IV da Constituição** e o **ADR 0005** (que veda tráfego artificial falso e adota rotina de backup legítimo exportado para armazenamento privado), o **Operador Inspira** deve executar a rotina abaixo **a cada 3 a 5 dias** (no mínimo duas vezes por semana).

> **Regra Estrita de Segredos (Princípio III)**: Jamais passe senhas, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, tokens JWT ou chaves em argumentos de linha de comando (`argv`), arquivos versionados ou URLs. Os scripts bloqueiam imediatamente execuções que contenham segredos na linha de comando.

### 4.1 Vínculo e Aplicação das Migrações no Projeto `qawlpsrfewosxsfgmmpm`

Para vincular o repositório ao projeto oficial `qawlpsrfewosxsfgmmpm` e aplicar as migrações `202611070001_site_access.sql` e `202611110001_portal_schema.sql` em ordem cronológica:

```bash
npx supabase link --project-ref qawlpsrfewosxsfgmmpm && npx supabase db push
```

*(Alternativamente, execute `supabase/migrations/202611070001_site_access.sql` seguido de `supabase/migrations/202611110001_portal_schema.sql` diretamente no SQL Editor do projeto `qawlpsrfewosxsfgmmpm`.)*

### 4.2 Rotina de Backup e Keep-Alive Legítimo (`scripts/backup-supabase.mjs`)

1. **Verificação local e checagem de integridade das migrações (`--dry-run` e `--check`)**:
   Valida que todas as migrações SQL em `supabase/migrations/*.sql` estão íntegras (SHA-256), que `public.sites`, `public.site_memberships` e `public.drafts` possuem RLS ativo e que o diretório de destino (`supabase/.temp/backups`, ignorado pelo Git) está fora de `dist/`, `web/` e `src/`:
   ```bash
   node scripts/backup-supabase.mjs --dry-run
   SUPABASE_DB_URL="postgresql://postgres:<password>@db.qawlpsrfewosxsfgmmpm.supabase.co:5432/postgres" node scripts/backup-supabase.mjs --check
   ```

2. **Execução real com variáveis de ambiente (Keep-Alive + Snapshot Privado)**:
   Em ambiente administrativo seguro do **Operador Inspira**, exporte os dados reais do projeto `qawlpsrfewosxsfgmmpm` via variáveis de ambiente:
   ```bash
   SUPABASE_URL="https://qawlpsrfewosxsfgmmpm.supabase.co" \
   SUPABASE_SERVICE_ROLE_KEY="<service-role-key-do-cofre>" \
   SUPABASE_DB_URL="postgresql://postgres:<password>@db.qawlpsrfewosxsfgmmpm.supabase.co:5432/postgres" \
   node scripts/backup-supabase.mjs
   ```
   - O snapshot criptograficamente assinado (`integrity.digest` SHA-256) é salvo com permissão `0600` em `supabase/.temp/backups/supabase-backup-<timestamp>.json`.

### 4.3 Auditoria Contínua de Row Level Security (`scripts/verify-supabase-rls.mjs`)

1. **Autoteste local embarcado em PostgreSQL (`--self-test`)**:
   Executa todas as migrações de `supabase/migrations/*.sql` em uma instância PGlite isolada e comprova que 16 verificações de bloqueio anônimo (`SQLSTATE 42501`) e isolamento multi-tenant (`authenticated` sem vínculo vê `0` linhas) passam integralmente:
   ```bash
   node scripts/verify-supabase-rls.mjs --self-test
   ```

2. **Auditoria remota contra o projeto oficial `qawlpsrfewosxsfgmmpm` (`SUPABASE_URL` + `SUPABASE_ANON_KEY`)**:
   Verifica remotamente que o papel público `anon` recebe bloqueio HTTP (`401`/`403`) ao tentar ler ou escrever em `sites`, `site_memberships`, `drafts` ou invocar `rpc/accessible_site_ids`:
   ```bash
   SUPABASE_URL="https://qawlpsrfewosxsfgmmpm.supabase.co" \
   SUPABASE_ANON_KEY="<anon-key-publica-do-projeto-qawlpsrfewosxsfgmmpm>" \
   node scripts/verify-supabase-rls.mjs
   ```

### 4.4 Validação Determinística do Pacote de 10 Vitrines (`scripts/validate-pilot-pack.mjs`)

Antes de qualquer atualização de lote ou release do piloto, execute o validador determinístico sobre a fixture representativa `examples/pilot-10-vitrines.json`:

```bash
node scripts/validate-pilot-pack.mjs
```

---

## 5. Checklist Assistido de Configuração Remota Cloudflare Workers Free com Static Assets

> **Nota de Transparência Operacional (Princípio V da Constituição)**: A autenticação remota na conta Cloudflare e o vínculo de DNS na zona `inspira.dev.br` dependem exclusivamente das credenciais do proprietário da conta Cloudflare. **Nenhum deploy remoto foi realizado automaticamente por este repositório**; toda validação de pré-lançamento no ambiente de desenvolvimento e CI ocorre de forma local e determinística via `npx --yes wrangler@4.158.0 deploy --dry-run`.

### 5.1 Topologia de Domínios, CSP e Rotas (ADR 0006)

| Superfície | Endereço Canônico | Política de `connect-src` na CSP e Comportamento |
|---|---|---|
| **Site de divulgação** | `https://vitrine.inspira.dev.br/` | `connect-src 'self'` — Serve o bundle estático compilado em `dist/` (`index.html`, `/data/portfolio.json`, `/data/contact.json`), sem jamais consultar o Supabase. |
| **Vitrine pública (Plano Básico Gratuito)** | `https://vitrine.inspira.dev.br/<slug>` | `connect-src 'self'` — Serve a **Publicação** estática imutável da **Vitrine** (`/<slug>`, `/data/vitrines/<slug>/menu.json` e `/data/vitrines/<slug>/releases/<hash>.json`) com zero consultas ao banco PostgreSQL. |
| **Portal e Painel Administrativo** | `https://painel.inspira.dev.br/portal/` | `connect-src 'self' https://qawlpsrfewosxsfgmmpm.supabase.co` — Permite exclusivamente ao **Portal** autenticar via Google OAuth PKCE no projeto `qawlpsrfewosxsfgmmpm` e chamar as rotas `/api/*`. |

### 5.2 Callback Google OAuth e Redirect URL PKCE

- **Callback autorizado no Google Cloud Console**: `https://qawlpsrfewosxsfgmmpm.supabase.co/auth/v1/callback`
- **Redirect URL PKCE no Supabase Auth**: `https://painel.inspira.dev.br/portal/`
- **Isolamento de Sessão por Cookie Host-Only (`__Host-`)**:
  O **Portal** em `painel.inspira.dev.br` utiliza exclusivamente o cookie de sessão `__Host-vitrine_session` (`Path=/; HttpOnly; Secure; SameSite=Lax`, sem atributo `Domain`), impedindo compartilhamento com vitrines públicas.

### 5.3 Variáveis Públicas e Segredos de Servidor no Cloudflare Workers (`wrangler secret put`)

1. **Variável pública versionada em `wrangler.jsonc`**:
   - `vars.SUPABASE_URL = "https://qawlpsrfewosxsfgmmpm.supabase.co"` (contém exclusivamente a URL pública do projeto, sem segredos).
2. **Verificação de JWT por JWKS (`ES256`) e Segredos de Servidor lidos por `workers/api.mjs`**:
   - O projeto `qawlpsrfewosxsfgmmpm` emite JWTs assinados com **ECDSA P-256 (`alg: ES256`)** e `kid` publicado em `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. `workers/api.mjs` (`verifyJwtEs256`) valida a assinatura via WebCrypto com cache da JWKS em memória do isolate (TTL de 10 min e refetch único em `kid` desconhecido), exigindo `exp` válido, `iss === "${SUPABASE_URL}/auth/v1"`, `aud` contendo `authenticated` e `role === 'authenticated'`.
   - Quando o proprietário da conta Cloudflare autenticar sua sessão (`npx wrangler login`), registre os segredos lidos por `workers/api.mjs` exclusivamente via `npx wrangler secret put`:
   ```bash
   npx wrangler secret put SUPABASE_ANON_KEY
   # Opcional (apenas fallback legado HS256):
   npx wrangler secret put SUPABASE_JWT_SECRET
   ```
   - `SUPABASE_ANON_KEY` (**obrigatória**): aceita a nova **publishable key (`sb_publishable_...`)** ou a chave `anon` legada; é lida por `workers/api.mjs` (`createSupabaseRestStore`) para autenticar chamadas REST ao Supabase sob o token JWT do usuário (aplicando integralmente as políticas RLS).
   - `SUPABASE_JWT_SECRET` (**opcional — legado**): lida por `workers/api.mjs` (`verifyJwtHs256`) apenas se configurada, como fallback para projetos ou tokens legados `HS256`. Para o projeto `qawlpsrfewosxsfgmmpm` (`ES256` via JWKS), sua configuração é opcional.
   - **Importante (Princípios I e III)**: `SUPABASE_SERVICE_ROLE_KEY` **não** é lida por `workers/api.mjs` e **jamais** deve ser injetada no Worker público.

### 5.4 Portões Obrigatórios de Pré-Lançamento (Dry-Run)

Antes de qualquer publicação remota pelo administrador da conta Cloudflare, todos os 6 portões locais devem retornar código de saída `0`:

```bash
node scripts/backup-supabase.mjs --dry-run
node scripts/verify-supabase-rls.mjs --self-test
node scripts/validate-pilot-pack.mjs
npm run build
npm test
npx --yes wrangler@4.158.0 deploy --dry-run
```
