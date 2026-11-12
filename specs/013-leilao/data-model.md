# Data Model: Leilão (`013-leilao`)

## Item da vitrine (rascunho e publicação)

| Campo | Tipo | Regra |
|-------|------|-------|
| `priceMode` | `"offer"` | já existente |
| `priceCents` | inteiro | lance inicial; `0` = R$ 1,00 |
| `auctionEndsAt` | string ISO 8601 | opcional; até 60 dias à frente; publicado normalizado em UTC |
| `bidIncrementCents` | inteiro | opcional; 100 a 1.000.000; padrão 100 |

## `public.auction_lots`

| Coluna | Tipo | Regra |
|--------|------|-------|
| `id` | uuid PK | |
| `site_id` | uuid FK `sites` | `on delete cascade` |
| `item_id` | text | 1–64 |
| `item_name` | text | 1–160, cópia no primeiro lance |
| `start_cents` | bigint | 100–100.000.000 |
| `increment_cents` | bigint | 100–1.000.000 |
| `scheduled_ends_at` | timestamptz | prazo publicado no primeiro lance |
| `ends_at` | timestamptz | `>= scheduled_ends_at` e `<= scheduled_ends_at + 60 min` |
| `highest_bid_id` | uuid | sem FK (evita ciclo); nulo sem lances válidos |
| `highest_cents` | bigint | nulo sem lances válidos |
| `bid_count` | integer | lances válidos |
| `personal_data_purged_at` | timestamptz | preenchido na limpeza de 90 dias |
| `created_at`, `updated_at` | timestamptz | |

Único: `(site_id, item_id, scheduled_ends_at)`.

## `public.auction_bids`

| Coluna | Tipo | Regra |
|--------|------|-------|
| `id` | uuid PK | |
| `lot_id` | uuid FK `auction_lots` | cascade |
| `site_id` | uuid FK `sites` | cascade |
| `amount_cents` | bigint | 100–100.000.000 |
| `bidder_name` | text | 2–60 |
| `bidder_whatsapp` | text | `^[1-9][0-9]{7,14}$` |
| `visitor_key` | text | `^[a-f0-9]{32,64}$`; sem grant de leitura |
| `status` | text | `valid` ou `void` |
| `void_reason`, `voided_at`, `voided_by` | | preenchidos ao desconsiderar |
| `created_at` | timestamptz | |

## `public.auction_blocks`

`id`, `site_id`, `bidder_whatsapp` (opcional), `visitor_key` (opcional, sem grant), `reason`, `created_by`, `created_at`. Pelo menos um dos identificadores.

## `private.auction_settings`

Linha única (`id = true`) com `bid_key_sha256` (64 hex). Sem grants.

## Transições

```text
(sem lote) --1º lance válido--> aberto --now() >= ends_at--> encerrado
aberto --lance nos 3 min finais--> aberto (ends_at prorrogado, teto +60 min)
lance válido --desconsiderar--> void (líder recalculado; lote pode voltar a "sem lances")
encerrado + 90 dias --próximo lance da vitrine--> lances apagados, totais mantidos
```

## RLS e grants

- `anon`: nenhum acesso às tabelas; `execute` em `read_auction_board` e `place_auction_bid` (esta exige o cabeçalho do canal).
- `authenticated`: `select` de colunas sem `visitor_key` quando `private.has_site_role(site_id, {owner,admin})`; `execute` em `void_auction_bid` (verifica papel internamente).
- Nenhum `insert/update/delete` direto.
