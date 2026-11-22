# Contrato: fila "Revisões" e ações do Operador Inspira sobre Pacotes HTML (`016`)

Rotas `/api/admin/*`: sessão válida e `store.isPlatformAdmin` antes de qualquer leitura, como as
rotas administrativas atuais (`workers/api.mjs` l. 4333–4359). `support_operator`, patrocinador,
proprietário e membro recebem `403 FORBIDDEN_PLATFORM_ADMIN`, inclusive em chamadas diretas
(FR-049). O banco repete a checagem (`private.is_platform_admin()` nas RPCs). Mutações exigem
`Origin` igual ao host e JSON. Respostas `no-store`.

## `GET /api/admin/html-reviews`

Versões `pending_review` de todos os clientes, da mais antiga para a mais nova (FR-027, US3-1).
Paginação por cursor (`?after=<cursor>&limit=25`, máximo 50).

```json
{
  "reviews": [
    {
      "versionId": "b2d4…",
      "client": { "key": "tenant:1f…", "name": "Orbit Estúdio" },
      "site": { "id": "…", "slug": "orbit", "code": "VI-ORBIT-7K2Q" },
      "package": { "id": "7a1c…", "name": "Protótipo Orbit", "origin": "owner" },
      "number": 2,
      "bytes": 170112,
      "externalHosts": ["cdn.tailwindcss.com", "fonts.googleapis.com", "fonts.gstatic.com"],
      "warnings": [{ "code": "PASSWORD_FIELD", "line": 812 }],
      "isFirstVersion": false,
      "submittedAt": "2026-11-21T12:00:00.000Z",
      "waitingSeconds": 86400
    }
  ],
  "next": "…"
}
```

## `GET /api/admin/html-reviews/:versionId`

Detalhe para decidir (FR-028, US3-2):

```json
{
  "version": { "id": "b2d4…", "number": 2, "sha256": "…", "bytes": 170112, "state": "pending_review",
    "report": { "errors": [], "warnings": [ … ], "info": { … } }, "declaration": { … },
    "uploadedBy": { "role": "owner" } },
  "comparison": {
    "previousApproved": { "id": "…", "number": 1, "bytes": 166225 },
    "bytesDelta": 3887,
    "hostsAdded": [],
    "hostsRemoved": [],
    "warningsAdded": ["PASSWORD_FIELD"],
    "warningsRemoved": []
  },
  "preview": {
    "embedUrl": "https://sandbox.inspira.dev.br/embed/b2d4…?v=…&t=<token>",
    "expiresAt": "…"
  },
  "checklist": [
    { "key": "coherentWithBusiness", "label": "Conteúdo coerente com o negócio" },
    { "key": "noPersonalDataOrPasswords", "label": "Sem coleta de dados pessoais ou senhas" },
    { "key": "noThirdPartyImpersonation", "label": "Sem imitação de marca de terceiros" },
    { "key": "allowedByTerms", "label": "Sem conteúdo proibido pelos termos" }
  ],
  "history": [{ "decision": "approve", "reason": null, "reviewer": "…", "at": "…" }]
}
```

`isFirstVersion = true` e `comparison.previousApproved = null` quando não há versão aprovada antes.
A prévia usa o mesmo token de portador da prévia do proprietário e alterna 1280/375 no painel
(largura da moldura de revisão; o conteúdo é o mesmo).

## `POST /api/admin/html-reviews/:versionId/decision`

```json
{
  "decision": "approve",
  "reason": "",
  "checklist": { "coherentWithBusiness": true, "noPersonalDataOrPasswords": true,
    "noThirdPartyImpersonation": true, "allowedByTerms": true }
}
```

- `decision`: `approve` | `request_changes` | `reject`.
- `approve` exige os quatro itens `true`; `request_changes` e `reject` exigem `reason` com 10 a
  1000 caracteres (US3-3), visível ao proprietário.
- Pacote `origin = "operator"`: quem enviou não pode aprovar quando houver mais de um
  `platform_admin` (FR-048) → `409 SELF_APPROVAL_NOT_ALLOWED`.
- `200` com a versão atualizada. Grava `html_package_reviews`, `audit_logs`
  (`html_version_approved` / `_changes_requested` / `_rejected`) e um aviso `owner` (FR-030, FR-031).

| Status | Código | Quando |
| --- | --- | --- |
| 409 | `HTML_VERSION_STATE` | versão não está `pending_review` (decisão concorrente) |
| 422 | `REVIEW_REASON_REQUIRED` | sem motivo em ajustes ou recusa |
| 422 | `REVIEW_CHECKLIST_INCOMPLETE` | aprovação sem a lista completa |

## `POST /api/admin/html-versions/:versionId/withdraw`

"Retirar do ar" (US3-5, FR-029). Corpo `{ "reason": "…" }` (10–1000 caracteres). `approved` →
`withdrawn`. Efeito para visitantes em até 5 minutos (revalidação do host isolado); o Worker também
apaga o cache da borda por melhor esforço. Grava revisão `withdraw`, auditoria e aviso `owner`.

## `PUT /api/admin/sites/:siteId/html-uploads`

Suspende ou retoma o envio de pacotes da vitrine (reincidência, FR-029).

```json
{ "suspended": true, "reason": "Reincidência em coleta de senha." }
```

`200` com `{ "uploadsSuspended": { "at": "…", "reason": "…" } }` ou `null`. Audita
`html_uploads_suspended` / `html_uploads_resumed` e avisa o proprietário.

## `POST /api/admin/sites/:siteId/html-packages` e `…/:packageId/versions`

Envio pelo operador em nome do cliente (FR-048). Mesmo corpo e respostas da
[API do proprietário](owner-html-packages-api.md), sem `declaration` do proprietário e com
`customizationId` obrigatório de uma customização `html_bespoke` vigente para a vitrine:

| Status | Código | Quando |
| --- | --- | --- |
| 409 | `CUSTOMIZATION_NOT_IN_FORCE` | sem `html_bespoke` vigente para a vitrine |

Não confere plano nem limite (FR-060). A versão segue a mesma validação e vai a `pending_review`
direto (o operador já é a equipe Inspira, mas outra pessoa aprova quando houver).

## `POST /api/admin/custom-components` (rota antiga)

Passa a responder `410 ENDPOINT_REPLACED` com `{ "replacement": "/api/admin/sites/:siteId/html-packages" }`.
