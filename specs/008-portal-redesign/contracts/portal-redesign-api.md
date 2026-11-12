# Contrato da API: Repaginação do Portal, Catálogo por Componentes e Insights (`008-portal-redesign`)

**Feature**: `008-portal-redesign`  
**Date**: 2026-11-12  
**Spec**: [../spec.md](../spec.md) | **Data Model**: [../data-model.md](../data-model.md)

---

## 1. Regras Globais de Segurança no Worker (`workers/api.mjs`)

1. **Autenticação**: Todas as rotas administrativas (`/api/profile`, `/api/customization-requests`, `/api/sites`, `/api/sites/:id/draft`, `/api/sites/:id/publish`, `/api/sites/:id/insights`) exigem sessão válida via `Authorization: Bearer <jwt>` ou cookie host-only `__Host-vitrine_session=<jwt>`. Ausência ou invalidez retorna `401 Unauthorized` (`code: "UNAUTHORIZED"`).
2. **Verificação de `Origin` e `Content-Type` em Mutações**: Todas as requisições `POST`, `PUT`, `PATCH` ou `DELETE` em rotas autenticadas DEVEM validar:
   - Header `Origin` presente e idêntico a `new URL(request.url).origin` -> caso contrário, `403 Forbidden` (`code: "FORBIDDEN_ORIGIN"`).
   - Header `Content-Type` iniciando com `application/json` (quando a rota recebe corpo JSON) -> caso contrário, `415 Unsupported Media Type` (`code: "UNSUPPORTED_MEDIA_TYPE"`).
3. **Envelope de Erro Padronizado**:
   ```json
   {
     "error": {
       "code": "ERROR_CODE",
       "message": "Mensagem clara em português."
     }
   }
   ```

---

## 2. Perfil e Interesses (`/api/profile`) — PR (a)

### 2.1. `GET /api/profile`
- **Resposta (`200 OK`)**:
  ```json
  {
    "profile": {
      "userId": "10000000-0000-0000-0000-000000000001",
      "displayName": "Maria Silva",
      "businessName": "Ateliê Maria",
      "city": "Porto Alegre, RS",
      "whatsapp": "5551999999999",
      "interests": ["cardapio-digital", "identidade-visual"],
      "completeness": {
        "percent": 100,
        "missingFields": []
      },
      "updatedAt": "2026-11-12T00:00:00.000Z"
    }
  }
  ```
  *(Se o usuário ainda não salvou perfil, retorna valores vazios default e `completeness.percent: 0` com `200 OK`.)*

### 2.2. `PUT /api/profile`
- Exige sessão válida (`401`), `Origin` igual (`403`) e `Content-Type: application/json` (`415`).
- **Request Body**:
  ```json
  {
    "displayName": "Maria Silva",
    "businessName": "Ateliê Maria",
    "city": "Porto Alegre, RS",
    "whatsapp": "5551999999999",
    "interests": ["cardapio-digital", "identidade-visual"]
  }
  ```
- **Validações (`422 Unprocessable Entity`)**:
  - `displayName`: string `<= 120` chars sem marcação perigosa (`INVALID_PROFILE`).
  - `businessName`: string `<= 160` chars sem marcação perigosa (`INVALID_PROFILE`).
  - `city`: string `<= 120` chars sem marcação perigosa (`INVALID_PROFILE`).
  - `whatsapp`: vazio `""` ou `/^[1-9]\d{7,14}$/` (`INVALID_WHATSAPP`).
  - `interests`: array de até 8 slugs pertencentes à lista permitida (`INVALID_INTERESTS`).
- **Resposta (`200 OK`)**: retorna `{ "profile": { ... } }` atualizado.

---

## 3. Pedidos de Customização (`/api/customization-requests`) — PR (a)

### 3.1. `GET /api/customization-requests`
- Retorna apenas os pedidos pertencentes a `auth.uid()`, ordenados do mais recente para o mais antigo.
- **Resposta (`200 OK`)**:
  ```json
  {
    "requests": [
      {
        "id": "30000000-0000-0000-0000-000000000001",
        "siteId": null,
        "storefrontType": "health",
        "templateInterest": "clinica-integrada",
        "goal": "Preciso de uma vitrine para clínica multidisciplinar com páginas por especialidade.",
        "referenceUrls": ["https://nexaenfermagem.hudilabs.com/"],
        "desiredDeadline": "Dezembro/2026",
        "status": "novo",
        "createdAt": "2026-11-12T00:00:00.000Z",
        "updatedAt": "2026-11-12T00:00:00.000Z"
      }
    ]
  }
  ```

