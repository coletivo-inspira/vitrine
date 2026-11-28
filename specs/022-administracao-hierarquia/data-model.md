# Data Model: Hierarquia da administração, licenças, cupons e limites

Migração: `supabase/migrations/20261128001000_platform_hierarchy_licenses.sql` (append-only).

## Papéis e capacidades

| Capacidade | O que libera | Dono (`platform_owner`) | Administrador (`platform_admin`) | Gestor de licenças (`license_manager`) |
| --- | --- | --- | --- | --- |
| `platform.operate` | CMS, modelos, Mila, Linktree, patrocinadores, resposta automática, processos e atividade | sim | sim | não |
| `users.read` | Lista e detalhe de usuários e vitrines | sim | sim | sim |
| `licenses.manage` | Licenças, cupons, relatório e limites por vitrine | sim | sim | sim |
| `staff.manage` | Dar e retirar `license_manager` e `support_operator` | sim | sim | não |
| `admins.manage` | Dar e retirar `platform_admin` | sim | não | não |

`support_operator` e `sponsor` não têm capacidades novas. A matriz está em `src/admin/platform-roles.mjs` e em `private.platform_capabilities(role)`; o teste de banco compara as duas.

## Tabelas

### `public.platform_operators` (alterada)

- `role` aceita `platform_owner`, `platform_admin`, `license_manager`, `support_operator`, `sponsor`.
- Índice único parcial `platform_operators_single_owner` (`where role = 'platform_owner'`).
- Coluna nova `granted_by uuid null`.

### `public.license_grants`

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `id` | uuid | PK |
| `tenant_id` | uuid | FK `tenants`, cascade |
| `plan_code` | text | FK `plans`, diferente de `free` |
| `source` | text | `manual`, `coupon`, `courtesy` |
| `starts_at`, `ends_at` | timestamptz | `ends_at > starts_at` |
| `note` | text | até 280 caracteres |
| `granted_by`, `revoked_by` | uuid | FK `auth.users`, set null |
| `revoked_at` | timestamptz | nula enquanto vale |

Vigente: `revoked_at is null and starts_at <= now() and ends_at > now()`. RLS: leitura pela dona da organização ou por quem tem `licenses.manage`; escrita só pelas funções.

### `public.coupons`

`code` único (`^[A-Z0-9][A-Z0-9-]{4,22}[A-Z0-9]$`), `plan_code` (pago), `duration_months` 1-36, `max_redemptions` 1-1000, `redemption_count`, `expires_at` opcional, `note`, `created_by`, `disabled_at`. Leitura e escrita só por funções com `licenses.manage`.

### `public.coupon_redemptions`

`coupon_id`, `tenant_id`, `site_id`, `redeemed_by`, `license_grant_id`, `plan_code`, `duration_months`, `value_cents`, `redeemed_at`; único `(coupon_id, tenant_id)`.

### `private.coupon_attempts`

`user_id`, `attempted_at`. Até 10 tentativas por hora por conta; linhas com mais de um dia são apagadas a cada tentativa.

### `public.site_limit_overrides`

`site_id` (PK), `max_active_items` 1-100, `max_item_blocks` 1-5 (ao menos um preenchido), `note`, `updated_by`, `updated_at`.

## Funções

| Função | Quem | Efeito |
| --- | --- | --- |
| `private.platform_role()`, `private.platform_capabilities(text)`, `private.has_platform_capability(text)` | interno | papel e capacidades da sessão |
| `public.read_my_platform_access()` | qualquer conta | `role` e `capabilities` da própria conta |
| `private.bootstrap_platform_owner(email)` | SQL Editor | define o Dono quando não há |
| `public.list_platform_operators()` | `staff.manage` | operadores com e-mail e nome |
| `public.grant_platform_role(user, role)` / `revoke_platform_role(user)` | `staff.manage` / `admins.manage` | muda papéis pela hierarquia |
| `public.admin_list_users(search, size, offset)` | `users.read` | lista paginada com `total_count` |
| `public.admin_user_detail(user)` | `users.read` | conta, vitrines, direitos, assinatura, licenças, limites |
| `public.grant_license(site, plan, months, note)` / `revoke_license(grant)` | `licenses.manage` | licença manual |
| `public.create_coupon(plan, months, max, expires, note, code)` / `set_coupon_disabled(coupon, disabled)` / `list_coupons()` / `read_coupon_report()` | `licenses.manage` | cupons |
| `public.redeem_coupon(site, code)` | proprietária | resgate; devolve `{status, ...}` |
| `public.set_site_limits(site, items, blocks, note)` / `clear_site_limits(site)` | `licenses.manage` | limites por vitrine |
| `private.site_entitlements(site)` | interno | redefinida (FR-007) |

## Auditoria (`audit_logs.action`)

`platform_owner_bootstrapped`, `platform_role_granted`, `platform_role_revoked`, `license_granted`, `license_revoked`, `coupon_created`, `coupon_disabled`, `coupon_enabled`, `coupon_redeemed`, `site_limits_set`, `site_limits_cleared`.
