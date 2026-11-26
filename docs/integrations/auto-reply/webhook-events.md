# Eventos de webhook da AutoResposta

Contrato completo em [`meta-endpoints.md`](../../../specs/019-autoresposta/contracts/meta-endpoints.md); código em `src/auto-reply/instagram-webhook.mjs`; fixtures em `test/fixtures/meta-instagram-webhooks.mjs` (IDs fictícios, formato dos exemplos oficiais).

## Formato (login unificado; mensagens)

```json
{
  "object": "instagram",
  "entry": [{
    "id": "<conta profissional do negócio>",
    "time": 1764180000000,
    "messaging": [{
      "sender": { "id": "<IGSID do consumidor>" },
      "recipient": { "id": "<conta do negócio>" },
      "timestamp": 1764180000000,
      "message": { "mid": "<id da mensagem>", "text": "..." }
    }]
  }]
}
```

O Worker lê só `entry.id`, `sender.id`, `recipient.id`, `timestamp` e `message.mid`. O texto e os anexos nunca saem do parser.

## Elegibilidade

| Evento | Atributo | Resultado |
| --- | --- | --- |
| Mensagem nova de consumidor (texto ou anexo) | `message.mid`, remetente ≠ conta | Elegível |
| Mensagem do próprio negócio (inclusive a resposta da Vitrine) | `message.is_echo` ou `sender.id = entry.id` | Ignorado (`echo`) |
| Teste do console | `message.is_self` | Ignorado (`self_test`) |
| Mensagem apagada | `message.is_deleted` | Ignorado |
| Mídia não suportada | `message.is_unsupported` | Ignorado |
| Resposta rápida (botão) | `message.quick_reply` | Ignorado |
| Leitura | `read` | Ignorado |
| Reação | `reaction` | Ignorado |
| Edição | `message_edit` | Ignorado |
| Postback (Ice Breaker, botão) | `postback` | Ignorado |
| Referência (`ig.me`, anúncio) sem mensagem | `referral` | Ignorado |
| Aviso de handoff sem `mid` | sem `message.mid` | Ignorado |
| Campos de mudança (`changes`) | `entry.changes` | Ignorado |

Os campos `messaging_seen`, `message_reactions`, `messaging_postbacks` e `messaging_referral` não são assinados; a tabela cobre o caso de a Meta mandar mesmo assim.

## Confiabilidade

| Tema | Tratamento |
| --- | --- |
| Assinatura | HMAC-SHA256 do corpo bruto com `META_APP_SECRET`, comparação em tempo constante (`crypto.subtle.verify`) |
| Validação estrutural | `object = instagram`, IDs numéricos, `mid` até 256 caracteres, hora válida |
| Lotes | Cada evento tratado à parte; até 5 reclamações novas e 12 tentativas por requisição |
| Idempotência | `UNIQUE (provider, provider_event_id)` |
| Concorrência | Vaga de frequência atômica no banco |
| Fora de ordem | A frequência usa a hora do envio; eventos anteriores à ativação são ignorados |
| Reentregas | Ignoradas pela idempotência; a Meta reentrega por até 36 h quando o Worker responde erro |
| Eventos antigos | Mais de 23 h → `window_expired` (janela padrão de 24 h) |
| Limite de requisições | Até 3 tentativas com espera de 1 s e 3 s |
| Falha transitória × definitiva | `rate_limited`/`unavailable` × token, permissão, destinatário, rejeição |
| Resultado incerto | `uncertain`, sem reenvio |
| Recuperação | Execuções presas há 15 min viram `uncertain` no Cron; nada é reenviado sem novo evento |
| Desativado | Releitura antes do envio cancela |
