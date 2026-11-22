# Contrato: `GET` e `POST /api/whatsapp/webhook`

Webhook da WhatsApp Cloud API (Meta) para o número da Vitrine. Recebe as mensagens que as pessoas enviam e responde com o código pendente. É a única rota que envia mensagens pelo WhatsApp neste escopo.

## `GET` (assinatura do webhook)

Parâmetros: `hub.mode`, `hub.verify_token`, `hub.challenge`.

- `hub.mode === "subscribe"` e `hub.verify_token` igual a `WHATSAPP_VERIFY_TOKEN` (tempo constante): `200` com o texto de `hub.challenge` (`text/plain`).
- Qualquer outro caso: `403`.

## `POST` (mensagens)

Cabeçalho `X-Hub-Signature-256: sha256=<hex>`, igual em tempo constante a `HMAC-SHA256(WHATSAPP_APP_SECRET, corpo bruto)`. Corpo com no máximo 64 KiB.

Campos usados de cada `entry[].changes[]` com `field === "messages"`:

```json
{
  "value": {
    "metadata": { "phone_number_id": "..." },
    "messages": [
      { "id": "wamid...", "from": "551187654321", "timestamp": "1763820000", "type": "text" }
    ]
  }
}
```

- `statuses[]` (entregue, lido, falhou) é ignorado, exceto para contar falhas de envio sem dados pessoais.
- `metadata.phone_number_id` diferente de `WHATSAPP_PHONE_NUMBER_ID`: ignorar a entrada.

*Decisão proposta (revisar no PR; research S8)*: o Worker valida tamanho e assinatura, responde `200` à Meta e faz o processamento abaixo em `ctx.waitUntil`, com prazo de 8 s contado da chegada, para o código chegar em até 10 s (US3, cenário 2).

Para cada mensagem, dentro de `ctx.waitUntil`:

1. Normalizar `from` (research R4) e calcular `phone_hash`.
2. Cifrar `from` (AES-GCM, chave derivada; `data-model.md`, "Chaves derivadas"), calcular o HMAC do `id` e chamar `private.touch_whatsapp_window(phone_hash, wa_id_ciphertext, wa_id_iv, message_id_hash)`; se o `id` já foi processado, seguir para a próxima. `from` e `id` não são gravados em texto puro (FR-009).
3. `private.take_auth_otp(phone_hash)`:
   - Com código: enviar "Seu código de acesso à Vitrine é NNNNNN. Ele vale por 10 minutos. Não compartilhe com ninguém."
   - Sem código: enviar no máximo uma vez a cada 10 minutos por número "Para receber um código, abra painel.inspira.dev.br/portal/, escolha WhatsApp e informe este número." O conteúdo da mensagem recebida não é lido nem gravado.

Responder `200` sempre que a assinatura for válida, antes do processamento e mesmo que o envio falhe depois, para a Meta não repetir; `401` quando inválida.

## Envio

`POST https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages` com `Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}`:

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "<from recebido>",
  "type": "text",
  "text": { "preview_url": false, "body": "..." }
}
```

- Só texto livre (mensagem de serviço). NUNCA `type: "template"`.
- Tempo limite de cada tentativa: o menor valor entre 3 s e o tempo restante do prazo de quem chama (4 s no hook, 8 s no webhook) menos 300 ms. Uma única nova tentativa, só para `5xx` e só se restar pelo menos 1 s. No webhook, falha não devolve o código à tabela (a pessoa pede outro); no hook, o código continua pendente (`send-sms-hook.md`).
- Erro `131047` (janela de 24 h fechada) ou similar: registrar só o código do erro.

## Testes obrigatórios

- Desafio `GET` correto e errado.
- `POST` sem assinatura ou com assinatura errada: `401`, nenhuma chamada à Graph API.
- Mensagem com código pendente: uma chamada à Graph API com `type: "text"` e o código; segunda entrega do mesmo webhook (`id` repetido) não envia de novo.
- Mensagem sem código pendente: no máximo uma orientação em 10 minutos.
- Nenhum `type: "template"` em todo o módulo (teste estático).
- A resposta `200` sai antes da chamada à Graph API; o envio roda em `ctx.waitUntil` (contexto simulado) e respeita o prazo de 8 s com Graph API lenta.
- Nenhuma linha gravada contém `from` ou `messages[].id` em texto puro.