### 3.2. `POST /api/customization-requests`
- Exige sessão válida (`401`), `Origin` igual (`403`) e `Content-Type: application/json` (`415`).
- **Request Body**:
  ```json
  {
    "siteId": null,
    "storefrontType": "health",
    "templateInterest": "clinica-integrada",
    "goal": "Preciso de uma vitrine para clínica multidisciplinar com páginas por especialidade.",
    "referenceUrls": ["https://nexaenfermagem.hudilabs.com/"],
    "desiredDeadline": "Dezembro/2026"
  }
  ```
- **Validações (`400` / `422`)**:
  - `storefrontType`: `'food' | 'art' | 'photo' | 'health' | 'tech'` (`INVALID_STOREFRONT_TYPE`).
  - `templateInterest`: 1 a 120 caracteres (`INVALID_TEMPLATE_INTEREST`).
  - `goal`: 10 a 2000 caracteres sem payload executável (`INVALID_GOAL`).
  - `referenceUrls`: array de até 10 URLs HTTPS públicas válidas via `validateSafePublicHttpsUrl` (`INVALID_URL`).
  - `desiredDeadline`: opcional, até 120 caracteres.
- **Resposta (`201 Created`)**: `{ "request": { ... } }` com `status: "novo"`.

---

## 4. Criação e Listagem de Vitrines (`/api/sites`) — PR (a)

### 4.1. `POST /api/sites` (Estendido)
- Exige sessão (`401`), `Origin` igual (`403`) e `Content-Type: application/json` (`415`).
- **Request Body**:
  ```json
  {
    "name": "Barbearia Dom Pedro",
    "slug": "barbearia-dom-pedro",
    "storefrontType": "health",
    "template": "booking-v1",
    "catalogType": "booking"
  }
  ```
- **Regras de Compatibilidade**:
  - `storefrontType` default `'food'` (valores aceitos: `'food'`, `'art'`, `'photo'`, `'health'`, `'tech'`).
  - `template` default `'pizzeria-v1'` (valores aceitos: `'pizzeria-v1'`, `'products-v1'`, `'booking-v1'`, `'quote-v1'`).
  - Inicializa o rascunho na `revision: 1` com a estrutura de componentes correspondente ao `template` / `catalogType`.

---

## 5. Coleta de Eventos e Painel de Insights — PR (e)

### 5.1. `POST /api/events` (Rota Pública com Proteções de Borda)
- **Autenticação**: Pública (chamada via `navigator.sendBeacon` pela vitrine pública).
- **Proteções Obrigatórias**:
  1. `Content-Type` deve iniciar com `application/json` -> caso contrário, `415 UNSUPPORTED_MEDIA_TYPE`.
  2. Tamanho bruto do corpo `<= 16384` bytes (16 KiB) e `events.length` entre `1` e `25` -> caso contrário, `400 INVALID_EVENTS_BATCH`.
  3. Filtro de `User-Agent`: se corresponder a robôs/crawlers (`bot|crawler|spider|headless|slurp|facebookexternalhit|whatsapp|preview|curl|wget|python/i`), retorna `202 Accepted` (`{ "accepted": 0, "ignored": "bot" }`) sem gravar no banco.
  4. A vitrine identificada por `slug` deve existir como vitrine publicada ativa -> caso contrário, `404 PUBLICATION_NOT_FOUND`.
  5. Para eventos `item_view` e `item_select`, `itemId` deve existir na lista `menu.items` da publicação ativa daquela vitrine; itens inexistentes são descartados/rejeitados (`422 INVALID_EVENT_ITEM`).
  6. Nenhum cabeçalho de IP (`CF-Connecting-IP`, `X-Forwarded-For`), cookie ou identificador de usuário é lido ou persistido.
