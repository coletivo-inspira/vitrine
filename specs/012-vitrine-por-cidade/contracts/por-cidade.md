# Contrato público — Por cidade

Somente leitura, sem autenticação. Cache: `public, max-age=300, stale-while-revalidate=86400` (200); `no-store` em 404/503. Parâmetros fora da lista abaixo são ignorados e não criam entradas de cache.

## HTML

| Rota | Resposta |
|---|---|
| `GET /por-cidade` | índice de cidades por UF |
| `GET /por-cidade/<cidade-uf>` | itens da cidade |
| `?modo=lance\|doacao\|troca` | filtro por modo (ausente = todos) |
| `?depois=<cursor>` | próxima página; cursor inválido volta ao início; páginas com cursor levam `noindex, follow` |

Cidade sem itens: 404 com `noindex`. Banco indisponível: 503.

## JSON

### `GET /data/por-cidade/index.json`

```json
{
  "schemaVersion": 1,
  "cities": [
    { "citySlug": "porto-alegre-rs", "city": "Porto Alegre", "uf": "RS",
      "counts": { "offer": 3, "donation": 2, "trade": 3, "total": 8 } }
  ]
}
```

### `GET /data/por-cidade/<cidade-uf>.json[?modo=&depois=]`

```json
{
  "schemaVersion": 1,
  "city": { "citySlug": "porto-alegre-rs", "city": "Porto Alegre", "uf": "RS", "counts": { "offer": 3, "donation": 2, "trade": 3, "total": 8 } },
  "mode": "todos",
  "items": [
    {
      "vitrine": { "slug": "bazar-da-ana", "name": "Bazar da Ana", "url": "/bazar-da-ana" },
      "item": { "id": "bike", "name": "Bicicleta aro 26", "priceMode": "offer", "priceCents": 18000,
                "description": "…", "imageUrl": "https://…" },
      "publishedAt": "2026-11-12T11:00:00.000Z",
      "auction": null
    }
  ],
  "nextCursor": "1794481200000000~bazar-da-ana~998"
}
```

- `item.conditions` (doação) e `item.tradeFor` (troca) aparecem quando preenchidos.
- Nunca aparecem: WhatsApp, `siteId`, dados do proprietário.
- `auction` é reservado para a spec 013 (ver research D10); hoje é sempre `null`.
- Erros: `{ "error": { "code": "CITY_NOT_FOUND" | "CITY_PAGE_UNAVAILABLE", "message": "…" } }`.

## Ponto de encaixe com a spec 013 (leilão)

1. Nova migração adiciona colunas de resumo do leilão em `public.city_listings` (ex.: `auction_status`, `auction_top_bid_cents`, `auction_ends_at`) e as preenche no trigger ou no fluxo de lances.
2. `toPublicListing()` (`src/city-listings.mjs`) passa a montar `auction` a partir dessas colunas; `CITY_LISTING_COLUMNS` (`workers/api.mjs`) inclui as colunas.
3. `describeListingPrice()` mostra o maior lance e o prazo quando `auction` existir.
4. Se a 013 criar um novo `priceMode`, incluí-lo em `CITY_LISTING_PRICE_MODES`, no `check` de `price_mode` e no filtro do trigger.
