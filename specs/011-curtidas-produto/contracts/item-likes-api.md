# Contrato: API de Curtidas (`011-curtidas-produto`)

## `GET /api/likes?slug=<slug>`

Público. Não cria cookie.

- `200` — `{ "slug": "loja1", "counts": { "margherita-verace": 3 }, "liked": ["margherita-verace"] }`
  - `counts` contém apenas itens da versão ativa com pelo menos 1 curtida.
  - `liked` lista os itens curtidos pelo visitante do cookie (vazio sem cookie).
  - Cabeçalho `cache-control: private, no-store`.
- `400 INVALID_SLUG`, `404 PUBLICATION_NOT_FOUND`, `503 LIKES_UNAVAILABLE`.

## `POST /api/likes`

Público, mesma origem.

Requisição:

```json
{ "slug": "loja1", "itemId": "margherita-verace", "liked": true }
```

- Exige `Origin` igual à origem do host, `Content-Type: application/json`, corpo ≤ 1024 bytes.
- `200` — `{ "itemId": "margherita-verace", "liked": true, "count": 4 }`.
  - Define `set-cookie: vitrine_curtidas=<32 hex>; Path=/api/likes; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax` quando o cookie está ausente ou inválido.
  - Repetir `liked: true` não altera a contagem; `liked: false` remove a curtida do visitante.
- Erros: `400 INVALID_LIKE_REQUEST`, `403 FORBIDDEN_ORIGIN`, `403 LIKE_NOT_ALLOWED` (robô), `404 PUBLICATION_NOT_FOUND`, `415 UNSUPPORTED_MEDIA_TYPE`, `422 INVALID_LIKE_ITEM`, `429 LIKE_RATE_LIMITED`, `503 LIKES_UNAVAILABLE`.

## `GET /api/sites/:id/insights?period=7d|30d|90d` (campo novo)

```json
{
  "insights": {
    "likes": {
      "total": 12,
      "periodNew": 5,
      "items": [
        { "itemId": "margherita-verace", "name": "Margherita Verace", "categoryName": "Pizzas", "likes": 7, "periodLikes": 3 }
      ]
    }
  }
}
```

- Ranking com até 10 itens, ordenado por `likes` e depois `periodLikes` e nome; só itens da versão publicada (ou do rascunho, se ainda não publicada).
- Sem associação à vitrine: `404 SITE_NOT_FOUND` (inalterado).
