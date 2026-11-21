# Contrato: área "Clientes" da Administração da plataforma (`016`)

Mesmas regras de acesso da [fila de revisões](admin-html-reviews-api.md): só `platform_admin`,
conferido no Worker e nas RPCs (`admin_list_clients`, `admin_read_client`), `403
FORBIDDEN_PLATFORM_ADMIN` para os demais (FR-049). Respostas `no-store`. Nenhum e-mail, telefone
ou documento do cliente aparece nestas respostas: só nome do negócio, endereços e situação.

## Chave do cliente

- `tenant:<uuid>` — organização cliente (`public.tenants`).
- `owner:<uuid>` — proprietário cujas vitrines não têm organização (`sites.tenant_id` nulo).

## `GET /api/admin/clients`

| Parâmetro | Regra |
| --- | --- |
| `q` | até 80 caracteres; busca no nome do negócio (organização, perfil ou nome da vitrine), no endereço da vitrine (`slug`) ou no código `#VI-XXXXXX-XXXX` |
| `filter` | zero ou mais de `pending_review`, `external_project`, `customization` (FR-044); combinados com E |
| `after` | cursor opaco devolvido em `next` |
| `limit` | 1–50, padrão 25 |

Código da vitrine: o Worker normaliza com `normalizeMilaRelayCode`, filtra endereços pelo prefixo
e confirma com `buildMilaRelayCode` (`web/assets/mila-relay.mjs`), sem coluna nova.

`200`:

```json
{
  "clients": [
    {
      "key": "tenant:1f…",
      "name": "Orbit Estúdio",
      "plan": { "code": "profissional", "name": "Profissional", "subscriptionStatus": "active" },
      "sites": [{ "id": "…", "slug": "orbit", "code": "VI-ORBIT-7K2Q", "name": "Orbit" }],
      "flags": { "pendingReviews": 1, "externalProject": "active", "customizations": 2 }
    }
  ],
  "next": null
}
```

`422 INVALID_CLIENT_QUERY` para filtro desconhecido ou `q` longo.

## `GET /api/admin/clients/:clientKey`

Ficha do cliente (FR-045). Cada grupo pode falhar sozinho: `{ "error": { "code", "message" } }`
no lugar dos dados, para o painel mostrar "Tentar novamente" só naquele grupo (FR-055).

```json
{
  "client": { "key": "tenant:1f…", "name": "Orbit Estúdio" },
  "summary": {
    "plan": { "code": "profissional", "name": "Profissional" },
    "subscription": { "status": "active", "currentPeriodEnd": "…" },
    "siteCount": 1
  },
  "sites": [
    { "id": "…", "slug": "orbit", "code": "VI-ORBIT-7K2Q", "name": "Orbit",
      "published": true, "paused": false, "archived": false }
  ],
  "customizations": [
    { "id": "…", "siteId": "…", "kind": "external_project", "startsOn": "2026-11-21",
      "endsOn": null, "inForce": true, "sourceRequestId": "…", "internalNote": "…" }
  ],
  "htmlContent": {
    "packages": [{ "siteId": "…", "id": "7a1c…", "name": "Protótipo Orbit", "origin": "owner",
      "versions": [{ "id": "…", "number": 1, "state": "approved", "inUse": true }] }],
    "pendingReviews": [{ "versionId": "…", "submittedAt": "…" }],
    "uploadsSuspended": []
  },
  "externalProjects": [{ "siteId": "…", "state": "active", "targetHost": "orbit.cliente.com.br",
    "scope": "page", "pageSlug": "prototipo-orbit" }],
  "domains": [{ "siteId": "…", "hostname": "cardapio.cliente.com.br", "status": "active" }],
  "history": [{ "action": "html_version_approved", "entityType": "html_package_version",
    "siteId": "…", "actor": "operator", "createdAt": "…", "summary": { … } }],
  "notices": [{ "id": "…", "kind": "external_link_target_down", "siteId": "…", "createdAt": "…" }]
}
```

- `history`: últimos 50 registros de `audit_logs` das vitrines do cliente, mais os de
  customização e assinatura do cliente.
- `notices`: avisos `operator` não lidos das vitrines do cliente.
- `404 CLIENT_NOT_FOUND` para chave inexistente; `422 INVALID_CLIENT_KEY` para formato inválido.

## Customizações contratadas

### `POST /api/admin/clients/:clientKey/customizations`

```json
{
  "siteId": "…",
  "kind": "external_project",
  "startsOn": "2026-11-21",
  "endsOn": null,
  "sourceRequestId": "…",
  "internalNote": "Contrato de 12 meses."
}
```

`201` com a customização. `422 INVALID_CUSTOMIZATION` (campo em `fieldErrors`), `409
CUSTOMIZATION_ALREADY_IN_FORCE` (mesmo tipo vigente na vitrine), `404 SITE_NOT_FOUND` (vitrine
não pertence ao cliente).

### `PATCH /api/admin/customizations/:id`

Edita `endsOn`, `internalNote`, `sourceRequestId`, ou encerra com `{ "end": true, "reason": "…" }`.
Encerrar mantém a vigência por mais 7 dias (tolerância); depois disso o Cron desativa o
projeto externo e avisa (edge case da spec).

## Ajustes nas rotas existentes (FR-047, U-02)

- `GET /api/admin/customization-requests`: cada pedido ganha `client: { key, name }` e
  `site: { id, slug } | null`.
- `GET /api/admin/audit-logs`: cada registro ganha `client: { key, name } | null` e
  `actor: "operator" | "owner" | "member" | "system"` (sem id pessoal).
- `GET /api/admin/overview`: ganha `pendingHtmlReviews`, `htmlStorageBytes`,
  `htmlStorageLimitBytes`, `externalProjectsActive`, `externalProjectsSuspended` e
  `databaseAlert: true` quando `databaseBytes > 0.8 × databaseLimitBytes` (SC-009).
- Pedido de customização do proprietário (`POST /api/customization-requests`) passa a exigir
  `siteId` de uma vitrine da equipe da pessoa (U-16); o campo `storefrontType` deixa de vir
  preenchido por padrão no formulário.
