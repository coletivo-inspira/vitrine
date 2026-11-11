# Modelo de Dados: Shell do Portal Administrativo (`007-admin-portal-shell`)

**Feature**: `007-admin-portal-shell`  
**Date**: 2026-11-11  
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Contract**: [../004-catalog-editor/contracts/portal-api.md](../004-catalog-editor/contracts/portal-api.md)

---

## 1. Entidades Relacionais (`public.sites` e `public.site_memberships`)

Definidas em `supabase/migrations/202611070001_site_access.sql` e complementadas de forma incremental e idempotente em `supabase/migrations/202611110001_portal_schema.sql`:

### 1.1. `public.sites`

| Coluna | Tipo SQL | Restrições | Descrição |
|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único imutável da vitrine. |
| `owner_user_id` | `uuid` | `NOT NULL REFERENCES auth.users(id)` | Proprietário da vitrine (`auth.uid()` opaco, ADR 0004). |
| `slug` | `text` | `NOT NULL UNIQUE`, formato `^[a-z0-9]+(-[a-z0-9]+)*$`, comprimento entre `3` e `40` caracteres (`sites_portal_slug_check`), proibido em `('admin','api','www','app','auth','portal','assets','data','login','logout')` | Caminho público único da vitrine (ex.: `pizzaria-bella`). |
| `name` | `text` | `NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160)` | Nome de exibição do negócio. |
| `template` | `text` | `NOT NULL DEFAULT 'pizzeria-v1' CHECK (template = 'pizzeria-v1')` | Identificador do modelo da vitrine. |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Data de criação da vitrine. |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Data da última atualização de metadados da vitrine (adicionada em `202611110001_portal_schema.sql`). |

### 1.2. `public.site_memberships`

| Coluna | Tipo SQL | Restrições | Descrição |
|---|---|---|---|
| `site_id` | `uuid` | `NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE` | Vitrine à qual o colaborador está vinculado. |
| `user_id` | `uuid` | `NOT NULL REFERENCES auth.users(id)` | Identificador `auth.uid()` do membro colaborador (`PRIMARY KEY (site_id, user_id)`). |

---

## 2. Funções Auxiliares no Schema `private`

- `private.accessible_site_ids()` (`202611070001_site_access.sql`): Retorna o conjunto de `uuid` das vitrines em que `(select auth.uid())` é proprietário ou membro.
- `private.user_site_role(target_site_id uuid)` (`202611110001_portal_schema.sql`): Retorna `'owner'` se `owner_user_id = (select auth.uid())`, `'member'` se existir vínculo em `public.site_memberships`, ou `NULL` caso contrário. Executável apenas por `authenticated`.
- `private.touch_site_updated_at()` (`202611110001_portal_schema.sql`): Trigger `BEFORE UPDATE ON public.sites` que atualiza `new.updated_at := now()`.

---

## 3. Modelos de Transporte HTTP/JSON

### 3.1. `PortalSessionResponse` (`GET /api/auth/session`)
```json
{
  "authenticated": true,
  "user": {
    "id": "10000000-0000-0000-0000-000000000001"
  }
}
```

### 3.2. `SiteSummary` (`GET /api/sites` e `POST /api/sites`)
```json
{
  "id": "20000000-0000-0000-0000-000000000001",
  "slug": "pizzaria-bella",
  "name": "Pizzaria Bella",
  "template": "pizzeria-v1",
  "role": "owner",
  "updatedAt": "2026-11-11T00:00:00.000Z"
}
```

### 3.3. Regras de Criação de Vitrine (`POST /api/sites`)
1. Valida `slug` com `validateSlug(slug)`:
   - Deve ser string minúscula `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
   - Comprimento entre 3 e 40 caracteres.
   - Não pode pertencer à lista reservada `['admin', 'api', 'auth', 'app', 'www', 'portal', 'assets', 'data', 'login', 'logout']`.
   - Violação retorna `400 Bad Request` (`code: "INVALID_SLUG"`).
2. Valida `name` (1 a 160 caracteres após `trim()`) e `template` (default `"pizzeria-v1"`).
3. Se `slug` já existir: retorna `409 Conflict` (`code: "SLUG_TAKEN"`).
4. Cria a vitrine (`role: "owner"`) e inicializa seu rascunho (`revision: 1`, `schemaVersion: 1`, `template: "pizzeria-v1"`, `slug`, `businessName: name`, `whatsapp: "5511999999999"`, `categories: []`), retornando `201 Created`.
