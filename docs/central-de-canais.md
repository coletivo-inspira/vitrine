# Central de canais (issue #125)

A aba **Canais** do editor separa dois grupos:

- **Links diretos**: WhatsApp (ou o modo Mila, ADR 0012), perfil do Instagram, e-mail
  público e os links externos dos menus. Não pedem login de terceiros; cada um tem o
  botão "Testar", que só abre o link em nova aba.
- **Integrações**: domínio próprio, `vitrine.json` para robôs de conversa,
  pré-orçamento para CRM ou planilha e Instagram conectado (em breve). Cada cartão mostra
  estado, plano necessário, titular, permissões pedidas, pré-requisitos, último
  diagnóstico e o próximo passo em texto.

Abaixo da central, a mesma aba tem a seção **Resposta automática** (AutoResposta do Instagram, `web/portal/auto-reply-panel.mjs`, spec 019, proposta): ela tem estado e rotas próprios (`/api/sites/:id/auto-reply`) e não entra na lista de integrações desta central.

Regras puras em `web/assets/channels.mjs` (servidor e navegador), rota e projeção em
`src/channels.mjs`, painel em `web/portal/channels-panel.mjs` e `channels-panel.css`.

## Campos do rascunho

| Campo | Regra | Snapshot público |
| --- | --- | --- |
| `instagramUrl` | Aceita `@perfil`, `perfil` ou URL de `instagram.com`; grava sempre `https://www.instagram.com/<perfil>/`. Recusa caminhos de post (`p`, `reel`, `explore`…), `http`, porta e credenciais. | `instagramUrl` (cabeçalho e rodapé) |
| `instagram` (legado) | Campo antigo do importador do Linktree. É lido como `instagramUrl` quando este falta e removido na primeira edição do campo. O carregamento não reescreve o rascunho. | não é projetado com esse nome |
| `publicEmail` | E-mail do negócio, até 120 caracteres, minúsculo. Não é o e-mail da conta. | `publicEmail` (rodapé) |

Erros de validação no `PUT` do rascunho: `INVALID_INSTAGRAM_URL` e
`INVALID_PUBLIC_EMAIL` (422, junto dos demais erros de `validateDraftContent`).

A publicação projeta os dois campos com `projectPublicChannels` e confere a forma
canônica com `assertPublicChannels` (falha com `PRIVATE_FIELD_LEAKAGE`).
`hydratePublicationRecord` repassa os dois campos ao recompilar, então o hash da
publicação não muda.

**`logoUrl` não é projetado.** O cabeçalho já sabe exibir `menu.logoUrl`, mas a estrutura
da vitrine não tem campo de logo (o tema só tem cor, par de fontes e estilo de botão).
Projetar a chave sem um campo validado abriria espaço para URL arbitrária no snapshot;
fica para quando houver envio de logo pelo Storage.

## `GET /api/sites/:id/channels`

Sessão obrigatória (401 sem ela); 404 para quem não é da equipe; 405 para outros
métodos; resposta com `cache-control: no-store`. A rota só lê: não grava nada e não
chama serviços externos.

```json
{
  "channels": {
    "role": "owner",
    "canEditLinks": true,
    "canManageIntegrations": true,
    "plan": { "code": "profissional", "name": "Profissional" },
    "integrations": [
      { "id": "custom_domain", "feature": "custom_domain", "available": true, "requiredPlan": null, "state": "pending",
        "diagnostic": { "hostname": "www.exemplo.com.br", "status": "pending_dns", "sslStatus": "pending", "cnameTarget": "vitrine.inspira.dev.br", "verifiedAt": null } },
      { "id": "public_json", "feature": "public_json", "available": true, "requiredPlan": null, "state": "active",
        "diagnostic": { "url": "https://vitrine.inspira.dev.br/<slug>/vitrine.json", "publishedAt": "2026-11-14T20:34:00.000Z" } },
      { "id": "quote_webhook", "feature": "quote_webhook", "available": true, "requiredPlan": null, "state": "error",
        "diagnostic": { "host": "hooks.exemplo.com.br", "hasSecret": true, "lastDelivery": { "ok": false, "httpStatus": 500 }, "totals": {} } },
      { "id": "instagram_connect", "feature": null, "available": false, "requiredPlan": null, "state": "soon" }
    ]
  }
}
```

Quando o plano não inclui o recurso, `available` é `false`, `state` é `locked` e
`requiredPlan` traz `{ code, name }` do menor plano que o inclui.

### Estados

| Estado | Significado |
| --- | --- |
| `off` | Disponível no plano, ainda não configurado (ou vitrine sem publicação). |
| `pending` | Configurado e aguardando: DNS/SSL do domínio ou `vitrine.json` aguardando nova publicação. |
| `active` | Funcionando. |
| `error` | Falhou: domínio `failed`/`suspended`, SSL `failed` ou último envio do webhook com erro. |
| `locked` | O plano não inclui o recurso. |
| `restricted` | O papel não pode ver o diagnóstico (domínio e webhook para quem não é dono ou administração). |
| `unavailable` | Não foi possível ler o estado agora. |
| `soon` | Integração ainda não existe (Instagram conectado). |

O diagnóstico do webhook nunca traz o segredo nem o caminho da URL: só o host, se há
segredo, o último envio e os totais.

## Papéis

Segue a tabela de papéis da auditoria (PB-05):

| Papel | Ver canais | Editar Instagram e e-mail | Ver diagnóstico de domínio e webhook | Abrir a configuração |
| --- | --- | --- | --- | --- |
| `owner`, `admin` | sim | sim | sim | sim |
| `editor` | sim | sim | não (`restricted`) | não |
| `viewer` | sim | não (só leitura) | não (`restricted`) | não |

Todos podem usar "Testar" nos links diretos. O painel não mostra botões que o papel não
pode usar; o leitor vê a nota "Acesso de leitura (Leitor)".

## Sem migração

Os campos ficam no JSON do rascunho e do snapshot, e o status vem das tabelas e RPCs que
já existem (domínios #44, `vitrine.json` #120, webhook de pré-orçamento #121).
