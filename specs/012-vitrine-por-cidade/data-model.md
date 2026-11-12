# Modelo de dados — Vitrine por cidade

## Rascunho (`drafts.content.locality`)

| Campo | Tipo | Regra |
|---|---|---|
| `listed` | boolean | padrão `false`; `true` exige `city` e `uf` |
| `city` | string | 2–60 caracteres; letras, espaços, `.`, `'`, `’`, `-`; espaços normalizados |
| `uf` | string | uma das 27 UFs (`BRAZIL_UFS`) |

## Manifesto público (`publications.menu.locality`)

Presente só quando `listed = true`: `{ city, uf, citySlug }`, com `citySlug = slugifyCity(city, uf)` (ex.: `porto-alegre-rs`). Qualquer outra chave é recusada como vazamento.

## `public.city_listings` (derivada; escrita só pelo trigger)

| Coluna | Tipo | Público (`anon`) |
|---|---|---|
| `site_id` | uuid FK `sites` on delete cascade | **não** |
| `item_position` | smallint (1–999), PK com `site_id` | sim |
| `city_slug`, `city`, `uf` | text | sim |
| `site_slug`, `site_name` | text | sim |
| `item_id`, `item_name` | text | sim |
| `price_mode` | `offer` \| `donation` \| `trade` | sim |
| `price_cents` | bigint ≥ 0 (mínimo do lance; 0 nos demais) | sim |
| `description` (≤280), `conditions` (≤240), `trade_for` (≤240) | text null | sim |
| `image_url` | text https null | sim |
| `published_at` | timestamptz | sim |
| `sort_key` | text único `epoch_us(16)~slug~(999−posição)(3)` | sim |

Índices: `(city_slug, sort_key desc)` e `(city_slug, price_mode, sort_key desc)`.

## `public.city_listing_cities` (view, `security_invoker`)

`city_slug`, `city` (grafia mais recente), `uf`, `offer_count`, `donation_count`, `trade_count`, `total_count`.

## Ciclo de vida

| Evento | Efeito |
|---|---|
| Publicar com autorização | linhas da vitrine recriadas |
| Publicar sem autorização / localidade inválida | linhas apagadas |
| Reverter versão (`rollback_showcase`) ou alternância rápida | trigger roda no `update` e reflete a versão ativa |
| Excluir vitrine | cascade remove as linhas |
