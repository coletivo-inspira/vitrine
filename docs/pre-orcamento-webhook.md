# Pré-orçamento com webhook assinado (issue #121)

Status: implementado no código, ainda sem chave de cifragem configurada no ambiente
remoto (passo humano abaixo). Recurso `quote_webhook` dos planos Profissional e Equipe
(ADR 0013).

Na etapa "Dados para o orçamento", a vitrine pode pedir até três campos (categoria,
data e bairro) e um consentimento explícito: "Enviar estes dados para \<negócio\>
organizar o atendimento". Quando a pessoa marca o consentimento e toca no botão do
WhatsApp, o navegador manda os dados para `POST /api/sites/:endereço/leads`; o Worker
responde na hora e entrega o webhook em segundo plano (`ctx.waitUntil`) para o CRM ou a
planilha do negócio. A conversa no WhatsApp abre do mesmo jeito, com ou sem webhook.
Sem consentimento, nada sai do navegador além do link do WhatsApp.

A mensagem do WhatsApp continua igual para o modo Mila (ADR 0012); categoria e bairro
entram como linhas extras na mensagem quando preenchidos.

## Configuração no painel

Editor da vitrine, aba "Campos do Pedido e Mensagem", quadro "Pré-orçamento para CRM ou
planilha" (só dono e admin veem):

1. Marque os campos que a vitrine pede (Categoria, Data, Bairro).
2. Cole o endereço HTTPS do webhook e salve.
3. Toque em "Gerar segredo" e copie: o segredo aparece uma única vez. "Gerar novo
   segredo" invalida o anterior.
4. Toque em "Enviar teste" e confira o status (HTTP, tentativas e horário).
5. Publique de novo: os campos só entram na vitrine publicada quando o plano tem o
   recurso e a integração tem endereço e segredo.

Sem o recurso, o quadro aparece bloqueado com "Disponível no Profissional", salvar
responde `403 PLAN_FEATURE_REQUIRED` e a rota pública responde `404`. Nada salvo é
apagado quando o plano muda.

## Endereços aceitos

Só `https://` na porta 443, sem usuário e senha na URL. São recusados ao salvar (e de
novo antes de cada envio): `http://`, `localhost` e `*.localhost`, nomes sem ponto,
sufixos internos (`.local`, `.internal`, `.lan`, `.home.arpa`, `.intranet`), IPv4 de
rede privada, loopback, link-local, CGNAT, documentação e multicast (por exemplo
`127.0.0.1`, `10.0.0.1`, `192.168.0.1`, `169.254.169.254`), qualquer IPv6 literal e o
domínio da plataforma (`inspira.dev.br` e subdomínios). Redirecionamentos nunca são
seguidos.

O endereço pode carregar um token do CRM, então só dono e admin o leem; a auditoria
grava apenas o host e os logs não registram nem o endereço nem o segredo.

## Contrato da entrega

`POST` com corpo JSON (UTF-8) e estes cabeçalhos:

| Cabeçalho | Valor |
| --- | --- |
| `X-Vitrine-Event` | `quote.lead.created` ou `quote.lead.test` |
| `X-Vitrine-Delivery` | UUID da entrega (igual nas tentativas; use para não duplicar) |
| `X-Vitrine-Timestamp` | segundos Unix do momento da assinatura |
| `X-Vitrine-Signature` | `sha256=<hex>`: HMAC-SHA256 de `${timestamp}.${corpo}` com o segredo |

Corpo:

```json
{
  "event": "quote.lead.created",
  "deliveryId": "5b0c8f6e-1d0a-4c1e-9b7e-3f1f5d1c2a10",
  "createdAt": "2026-11-14T23:40:00.000Z",
  "test": false,
  "vitrine": { "slug": "foto-ana", "name": "Foto Ana", "url": "https://vitrine.inspira.dev.br/foto-ana" },
  "lead": {
    "category": "Casamento",
    "date": "2027-03-20",
    "neighborhood": "Cidade Baixa",
    "items": [{ "id": "ensaio", "name": "Ensaio externo", "quantity": 2 }]
  },
  "consent": { "text": "Enviar estes dados para Foto Ana organizar o atendimento", "acceptedAt": "2026-11-14T23:40:00.000Z" }
}
```

