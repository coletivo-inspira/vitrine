# Contrato da API do Portal (`workers/api.mjs`)

**Features**: `004-catalog-editor` e `007-admin-portal-shell`  
**Date**: 2026-11-11

---

## 1. Autenticação, Sessão e Formato de Erros

### 1.1. Credenciais Aceitas
1. Header HTTP `Authorization: Bearer <jwt>`
2. Cookie host-only `__Host-vitrine_session=<jwt>` (`Secure; HttpOnly; SameSite=Lax; Path=/`)

### 1.2. Envelope Padrão de Erro
```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Mensagem clara em português para exibição segura."
  }
}
```

### 1.3. `GET /api/auth/session`
- **Autenticado (`200 OK`)**:
  ```json
  {
    "authenticated": true,
    "user": {
      "id": "10000000-0000-0000-0000-000000000001"
    }
  }
  ```
- **Não autenticado (`401 Unauthorized`)**:
  ```json
  {
    "error": {
      "code": "UNAUTHORIZED",
      "message": "Sessão inválida ou expirada."
    }
  }
  ```

### 1.4. `POST /api/auth/logout`
- **Resposta (`200 OK`)**:
  - Header: `Set-Cookie: __Host-vitrine_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`
  - Body:
    ```json
    {
      "ok": true
    }
    ```

---

## 2. Gestão de Vitrines (`/api/sites`)

### 2.1. `GET /api/sites`
- Requer sessão válida (`401 UNAUTHORIZED` se ausente ou inválida).
- Retorna apenas vitrines nas quais o usuário é proprietário (`role: "owner"`) ou membro em `site_memberships` (`role: "member"`).
- **Resposta (`200 OK`)**:
  ```json
  {
    "sites": [
      {
        "id": "20000000-0000-0000-0000-000000000001",
        "slug": "pizzaria-bella",
        "name": "Pizzaria Bella",
        "template": "pizzeria-v1",
        "role": "owner",
        "updatedAt": "2026-11-11T00:00:00.000Z"
      }
    ]
  }
  ```

### 2.2. `POST /api/sites`
- Requer sessão válida (`401 UNAUTHORIZED` se ausente ou inválida).
- **Request Body**:
  ```json
  {
    "name": "Pizzaria Bella",
    "slug": "pizzaria-bella",
    "template": "pizzeria-v1"
  }
  ```
- **Validações**:
  - `slug`: minúsculo `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3 a 40 caracteres, proibindo slugs reservados (`admin`, `api`, `auth`, `app`, `www`, `portal`, `assets`, `data`, `login`, `logout`) -> `400 Bad Request` (`code: "INVALID_SLUG"`).
  - `slug` já cadastrado -> `409 Conflict` (`code: "SLUG_TAKEN"`).
- **Resposta (`201 Created`)**:
  ```json
  {
    "site": {
      "id": "20000000-0000-0000-0000-000000000001",
      "slug": "pizzaria-bella",
      "name": "Pizzaria Bella",
      "template": "pizzeria-v1",
      "role": "owner",
      "updatedAt": "2026-11-11T00:00:00.000Z"
    },
    "draft": {
      "siteId": "20000000-0000-0000-0000-000000000001",
      "revision": 1,
      "updatedAt": "2026-11-11T00:00:00.000Z",
      "content": {
        "schemaVersion": 1,
        "template": "pizzeria-v1",
        "slug": "pizzaria-bella",
        "businessName": "Pizzaria Bella",
        "whatsapp": "5511999999999",
        "categories": []
      }
    }
  }
  ```

---

## 3. Rascunhos de Cardápio (`/api/sites/:siteId/draft`)

### 3.1. `GET /api/sites/:siteId/draft`
- Requer sessão válida (`401 UNAUTHORIZED` se ausente ou inválida).
- Se a vitrine não existir ou o usuário não for `owner` nem membro em `site_memberships`: retorna `404 Not Found` (`code: "SITE_NOT_FOUND"`).
- **Resposta (`200 OK`)**:
  ```json
  {
    "draft": {
      "siteId": "20000000-0000-0000-0000-000000000001",
      "revision": 1,
      "updatedAt": "2026-11-11T00:00:00.000Z",
      "content": {
        "schemaVersion": 1,
        "template": "pizzeria-v1",
        "slug": "pizzaria-bella",
        "businessName": "Pizzaria Bella",
        "whatsapp": "5511999999999",
        "categories": []
      }
    }
  }
  ```

### 3.2. `PUT /api/sites/:siteId/draft`
- Requer sessão válida (`401 UNAUTHORIZED` se ausente ou inválida).
- Se o usuário não tiver acesso à vitrine `:siteId`: retorna `404 Not Found` (`code: "SITE_NOT_FOUND"`).
- **Request Body**:
  ```json
  {
    "revision": 1,
    "content": {
      "schemaVersion": 1,
      "template": "pizzeria-v1",
      "slug": "pizzaria-bella",
      "businessName": "Pizzaria Bella",
      "whatsapp": "5511999999999",
      "categories": []
    }
  }
  ```
- **Tabela de Status e Códigos de Erro**:
  - `413 Payload Too Large` (`code: "DRAFT_TOO_LARGE"`): `content` serializado em UTF-8 > `262144` bytes (256 KiB).
  - `400 Bad Request` (`code: "INVALID_REVISION"`): `revision` não é inteiro seguro `>= 1`.
  - `422 Unprocessable Entity` (`code: "INVALID_PRICE_CENTS"`): item com `priceCents` não inteiro ou `<= 0`.
  - `422 Unprocessable Entity` (`code: "ACTIVE_ITEMS_LIMIT_EXCEEDED"`): mais de 20 itens ativos (`available !== false` / `active !== false`).
  - `422 Unprocessable Entity` (`code: "TOTAL_ITEMS_LIMIT_EXCEEDED"`): mais de 100 itens totais (ativos + ocultos).
  - `422 Unprocessable Entity` (`code: "INVALID_WHATSAPP"`): `whatsapp` fora do padrão `^[1-9]\d{7,14}$`.
  - `409 Conflict` (`code: "REVISION_CONFLICT"`): `revision` enviada difere da revisão atual salva, retornando `currentRevision`.
  - `200 OK`: retorna `{ "draft": { "siteId", "revision": revision + 1, "updatedAt", "content" } }`.
