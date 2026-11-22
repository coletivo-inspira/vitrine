# Contrato: chamadas do portal ao Supabase Auth

O navegador fala direto com o Supabase Auth (a CSP do `/portal/` já permite `connect-src` para o projeto) e sempre termina em `POST /api/auth/session` com o `access_token`, como no Google. Todas as chamadas levam `apikey: <publishableKey>`. Quando há `turnstileSiteKey`, o corpo inclui `"gotrue_meta_security": { "captcha_token": "<token>" }`.

| Fluxo | Chamada | Próximo passo |
|---|---|---|
| Cadastro por e-mail | `POST /auth/v1/signup` `{ email, password, code_challenge, code_challenge_method: "s256" }` com `redirect_to=<origem>/portal/?fluxo=confirmar` | Mostrar "Enviamos um link de confirmação"; o retorno com `?code=` usa `exchangePkceCode()`. |
| Entrada por e-mail ou telefone e senha | `POST /auth/v1/token?grant_type=password` `{ email \| phone, password }` | `POST /api/auth/session`. |
| Recuperação por e-mail | `POST /auth/v1/recover` `{ email, code_challenge, code_challenge_method: "s256" }` com `redirect_to=<origem>/portal/?fluxo=recuperar` | No retorno, trocar o código e abrir "Definir nova senha". |
| Definir nova senha | `PUT /auth/v1/user` `{ password }` com `Authorization: Bearer <access_token>` | `POST /api/auth/session`. |
| Pedir código pelo WhatsApp | `POST /auth/v1/otp` `{ phone, create_user: true }` | Mostrar "Abrir WhatsApp" (`https://wa.me/<whatsappNumber>?text=<mensagem pronta>`) e o campo de 6 dígitos. |
| Cadastro por telefone e senha | `POST /auth/v1/signup` `{ phone, password }` | Mesmo passo "Abrir WhatsApp". |
| Confirmar código | `POST /auth/v1/verify` `{ type: "sms", phone, token }` | `POST /api/auth/session`; se `fluxo=recuperar`, antes abrir "Definir nova senha". |

Regras:

- O estado do fluxo (`fluxo`, `pkce_verifier`, telefone mascarado para exibição) fica em `sessionStorage` e é apagado ao terminar ou falhar, como em `cleanupPkceState()`.
- Mensagem pronta do WhatsApp: "Quero meu código de acesso à Vitrine". Não leva o telefone nem identificadores.
- Erros do Supabase são traduzidos para mensagens neutras (`spec.md`, FR-011); o texto original não é exibido nem registrado.
- Reenvio do código liberado só depois de 60 s, com contagem regressiva visível e anunciada a cada 15 s.
