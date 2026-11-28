# Modelo de dados: convite de demonstração e equipe da vitrine

> Nota (spec 020): a tabela `private.site_invitations`, as funções de equipe (`create_team_invitation`, `revoke_invitation`, `list_site_team`, `read_invitation`, `accept_invitation` só para `team`) e `purge_expired_invitations` já foram criadas por `supabase/migrations/20261126003000_site_team_invitations.sql`. A migração desta spec, com timestamp posterior, acrescenta só demonstração, convite de dono, cortesia e `growth_operator`, e estende `accept_invitation` para `demo_owner`.

Tudo entra numa migração nova, append-only, proposta como `supabase/migrations/20261126000100_site_invitations_courtesy.sql`. Nenhuma migração anterior é alterada. As funções seguem o padrão do projeto: `security definer`, `set search_path = ''`, `revoke all ... from public, anon` e `grant execute` explícito.

## Alterações em tabelas existentes

### `public.platform_operators`

- `platform_operators_role_check` passa a aceitar `growth_operator`: `role in ('platform_admin', 'support_operator', 'sponsor', 'growth_operator')`.

### `public.sites`

| Coluna | Mudança | Regra |
|---|---|---|
| `demo_source` | restrição ampliada | `demo_source in ('linktree', 'manual', 'csv')`. |
| `demo_created_by` | nova, `uuid null references auth.users(id) on delete set null` | Quem criou a demonstração; nulo para vitrines comuns. |
| `demo_created_at` | nova, `timestamptz null` | Base do limite de 90 dias da prorrogação; preenchida na criação da demonstração. |
| `demo_invited_user_id` | sem mudança | Mantida para o fluxo do Linktree já entregue; o fluxo novo não a usa. |

A restrição `sites_owner_or_demo` continua valendo: vitrine sem dono é sempre demonstração com prazo.

## `private.site_invitations`

Convite de uso único. Fica em `private`, sem acesso de `anon` nem `authenticated`; tudo passa pelas funções abaixo.

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `uuid` | Chave primária, `gen_random_uuid()`. Usado para listar e revogar; nunca abre o convite. |
| `token_hash` | `text` | Único. SHA-256 hexadecimal do token (64 caracteres, `^[0-9a-f]{64}$`). |
| `kind` | `text` | `demo_owner` ou `team`. |
| `site_id` | `uuid` | `references public.sites(id) on delete cascade`. |
| `role` | `text null` | Obrigatório para `team`: `admin`, `editor` ou `viewer`; nulo para `demo_owner`. |
| `created_by` | `uuid` | Quem gerou; `references auth.users(id) on delete cascade`. |
| `created_at` | `timestamptz` | `now()`. |
| `expires_at` | `timestamptz` | `created_at + 7 dias`; para `demo_owner`, no máximo `sites.demo_expires_at`. |
| `first_opened_at` | `timestamptz null` | Primeira abertura da prévia ou da confirmação; sem IP nem contagem (research R2). |
| `status` | `text` | `open`, `accepted`, `declined`, `revoked` ou `expired`. |
| `resolved_at` | `timestamptz null` | Momento do aceite, da recusa ou da revogação. |
| `accepted_by` | `uuid null` | Quem aceitou; `references auth.users(id) on delete set null`. |

Restrições e índices:

- `check ((kind = 'team') = (role is not null))`.
- Índice único parcial `(site_id) where kind = 'demo_owner' and status = 'open'`: no máximo um convite de dono aberto por demonstração (FR-008).
- Limite de 20 convites `team` abertos por vitrine verificado em `create_team_invitation` (FR-018).
- Índice `(expires_at) where status = 'open'` para a limpeza.

"Vencido" é calculado (`status = 'open' and expires_at <= now()`); a limpeza horária grava `expired` e apaga convites resolvidos há mais de 90 dias.

## `private.courtesy_grants`

Cortesia do Profissional, separada da assinatura (research R6).

