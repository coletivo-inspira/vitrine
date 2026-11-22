# Modelo de dados: login múltiplo

Os usuários, identidades, senhas e códigos continuam no esquema `auth` do Supabase, administrado pelo Supabase Auth. Esta especificação só acrescenta uma tabela privada para a entrega do código pelo WhatsApp.

## `private.auth_otp_outbox`

Código de acesso pendente de entrega. Uma linha por telefone; um pedido novo substitui o anterior.

| Coluna | Tipo | Regra |
|---|---|---|
| `phone_hash` | `text` | Chave primária. HMAC-SHA256 do telefone canônico (R4) com `AUTH_PHONE_PEPPER`, em hexadecimal. |
| `otp_ciphertext` | `bytea` | Código cifrado com AES-GCM (`AUTH_OTP_ENC_KEY`). `null` depois da entrega. |
| `otp_iv` | `bytea` | Vetor de inicialização de 12 bytes, novo a cada código. |
| `purpose` | `text` | `login`, `signup`, `recovery` ou `phone_change`, a partir do tipo informado no hook; só para mensagens e métricas. |
| `requested_at` | `timestamptz` | Momento do hook. |
| `expires_at` | `timestamptz` | `requested_at + 10 minutos`. |
| `delivered_at` | `timestamptz` | Momento da entrega pelo WhatsApp; `null` enquanto pendente. |
| `request_count` | `integer` | Pedidos na hora corrente, para o limite de 5 por hora. |
| `window_reset_at` | `timestamptz` | Início da hora corrente do limite. |

Índices: `expires_at` (limpeza no cron).

## `private.whatsapp_service_windows`

Última mensagem recebida de cada número, para saber se a janela de 24 horas está aberta e entregar o código direto.

| Coluna | Tipo | Regra |
|---|---|---|
| `phone_hash` | `text` | Chave primária, mesmo HMAC da tabela anterior. |
| `wa_id` | `text` | Identificador do WhatsApp para responder (pode não ter o nono dígito). Apagado junto com a linha. |
| `last_inbound_at` | `timestamptz` | Momento da última mensagem recebida. |
| `last_message_id` | `text` | Último `messages[].id` processado, para ignorar repetição do webhook. |

Linhas com `last_inbound_at` mais antigo que 24 horas são apagadas no cron. O `wa_id` é dado pessoal; fica só durante a janela e nunca entra em logs.

## `private.auth_hook_events`

Identificadores já processados do Send SMS Hook (`webhook-id`) para recusar repetição.

| Coluna | Tipo | Regra |
|---|---|---|
| `webhook_id` | `text` | Chave primária. |
| `received_at` | `timestamptz` | Apagado no cron depois de 1 hora. |

## Permissões

- As três tabelas ficam no esquema `private`, com `revoke all ... from public, anon, authenticated`, como as demais tabelas privadas do projeto.
- Só o Worker as acessa, por funções `security definer` chamadas com `SUPABASE_SERVICE_ROLE_KEY`:
  - `private.store_auth_otp(phone_hash, ciphertext, iv, purpose)`: grava ou substitui e devolve `{ allowed, window_open, wa_id }`, aplicando o limite por hora.
  - `private.take_auth_otp(phone_hash)`: devolve e anula o código pendente não vencido, marcando `delivered_at`, em uma única transação (uso único).
  - `private.touch_whatsapp_window(phone_hash, wa_id, message_id)`: registra a mensagem recebida e devolve `false` se o `message_id` já foi processado.
  - `private.purge_auth_otp()`: limpeza chamada pelo cron.
- Testes em PGlite DEVEM provar que `anon` e `authenticated` não leem nem escrevem nessas tabelas e que `take_auth_otp` não entrega o mesmo código duas vezes.

## Segredos do Worker (só `wrangler secret put`)

| Nome | Uso |
|---|---|
| `SUPABASE_AUTH_HOOK_SECRET` | Verificar a assinatura do Send SMS Hook (`v1,whsec_...`). |
| `AUTH_OTP_ENC_KEY` | Chave AES-GCM de 256 bits, em base64, para cifrar o código. |
| `AUTH_PHONE_PEPPER` | Segredo do HMAC do telefone. |
| `WHATSAPP_APP_SECRET` | Verificar `X-Hub-Signature-256` do webhook da Meta. |
| `WHATSAPP_VERIFY_TOKEN` | Responder ao desafio `hub.verify_token` ao assinar o webhook. |
| `WHATSAPP_ACCESS_TOKEN` | Token de usuário do sistema com `whatsapp_business_messaging`. |

Variáveis não secretas em `wrangler.jsonc`: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_DISPLAY_NUMBER` (para o link `wa.me`), `WHATSAPP_GRAPH_VERSION`, `AUTH_METHODS` (lista de métodos ligados) e `TURNSTILE_SITE_KEY`.
