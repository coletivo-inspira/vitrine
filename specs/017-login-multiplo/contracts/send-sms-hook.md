# Contrato: `POST /api/auth/hooks/send-sms`

Chamado pelo Supabase Auth (Send SMS Hook, tipo HTTP) sempre que precisa entregar um código por telefone: entrada por código, confirmação de cadastro com telefone, recuperação e troca de telefone. Não é chamado pelo navegador.

## Requisição

Cabeçalhos (Standard Webhooks):

| Cabeçalho | Regra |
|---|---|
| `webhook-id` | Obrigatório. Recusar se já estiver em `private.auth_hook_events`. |
| `webhook-timestamp` | Obrigatório. Segundos Unix; recusar se a diferença para o relógio do Worker passar de 300 s. |
| `webhook-signature` | Obrigatório. Lista separada por espaço de `v1,<base64>`; aceitar se alguma for igual, em tempo constante, a `base64(HMAC-SHA256(segredo, "${id}.${timestamp}.${corpo}"))`, onde `segredo` são os bytes do base64 depois de `v1,whsec_` em `SUPABASE_AUTH_HOOK_SECRET`. |
| `content-type` | `application/json`. Corpo com no máximo 8 KiB. |

Corpo (campos usados; os demais são ignorados):

```json
{
  "user": { "id": "uuid", "phone": "5511987654321" },
  "sms": { "otp": "123456" }
}
```

## Processamento

1. Validar assinatura, carimbo de tempo, tamanho e repetição; gravar `webhook-id`.
2. Normalizar `user.phone` para a forma canônica (research R4); se não for celular brasileiro, responder `200` sem gravar (o front-end já recusa esses números).
3. Cifrar `sms.otp` (AES-GCM) e chamar `private.store_auth_otp`.
4. Se o limite por hora estourou, responder `200` sem enviar nada (o Supabase não deve repetir) e registrar só a contagem.
5. Se a janela de atendimento estiver aberta, enviar o código já (contrato `whatsapp-webhook.md`, seção "Envio") e chamar `private.take_auth_otp`.
6. Responder `200` com `{}` em menos de 5 s.

## Respostas

| Situação | Status | Corpo |
|---|---|---|
| Aceito (gravado, enviado ou descartado por limite) | `200` | `{}` |
| Assinatura ausente, inválida, carimbo vencido ou repetido | `401` | `{ "error": { "http_code": 401, "message": "invalid signature" } }` |
| Corpo inválido ou grande demais | `400` | `{ "error": { "http_code": 400, "message": "invalid payload" } }` |
| Segredos do Worker ausentes | `503` | `{ "error": { "http_code": 503, "message": "hook unavailable" } }` |

O formato `error.http_code`/`error.message` é o que o Supabase Auth repassa ao cliente. As mensagens NÃO DEVEM conter telefone, código ou detalhes internos.

## Testes obrigatórios

- Assinatura válida grava uma linha e não registra o código nem o telefone em log.
- Assinatura errada, ausente, carimbo de 6 minutos atrás e `webhook-id` repetido: `401`, nada gravado.
- Número sem o nono dígito e com o nono dígito geram o mesmo `phone_hash`.
- Sexto pedido na mesma hora: `200`, sem envio.
- Janela aberta: envio imediato e `take_auth_otp` chamado uma vez.
