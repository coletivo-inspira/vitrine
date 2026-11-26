# Contrato: demonstrações e convites de dono (operadores)

Rotas do Worker (`workers/api.mjs`, módulo novo `src/demo-invitations.mjs`), com sessão do painel (`__Host-vitrine_session`) e verificação `Origin` como nas demais rotas `/api/admin/*`. Permissão: `platform_admin` ou `growth_operator` (`private.can_manage_demos()`); os demais recebem `403 FORBIDDEN_DEMO_OPERATOR`.

Todas as respostas são `application/json` com `cache-control: no-store`. Erros seguem o formato atual `{ "error": { "code": "...", "message": "..." } }`.

## `GET /api/admin/demos`

Lista as demonstrações vigentes.

```json
{
  "demos": [
    {
      "id": "uuid",
      "slug": "salao-exemplo",
      "name": "Salão Exemplo",
      "source": "csv",
      "createdAt": "2026-11-26T13:00:00Z",
      "expiresAt": "2026-12-26T13:00:00Z",
      "maxExpiresAt": "2027-02-24T13:00:00Z",
      "status": "sem_convite | convite_enviado | convite_aberto | vencida",
      "invitation": { "id": "uuid", "expiresAt": "...", "firstOpenedAt": null }
    }
  ],
  "funnel": { "invited": 12, "opened": 8, "accepted": 3, "declined": 1 }
}
```

`funnel` conta os convites de dono dos últimos 90 dias, inclusive de demonstrações já aceitas ou recusadas (SC-007).

## `POST /api/admin/demos`

Cria uma demonstração vazia ou com conteúdo inicial.

Corpo: `{ "name": "Salão Exemplo", "slug": "salao-exemplo", "storefrontType": "services", "template": "booking-v1", "source": "manual" | "csv" }`.

- `slug` com a mesma validação das vitrines comuns; em uso, `409 SLUG_TAKEN`.
- `201` com `{ "id", "slug", "name", "expiresAt" }`.

O conteúdo é editado depois pelas rotas existentes `GET`/`PUT /api/sites/:id/draft`, `structure` e `assets`, que passam a aceitar o operador só para demonstrações sem dono (data-model, "Autorização"). `POST /api/sites/:id/publish` continua recusando com `DEMO_NOT_PUBLISHABLE`.

A importação do Linktree (`POST /api/admin/linktree-demos`) passa a aceitar o `growth_operator`.

## `POST /api/admin/demos/:id/extend`

Soma 30 dias, até 90 dias desde a criação. `200` com `{ "expiresAt" }`; no teto, `409 DEMO_MAX_DURATION`.

## `DELETE /api/admin/demos/:id`

Apaga a demonstração (por exemplo, quando o dono responde "NÃO" no WhatsApp). `204`.

## `POST /api/admin/demos/:id/invitations`

Gera o convite de dono. O Worker cria o token (32 bytes aleatórios, base64url), envia só o hash a `create_demo_invitation` e devolve:

```json
{
  "invitation": { "id": "uuid", "expiresAt": "2026-12-03T13:00:00Z" },
  "url": "https://painel.inspira.dev.br/convite/<token>",
  "message": "Olá! Sou <nome do operador>, da Vitrine Inspira. ..."
}
```

- `url` e o token aparecem só nesta resposta; não há rota para recuperá-los depois (FR-006).
- `message` é o texto sugerido, que o painel deixa editar antes de montar `https://wa.me/<número>?text=<mensagem>` no navegador. O número não vai ao servidor (FR-024).
- Gera um novo convite e revoga o aberto anterior (FR-008).
- Demonstração vencida: `404`.

Texto sugerido (painel, editável):

> Olá! Sou {operador}, da Vitrine Inspira. Montamos uma vitrine de demonstração para {negócio}, com {quantidade} itens do que vocês já mostram, para você ver como fica: {url}
> Se gostar, ela é sua, com 3 meses do plano Profissional sem custo e sem cartão. Você pode mudar tudo antes de publicar.
> Se não tiver interesse, é só responder NÃO que apagamos a demonstração.

## `DELETE /api/admin/demos/:id/invitations/:invitationId`

Revoga o convite. `204`; convite já resolvido, `404`.

## Operadores de captação

- `GET /api/admin/operators` (só `platform_admin`): lista `growth_operator` e `sponsor` com nome de exibição.
- `POST /api/admin/operators` `{ "userId": "uuid", "role": "growth_operator" }` e `DELETE /api/admin/operators/:userId?role=growth_operator`: chamam `grant_growth_operator` e `revoke_growth_operator`. `403` para quem não é `platform_admin`.

## Testes de contrato

`test/demo-invitations.test.mjs`, com `fetch` simulado para o Supabase:

- `403` para sessão comum, `support_operator` e `sponsor` em todas as rotas;
- `url` com token de 43 caracteres base64url; o corpo enviado ao Supabase contém só o hash;
- segunda geração revoga a primeira;
- nenhuma linha de `console.*` contém o token;
- `POST /api/sites/:id/publish` de uma demonstração continua `4xx`.
