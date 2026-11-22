---
titulo: "[Login múltiplo] Épico: entrar no painel com e-mail, telefone ou código pelo WhatsApp"
rotulos: autenticacao, painel, enhancement
depende:
---
## Contexto

Só o Google limita quem consegue criar conta no painel. O Lino pediu uma tela de entrada
minimalista (campo de identificação, senha, "Esqueceu sua senha?", "Entrar", "ou entrar com" e
botões redondos) com e-mail e senha, telefone e senha e entrada por telefone com código pelo
WhatsApp. SMS fica fora por custo; o código pelo WhatsApp é entregue como resposta gratuita a uma
mensagem que a própria pessoa envia ao número da Vitrine.

- Especificação: [`specs/017-login-multiplo/spec.md`](../../../specs/017-login-multiplo/spec.md)
- Plano: [`specs/017-login-multiplo/plan.md`](../../../specs/017-login-multiplo/plan.md)
- Tarefas: [`specs/017-login-multiplo/tasks.md`](../../../specs/017-login-multiplo/tasks.md)
- Decisão: [ADR 0015](../../adr/0015-login-multiplo-whatsapp.md) (proposta) e constituição 0.2.0
  (proposta).

## Issues (uma por PR)

- [ ] {{issue:01}} Tela de entrada minimalista com botões redondos
- [ ] {{issue:02}} E-mail e senha (depende de 01 e de `BLK-SMTP-01`)
- [ ] {{issue:03}} Ponte do código pelo WhatsApp no Worker (pode começar junto com 01)
- [ ] {{issue:04}} Entrar com código pelo WhatsApp (depende de 01 e 03)
- [ ] {{issue:05}} Telefone e senha (depende de 03 e 04)
- [ ] {{issue:06}} Proteção contra abuso (depende de 02 e 04)
- [ ] {{issue:07}} Provedores sociais configuráveis (depende de 01)
- [ ] {{issue:08}} Testes de ponta a ponta e documentação (fecha o épico)

## Passos humanos

- [ ] `BLK-SMTP-01`: SMTP gratuito (Resend ou Brevo) com SPF e DKIM em `inspira.dev.br`.
- [ ] `BLK-WA-01`: app Meta com WhatsApp, número dedicado, nome de exibição, token de usuário do
      sistema e webhook `messages`.
- [ ] `BLK-HOOK-01`: Send SMS Hook do Supabase apontando para o Worker; confirmar no plano Free.
- [ ] `BLK-TURNSTILE-01`: site Turnstile e chave secreta no Supabase.
- [ ] Ratificar o ADR 0015 e a constituição 0.2.0.

## Critérios de aceite do épico

- [ ] Uma pessoa sem conta Google cria conta e chega ao painel em até 2 minutos.
- [ ] Nenhuma mensagem paga: só respostas de serviço do WhatsApp; zero SMS.
- [ ] Isolamento entre vitrines comprovado para contas de cada método.
