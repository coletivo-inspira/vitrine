# Provisionamento Supabase Free, Login Google e Salvaguardas Operacionais

Este guia documenta o procedimento passo a passo para operar o projeto oficial da **Vitrine Inspira** no plano **Supabase Free** (`qawlpsrfewosxsfgmmpm`), vincular e aplicar as migrações (`202611070001_site_access.sql` e `202611110001_portal_schema.sql`), conectar o login Google OAuth com PKCE (`docs/google-auth-setup.md`), executar a rotina preventiva de backup contra pausa por inatividade (`scripts/backup-supabase.mjs`), auditar o bloqueio anônimo via Row Level Security (`scripts/verify-supabase-rls.mjs`) e registrar os segredos de servidor no Cloudflare Workers (`workers/api.mjs`).

> **Regra de Segurança (Princípio III da Constituição)**: Nenhum segredo (`service_role`, `SUPABASE_JWT_SECRET`, `client_secret`, tokens de acesso ou senhas de banco em `SUPABASE_DB_URL`) deve ser colado em arquivos versionados, bundles estáticos (`dist/`), URLs ou argumentos de linha de comando. Apenas a URL pública do projeto (`https://qawlpsrfewosxsfgmmpm.supabase.co`) pode constar em configurações versionadas (`wrangler.jsonc` / CSP de `/portal/*`).

---

## 1. Identificação do Projeto Oficial no Plano Supabase Free (Custo Zero)

Conforme o **Princípio IV da Constituição** e os **ADRs 0003 e 0005**, o MVP opera estritamente dentro das cotas gratuitas verificáveis:

- **Project Ref oficial**: `qawlpsrfewosxsfgmmpm`
- **URL pública canônica (`SUPABASE_URL`)**: `https://qawlpsrfewosxsfgmmpm.supabase.co`
- **Endpoint público de saúde (GoTrue Auth)**: `https://qawlpsrfewosxsfgmmpm.supabase.co/auth/v1/health`

### Diretrizes de Governança da Conta

1. A organização e o projeto `qawlpsrfewosxsfgmmpm` operam na camada **Free Plan ($0/mês)**:
   - **Sem cartão de crédito** e com *Spend Cap* pago / upgrade automático desativados.
   - Senha do banco PostgreSQL e códigos de recuperação de 2FA armazenados exclusivamente no cofre administrativo da equipe Inspira.
2. Limites operacionais monitorados (tratados como restrições de arquitetura, nunca como SLA permanente):
   - **Pausa por inatividade**: Projetos no plano Free são pausados automaticamente após **7 dias sem atividade**.
   - **Armazenamento no banco**: Até 500 MB (adequado ao piloto de até 10 vitrines, máximo de 100 itens por rascunho de até 256 KiB em JSONB e zero upload de binários no banco).
3. Em **Project Settings → Data API**:
   - Mantenha em **Exposed schemas** apenas `public` (o schema `private` **jamais** deve ser exposto na Data API).

---

## 2. Aplicação das Migrações (`202611070001_site_access.sql` e `202611110001_portal_schema.sql`)

O repositório contém duas migrações SQL append-only que devem ser aplicadas em estrita ordem cronológica:

1. `supabase/migrations/202611070001_site_access.sql`: cria o schema `private`, as tabelas `public.sites`, `public.site_memberships` e `public.drafts`, as funções `private.accessible_site_ids()` e `private.bump_draft_revision()`, os privilégios de coluna e as políticas RLS.
2. `supabase/migrations/202611110001_portal_schema.sql`: adiciona as restrições complementares do portal e do editor de catálogo (`slug` estrito e limite de 256 KiB no `content` JSONB).

### Opção A — Via Supabase CLI (Link + Push)

Em ambiente administrativo autenticado (`SUPABASE_ACCESS_TOKEN` e senha do banco em variáveis de ambiente):

```bash
npx supabase link --project-ref qawlpsrfewosxsfgmmpm && npx supabase db push --remote
```

### Opção B — Via SQL Editor no Painel do Supabase