> Nota (spec 021, 2026-11-28): a tabela `public.license_grants` da migração `20261128001000_platform_hierarchy_licenses.sql` já aceita `source = 'courtesy'` e já é lida por `private.site_entitlements`. Ao implementar esta especificação, prefira gravar a cortesia como licença dessa origem (90 dias do Profissional) em vez de criar `private.courtesy_grants`; a regra "uma cortesia por conta" passa a ser uma checagem em `license_grants`.

| Coluna | Tipo | Regra |
|---|---|---|
| `user_id` | `uuid` | Chave primária (uma cortesia por conta); `references auth.users(id) on delete cascade`. |
| `tenant_id` | `uuid` | Organização criada no aceite; `references public.tenants(id) on delete cascade`. |
| `site_id` | `uuid null` | Vitrine aceita; `references public.sites(id) on delete set null`. |
| `plan_code` | `text` | `references public.plans(code)`; `profissional` no aceite. |
| `starts_at` | `timestamptz` | Momento do aceite. |
| `ends_at` | `timestamptz` | `starts_at + 90 dias`. |
| `ended_at` | `timestamptz null` | Preenchido quando uma assinatura paga é confirmada para a organização (a cortesia deixa de contar antes da data). |
| `ended_logged_at` | `timestamptz null` | Quando a rotina agendada gravou `courtesy.ended` em `audit_logs` (uma vez). |
| `granted_by` | `uuid null` | `null` no aceite; o `platform_admin` quando ele concede outra cortesia manualmente. |

Uma segunda cortesia concedida pelo `platform_admin` substitui a linha (com auditoria do valor antigo e do novo).

## Funções novas ou alteradas

### Autorização

- `private.can_manage_demos() returns boolean`: `platform_admin` ou `growth_operator` em `platform_operators` para `auth.uid()`.
- Políticas novas de `public.sites` (select e update de `name`) e `public.drafts` (select e update) para `private.can_manage_demos()` **apenas** quando `sites.owner_user_id is null and sites.demo_expires_at is not null`. As políticas atuais continuam iguais para vitrines com dono (FR-002).
- Política de `public.assets` (select, insert, delete) com a mesma condição, para as fotos da demonstração.

### Demonstrações (chamadas com o JWT do operador)

| Função | Faz |
|---|---|
| `public.create_demo(target_slug, target_name, target_storefront_type, target_template, target_source, target_content)` | Exige `can_manage_demos()`; cria vitrine sem dono, `demo_expires_at = now() + 30 dias`, `demo_created_by`, `demo_created_at` e rascunho na mesma transação; audita `demo_created`. |
| `public.import_linktree_demo(...)` | Alterada: passa a exigir `can_manage_demos()` em vez de `is_platform_admin()` (FR-003). |
| `public.extend_demo(target_site)` | Soma 30 dias, sem passar de `demo_created_at + 90 dias`; audita `demo_extended`. |
| `public.delete_demo(target_site)` | Apaga demonstração sem dono; audita `demo_deleted` com `site_id` nulo e o endereço no resumo. |
| `public.list_demos()` | Lista demonstrações vigentes com situação derivada do último convite, `first_opened_at`, prazos e totais para a taxa de aceite (SC-007). |
| `public.create_demo_invitation(target_site, target_token_hash)` | Revoga o convite de dono aberto, cria o novo com prazo limitado ao da demonstração; audita `invitation_created` (sem o hash). |
| `public.revoke_invitation(target_invitation)` | Operador (para `demo_owner`) ou proprietário e `admin` da vitrine (para `team`, respeitando a regra de `admin`); audita `invitation_revoked`. |

O token é gerado no Worker; o banco só recebe o hash (FR-006).

### Abertura, aceite e recusa (chamadas pelo Worker)

