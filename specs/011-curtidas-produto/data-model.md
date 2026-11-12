# Data Model: Curtidas por Item (`011-curtidas-produto`)

Migração: `supabase/migrations/20261112192000_item_likes.sql` (append-only).

## Tabela `public.item_likes`

| Coluna | Tipo | Regra |
|---|---|---|
| `site_id` | `uuid` | FK `public.sites(id)` `on delete cascade` |
| `item_key` | `text` | 1 a 64 caracteres; deve existir em `publications.menu->items` ativa ao gravar |
| `visitor_hash` | `text` | `^[a-f0-9]{64}$` (SHA-256 do token do cookie) |
| `created_at` | `timestamptz` | `default now()` |

- Chave primária: `(site_id, item_key, visitor_hash)`.
- Índice: `(site_id, created_at desc)` para os tetos por hora e "novas no período".
- RLS habilitada, sem políticas e sem grants para `anon`/`authenticated`: nenhum acesso direto.

## Funções

| Função | Quem executa | Retorno |
|---|---|---|
| `public.get_item_likes(target_slug text, visitor_key text default null)` | `anon`, `authenticated` | `jsonb {counts: {itemId: n}, liked: [itemId]}` |
| `public.set_item_like(target_slug text, target_item text, visitor_key text, liked boolean)` | `anon`, `authenticated` | `jsonb {itemId, liked, count}` |
| `public.site_item_like_stats(target_site_id uuid, since timestamptz)` | `authenticated` | `table(item_key, total_likes, period_likes)` |

Implementação em `private.*` com `security definer` e `search_path = ''`; os wrappers `public.*` só repassam.

## Erros

| SQLSTATE | Mensagem | HTTP no Worker |
|---|---|---|
| `P0002` | `PUBLICATION_NOT_FOUND` | 404 |
| `23514` | `INVALID_LIKE_ITEM` | 422 |
| `22023` | `INVALID_LIKE_REQUEST` | 400 |
| `PT429` | `LIKE_RATE_LIMITED` | 429 |

## Limites

- `ITEM_LIKE_LIMITS.perItemPerHour = 30`, `ITEM_LIKE_LIMITS.perSitePerHour = 150` (espelhados em `src/portal-validation.mjs` e na migração).
