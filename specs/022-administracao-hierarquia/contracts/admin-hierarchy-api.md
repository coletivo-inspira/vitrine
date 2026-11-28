# Contrato: rotas da hierarquia, licenças, cupons e limites

Todas as rotas exigem sessão (`401 UNAUTHORIZED`). Mutação exige mesma origem e JSON (`validateMutationOriginAndJson`). Respostas com `cache-control: no-store`. Papel sem a capacidade: `403 FORBIDDEN_PLATFORM_ROLE`.

| Método e rota | Capacidade | Corpo | Resposta |
| --- | --- | --- | --- |
| `GET /api/admin/me` | qualquer conta | — | `{ access: { role, capabilities } }` (`role` nulo sem papel) |
| `GET /api/admin/users?q=&offset=` | `users.read` | — | `{ users: [...], total, offset, pageSize }` |
| `GET /api/admin/users/:id` | `users.read` | — | `{ user, sites: [...] }` |
| `GET /api/admin/operators` | `staff.manage` | — | `{ operators: [{ userId, role, email, displayName, since }] }` |
| `POST /api/admin/operators` | `staff.manage` (+ `admins.manage` para `platform_admin`) | `{ userId, role }` | `201 { operator }` |
| `DELETE /api/admin/operators/:userId` | idem | — | `{ removed: true }` |
| `POST /api/admin/licenses` | `licenses.manage` | `{ siteId, planCode, months, note? }` | `201 { license }` |
| `DELETE /api/admin/licenses/:id` | `licenses.manage` | — | `{ revoked: true }` |
| `GET /api/admin/coupons` | `licenses.manage` | — | `{ coupons: [...] }` |
| `POST /api/admin/coupons` | `licenses.manage` | `{ planCode, months, maxRedemptions?, expiresAt?, note?, code? }` | `201 { coupon }` |
| `PATCH /api/admin/coupons/:id` | `licenses.manage` | `{ disabled: boolean }` | `{ coupon }` |
| `GET /api/admin/coupons/report` | `licenses.manage` | — | `{ report }` |
| `PUT /api/admin/sites/:id/limits` | `licenses.manage` | `{ maxActiveItems?, maxItemBlocks?, note? }` | `{ limits }` |
| `DELETE /api/admin/sites/:id/limits` | `licenses.manage` | — | `{ cleared: true }` |
| `POST /api/sites/:id/coupon` | proprietária da vitrine | `{ code }` | `200 { redemption: { planCode, planName, endsAt, months } }` |

## Erros

| Código | HTTP | Quando |
| --- | --- | --- |
| `INVALID_ADMIN_PAYLOAD` | 422 | campos fora das regras |
| `PLATFORM_USER_NOT_FOUND` | 404 | conta inexistente |
| `OPERATOR_ROLE_CONFLICT` | 409 | conta patrocinadora ou Dono |
| `CANNOT_CHANGE_OWN_ROLE` | 409 | operador mexendo no próprio papel |
| `ADMINS_MANAGED_BY_OWNER` | 403 | Administrador mexendo em administrador |
| `SITE_NOT_FOUND` | 404 | vitrine inexistente (ou de outra pessoa, no resgate) |
| `SITE_WITHOUT_OWNER` | 409 | demonstração sem dona |
| `LICENSE_NOT_FOUND` / `COUPON_NOT_FOUND` | 404 | id inexistente ou já retirado |
| `COUPON_CODE_TAKEN` | 409 | código escolhido já existe |
| `COUPON_INVALID` | 404 | resgate: código inexistente ou desativado |
| `COUPON_EXPIRED` / `COUPON_EXHAUSTED` / `COUPON_ALREADY_REDEEMED` | 409 | resgate |
| `COUPON_RATE_LIMITED` | 429 | mais de 10 tentativas por hora |

As rotas antigas da Administração (`/api/admin/cms`, `templates`, `mila-relay`, `overview`, `audit-logs`, `customization-requests`, Linktree, patrocinadores, resposta automática) continuam exigindo `platform.operate` (Dono ou Administrador) com o erro `FORBIDDEN_PLATFORM_ADMIN`.
