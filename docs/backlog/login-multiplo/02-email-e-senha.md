---
titulo: "[Login múltiplo] Cadastro, entrada e recuperação com e-mail e senha"
rotulos: autenticacao, painel, enhancement
depende: 01
---
## Contexto

Quem não tem conta Google não consegue criar conta no painel. O Supabase Auth já oferece e-mail
e senha; falta ligar o fluxo na nova tela e configurar um SMTP próprio gratuito, porque o SMTP
padrão do Supabase só envia para a equipe do projeto.

## Escopo

- Cadastro com `POST /auth/v1/signup` e PKCE (`redirect_to=/portal/?fluxo=confirmar`).
- Entrada com `POST /auth/v1/token?grant_type=password` e `POST /api/auth/session`.
- "Esqueceu sua senha?" com `POST /auth/v1/recover` e PKCE (`fluxo=recuperar`), formulário
  "Definir nova senha" e `PUT /auth/v1/user`.
- Generalizar `exchangePkceCode()` em `web/portal/portal.js` para os retornos de confirmação e
  recuperação, mantendo o Google.
- Senha com no mínimo 8 caracteres, letra e número (navegador e configuração do Supabase).
- Mensagens neutras: e-mail existente recebe a mesma resposta do novo; erro de entrada sempre
  "E-mail, telefone ou senha incorretos".
- Documentar o passo humano `BLK-SMTP-01` e os modelos de e-mail em português em
  `docs/supabase-provisioning.md`.

Contrato: [chamadas do portal ao Supabase Auth](../../../specs/017-login-multiplo/contracts/portal-auth-flows.md).

## Fora de escopo

- Turnstile ({{issue:06}}); vincular conta de telefone a conta de e-mail.

## Critérios de aceite

- [ ] Testes com `fetch` simulado: cadastro, e-mail repetido com a mesma resposta, senha errada
      com mensagem neutra, recuperação e link de recuperação que não funciona duas vezes.
- [ ] Conta criada por e-mail e senha e depois acessada por Google com o mesmo e-mail verificado
      tem o mesmo `user.id` (teste com resposta simulada do Supabase).
- [ ] Nenhum e-mail ou senha nos logs de teste.
- [ ] Método entra desligado em `AUTH_METHODS` até `BLK-SMTP-01`.
- [ ] Teste real com SMTP registrado no PR depois de `BLK-SMTP-01`.

## Dependências

- {{issue:01}} `01-tela-de-entrada.md`.
- Passo humano `BLK-SMTP-01` (SMTP gratuito com SPF e DKIM em `inspira.dev.br`).

## Referências

- `specs/017-login-multiplo/spec.md` (US2) e `research.md` (R5); tasks T022 a T026.
