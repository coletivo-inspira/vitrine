# Contrato: Vínculo de projeto externo (`016`)

Configuração só pelo Operador Inspira (`platform_admin`), na ficha do cliente (FR-032). Leitura
somente leitura pelo proprietário e pela equipe da vitrine (FR-042). Estados e campos em
[data-model.md](../data-model.md) seções 9 a 11; comprovação em
[ownership-verification.md](ownership-verification.md); efeito na borda em
[redirect-behaviour.md](redirect-behaviour.md). Mutações exigem `Origin` igual ao host e JSON;
respostas `no-store`.

## Representação

```json
{
  "siteId": "…",
  "customization": { "id": "…", "inForce": true, "endsOn": null },
  "state": "active",
  "stateLabel": "Ativo",
  "suspendedReason": null,
  "activeSince": "2026-11-21T15:00:00.000Z",
  "active": {
    "configId": "…",
    "targetUrl": "https://orbit.cliente.com.br/",
    "targetHost": "orbit.cliente.com.br",
    "targetHostDisplay": "orbit.cliente.com.br",
    "scope": "page",
    "pageSlug": "prototipo-orbit",
    "menuOpen": "new_tab",
    "createdAt": "…"
  },
  "pending": null,
  "proof": {
    "hostname": "orbit.cliente.com.br",
    "state": "valid",
    "method": "dns",
    "txtName": "_vitrine-verify.orbit.cliente.com.br",
    "txtValue": "vitrine=3c1e…",
    "fileUrl": "https://orbit.cliente.com.br/.well-known/vitrine-inspira-verificacao.txt",
    "fileContent": "vitrine=3c1e…",
    "lastAttemptAt": "…",
    "lastResult": "ok",
    "lastResultMessage": "Comprovação válida pelo registro DNS."
  },
  "lastCheck": { "at": "…", "result": "ok", "consecutiveDownDays": 0 },
  "history": [{ "configId": "…", "targetUrl": "…", "scope": "site", "createdAt": "…",
    "reason": "…", "isActive": false }]
}
```

- `stateLabel`: "Rascunho", "Aguardando comprovação", "Pronto para ativar", "Ativo",
  "Suspenso: posse não confirmada", "Suspenso: laço detectado", "Desativado".
- `history` traz até 5 configurações (FR-040). `reason` e autor só aparecem para o operador.
- `pending` tem o mesmo formato de `active` e um `proof` próprio quando há troca de domínio com o
  vínculo ativo (FR-063).
- `lastResultMessage` em linguagem simples; nas falhas de DNS acrescenta "A propagação de DNS pode
  levar até 48 horas." (FR-062).

## Operador

### `GET /api/admin/sites/:siteId/external-project`

`200` com a representação; sem vínculo, `{ "state": null, "customization": { … } }`. Sem
customização vigente, `customization.inForce = false` e o painel mostra a área desabilitada com
"Disponível quando a customização Projeto externo estiver contratada" (US4-4).

### `PUT /api/admin/sites/:siteId/external-project`

Cria ou altera a configuração.

```json
{
  "targetUrl": "https://orbit.cliente.com.br/",
  "scope": "page",
  "pageSlug": "prototipo-orbit",
  "menuOpen": "new_tab",
  "reason": "Projeto contratado em 21/11."
}
```

- Valida a sintaxe (FR-034) e segue o destino até 5 saltos (FR-035). Passou → `awaiting_proof`
  (ou, com o vínculo ativo e o mesmo host, troca na hora a configuração ativa depois da checagem);
  não passou por indisponibilidade → `draft` com o motivo.
- `200` com a representação.

