# Contrato: API de leilões (`013-leilao`)

Todas as respostas JSON usam `cache-control: no-store` e os cabeçalhos de segurança do Worker. Erros seguem `{ "error": { "code", "message", ... } }`.

## `GET /api/public/auctions/:slug`

Público. Também atende no domínio personalizado da vitrine.

```json
{
  "serverNow": "2026-11-12T19:00:00.000Z",
  "lots": [
    {
      "itemId": "vaso-raro",
      "status": "open",
      "endsAt": "2026-11-20T21:00:00.000Z",
      "scheduledEndsAt": "2026-11-20T21:00:00.000Z",
      "startCents": 5000,
      "incrementCents": 500,
      "currentCents": 8500,
      "nextMinCents": 9000,
      "bidCount": 3,
      "leadingRef": "1f2e3d4c",
      "recentBids": [{ "amountCents": 8500, "placedAt": "2026-11-12T18:59:10.000Z" }]
    }
  ]
}
```

`status`: `open` | `closed`. Só itens de leilão da publicação ativa. `404 PUBLICATION_NOT_FOUND`.

## `POST /api/public/auctions/:slug/bids`

Exige `Origin` igual ao host, `Content-Type: application/json`, corpo ≤ 2 KiB.

```json
{ "itemId": "vaso-raro", "amountCents": 9000, "name": "Ana Souza", "whatsapp": "5551999998888", "consent": true, "website": "" }
```

`201`:

```json
{ "bid": { "ref": "9a8b7c6d", "amountCents": 9000, "placedAt": "..." }, "lot": { "...": "mesmo formato do quadro" } }
```

| Status | Código | Quando |
|--------|--------|--------|
| 400 | `INVALID_BID` | corpo inválido, nome/WhatsApp/valor fora do formato, sem consentimento |
| 403 | `FORBIDDEN_ORIGIN` | origem diferente |
| 403 | `BIDDER_BLOCKED` | contato bloqueado na vitrine |
| 403 | `BIDDER_IS_OWNER` | WhatsApp da própria vitrine |
| 404 | `PUBLICATION_NOT_FOUND` / `AUCTION_NOT_FOUND` | vitrine ou item de leilão inexistente |
| 409 | `AUCTION_CLOSED` | após o encerramento |
| 409 | `ALREADY_LEADING` | quem lidera tentou cobrir o próprio lance |
| 409 | `AUCTION_BID_LIMIT` | lote com 300 lances |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | sem JSON |
| 422 | `BID_TOO_LOW` | abaixo do mínimo; inclui `requiredCents` |
| 422 | `BID_TOO_HIGH` | acima de 10× o mínimo ou R$ 1.000.000,00 |
| 429 | `BID_RATE_LIMITED` | intervalo/limite por visitante |
| 429 | `TOO_MANY_IDENTITIES` | mais de 3 WhatsApps por visitante no lote |
| 503 | `AUCTIONS_UNAVAILABLE` | segredo do canal ausente ou banco indisponível |

Campo isca preenchido ou agente de robô: `202 { "accepted": false }` sem gravar.

## `GET /api/sites/:siteId/auctions`

Sessão obrigatória; papel `owner` ou `admin` (demais: `404 SITE_NOT_FOUND`).

```json
{
  "auctions": [
    {
      "lotId": "uuid", "itemId": "vaso-raro", "itemName": "Vaso raro",
      "status": "closed", "endsAt": "...", "scheduledEndsAt": "...",
      "startCents": 5000, "incrementCents": 500, "currentCents": 9000, "bidCount": 4,
      "personalDataPurged": false,
      "winner": { "bidId": "uuid", "name": "Ana Souza", "whatsapp": "5551999998888", "amountCents": 9000, "placedAt": "..." },
      "bids": [{ "id": "uuid", "amountCents": 9000, "name": "Ana Souza", "whatsapp": "5551999998888", "status": "valid", "voidReason": null, "voidedAt": null, "placedAt": "..." }]
    }
  ]
}
```

`winner` é o líder atual (aberto) ou vencedor (encerrado).

## `POST /api/sites/:siteId/auctions/bids/:bidId/void`

Sessão, `Origin` igual ao host, JSON `{ "reason": "Não respondeu em 48 h", "block": true }`. `200 { "auction": { ... } }`. Erros: `401`, `403 FORBIDDEN_ORIGIN`, `404 SITE_NOT_FOUND`/`BID_NOT_FOUND`, `409 BID_ALREADY_VOID`, `422 INVALID_VOID_REASON`.

## Funções SQL (PostgREST)

| Função | Quem executa | Observação |
|--------|--------------|------------|
| `public.read_auction_board(target_slug text) → jsonb` | `anon`, `authenticated` | sem dados pessoais |
| `public.place_auction_bid(target_slug, target_item_id, bidder_name, bidder_whatsapp, amount_cents, visitor_key) → jsonb` | `anon`, `authenticated` | exige cabeçalho `x-vitrine-bid-key` |
| `public.void_auction_bid(target_bid uuid, void_reason text, block_bidder boolean) → jsonb` | `authenticated` | exige `owner`/`admin` |
