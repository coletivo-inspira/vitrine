---
titulo: "[Login múltiplo] Proteção contra abuso: Turnstile, limites e logs sem dados pessoais"
rotulos: autenticacao, painel, enhancement
depende: 02, 04
---
## Contexto

Cadastro, entrada com senha e pedido de código são formulários públicos. Sem proteção, robôs
podem criar contas, testar senhas ou disparar mensagens. Precisa estar pronta antes de ligar os
métodos em produção.

## Escopo

- Cloudflare Turnstile (gratuito) no `web/portal/auth-form.mjs`, carregado só quando
  `turnstileSiteKey` existir, com o token em `gotrue_meta_security.captcha_token`.
- CSP do `/portal/` em `web/_headers` e em `workers/api.mjs` com
  `https://challenges.cloudflare.com` em `script-src` e `frame-src`, só nessa rota; ajustar
  `test/security-rls-csp-audit.test.mjs`.
- Revisar os limites do Supabase Auth (*Rate Limits*) para o piloto e documentar.
- Teste que procura e-mail, telefone, código e segredos nos logs capturados, no bundle e em
  `dist/`.

## Critérios de aceite

- [ ] Pedido sem token do Turnstile é recusado pelo Supabase e a tela pede nova tentativa
      (simulado).
- [ ] A CSP das demais rotas continua igual (teste).
- [ ] O teste de dados pessoais falha se um log de teste incluir um telefone ou e-mail de exemplo.
- [ ] Passo humano `BLK-TURNSTILE-01` documentado em `docs/supabase-provisioning.md`.

## Dependências

- {{issue:02}} `02-email-e-senha.md` e {{issue:04}} `04-entrar-com-codigo-whatsapp.md`.
- Passo humano `BLK-TURNSTILE-01`.

## Referências

- `specs/017-login-multiplo/spec.md` (US5) e `research.md` (R7); tasks T035 a T038.