1. No painel do projeto `qawlpsrfewosxsfgmmpm`, abra **SQL Editor**.
2. Execute primeiro o conteúdo integral de `supabase/migrations/202611070001_site_access.sql`.
3. Em seguida, execute o conteúdo integral de `supabase/migrations/202611110001_portal_schema.sql`.
4. Verifique no catálogo do projeto:
   - `public.sites`, `public.site_memberships` e `public.drafts` estão com **RLS Enabled**.
   - O papel `anon` não possui nenhum `GRANT` de leitura ou escrita nessas tabelas nem permissão de execução no schema `private`.
   - O papel `authenticated` possui apenas os grants explícitos por coluna (`insert (owner_user_id, slug, name, template)` e `update (name)` em `sites`; `insert (site_id, content)` e `update (content)` em `drafts`).

---

## 3. Integração com Google OAuth e Allowlist de Retorno PKCE

Siga em conjunto as diretrizes de `docs/google-auth-setup.md` e os **ADRs 0004 e 0006** para o projeto `qawlpsrfewosxsfgmmpm`:

1. **Google Cloud Console**:
   - Configure a tela de consentimento OAuth solicitando apenas escopos básicos de identidade (`openid`, `email`, `profile`).
   - Crie uma credencial **OAuth 2.0 Client ID** do tipo *Web application*.
   - Em **Authorized redirect URIs**, registre exclusivamente o callback oficial do projeto `qawlpsrfewosxsfgmmpm`:
     `https://qawlpsrfewosxsfgmmpm.supabase.co/auth/v1/callback`
2. **Painel Supabase (Authentication → Providers → Google)**:
   - Ative o provedor Google e preencha o `Client ID` e o `Client Secret` diretamente no cofre do painel Supabase (nunca no repositório).
3. **Painel Supabase (Authentication → URL Configuration)**:
   - **Site URL**: `https://painel.inspira.dev.br`
   - **Redirect URLs (Allowlist estrita para o fluxo PKCE do Portal)**:
     - `https://painel.inspira.dev.br/portal/`
     - `https://painel.inspira.dev.br`
     - `http://localhost:5173/portal/`
     - `http://localhost:5173`
4. **Regras de Sessão, CSP e Identidade no Portal**:
   - O portal (`web/portal/portal.js`) utiliza o fluxo OAuth 2.0 Authorization Code com **PKCE** (`code_challenge_method=s256`) apontando para `https://qawlpsrfewosxsfgmmpm.supabase.co/auth/v1/authorize` com `redirect_to=https://painel.inspira.dev.br/portal/`.
   - A Content Security Policy (CSP) de `/portal` e `/portal/*` autoriza `connect-src 'self' https://qawlpsrfewosxsfgmmpm.supabase.co`, enquanto a vitrine pública (`/<slug>`, `/loja1`) e o site de divulgação (`/`) mantêm estritamente `connect-src 'self'`.
   - Toda autorização no banco baseia-se exclusivamente no UUID imutável `(select auth.uid())`, nunca em endereço de e-mail (ADR 0004).
   - Cookies de sessão em `painel.inspira.dev.br` utilizam prefixo host-only `__Host-vitrine_session` (`Secure; HttpOnly; SameSite=Lax; Path=/`) para impedir compartilhamento com vitrines públicas (ADR 0006).

---

## 4. Salvaguarda contra Pausa de 7 Dias (`scripts/backup-supabase.mjs`)

Para mitigar o limite operacional de pausa por inatividade de 7 dias do Supabase Free (**Princípio IV da Constituição**), o script `scripts/backup-supabase.mjs` valida as migrações locais e exporta snapshots JSON determinísticos fora da árvore pública.

### 4.1 Verificação Offline e Checagem (`--dry-run` e `--check`)

```bash
node scripts/backup-supabase.mjs --dry-run
SUPABASE_DB_URL="postgresql://postgres:<password>@db.qawlpsrfewosxsfgmmpm.supabase.co:5432/postgres" node scripts/backup-supabase.mjs --check
```

### 4.2 Execução Periódica do Backup Remoto (Keep-Alive + Snapshot)

Execute a rotina **a cada 3 a 5 dias** (sempre abaixo da janela de 7 dias de inatividade do Supabase Free) em ambiente administrativo seguro, fornecendo as credenciais exclusivamente por variáveis de ambiente:

