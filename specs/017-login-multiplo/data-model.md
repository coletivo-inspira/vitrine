# Modelo de dados: login múltiplo

Os usuários, identidades, senhas e códigos continuam no esquema `auth` do Supabase, administrado pelo Supabase Auth. Esta especificação só acrescenta tabelas privadas para a entrega e a verificação do código pelo WhatsApp.

## `private.auth_otp_outbox`

Código de acesso pendente de entrega. Uma linha por telefone; um pedido novo substitui o anterior.

| Coluna | Tipo | Regra |
|---|---|---|
| `phone_hash` | `text` | Chave primária. HMAC-SHA256 do telefone canônico (R4) com `AUTH_PHONE_PEPPER`, em hexadecimal. |
| `otp_ciphertext` | `bytea` | Código cifrado com AES-GCM (chave derivada de `AUTH_OTP_ENC_KEY`; ver "Chaves derivadas"). `null` depois da entrega. |
| `otp_iv` | `bytea` | Vetor de inicialização de 12 bytes, novo a cada código. |
| `purpose` | `text` | `login`, `signup`, `recovery` ou `phone_change`, a partir do tipo informado no hook; só para mensagens e métricas. |
| `requested_at` | `timestamptz` | Momento do hook. |
| `expires_at` | `timestamptz` | `requested_at + 10 minutos`. |
| `delivered_at` | `timestamptz` | Momento da entrega pelo WhatsApp; `null` enquanto pendente. |
| `request_count` | `integer` | Pedidos na hora corrente, para o limite de 5 por hora. |
| `window_reset_at` | `timestamptz` | Início da hora corrente do limite. |
| `failed_attempts` | `integer` | Tentativas de verificação pelo Worker para o código atual (FR-010). Zerado a cada código novo; com 5, o código fica invalidado. *Decisão proposta (revisar no PR; research S5)*. |

Índices: `expires_at` (limpeza no cron).

A linha continua valendo para a verificação depois da entrega: `take_auth_otp` anula só o código cifrado, e `failed_attempts` e `expires_at` seguem até o código vencer ou ser usado.

## `private.whatsapp_service_windows`

Última mensagem recebida de cada número, para saber se a janela de 24 horas está aberta e entregar o código direto.

| Coluna | Tipo | Regra |
|---|---|---|
| `phone_hash` | `text` | Chave primária, mesmo HMAC da tabela anterior. |
| `wa_id_ciphertext` | `bytea` | Identificador do WhatsApp para responder (pode não ter o nono dígito), cifrado com AES-GCM (chave derivada de `AUTH_OTP_ENC_KEY`). Apagado junto com a linha. *Decisão proposta (revisar no PR; research S3)*. |
| `wa_id_iv` | `bytea` | Vetor de inicialização de 12 bytes, novo a cada gravação do `wa_id`. |
| `last_inbound_at` | `timestamptz` | Momento da última mensagem recebida. |
| `last_message_id` | `text` | HMAC-SHA256, em hexadecimal, do último `messages[].id` processado, para ignorar repetição do webhook. O `wamid` não é gravado em texto puro, porque costuma trazer o número codificado. |

Linhas com `last_inbound_at` mais antigo que 24 horas são apagadas no cron horário, então ficam no máximo 25 horas. O `wa_id` é dado pessoal: só existe cifrado, durante a janela, e nunca entra em logs.

## `private.auth_hook_events`

Identificadores já processados do Send SMS Hook (`webhook-id`) para recusar repetição.

| Coluna | Tipo | Regra |
|---|---|---|
| `webhook_id` | `text` | Chave primária. |
| `received_at` | `timestamptz` | Apagado no cron depois de 1 hora. |

## Permissões

