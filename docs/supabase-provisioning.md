# Provisionamento Supabase Free, Login Google e Salvaguardas Operacionais

Este guia documenta o procedimento passo a passo para provisionar o projeto no plano **Supabase Free**, aplicar a migração inicial de controle de acesso por vitrine (`supabase/migrations/202611070001_site_access.sql`), conectar o login Google OAuth com PKCE (`docs/google-auth-setup.md`), operar a rotina preventiva de backup contra pausa por inatividade (`scripts/backup-supabase.mjs`) e validar o bloqueio anônimo via Row Level Security (`scripts/verify-supabase-rls.mjs`).

> **Regra de Segurança (Princípio III da Constituição)**: Nenhum segredo (`service_role`, `client_secret`, tokens de acesso ou senhas de banco) deve ser colado em arquivos versionados, bundles estáticos (`dist/`), URLs ou argumentos de linha de comando.

---

## 1. Provisionamento no Plano Supabase Free (Custo Zero)

Conforme o **Princípio IV da Constituição** e os **ADRs 0003 e 0005**, o MVP opera estritamente dentro das cotas gratuitas verificáveis:

1. Acesse o painel do Supabase com uma conta sob controle administrativo do Coletivo Inspira.
2. Crie uma organização na camada **Free Plan ($0/mês)**:
   - **Não cadastre cartão de crédito** e mantenha desativada qualquer opção de *Spend Cap* pago ou upgrade automático.
   - Armazene a senha do banco PostgreSQL e os códigos de recuperação de 2FA no cofre administrativo da equipe.
3. Crie o projeto da Vitrine Inspira na região mais próxima do público-alvo (ex.: `South America (São Paulo)` / `sa-east-1`).
4. Registre os limites operacionais do plano gratuito (tratados como restrições de arquitetura, nunca como SLA permanente):
   - **Pausa por inatividade**: Projetos no plano Free são pausados automaticamente após **7 dias sem atividade**.
   - **Armazenamento no banco**: Até 500 MB (adequado ao piloto de até 10 vitrines, máximo de 100 itens por rascunho de até 256 KiB em JSONB e zero upload de binários no banco).
5. Em **Project Settings → Data API**:
   - Mantenha em **Exposed schemas** apenas `public` (o schema `private` **jamais** deve ser exposto na Data API).

---

## 2. Aplicação da Migração `202611070001_site_access.sql`

A migração `supabase/migrations/202611070001_site_access.sql` cria o schema `private`, as tabelas `public.sites`, `public.site_memberships` e `public.drafts`, as funções `private.accessible_site_ids()` e `private.bump_draft_revision()`, os privilégios de coluna e as políticas RLS.

### Passo a passo de aplicação

1. No painel do Supabase, abra **SQL Editor** (ou utilize a CLI autenticada como administrador de migração via `supabase db push` em ambiente administrativo isolado).
2. Execute integralmente o conteúdo de `supabase/migrations/202611070001_site_access.sql`.
3. Confirme que a execução ocorreu com o papel administrativo da migração (que possui privilégio para criar funções `security definer` com `search_path = ''` e contornar RLS na função `private.accessible_site_ids()`).
4. Verifique no catálogo do projeto:
   - `public.sites`, `public.site_memberships` e `public.drafts` estão com **RLS Enabled**.
   - O papel `anon` não possui nenhum `GRANT` de leitura ou escrita nessas tabelas nem permissão de execução no schema `private`.
   - O papel `authenticated` possui apenas os grants explícitos por coluna (`insert (owner_user_id, slug, name, template)` e `update (name)` em `sites`; `insert (site_id, content)` e `update (content)` em `drafts`), impedindo auto-atribuição de membros ou adulteração manual de `revision`.

---

## 3. Integração com Google OAuth e Allowlist de Retorno

Siga em conjunto as diretrizes de `docs/google-auth-setup.md` e os **ADRs 0004 e 0006**:

1. **Google Cloud Console**:
   - Configure a tela de consentimento OAuth solicitando apenas escopos básicos de identidade (`openid`, `email`, `profile`).
   - Crie uma credencial **OAuth 2.0 Client ID** do tipo *Web application*.
   - Em **Authorized redirect URIs**, registre exclusivamente o callback fornecido pelo projeto Supabase:
     `https://<project-ref>.supabase.co/auth/v1/callback`
2. **Painel Supabase (Authentication → Providers → Google)**:
   - Ative o provedor Google e preencha o `Client ID` e o `Client Secret` diretamente no cofre do painel Supabase (nunca no repositório).
