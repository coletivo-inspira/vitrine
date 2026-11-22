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

*Decisões propostas (revisar no PR)*: resposta `429` no limite (research S7) e prazo total de 4 s (research S8).

O prazo total é de 4 s, contado da chegada da requisição e compartilhado por todos os passos.

1. Validar assinatura, carimbo de tempo, tamanho e repetição; gravar `webhook-id`.
2. Normalizar `user.phone` para a forma canônica (research R4); se não for celular brasileiro, responder `200` sem gravar (o front-end já recusa esses números).
3. Cifrar `sms.otp` (AES-GCM, chave derivada; `data-model.md`, "Chaves derivadas") e chamar `private.store_auth_otp`.
4. Se o limite por hora estourou, responder `429` com `{ "error": { "http_code": 429, "message": "too many requests" } }`, sem cabeçalho `retry-after`, sem substituir o código pendente e sem enviar nada; registrar só a contagem. O painel traduz para "Muitas tentativas. Tente de novo em alguns minutos." (`portal-auth-flows.md`).
5. Se a janela de atendimento estiver aberta, decifrar o `wa_id` devolvido por `store_auth_otp`, enviar o código (contrato `whatsapp-webhook.md`, seção "Envio") e, só depois do envio aceito, chamar `private.take_auth_otp`. Cada tentativa de envio usa como tempo limite o menor valor entre 3 s e o tempo restante menos 300 ms; a única nova tentativa (só para `5xx`) acontece se restar pelo menos 1 s. Sem tempo ou com falha, o código fica pendente e é entregue quando a pessoa enviar a mensagem.
6. Responder `200` com `{}` dentro do prazo de 4 s.

## Respostas

| Situação | Status | Corpo |
|---|---|---|
| Aceito (gravado, enviado ou fora do Brasil) | `200` | `{}` |
| Mais de 5 pedidos por telefone na hora | `429` | `{ "error": { "http_code": 429, "message": "too many requests" } }`, sem `retry-after` |
| Assinatura ausente, inválida, carimbo vencido ou repetido | `401` | `{ "error": { "http_code": 401, "message": "invalid signature" } }` |
| Corpo inválido ou grande demais | `400` | `{ "error": { "http_code": 400, "message": "invalid payload" } }` |
| Segredos do Worker ausentes | `503` | `{ "error": { "http_code": 503, "message": "hook unavailable" } }` |

O formato `error.http_code`/`error.message` é o que o Supabase Auth repassa ao cliente; o repasse do `429` e a ausência de nova chamada sem `retry-after` são a reconferir no projeto de teste (research S7). As mensagens NÃO DEVEM conter telefone, código ou detalhes internos.

## Testes obrigatórios

- Assinatura válida grava uma linha e não registra o código nem o telefone em log.
- Assinatura errada, ausente, carimbo de 6 minutos atrás e `webhook-id` repetido: `401`, nada gravado.
- Número sem o nono dígito e com o nono dígito geram o mesmo `phone_hash`.
- Sexto pedido na mesma hora: `429` no formato acima, sem `retry-after`, sem envio e com o código anterior intacto.
- Janela aberta: envio imediato e `take_auth_otp` chamado uma vez.
- Graph API lenta (relógio e `fetch` simulados): a resposta sai em até 4 s; com `5xx` e menos de 1 s restante, não há nova tentativa e o código continua pendente.
- Nenhuma linha gravada contém o telefone, o `wa_id` ou o código em texto puro.
