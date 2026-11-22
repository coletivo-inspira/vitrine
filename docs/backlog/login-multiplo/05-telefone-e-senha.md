---
titulo: "[Login múltiplo] Cadastro, entrada e recuperação com telefone e senha"
rotulos: autenticacao, painel, enhancement
depende: 03, 04
---
## Contexto

Quem prefere senha não precisa receber código a cada acesso. O telefone é confirmado uma vez pelo
mesmo passo do WhatsApp ({{issue:04}}); depois a pessoa entra com telefone e senha.

## Escopo

- Cadastro com `POST /auth/v1/signup` (`phone`, `password`) e confirmação pelo passo
  "Abrir WhatsApp" e `POST /auth/v1/verify` (`type: "sms"`).
- Entrada com `POST /auth/v1/token?grant_type=password` (`phone`, `password`).
- "Esqueceu sua senha?" com telefone: entrada por código e depois "Definir nova senha"
  (`PUT /auth/v1/user`).
- Ligar "confirmar telefone" no Supabase (parte de `BLK-HOOK-01`).

## Critérios de aceite

- [ ] Testes simulados: cadastro com confirmação, entrada com senha, senha errada com mensagem
      neutra e recuperação por código.
- [ ] Conta por telefone não confirmada não entra no painel.
- [ ] `authMethods.phonePassword` só fica `true` com `whatsappOtp` ligado.
- [ ] Nenhum telefone ou senha nos logs de teste.

## Dependências

- {{issue:03}} `03-ponte-whatsapp-worker.md` e {{issue:04}} `04-entrar-com-codigo-whatsapp.md`.

## Referências

- `specs/017-login-multiplo/spec.md` (US4) e `research.md` (R6); tasks T031 a T034.