Campos vazios não vêm. Os nomes dos itens são lidos da vitrine publicada (o navegador
manda só identificador e quantidade). Não há nome, telefone nem IP de quem pede.

Tentativas: no máximo 3, só para `5xx` e erro de rede (espera de 0,5 s e 1,5 s, 5 s
de limite por tentativa). `2xx` e `3xx` contam como entregue (o Apps Script responde
302 depois de executar); `4xx` conta como falha e não repete. Não há fila: o que falhar
fica registrado no último status e no contador de falhas.

### Verificar a assinatura

1. Rejeite `X-Vitrine-Timestamp` com mais de 5 minutos de diferença do seu relógio.
2. Calcule o HMAC-SHA256 de `${timestamp}.${corpo bruto}` com o segredo (o texto
   hexadecimal de 64 caracteres, como bytes UTF-8).
3. Compare com `X-Vitrine-Signature` em tempo constante.

Node.js:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function vitrineSignatureIsValid(secret, headers, rawBody) {
  const timestamp = headers['x-vitrine-timestamp'];
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const received = String(headers['x-vitrine-signature'] ?? '');
  return received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
```

Cloudflare Worker (Web Crypto), útil como intermediário gratuito na frente de um CRM:

```js
async function vitrineSignatureIsValid(secret, request, rawBody) {
  const timestamp = request.headers.get('x-vitrine-timestamp');
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const match = /^sha256=([a-f0-9]{64})$/.exec(request.headers.get('x-vitrine-signature') ?? '');
  if (!match) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(match[1].match(/../g), (h) => parseInt(h, 16));
  return crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(`${timestamp}.${rawBody}`));
}
```

Guarde o segredo como variável secreta do destino, nunca no código.

## Receitas

As receitas abaixo são pontos de partida; confira a documentação atual de cada
ferramenta, que pode mudar e tem cotas próprias.

### Google Planilhas (Apps Script)

O `doPost` do Apps Script não recebe os cabeçalhos HTTP, então não dá para conferir a
assinatura ali. Duas opções:

- **Simples:** publique o script como app da Web e use o endereço `/exec` (longo e
  imprevisível) como segredo compartilhado; acrescente `?chave=<texto aleatório seu>` e
  confira no script. Quem souber o endereço consegue escrever na planilha.
- **Com assinatura:** ponha um intermediário que verifique a assinatura (o Worker
  acima) e repasse para o Apps Script.

```js
// Extensões > Apps Script, na planilha. Implantar > Nova implantação > App da Web,
// executar como você, acesso "Qualquer pessoa".
const CHAVE = PropertiesService.getScriptProperties().getProperty('CHAVE');