- As três tabelas ficam no esquema `private`, com `revoke all ... from public, anon, authenticated`, como as demais tabelas privadas do projeto.
- Só o Worker as acessa, por funções `security definer` chamadas com `SUPABASE_SERVICE_ROLE_KEY`:
  - `private.store_auth_otp(phone_hash, ciphertext, iv, purpose)`: grava ou substitui o código, zera `failed_attempts` e devolve `{ allowed, window_open, wa_id_ciphertext, wa_id_iv }`, aplicando o limite por hora. Com `allowed = false`, não substitui o código pendente (o hook responde `429`; research S7).
  - `private.take_auth_otp(phone_hash)`: devolve e anula o código pendente não vencido, marcando `delivered_at`, em uma única transação (uso único).
  - `private.touch_whatsapp_window(phone_hash, wa_id_ciphertext, wa_id_iv, message_id_hash)`: registra a mensagem recebida e devolve `false` se o `message_id_hash` já foi processado.
  - `private.reserve_otp_attempt(phone_hash)`: em uma única instrução, soma 1 a `failed_attempts` se houver código não vencido com menos de 5 tentativas e devolve `ok`; devolve `locked` com 5 tentativas e `none` sem código válido. A reserva antes de chamar o Supabase impede que pedidos simultâneos passem de 5. *Decisão proposta (revisar no PR; research S5)*.
  - `private.finish_otp_attempt(phone_hash, outcome)`: `success` encerra o código (`expires_at = now()`, contador zerado); `failure` mantém a tentativa contada e devolve quantas restam; `unknown` (Supabase com `429`, `5xx` ou tempo esgotado) devolve a tentativa reservada.
  - `private.purge_auth_otp()`: limpeza chamada pelo cron.
- Testes em PGlite DEVEM provar que `anon` e `authenticated` não leem nem escrevem nessas tabelas, que `take_auth_otp` não entrega o mesmo código duas vezes, que `reserve_otp_attempt` não passa de 5 tentativas e que nenhuma coluna guarda telefone, `wa_id`, `wamid` ou código em texto puro.

## Retenção e texto puro (FR-009)

*Decisão proposta (revisar no PR; research S3)*.

| Tabela | Dado pessoal | Forma gravada | Retenção máxima |
|---|---|---|---|
| `private.auth_otp_outbox` | telefone, código | `phone_hash` (HMAC); código cifrado | Código: 10 minutos depois do pedido. Linha sem código: apagada pelo cron quando o código venceu e a hora do limite (`window_reset_at`) já passou, no máximo 2 horas. |
| `private.whatsapp_service_windows` | telefone, `wa_id`, `wamid` | `phone_hash` (HMAC); `wa_id` cifrado; `wamid` como HMAC | 25 horas |
| `private.auth_hook_events` | nenhum | `webhook-id` do Supabase | 1 hora |

## Chaves derivadas

*Decisão proposta (revisar no PR; research S3)*. O Worker deriva as chaves com HKDF-SHA256 (WebCrypto) a partir dos segredos abaixo, com `info` diferente para cada uso:

| Segredo | `info` | Uso |
|---|---|---|
| `AUTH_OTP_ENC_KEY` | `vitrine/auth/otp/v1` | AES-GCM do código. |
| `AUTH_OTP_ENC_KEY` | `vitrine/auth/wa-id/v1` | AES-GCM do `wa_id`. |
| `AUTH_PHONE_PEPPER` | `vitrine/auth/wamid/v1` | HMAC do `messages[].id`. |

O `phone_hash` continua sendo o HMAC-SHA256 do telefone canônico com `AUTH_PHONE_PEPPER`. Os dados associados do AES-GCM levam o `phone_hash` da linha.

## Segredos do Worker (só `wrangler secret put`)

| Nome | Uso |
|---|---|
| `SUPABASE_AUTH_HOOK_SECRET` | Verificar a assinatura do Send SMS Hook (`v1,whsec_...`). |
| `AUTH_OTP_ENC_KEY` | Chave-mestra de 256 bits, em base64, das chaves AES-GCM do código e do `wa_id` ("Chaves derivadas"). |
| `AUTH_PHONE_PEPPER` | Segredo do HMAC do telefone e, por derivação, do `messages[].id`. |
| `WHATSAPP_APP_SECRET` | Verificar `X-Hub-Signature-256` do webhook da Meta. |
| `WHATSAPP_VERIFY_TOKEN` | Responder ao desafio `hub.verify_token` ao assinar o webhook. |
| `WHATSAPP_ACCESS_TOKEN` | Token de usuário do sistema com `whatsapp_business_messaging`. |

Variáveis não secretas em `wrangler.jsonc`: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_DISPLAY_NUMBER` (para o link `wa.me`), `WHATSAPP_GRAPH_VERSION`, `AUTH_METHODS` (lista de métodos ligados) e `TURNSTILE_SITE_KEY`.
