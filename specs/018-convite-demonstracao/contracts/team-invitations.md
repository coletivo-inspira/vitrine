# Contrato: equipe da vitrine por link

Rotas com sessão do painel e verificação `Origin`. Quem pode: proprietário e `admin` da vitrine (`private.has_site_role(site, ['owner','admin'])`); os demais papéis recebem `403`, e quem não tem papel recebe `404`, como nas rotas atuais de `/api/sites/:id/*`.

## `GET /api/sites/:id/team`

Chama `public.list_site_team`.

```json
{
  "members": [
    { "userId": "uuid", "displayName": "Ana", "role": "owner" },
    { "userId": "uuid", "displayName": null, "role": "editor" }
  ],
  "invitations": [
    { "id": "uuid", "role": "viewer", "expiresAt": "2026-12-03T13:00:00Z" }
  ]
}
```

O painel mostra `displayName` ou "Pessoa sem nome" e os papéis como "Proprietário", "Administrador", "Funcionário" (`editor`) e "Somente leitura" (`viewer`). `userId` não aparece na tela (FR-021).

## `POST /api/sites/:id/invitations`

Corpo `{ "role": "admin" | "editor" | "viewer" }`. O Worker gera o token e envia só o hash a `create_team_invitation`.

- `201` `{ "invitation": { "id", "role", "expiresAt" }, "url": "https://painel.inspira.dev.br/convite/<token>", "message": "..." }`; `url` só nesta resposta.
- `admin` da vitrine pedindo `role: "admin"`: `403 ADMIN_INVITE_OWNER_ONLY`.
- Com 20 convites abertos: `409 TEAM_INVITATIONS_LIMIT`.

Texto sugerido: "Oi! Estou chamando você para a equipe da vitrine {vitrine} na Vitrine Inspira, como {papel}. Entre por este link: {url}"

## `DELETE /api/sites/:id/invitations/:invitationId`

Revoga um convite aberto. `204`; já resolvido, `404`.

## Mudar papel e remover

As rotas atuais `PUT` e `DELETE /api/sites/:id/members/:userId` continuam; a aba "Equipe" passa a usá-las com o `userId` vindo de `GET /api/sites/:id/team`. As regras do banco não mudam: o proprietário não sai nem é rebaixado, e o `admin` não mexe em outro `admin`.

## Permissões por papel (FR-020)

| Ação | Proprietário | `admin` | `editor` (Funcionário) | `viewer` |
|---|---|---|---|---|
| Ver a vitrine e o rascunho | sim | sim | sim | sim |
| Editar itens, blocos, fotos e rascunho | sim | sim | sim | não |
| Publicar e restaurar versões | sim | sim | não | não |
| Configurações, domínio, canais, pausar e retomar | sim | sim | não | não |
| Convidar e gerir `editor` e `viewer` | sim | sim | não | não |
| Convidar e gerir `admin` | sim | não | não | não |
| Plano e cobrança | sim | não | não | não |
| Arquivar, restaurar e apagar a vitrine | sim | não | não | não |

A tabela registra o que o banco já aplica hoje (`202611120005_multi_tenant_rbac_audit.sql` e migrações seguintes). A tarefa de testes confere cada linha por chamada direta; se alguma rota divergir, a correção entra no PR da aba Equipe.

## Testes de contrato

`test/team-invitations.test.mjs`:

- `editor` e `viewer` recebem `403` em `team` e `invitations`; quem não é da vitrine recebe `404`;
- `admin` não convida `admin`;
- 21º convite aberto `409`;
- resposta de `team` sem e-mail, telefone, hash nem token;
- `editor` com `POST /api/sites/:id/publish` recebe `403`, inclusive com o JWT direto no Supabase.