- **Request Body**:
  ```json
  {
    "slug": "loja1",
    "events": [
      { "type": "visit", "hour": 19 },
      { "type": "item_view", "itemId": "margherita-verace", "hour": 19 },
      { "type": "item_select", "itemId": "margherita-verace", "count": 2, "hour": 19 },
      { "type": "whatsapp_order", "estimatedCents": 9600, "hour": 19 }
    ]
  }
  ```
- **Resposta (`202 Accepted`)**:
  ```json
  {
    "accepted": 4
  }
  ```

### 5.2. `GET /api/sites/:siteId/insights?period=7d|30d|90d`
- **Autenticação**: Exige sessão válida (`401`) onde o usuário é `owner` ou `member` da vitrine `:siteId` (caso contrário, `404 SITE_NOT_FOUND`).
- **Parâmetro `period`**: `'7d'` (default), `'30d'` ou `'90d'`.
- **Resposta (`200 OK`)**:
  ```json
  {
    "insights": {
      "siteId": "20000000-0000-0000-0000-000000000001",
      "period": "7d",
      "summary": {
        "visits": 140,
        "previousVisits": 100,
        "orders": 28,
        "previousOrders": 20,
        "conversionPercent": 20.0,
        "previousConversionPercent": 20.0,
        "estimatedCents": 134400,
        "previousEstimatedCents": 96000
      },
      "topItems": [
        {
          "itemId": "margherita-verace",
          "name": "Margherita Verace",
          "categoryName": "Pizzas Clássicas",
          "views": 85,
          "selections": 34,
          "previousSelections": 24,
          "deltaPercent": 41.7
        }
      ],
      "topCategories": [
        {
          "categoryId": "pizzas-classicas",
          "name": "Pizzas Clássicas",
          "selections": 48
        }
      ],
      "byDay": [
        { "date": "2026-11-06", "visits": 18, "orders": 4 }
      ],
      "byHour": [
        { "hour": 18, "visits": 32, "orders": 9 },
        { "hour": 19, "visits": 45, "orders": 12 }
      ],
      "highlights": [
        "Margherita Verace foi o item mais escolhido nesta semana, 42% a mais que na anterior.",
        "Seus pedidos se concentram entre 18h e 20h."
      ]
    }
  }
  ```

---

## 6. Upload de Fotos do Catálogo (`/api/sites/:siteId/upload`) — PR (c)

- **Método**: `POST`
- **Autenticação**: Exige sessão válida (`401 UNAUTHORIZED`) via cookie HttpOnly `__Host-vitrine_session` (ou `Authorization: Bearer`) onde o usuário é proprietário ou colaborador da vitrine `:siteId` (caso contrário, `404 SITE_NOT_FOUND`). O token de sessão jamais é exposto ao JavaScript cliente em `/api/auth/session`.
- **Headers Obrigatórios**:
  - `Origin`: presente e idêntico a `new URL(request.url).origin` (`403 FORBIDDEN_ORIGIN`).
  - `Content-Type`: `image/webp` (`415 UNSUPPORTED_MEDIA_TYPE`).
- **Parâmetros de Consulta (Query)**:
  - `itemId`: opcional (`^[a-z0-9][a-z0-9._-]{0,63}$`, sem `..`; inválido retorna `422 INVALID_IMAGE_PATH`).
- **Corpo da Requisição e Validação Server-Side**:
  - Binário WebP válido (assinatura mágica `RIFF....WEBP`, caso contrário `422 INVALID_IMAGE`).
  - Não vazio (`400 EMPTY_FILE`) e tamanho `<= 204800` bytes (`200 KiB`; payloads maiores retornam `413 FILE_TOO_LARGE`).
  - O Worker encaminha o upload ao bucket `catalog-images` no Supabase Storage usando o JWT de sessão no servidor (`502 STORAGE_UPLOAD_ERROR` em falha upstream).
- **Resposta (`200 OK`)**:
  ```json
  {
    "imageUrl": "https://qawlpsrfewosxsfgmmpm.supabase.co/storage/v1/object/public/catalog-images/20000000-0000-0000-0000-000000000001/item-123-a1b2c3d4.webp",
    "path": "20000000-0000-0000-0000-000000000001/item-123-a1b2c3d4.webp",
    "bytes": 18432
  }
  ```

