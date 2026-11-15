# `vitrine.json`: leitura pública para robôs de conversa

Issue [#120](https://github.com/coletivo-inspira/vitrine/issues/120). Recurso `public_json`
dos planos Profissional e Equipe/Multi-Vitrine (ADR 0013). Serve para robôs como o
Manychat Pro ou o BotConversa Pro responderem horário, links e itens lendo a vitrine
por HTTP GET, sem que o dono mantenha a informação em dois lugares. A issue #122 (kit
Comment-to-Vitrine) cita este contrato.

Só leitura: sem escrita, sem autenticação de robôs e sem chaves de API.

## Endereços

| Onde | Endereço |
| --- | --- |
| Endereço da plataforma | `GET https://vitrine.inspira.dev.br/<endereço>/vitrine.json` |
| Domínio próprio ativo | `GET https://<domínio>/vitrine.json` |

Só `GET` e `HEAD`; qualquer outro método responde `405` com `allow: GET, HEAD`.

## Respostas

| Situação | Status | `cache-control` | Corpo |
| --- | --- | --- | --- |
| Vitrine publicada com o recurso | `200` | `public, max-age=300, stale-while-revalidate=86400` | contrato abaixo |
| `If-None-Match` igual ao `ETag` | `304` | igual ao `200` | vazio |
| Plano sem `public_json`, assinatura suspensa, vitrine sem publicação ou inexistente | `404` | `public, max-age=60` | vazio |
| Domínio próprio que deixou de ser canônico (suspensão) | `404` | `public, max-age=60` | vazio |
| Vitrine pausada (issue #144) | `503` | `no-store` | `{"error":{"code":"SHOWCASE_PAUSED",...}}` |
| Falha ao conferir o plano | `503` | `no-store` | `{"error":{"code":"VITRINE_JSON_UNAVAILABLE",...}}` |
| Método diferente de `GET`/`HEAD` | `405` | `no-store` | vazio |

Todas as respostas desta rota levam `access-control-allow-origin: *` e
`access-control-expose-headers: etag`. Nenhuma outra rota pública abre CORS.

O `404` curto (`max-age=60`) vem de `paidFeatureGoneResponse()` (issue #114): a
reativação aparece logo.

## Contrato (`schemaVersion: 1`)

```json
{
  "schemaVersion": 1,
  "slug": "pizza-a",
  "name": "Pizza A",
  "url": "https://vitrine.inspira.dev.br/pizza-a",
  "description": "Pizza no forno a lenha.",
  "whatsapp": {
    "number": "5511999999999",
    "via": "direct",
    "url": "https://wa.me/5511999999999?text=..."
  },
  "businessHours": {
    "timeZone": "America/Sao_Paulo",
    "week": { "mon": [{ "opens": "18:00", "closes": "23:00" }], "tue": [] },
    "closedDates": []
  },
  "openNow": {
    "open": true,
    "label": "Aberto agora",
    "closesAt": "23:00",
    "computedAt": "2026-11-16T22:00:00.000Z"
  },
  "address": {
    "street": "Rua Augusta, 1500",
    "district": "Consolação",
    "city": "São Paulo",
    "uf": "SP",
    "formatted": "Rua Augusta, 1500, Consolação, São Paulo – SP",
    "routeUrl": "https://www.google.com/maps/dir/?api=1&destination=..."
  },
  "links": [{ "label": "Instagram", "url": "https://instagram.com/pizza-a" }],
  "currency": "BRL",
  "items": [
    {
      "id": "margherita",
      "name": "Margherita",
      "priceCents": 4500,
      "category": "Pizzas",
      "url": "https://wa.me/5511999999999?text=..."
    }
  ],
  "updatedAt": "2026-11-16T21:58:00.000Z"
}
```

| Campo | Regra |
| --- | --- |
| `schemaVersion` | Sempre `1`. Campos novos podem aparecer sem mudar a versão; remoção ou mudança de sentido sobe a versão. |
| `url` | Endereço canônico gravado na publicação (domínio próprio quando ativo, senão o endereço da plataforma), o mesmo do SEO local (issue #117). |
| `description` | Texto de boas-vindas da vitrine (`messages.welcomeText`) ou `null`. |
| `whatsapp` | WhatsApp público da vitrine. No modo Mila (ADR 0012), `number` é o da Mila, `via` é `"mila"` e a mensagem do `url` começa com o código do pedido; o telefone do dono **nunca** aparece. Sem WhatsApp, `null`. |
| `businessHours` | Horário publicado (issue #118) ou `null`. |
| `openNow` | Calculado no momento em que a resposta foi gerada (`computedAt`), com `getOpenStatus`. Pode ter até 5 minutos de idade por causa do cache; quem precisa de precisão calcula a partir de `businessHours`. Sem horário, `null`. |
| `address` | Endereço público com `formatted` e `routeUrl` (Google Maps, sem chave), ou `null`. |
| `links` | Links HTTPS dos blocos "Links" ativos da vitrine, sem repetição, até 20. |
| `items` | Itens ativos da publicação: `id`, `name`, `priceCents` (inteiro, centavos de real), `priceMode` quando não é preço fixo (`offer`, `donation`, `trade`, `quota`), `category` quando há categoria e `url` (conversa no WhatsApp sobre o item). Itens ocultos e mudanças só no rascunho não aparecem. |
| `updatedAt` | `publishedAt` da publicação servida. |

Nunca entram: identificadores internos (`siteId`, dono, tenant), plano, assinatura,
rascunho, sessão ou qualquer chave.

### `ETag`

`ETag: W/"<hash da publicação>"`. É fraco porque `openNow` é recalculado; o resto do
corpo é função do snapshot. Mande o valor em `If-None-Match` para receber `304`
(o servidor também aceita a forma forte `"<hash>"`).

## Como a rota decide (ADR 0008)

1. **Na publicação**: `vitrineJsonPublicationOptions(entitlements)` grava no snapshot o
   indicador público mínimo `features: { publicJson: true }` só quando o plano tem
   `public_json`. `assertNoPrivateLeakage` aceita só esse formato. Sem o recurso, o bloco
   não existe e o hash das vitrines atuais não muda.
2. **Na leitura, com acerto no `caches.default`**: a resposta sai da borda, sem nenhuma
   consulta ao banco. A chave é `<origem>/<endereço>/vitrine.json` (no domínio próprio,
   `https://<domínio>/<endereço>/vitrine.json`), por vitrine.
3. **Na leitura, com falta no cache**: confere a pausa (issue #144), lê o snapshot
   ativo e, se ele não tiver o indicador, responde `404` sem mais nada. Se tiver, confere
   a suspensão pela RPC anônima `public.public_json_enabled(slug)` (migração
   `20261116000500_public_json_state.sql`), que devolve só um booleano a partir de
   `private.site_entitlements` e de `sites.paused_at`/`archived_at`. O resultado fica
   60 s na memória do isolate e a resposta (`200` ou `404`) vai para o cache da borda.
4. **Pausa**: `storefrontCacheUrls` inclui `vitrine.json`, então pausar apaga a cópia da
   borda.

Custo no Workers Free: no acerto, só a leitura do cache e o `304`/corpo pronto. Na
falta, no máximo três subrequests (estado de pausa, publicação e `public_json_enabled`),
os dois primeiros já usados pela vitrine e com cache em memória.

Limitação conhecida: o indicador é decidido na publicação, como o SEO local (#117).
Quem contrata o Profissional precisa **publicar de novo** para ligar o `vitrine.json`;
na suspensão a rota desliga sozinha (até 5 minutos pelo cache) e na reativação volta
sem nova publicação.

## Exemplos para robôs

Os passos abaixo descrevem a configuração genérica; nomes de menus mudam entre versões
das ferramentas.

### Manychat Pro

1. Num fluxo, adicione a ação **External Request** (disponível no Pro).
2. Método `GET`, URL `https://vitrine.inspira.dev.br/<endereço>/vitrine.json`. Sem
   cabeçalhos e sem corpo.
3. Em **Response mapping**, ligue os caminhos JSON a campos personalizados, por exemplo:
   - `$.openNow.label` → `vitrine_status` ("Aberto agora", "Fechado · abre amanhã às 18h");
   - `$.address.formatted` → `vitrine_endereco`;
   - `$.address.routeUrl` → `vitrine_rota`;
   - `$.url` → `vitrine_link`;
   - `$.items[0].name` e `$.items[0].priceCents` para destaques.
4. Use os campos na mensagem: "Agora estamos: {{vitrine_status}}. Veja tudo em
   {{vitrine_link}}".
5. Trate a falha da requisição (404 ou 503) com uma mensagem padrão que mande o link da
   vitrine.

### BotConversa Pro

1. No fluxo, adicione o bloco de **requisição HTTP / integração com webhook** (Pro).
2. Método `GET`, URL `https://vitrine.inspira.dev.br/<endereço>/vitrine.json`.
3. Salve campos da resposta em campos personalizados (`openNow.label`,
   `address.formatted`, `address.routeUrl`, `url`, `whatsapp.url`).
4. Use os campos nas mensagens seguintes e preveja a saída de erro com o link da
   vitrine.

### Teste rápido

```bash
curl -i https://vitrine.inspira.dev.br/<endereço>/vitrine.json
curl -i -H 'If-None-Match: W/"<hash>"' https://vitrine.inspira.dev.br/<endereço>/vitrine.json
```

## Código e testes

- `src/vitrine-json.mjs`: indicador do snapshot, projeção, cache, `ETag`/`304`, CORS e
  métodos. `workers/api.mjs` só registra as rotas e a leitura da RPC.
- `test/vitrine-json.test.mjs`: contrato, `404` free/suspensa, modo Mila, itens ocultos e
  rascunho, `304`, `405`, CORS só nesta rota, pausa, domínio próprio, acerto no cache sem
  banco e isolamento entre duas vitrines.
- `test/database/public-json-state.test.mjs`: a RPC em PGlite (planos, tolerância,
  suspensão, pausa, isolamento e permissões).
