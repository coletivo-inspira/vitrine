# Contrato: abrir, aceitar e recusar um convite

Vale para os dois tipos de convite (`demo_owner` e `team`). O token nunca vai para log, auditoria ou mensagem de erro (FR-011).

## Respostas comuns

Todas as rotas abaixo respondem com:

- `cache-control: private, no-store`
- `x-robots-tag: noindex, nofollow`
- `referrer-policy: no-referrer`

Token com formato inválido, inexistente, vencido, revogado, usado ou de demonstração apagada: a mesma resposta (`404`, página "Este convite não está mais disponível" ou `{ "error": { "code": "INVITATION_UNAVAILABLE" } }`). Tentativas inválidas por IP (hash de `CF-Connecting-IP`) passam pelo limitador em memória de `src/quote-webhook.mjs`; acima de 30 em 10 minutos, `429` (research R10).

## `GET /convite/:token` (página, sem sessão)

No host do painel (`painel.inspira.dev.br`) e no `*.workers.dev`.

- `demo_owner`: HTML com a vitrine compilada do rascunho atual por `compilePublicStorefront` com os direitos do Profissional e `interactive: false`, dentro de um invólucro com a faixa "Demonstração preparada pela Vitrine Inspira para {negócio}" e dois botões: "Quero esta vitrine" (leva a `/portal/#convite`) e "Não tenho interesse" (abre a confirmação da recusa). CSP igual à do `/__preview`.
- `team`: página curta "{vitrine} convidou você para a equipe como {papel}" e o botão "Entrar e aceitar".
- A primeira abertura preenche `first_opened_at` e grava `invitation_opened` na auditoria.

O token vai ao painel por `POST` de formulário para `/portal/convite` (mesma origem), que o guarda em `sessionStorage` e redireciona para `/portal/#convite` sem o token na URL.

## `POST /api/invitations/lookup` (painel, sessão opcional)

Corpo `{ "token": "..." }`. Devolve o resumo para a tela de confirmação:

```json
{ "kind": "demo_owner", "siteName": "Salão Exemplo", "slug": "salao-exemplo", "role": null, "expiresAt": "...", "courtesy": { "planName": "Profissional", "days": 90, "available": true } }
```

`courtesy.available` é `false` quando a pessoa logada já usou a cortesia (US3, cenário 8); sem sessão, o campo vem `null`.

## `POST /api/invitations/accept` (sessão obrigatória)

Corpo `{ "token": "..." }`. Chama `public.accept_invitation(sha256(token))` com o JWT da pessoa.

- `200` `{ "siteId", "slug", "role": "owner" | "admin" | "editor" | "viewer", "courtesy": { "endsAt": "..." } | null }`.
- Já é proprietária ou membro (convite `team`): `409 ALREADY_MEMBER`, nada muda.
- Sem sessão: `401`.
- Corrida com outro aceite: `404 INVITATION_UNAVAILABLE` para quem perdeu.

O painel apaga o token do `sessionStorage` e abre a vitrine: no editor, com o aviso "Revise e publique quando quiser" (dono) ou "Você entrou na equipe como {papel}" (equipe).

## `POST /api/invitations/decline` (sem sessão)

Corpo `{ "token": "...", "confirm": true }`. Só `demo_owner`. Chama `private.decline_demo_invitation` com a chave de serviço.

- `200` `{ "deleted": true }` e a página mostra "Pronto, apagamos a demonstração".
- Convite `team`: `404 INVITATION_UNAVAILABLE` (recusar um convite de equipe é só não aceitar).

Pedido sem `confirm: true`: `400`, nada é apagado. O botão da página exige uma segunda confirmação ("Apagar a demonstração? Não dá para desfazer.").

## Testes de contrato

`test/invitation-flow.test.mjs`, com `fetch` simulado:

- os seis casos de token indisponível têm resposta idêntica (status, corpo e cabeçalhos);
- os três cabeçalhos em todas as respostas, inclusive `404` e `429`;
- a página não contém dados privados do rascunho (`assertNoPrivateLeakage`) nem o token fora do formulário;
- `/salao-exemplo` continua `404` antes do aceite e responde depois do aceite e da publicação;
- aceite sem sessão `401`; recusa sem `confirm` `400`;
- nenhuma linha de `console.*` contém o token.