3. **Painel Supabase (Authentication → URL Configuration)**:
   - **Site URL**: `https://painel.inspira.dev.br`
   - **Redirect URLs (Allowlist estrita, sem wildcards abertos para vitrines de clientes)**:
     - `https://painel.inspira.dev.br`
     - `https://painel.inspira.dev.br/portal/`
     - `http://localhost:5173`
     - `http://localhost:5173/portal/`
4. **Regras de Sessão e Identidade no Portal**:
   - O portal utiliza o fluxo OAuth 2.0 Authorization Code com **PKCE** (`code_challenge_method=s256`).
   - Toda autorização no banco baseia-se exclusivamente no UUID imutável `(select auth.uid())`, nunca em endereço de e-mail (ADR 0004).
   - Cookies de sessão no domínio administrativo `painel.inspira.dev.br` utilizam prefixo host-only `__Host-vitrine_session` (`Secure; HttpOnly; SameSite=Lax; Path=/`) para impedir compartilhamento com vitrines públicas (ADR 0006).

---

## 4. Salvaguarda contra Pausa de 7 Dias (`scripts/backup-supabase.mjs`)

Para mitigar o limite operacional de pausa por inatividade de 7 dias do Supabase Free (**Princípio IV da Constituição**), o script `scripts/backup-supabase.mjs` realiza a leitura periódica autenticada via HTTPS das tabelas administrativas e grava um snapshot JSON determinístico fora da árvore pública.

### 4.1 Verificação Offline (sem credenciais remotas)

Antes de qualquer commit ou em ambientes locais sem variáveis de ambiente remotas, valide a integridade das migrações locais e do contrato de backup:

```bash
node scripts/backup-supabase.mjs --dry-run
```

O modo `--dry-run` (ou `--check`):
- Inspeciona `supabase/migrations/*.sql`, calcula o digest SHA-256 de cada migração e valida que `sites`, `site_memberships` e `drafts` possuem RLS habilitado.
- Garante que o diretório de destino (`supabase/.temp/backups` por padrão, ignorado pelo `.gitignore`) está fora de `dist/`, `web/`, `src/` e `supabase/migrations/`.
- Rejeita imediatamente qualquer tentativa de passar chaves ou tokens via argumentos de linha de comando.

### 4.2 Execução Periódica do Backup Remoto (Keep-Alive + Snapshot)

Execute a rotina **a cada 3 a 5 dias** (sempre abaixo da janela de 7 dias de inatividade do Supabase Free) em ambiente administrativo seguro, fornecendo as credenciais exclusivamente por variáveis de ambiente:

```bash
SUPABASE_URL="https://<project-ref>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<chave-lida-do-secret-store>" \
node scripts/backup-supabase.mjs
```

- **Saída**: O arquivo `supabase-backup-<timestamp>.json` é gravado com permissão restrita (`0600`) em `supabase/.temp/backups/` (ou no diretório configurado em `BACKUP_OUTPUT_DIR`, desde que fora da árvore pública), contendo metadados das migrações locais, registros ordenados de `sites`, `site_memberships` e `drafts` e hash SHA-256 de integridade.
- **Recuperação em caso de pausa**: Caso o projeto entre em pausa no painel do Supabase Free, acione **Restore project** no painel do provedor, valide a integridade do schema com `scripts/verify-supabase-rls.mjs` e compare as contagens e hashes com o último artefato JSON gerado por `scripts/backup-supabase.mjs`.

---

## 5. Verificação de Isolamento e Bloqueio Anônimo (`scripts/verify-supabase-rls.mjs`)

O script `scripts/verify-supabase-rls.mjs` comprova que requisições anônimas (`anon`) para `sites`, `site_memberships`, `drafts` e funções do schema `private` são sumariamente bloqueadas.

### 5.1 Autoteste Local Embarcado com PGlite (`--self-test`)

Executa a migração real `supabase/migrations/202611070001_site_access.sql` em uma instância PostgreSQL embarcada (`@electric-sql/pglite`) e verifica que `SELECT`, `INSERT`, `UPDATE`, `DELETE` e chamadas a `private.accessible_site_ids()` sob o papel `anon` falham com `SQLSTATE 42501`, além de confirmar que um usuário `authenticated` sem vínculo vê zero linhas:

```bash
node scripts/verify-supabase-rls.mjs --self-test
```

### 5.2 Verificação Remota contra a Data API do Supabase

Após aplicar a migração no projeto Supabase remoto, execute o verificador utilizando apenas a chave pública `anon` via variáveis de ambiente:

```bash
SUPABASE_URL="https://<project-ref>.supabase.co" \
SUPABASE_ANON_KEY="<anon-key-publica>" \
node scripts/verify-supabase-rls.mjs
```

O verificador falha com código de saída diferente de zero se qualquer tabela administrativa (`sites`, `site_memberships`, `drafts`) ou função privada permitir leitura, escrita ou execução anônima.
