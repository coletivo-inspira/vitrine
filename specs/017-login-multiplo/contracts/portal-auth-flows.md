# Contrato: chamadas do portal ao Supabase Auth

O navegador fala direto com o Supabase Auth (a CSP do `/portal/` já permite `connect-src` para o projeto) e sempre termina em `POST /api/auth/session` com o `access_token`, como no Google. A exceção é a confirmação de código por telefone, que passa pelo Worker (`POST /api/auth/otp/verify`, abaixo). Todas as chamadas ao Supabase levam `apikey: <publishableKey>`. Quando há `turnstileSiteKey`, o corpo inclui `"gotrue_meta_security": { "captcha_token": "<token>" }`.

| Fluxo | Chamada | Próximo passo |
|---|---|---|
| Cadastro por e-mail | `POST /auth/v1/signup` `{ email, password, code_challenge, code_challenge_method: "s256" }` com `redirect_to=<origem>/portal/?fluxo=confirmar` | Mostrar "Enviamos um link de confirmação"; o retorno com `?code=` usa `exchangePkceCode()`. |
| Entrada por e-mail ou telefone e senha | `POST /auth/v1/token?grant_type=password` `{ email \| phone, password }` | `POST /api/auth/session`. |
| Recuperação por e-mail | `POST /auth/v1/recover` `{ email, code_challenge, code_challenge_method: "s256" }` com `redirect_to=<origem>/portal/?fluxo=recuperar` | No retorno, trocar o código e abrir "Definir nova senha". |
| Definir nova senha | `PUT /auth/v1/user` `{ password }` com `Authorization: Bearer <access_token>` | `POST /api/auth/session`. |
| Pedir código pelo WhatsApp | `POST /auth/v1/otp` `{ phone, create_user: true }` | Mostrar "Abrir WhatsApp" (`https://wa.me/<whatsappNumber>?text=<mensagem pronta>`) e o campo de 6 dígitos. |
| Cadastro por telefone e senha | `POST /auth/v1/signup` `{ phone, password }` | Mesmo passo "Abrir WhatsApp". |
| Confirmar código | `POST /api/auth/otp/verify` `{ phone, token }` no Worker | `POST /api/auth/session`; se `fluxo=recuperar`, antes abrir "Definir nova senha". |

Regras:

- O estado do fluxo (`fluxo`, `pkce_verifier`, telefone mascarado para exibição) fica em `sessionStorage` e é apagado ao terminar ou falhar, como em `cleanupPkceState()`.
- Mensagem pronta do WhatsApp: "Quero meu código de acesso à Vitrine". Não leva o telefone nem identificadores.
- Erros do Supabase são traduzidos para mensagens neutras (`spec.md`, FR-011); o texto original não é exibido nem registrado.
- `429` de qualquer chamada (inclusive o `429` que o Send SMS Hook devolve por `/auth/v1/otp` e `/auth/v1/signup`; [`send-sms-hook.md`](send-sms-hook.md)) vira "Muitas tentativas. Tente de novo em alguns minutos." (US3, cenário 7; US5, cenário 6).
- O painel nunca chama `/auth/v1/verify` com `type: "sms"` direto (FR-010).
- Reenvio do código liberado só depois de 60 s, com contagem regressiva visível e anunciada a cada 15 s.

## `POST /api/auth/otp/verify`

*Decisão proposta (revisar no PR; research S5)*. Rota do Worker que confirma o código por telefone e conta os erros por telefone (FR-010).

Requisição:

- `Origin` igual à origem do painel e `content-type: application/json` (mesma regra de `validateMutationOriginAndJson(..., { requireOrigin: true })` em `workers/api.mjs`); corpo com no máximo 2 KiB.
- Corpo: `{ "phone": "+5511987654321", "token": "123456" }`.

Processamento:

1. Se `whatsappOtp` e `phonePassword` estiverem desligados (contrato `auth-config.md`), responder `503`.
2. Normalizar `phone` (research R4) e calcular `phone_hash`; conferir `token` com seis dígitos. Formato inválido: `400`, sem tentativa contada e sem chamar o Supabase.
3. `private.reserve_otp_attempt(phone_hash)`: `none` responde `400`; `locked` responde `429`.
4. `POST ${SUPABASE_URL}/auth/v1/verify` `{ "type": "sms", phone, token }` com `apikey: <publishableKey>` e tempo limite de 4 s.
5. Supabase `200`: `private.finish_otp_attempt(phone_hash, 'success')` e resposta `200` com a sessão. Supabase `4xx`, exceto `429` (código errado, vencido ou já usado): `finish_otp_attempt(phone_hash, 'failure')`; se foi a quinta, responder `429`, senão `400`. Supabase `429`, `5xx` ou tempo esgotado: `finish_otp_attempt(phone_hash, 'unknown')` e responder `429` ou `503`.

Respostas (`Cache-Control: no-store`):

| Situação | Status | Corpo | Mensagem no painel |
|---|---|---|---|
| Código correto | `200` | `{ "access_token", "refresh_token", "expires_in", "token_type" }` | Segue para `POST /api/auth/session`. |
| Código errado, vencido, já usado, inexistente ou com formato inválido | `400` | `{ "error": "invalid_code" }` | "Código incorreto ou vencido. Confira ou peça outro." |
| Quinto erro, código já bloqueado ou Supabase com `429` | `429` | `{ "error": "too_many_attempts" }` | "Muitas tentativas. Peça um novo código." |
| Método desligado, Supabase fora do ar ou tempo esgotado | `503` | `{ "error": "unavailable" }` | "Não conseguimos confirmar o código agora." |
| Origem ou `content-type` inválidos | `403` / `415` | Formato atual de `errorResponse` | Erro genérico. |

As respostas não dizem se a conta existe nem quantas tentativas restam, e nada é registrado com telefone ou código.

Testes obrigatórios (`test/auth-otp-verify.test.mjs`, com `fetch` simulado para o Supabase):

- Código correto: uma chamada a `/auth/v1/verify` com `type: "sms"` e contador zerado.
- Cinco códigos errados: a quinta resposta é `429`; a sexta também, sem chamar o Supabase; um código novo (`store_auth_otp`) libera de novo.
- Cinco pedidos simultâneos com o código errado e mais um: no máximo 5 chamadas ao Supabase.
- Supabase com `503` ou tempo esgotado: a tentativa não é contada.
- Formato inválido, sem código pendente, origem errada: nenhuma chamada ao Supabase.
- Nenhum telefone ou código nos logs capturados.

Risco residual (a reconferir): uma chamada direta a `/auth/v1/verify` com a chave pública não passa por esta rota; fica limitada só pelo limite de verificações por IP do Supabase e pela validade do código (research S2 e S5).
