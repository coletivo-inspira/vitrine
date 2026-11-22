# Contrato: API de Pacotes HTML do proprietário (`016`)

Rotas autenticadas do painel para o dono e os administradores da vitrine (`TEAM_ROLES` =
`owner`, `admin`). Editores e leitores só leem (`GET`). Respostas JSON com `cache-control:
no-store` e os cabeçalhos de segurança do Worker. Erros: `{ "error": { "code", "message", ... } }`.
Mutações exigem `Origin` igual ao host e `Content-Type: application/json`
(`validateMutationOriginAndJson`). Vitrine de outra pessoa responde `404 SITE_NOT_FOUND`, nunca
`403` (não revela existência). Modelo em [data-model.md](../data-model.md) seções 3 a 8.

## Erros comuns

| Status | Código | Quando |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | sem sessão |
| 403 | `FORBIDDEN_ORIGIN` | origem diferente |
| 403 | `FORBIDDEN_ROLE` | editor ou leitor tentando escrever |
| 403 | `PLAN_FEATURE_REQUIRED` | vitrine sem `html_packages`; corpo inclui `feature: "html_packages"` e `requiredPlan: { "code": "essencial", "name": "Essencial" }` |
| 403 | `PLAN_FEATURE_REQUIRED` | pacote novo acima do limite; `feature: "html_packages_limit"`, `limit`, `current`, `requiredPlan` (plano mais barato com limite maior, ou `null`) |
| 403 | `HTML_UPLOADS_SUSPENDED` | envio suspenso pelo operador; inclui `reason` |
| 404 | `SITE_NOT_FOUND` / `HTML_PACKAGE_NOT_FOUND` / `HTML_VERSION_NOT_FOUND` | |
| 413 | `HTML_PACKAGE_TOO_LARGE` | arquivo acima de 524.288 bytes; inclui `bytes` e `limitBytes`; nada é gravado |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | sem JSON |
| 422 | `INVALID_HTML_PACKAGE` | nome, descrição, declaração ou `html` ausente ou inválido; `fieldErrors` por campo |
| 422 | `HTML_DECLARATION_REQUIRED` | sem as duas confirmações da FR-009 |
| 409 | `HTML_VERSION_LIMIT` | pacote já tem 5 versões aprovadas |
| 409 | `HTML_STORAGE_QUOTA` | cota de 3 MiB da vitrine ou teto global atingido; inclui `usedBytes`, `limitBytes` |
| 409 | `HTML_PACKAGE_IN_USE` | exclusão com uso; inclui `usages: [{ "page": "prototipo-orbit", "sectionId": null }]` |
| 409 | `HTML_VERSION_STATE` | transição não permitida a partir do estado atual; inclui `state` |
| 429 | `HTML_UPLOAD_RATE_LIMITED` | mais de 10 envios por vitrine em 10 minutos (por isolate) |

O corpo do pedido de envio pode ter até 1 MiB (JSON com o HTML escapado); o limite de 512 KiB é
medido nos bytes UTF-8 do campo `html`.

## `GET /api/sites/:siteId/html-packages`

Lista pacotes, versões, uso e cotas. Também traz o necessário para o grupo "Conteúdo HTML"
bloqueado (FR-057).

```json
{
  "plan": {
    "feature": true,
    "limit": 1,
    "activePackages": 1,
    "requiredPlan": null,
    "moreLimitPlan": { "code": "profissional", "name": "Profissional" }
  },
  "uploadsSuspended": null,
  "storage": { "usedBytes": 166225, "limitBytes": 3145728 },
  "packages": [
    {
      "id": "7a1c…",
      "name": "Protótipo Orbit",
      "description": "Simulador interativo",
      "origin": "owner",
      "createdAt": "2026-11-21T12:00:00.000Z",
      "versions": [
        {
          "id": "b2d4…",
          "number": 1,
          "sha256": "e888ce2a…d47c",
          "bytes": 166225,
          "state": "approved",
          "label": "Em uso",
          "inUse": true,
          "usages": [{ "page": "prototipo-orbit", "sectionId": null }],
          "externalHosts": ["cdn.tailwindcss.com", "fonts.googleapis.com", "fonts.gstatic.com"],
          "report": { "errors": [], "warnings": [], "info": { "forms": 2, "sendsResize": false } },
          "uploadedAt": "…",
          "submittedAt": "…",
          "decision": { "outcome": "approve", "reason": null, "decidedAt": "…", "byOperator": true }
        }
      ]
    }
  ]
}
```

- `label` é o texto da FR-006 já resolvido ("Com erros", "Pronta para revisão", "Aguardando
  revisão", "Ajustes pedidos", "Recusada", "Aprovada", "Em uso", "Aprovada, fora de uso",
  "Retirada do ar").
- Sem o recurso: `plan.feature = false`, `plan.requiredPlan = { "code": "essencial", "name":
  "Essencial" }`, `packages` traz os pacotes já guardados (FR-059), sem ações de envio.
- O id do revisor não é exposto (`byOperator`).

## `POST /api/sites/:siteId/html-packages`

Cria pacote e versão 1. Confere plano, limite, suspensão e cotas no Worker e no banco.

```json
{
  "name": "Protótipo Orbit",
  "description": "Simulador interativo",
  "html": "<!doctype html>…",
  "declaration": { "rightsHolder": true, "noVisitorData": true }
}
```

`201`:

```json
{
  "package": { "id": "7a1c…", "name": "Protótipo Orbit" },
  "version": {
    "id": "b2d4…", "number": 1, "sha256": "e888…", "bytes": 166225, "state": "ready",
    "report": {
      "errors": [],
      "warnings": [],
      "info": {
        "hosts": ["cdn.tailwindcss.com", "fonts.googleapis.com", "fonts.gstatic.com"],
        "forms": 2,
        "formsNotice": "Formulários só funcionam por script e não enviam dados.",
        "sendsResize": false
      }
    }
  },
  "reused": false
}
```