```bash
SUPABASE_URL="https://qawlpsrfewosxsfgmmpm.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service-role-key-lida-do-secret-store>" \
SUPABASE_DB_URL="postgresql://postgres:<password>@db.qawlpsrfewosxsfgmmpm.supabase.co:5432/postgres" \
node scripts/backup-supabase.mjs
```

- **Saída**: O arquivo `supabase-backup-<timestamp>.json` é gravado com permissão restrita (`0600`) em `supabase/.temp/backups/`, contendo metadados das migrações locais (`202611070001_site_access.sql` e `202611110001_portal_schema.sql`), registros ordenados de `sites`, `site_memberships` e `drafts` e hash SHA-256 de integridade.

---

## 5. Verificação de Isolamento e Bloqueio Anônimo (`scripts/verify-supabase-rls.mjs`)

### 5.1 Autoteste Local Embarcado com PGlite (`--self-test`)

Executa as migrações `202611070001_site_access.sql` e `202611110001_portal_schema.sql` em uma instância PostgreSQL embarcada (`@electric-sql/pglite`) e verifica que `SELECT`, `INSERT`, `UPDATE`, `DELETE` e chamadas a `private.accessible_site_ids()` sob o papel `anon` falham com `SQLSTATE 42501`:

```bash
node scripts/verify-supabase-rls.mjs --self-test
```

### 5.2 Verificação Remota contra o Projeto `qawlpsrfewosxsfgmmpm`

Após aplicar as migrações no projeto remoto, execute o verificador utilizando a URL pública e a chave `anon` via variáveis de ambiente:

```bash
SUPABASE_URL="https://qawlpsrfewosxsfgmmpm.supabase.co" \
SUPABASE_ANON_KEY="<anon-key-publica-do-projeto-qawlpsrfewosxsfgmmpm>" \
node scripts/verify-supabase-rls.mjs
```

---

## 6. Registro de Variáveis e Segredos no Cloudflare Workers (`workers/api.mjs`)

- **Variável pública versionada (`wrangler.jsonc`)**:
  - `vars.SUPABASE_URL = "https://qawlpsrfewosxsfgmmpm.supabase.co"`
- **Verificação de JWT no servidor (`ES256` via JWKS por padrão)**:
  - O projeto `qawlpsrfewosxsfgmmpm` assina tokens JWT de sessão com chaves assimétricas **EC P-256 (`alg: ES256`)** identificadas por `kid`, expostas publicamente em `https://qawlpsrfewosxsfgmmpm.supabase.co/auth/v1/.well-known/jwks.json`.
  - `workers/api.mjs` (`verifyJwtEs256` e `resolveJwtSession`) busca e mantém a JWKS em cache na memória do isolate (TTL de 10 minutos, com refetch único caso receba um `kid` recém-rotacionado) e valida criptograficamente a assinatura ECDSA P-256 SHA-256, além das claims `exp`, `iss` (`${SUPABASE_URL}/auth/v1`), `aud` contendo `authenticated` e `role === 'authenticated'`.
- **Segredos exclusivos de servidor lidos por `workers/api.mjs`** (registrados via `npx wrangler secret put`, nunca em arquivos versionados):
  ```bash
  npx wrangler secret put SUPABASE_ANON_KEY
  # Opcional (apenas fallback legado HS256):
  npx wrangler secret put SUPABASE_JWT_SECRET
  ```
  - `SUPABASE_ANON_KEY` (**obrigatória**): aceita tanto a nova **publishable key (`sb_publishable_...`)** quanto a chave `anon` legada. É utilizada por `workers/api.mjs` (`createSupabaseRestStore`) como cabeçalho `apikey` nas chamadas autenticadas ao PostgREST sob o JWT do usuário.
  - `SUPABASE_JWT_SECRET` (**opcional — legado**): necessária apenas como fallback de compatibilidade para tokens legados `HS256` (`verifyJwtHs256`). Em projetos com chaves de assinatura assimétricas `ES256` via JWKS (`qawlpsrfewosxsfgmmpm`), não é necessário configurá-la.
  - **Importante**: `SUPABASE_SERVICE_ROLE_KEY` **não** é lida por `workers/api.mjs` e **jamais** deve ser configurada no Worker público.