| Função | Quem chama | Faz |
|---|---|---|
| `private.read_invitation(target_token_hash)` | `service_role` | Devolve tipo, vitrine, papel, prazo e, para `demo_owner`, o rascunho atual, só se o convite estiver aberto, não vencido e a demonstração vigente; senão, nada. Marca `first_opened_at` na primeira vez. |
| `public.accept_invitation(target_token_hash)` | JWT da pessoa | `demo_owner`: trava a linha do convite e da vitrine (`for update`), torna a pessoa proprietária, limpa os campos de demonstração, cria a organização (`tenants`) e liga `sites.tenant_id`, cria a cortesia se não houver linha em `courtesy_grants` para a pessoa, marca o convite como aceito e audita `invitation_accepted` e `courtesy_granted`. `team`: recusa proprietário ou membro existente sem alterar nada; cria a associação com o papel do convite; marca aceito. |
| `private.decline_demo_invitation(target_token_hash)` | `service_role` | Só `demo_owner` aberto: apaga a demonstração (os convites saem em cascata) e audita `demo_declined` com `site_id` nulo, o endereço e nenhum dado de quem recusou. |

Os erros de convite inexistente, vencido, revogado ou usado são o mesmo (`INVITATION_UNAVAILABLE`), para a resposta não revelar o motivo (FR-010).

### Equipe

| Função | Faz |
|---|---|
| `public.create_team_invitation(target_site, target_role, target_token_hash)` | Proprietário: `admin`, `editor` ou `viewer`; `admin` da vitrine: `editor` ou `viewer`; até 20 abertos; audita `invitation_created`. |
| `public.list_site_team(target_site)` | Só proprietário e `admin`: `user_id`, `display_name` de `profiles` (ou nulo) e papel, mais os convites `team` abertos (`id`, papel, prazo); sem e-mail, telefone nem hash. |
| `public.set_showcase_member` e a remoção atual | Sem mudança; continuam valendo as políticas `memberships_*`. |

### Cortesia e direitos

| Função | Mudança |
|---|---|
| `private.site_entitlements(target_site)` | Redefinida: assinatura paga que vale (regra atual); senão, `courtesy_grants` da organização da vitrine com `ended_at is null and ends_at > now()`; senão, `free`. |
| `public.read_courtesy_notices()` | Nova: cortesias da pessoa com `ends_at` em até 15 dias, para a faixa de avisos. |
| `public.billing_apply_event(...)` | Alterada só para, ao confirmar pagamento de uma organização com cortesia vigente, preencher `ended_at`. |
| `public.purge_expired_demos()` | Nova (substitui a chamada de `purge_expired_linktree_demos` no `scheduled()`): apaga demonstrações vencidas de qualquer origem, até 50 por execução; marca convites vencidos; grava `courtesy.ended` das cortesias terminadas e ainda não registradas. Só `service_role`. |
| `public.grant_growth_operator(target_user)` e `public.revoke_growth_operator(target_user)` | Novas, só `platform_admin`, no padrão de `grant_sponsor_role`; auditadas. |
| `public.grant_courtesy(target_user, target_tenant)` | Nova, só `platform_admin`: concede ou renova cortesia manualmente; auditada. |

## Auditoria

Ações novas em `audit_logs.action`: `demo_created`, `demo_extended`, `demo_deleted`, `demo_declined`, `invitation_created`, `invitation_opened`, `invitation_revoked`, `invitation_accepted`, `courtesy_granted`, `courtesy.ended`, `growth_operator_granted` e `growth_operator_revoked`. Os rótulos em português entram no mapa de `web/portal/platform-cms.js`, junto dos do Linktree. Nenhum resumo leva o token, o hash, o número de WhatsApp do negócio ou dados de quem recusou (FR-023).

## Testes de banco (PGlite)

`test/database/site-invitations.test.mjs`, no padrão de `test/database/linktree-demo.test.mjs`:

- `anon` e `authenticated` sem acesso direto a `private.site_invitations` e `private.courtesy_grants`;
- usuário comum, `support_operator` e `sponsor` recebem `42501` em todas as funções de demonstração;
- `growth_operator` não lê nem altera vitrine com dono;
- dois aceites simultâneos do mesmo convite: um vence, o outro recebe `INVITATION_UNAVAILABLE`;
- segunda cortesia para a mesma conta não é criada;
- `site_entitlements` com cortesia vigente, vencida, com assinatura pendente e com assinatura paga confirmada;
- `admin` da vitrine não cria convite `admin`; `editor` não cria convite;
- recusa apaga vitrine, rascunho, fotos e convites e não grava dados de quem recusou.