function doPost(e) {
  if (e.parameter.chave !== CHAVE) return ContentService.createTextOutput('negado');
  const data = JSON.parse(e.postData.contents);
  if (data.event !== 'quote.lead.created' && data.event !== 'quote.lead.test') {
    return ContentService.createTextOutput('ignorado');
  }
  const lead = data.lead || {};
  const itens = (lead.items || []).map((i) => `${i.quantity}x ${i.name}`).join(', ');
  SpreadsheetApp.getActive().getSheetByName('Pré-orçamentos').appendRow([
    data.createdAt, data.vitrine.name, lead.category || '', lead.date || '', lead.neighborhood || '', itens,
    data.test ? 'teste' : '', data.deliveryId
  ]);
  return ContentService.createTextOutput('ok');
}
```

Defina a propriedade `CHAVE` em Configurações do projeto > Propriedades do script.
O Apps Script responde 302 ao POST; o painel mostra "Entregue · HTTP 302".

### Kommo

O Kommo recebe pedidos pela API (por exemplo, a entrada de leads "não ordenados"), que
exige token de integração. Não coloque esse token no endereço do webhook da Vitrine:
use um intermediário (o Worker acima, Make, n8n ou similar) que verifique a assinatura
e chame a API do Kommo com o token guardado nele, mapeando `lead.category` para o nome
do negócio, `lead.date` e `lead.neighborhood` para campos personalizados e
`deliveryId` para evitar duplicados.

### BotConversa

Use um fluxo iniciado por webhook de entrada do BotConversa e cole o endereço gerado no
painel. Mapeie `lead.category`, `lead.date` e `lead.neighborhood` para campos do
contato. Como o gatilho não confere a assinatura, o sigilo depende do endereço; para
conferir, ponha o intermediário na frente.

## Privacidade e limites

- Consentimento explícito obrigatório, desmarcado por padrão; a rota recusa
  `consent` diferente de `true` (`422 CONSENT_REQUIRED`).
- Nenhum dado do pré-orçamento fica no banco: `private.quote_webhooks` guarda endereço,
  segredo cifrado, último status (tipo, ok, HTTP, tentativas, horário) e contadores de
  entregas e falhas.
- Limite de 5 envios por endereço IP e vitrine a cada 10 minutos, em memória do
  isolate da borda (`429` com `retry-after`). A chave do limite é o SHA-256 do IP com
  um sal aleatório do isolate; o IP não é gravado nem registrado. O limite é por
  isolate, não global: serve para conter abuso, não como garantia.
- Corpo de até 4 KiB; textos de até 80 caracteres, sem marcação executável.
- O plano gratuito da Cloudflare limita subrequests por pedido; cada pré-orçamento usa
  até 3 tentativas de entrega, até 3 leituras do banco e 1 gravação do status.

## Segredo: decisão de armazenamento

O HMAC precisa do segredo em claro no momento de assinar, então guardar só um hash não
serve. O segredo é gerado no Worker (32 bytes aleatórios, em hexadecimal), devolvido
uma vez na resposta de "Gerar segredo" (`cache-control: no-store`) e gravado cifrado
com AES-256-GCM. A chave vem de HKDF-SHA-256 sobre a variável secreta
`QUOTE_WEBHOOK_ENCRYPTION_KEY` (mínimo de 32 caracteres) e o id da vitrine entra como
dado associado: a cifra de uma vitrine não abre em outra. O banco vê só o texto
cifrado (`v1.<iv>.<cifra>`), lido apenas pelo `service_role`. Trocar a chave de
ambiente invalida todos os segredos; cada dono gera um novo.

## Operação

- Passo humano: `npx wrangler secret put QUOTE_WEBHOOK_ENCRYPTION_KEY` com um valor
  aleatório de pelo menos 32 caracteres (por exemplo `openssl rand -hex 32`). Sem ela,
  "Gerar segredo" e "Enviar teste" respondem `503` e a rota pública responde `404`.
- `SUPABASE_SERVICE_ROLE_KEY` já é usado por outras rotas e também serve aqui.
- Migração `20261116001000_quote_webhooks.sql` (aplicada pelo workflow de deploy).

## Rotas

| Rota | Quem | Resposta |
| --- | --- | --- |
| `GET /api/sites/:id/quote-webhook` | dono ou admin | status (sem segredo) |
| `PUT /api/sites/:id/quote-webhook` `{ url }` | dono ou admin, com o recurso | status |
| `POST /api/sites/:id/quote-webhook/secret` | dono ou admin, com o recurso | `201 { secret, quoteWebhook }`, uma vez |
| `POST /api/sites/:id/quote-webhook/test` | dono ou admin, com o recurso | `{ delivery, quoteWebhook }` |
| `DELETE /api/sites/:id/quote-webhook` | dono ou admin | status vazio |
| `POST /api/sites/:endereço/leads` | público, mesma origem | `202 { accepted: true }`, `404`, `422` ou `429` |

O status (`readQuoteWebhookStatus` em `src/quote-webhook.mjs`) tem `available`,
`requiredPlan` quando bloqueado, `state` (`locked`, `not_configured`, `ready`,
`failing`), `url`, `hasSecret`, `secretCreatedAt`, `lastDelivery` e `totals`. A central
de canais (#125) reaproveita essa função e `describeLastDelivery` de
`web/portal/quote-webhook.mjs`.