| Status | Código | `field` | Quando |
| --- | --- | --- | --- |
| 409 | `CUSTOMIZATION_NOT_IN_FORCE` | — | sem "Projeto externo" vigente |
| 422 | `EXTERNAL_URL_NOT_HTTPS` | `targetUrl` | fora de `https://` |
| 422 | `EXTERNAL_URL_CREDENTIALS` | `targetUrl` | usuário ou senha |
| 422 | `EXTERNAL_URL_PORT` | `targetUrl` | porta explícita |
| 422 | `EXTERNAL_URL_IP` | `targetUrl` | IPv4, IPv6 ou `localhost` |
| 422 | `EXTERNAL_URL_SHORTENER` | `targetUrl` | host em `content/url-shorteners.json` |
| 422 | `EXTERNAL_URL_PLATFORM` | `targetUrl` | `inspira.dev.br` e subdomínios, `*.workers.dev`, `*.pages.dev` |
| 422 | `EXTERNAL_URL_OWN_DOMAIN` | `targetUrl` | domínio vinculado à vitrine |
| 422 | `EXTERNAL_URL_TOO_LONG` | `targetUrl` | mais de 2048 caracteres |
| 422 | `EXTERNAL_URL_LOOP` | `targetUrl` | volta à plataforma ou à vitrine em até 5 saltos; inclui `hop` |
| 422 | `EXTERNAL_PAGE_NOT_FOUND` | `pageSlug` | página inexistente no rascunho |
| 422 | `EXTERNAL_REASON_REQUIRED` | `reason` | motivo com menos de 3 caracteres |

Cada código traz `message` pronta para aparecer ao lado do campo (US4-5). Destino com caracteres
internacionais é aceito e devolvido também em punycode (`targetHost`).

### `POST /api/admin/sites/:siteId/external-project/verify`

"Verificar agora" (FR-062): tenta DNS e depois o arquivo. `200` com a representação atualizada.
`429 OWNERSHIP_CHECK_RATE_LIMITED` com `retryAfterSeconds` se houve tentativa há menos de 30 s.

### `POST /api/admin/sites/:siteId/external-project/activate`

```json
{ "configId": "…", "operatorConfirmed": true, "reason": "Cliente confirmou o domínio." }
```

Refaz comprovação e checagem de laço na hora. `200` com a representação (`state: "active"`).
Efeito na vitrine em até 30 s no isolate e até 5 minutos no navegador de quem já abriu a página.

| Status | Código | Quando |
| --- | --- | --- |
| 409 | `OWNERSHIP_NOT_VERIFIED` | comprovação ausente ou falhou; inclui `result` (`txt_not_found`, `txt_mismatch`, `file_not_found`, `file_mismatch`, `file_redirected_off_host`, `domain_unreachable`) e o lembrete de 48 h (US4-8) |
| 409 | `EXTERNAL_LINK_STATE` | estado não permite ativar |
| 422 | `OPERATOR_CONFIRMATION_REQUIRED` | `operatorConfirmed` diferente de `true` |
| 422 | `EXTERNAL_URL_LOOP` | laço apareceu desde o salvamento |

### `POST /api/admin/sites/:siteId/external-project/deactivate`

`{ "reason": "…" }`. `active` ou `suspended` → `disabled`. A vitrine volta a ser exibida (US4-7).

### `POST /api/admin/sites/:siteId/external-project/restore`

`{ "configId": "…", "reason": "…", "operatorConfirmed": true }` com uma das 5 configurações
guardadas. Comprovação do host ainda válida → `active` na hora; senão → `awaiting_proof` com a
configuração restaurada como pendente.

Todas as mutações gravam `audit_logs` com valor anterior e novo, motivo e autor (FR-043) e
avisos `owner` quando mudam o que o visitante vê.

## Proprietário e equipe da vitrine

### `GET /api/sites/:siteId/external-project`

Qualquer papel da equipe (`owner`, `admin`, `editor`, `viewer`). `200` com a representação sem
`history[].reason`, sem autores e com `contactHint: "Para mudar, fale com a equipe Inspira pela
Mila."`. Sem vínculo: `{ "state": null }`. O grupo "Domínio e projeto externo" mostra só leitura
(FR-042, US4-6).

### `POST /api/sites/:siteId/external-project/verify`

Só `owner` e `admin`. Mesmo efeito e limite do "Verificar agora" do operador; nunca ativa nada.