- Arquivo com erros: `201` com `state: "has_errors"` e `report.errors[]` (`code`, `message`,
  `line`, `column`, `host?`). A versão fica só com o relatório (sem conteúdo).
- Mesmo arquivo já enviado nesta vitrine: `200` com a versão existente e `reused: true` (FR-005).

## `POST /api/sites/:siteId/html-packages/:packageId/versions`

Nova versão de um pacote existente. Mesmo corpo sem `name`/`description`. Não conta no limite de
pacotes (FR-058, US1-8). Respostas iguais às do envio inicial. Se o pacote ainda não está ativo, o
limite é conferido no envio para revisão (abaixo).

## `POST /api/sites/:siteId/html-packages/:packageId/versions/:versionId/submit`

Envia para revisão: `ready` → `pending_review`. Corpo `{}`. `200` com a versão. A versão aprovada
em uso continua no ar durante a revisão (US6-1).

Quando o pacote ainda não está ativo (nenhuma versão `pending_review`, `approved` ou em uso), o
envio conta como entrada de um pacote novo no limite (FR-058) e o Worker e o banco conferem de novo:

| Status | Código | Quando |
| --- | --- | --- |
| 403 | `PLAN_FEATURE_REQUIRED` | a vitrine perdeu o recurso; `feature: "html_packages"` e `requiredPlan` |
| 403 | `PLAN_FEATURE_REQUIRED` | a vitrine já tem o número máximo de pacotes ativos; `feature: "html_packages_limit"`, `limit`, `current`, `requiredPlan` |

## `POST /api/sites/:siteId/html-packages/:packageId/versions/:versionId/preview-token`

Token curto (10 minutos) para a prévia autenticada de versões `ready`, `pending_review`,
`changes_requested` e `approved`. `200`:

```json
{ "embedUrl": "https://sandbox.inspira.dev.br/embed/b2d4…?v=e888…&t=<token>", "expiresAt": "…" }
```

O token é HMAC com `PREVIEW_HMAC_SECRET` (o segredo de `src/preview-token.mjs`) sobre o prefixo
`html-preview`, `versionId`, `sha256` e expiração, num formato próprio para não ser aceito como
token de prévia de rascunho. Funciona como portador: o host isolado não recebe o cookie de sessão
(outro host), então a proteção é a validade curta, o vínculo com a versão e `no-store`. Nunca
aparece no snapshot.

## `POST /api/sites/:siteId/html-packages/:packageId/rollback`

"Voltar para esta versão" (US6-3). Corpo `{ "versionId": "…" }` de uma versão `approved` do mesmo
pacote. O Worker parte do **snapshot publicado atual**, troca as referências desse pacote pela
versão escolhida, confere aprovação e `assertNoPrivateLeakage`, recalcula o hash e grava uma nova
publicação (mesma rotina e invalidação de cache do `rollback` de versões publicadas,
`workers/api.mjs` l. 5341–5357). Se o rascunho ainda aponta para a versão substituída, atualiza a
referência no rascunho também. Sem nova revisão. `200` com `{ "publication": { … } }`. Audita
`html_version_rolled_back`.

| Status | Código | Quando |
| --- | --- | --- |
| 409 | `HTML_VERSION_STATE` | versão não aprovada ou retirada |
| 409 | `HTML_PACKAGE_NOT_PUBLISHED` | o pacote não está no snapshot atual |

## `DELETE /api/sites/:siteId/html-packages/:packageId`

Exclui pacote fora de uso (US6-4). Exige `{ "confirm": true }` no corpo. `204`. Em uso:
`409 HTML_PACKAGE_IN_USE` com `usages`.

## `DELETE /api/sites/:siteId/html-packages/:packageId/versions/:versionId`

Exclui versão fora de uso que não seja a única aprovada referenciada. `204`.

## Estrutura e publicação (rotas existentes)

- `PUT /api/sites/:siteId/structure` aceita páginas `kind: "html_frame"` e blocos
  `custom_sandbox` com `versionId` e `heightMode` (formato em [data-model.md](../data-model.md)
  seção 8). Erros novos: `422 INVALID_STRUCTURE` (campos), `422 HTML_BLOCK_LIMIT` (mais de 3 blocos
  por página), `422 RESERVED_PAGE_SLUG` (`item`, `home`), `403 PLAN_FEATURE_REQUIRED` só quando a
  mudança acrescenta conteúdo HTML sem o recurso.
- `GET /api/sites/:siteId/structure` troca `widgets` por `htmlPackages`: pacotes com versões
  `approved`, `ready` e `pending_review` (para a prévia) e o `label` de cada uma.
- `POST /api/sites/:siteId/publish` responde `422 HTML_VERSION_NOT_APPROVED` com `targets:
  [{ "page": "prototipo-orbit", "sectionId": null, "packageId": "…", "versionId": "…" }]` e
  `actions: ["use_last_approved", "hide_content"]` para o painel oferecer as duas saídas da spec.

## Avisos

`GET /api/sites/:siteId/notices?unread=1` devolve os avisos `owner` da vitrine (decisões, retirada,
suspensão, projeto externo); `POST /api/sites/:siteId/notices/:id/read` marca como lido. Formato:

```json
{ "notices": [{ "id": "…", "kind": "html_version_rejected", "createdAt": "…",
  "payload": { "packageName": "Protótipo Orbit", "version": 2, "reason": "…", "nextStep": "send_new_version" } }] }
```
