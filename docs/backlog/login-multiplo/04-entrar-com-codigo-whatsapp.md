---
titulo: "[Login múltiplo] Entrar com código pelo WhatsApp"
rotulos: autenticacao, painel, enhancement
depende: 01, 03
---
## Contexto

Com a ponte do Worker ({{issue:03}}), falta a tela: a pessoa toca no botão redondo do WhatsApp,
informa o telefone, abre o WhatsApp com uma mensagem pronta, envia e digita o código recebido.

## Escopo

- Modo "Entrar com código pelo WhatsApp" em `web/portal/auth-form.mjs`:
  - telefone com máscara (`+55`), só celular brasileiro no MVP;
  - `POST /auth/v1/otp` com `create_user: true`;
  - botão "Abrir WhatsApp" com `https://wa.me/<whatsappNumber>?text=Quero%20meu%20c%C3%B3digo%20de%20acesso%20%C3%A0%20Vitrine`;
  - campo de 6 dígitos com `inputmode="numeric"` e `autocomplete="one-time-code"`.
- `POST /auth/v1/verify` (`type: "sms"`) e `POST /api/auth/session`.
- Reenvio liberado depois de 60 s, com contagem anunciada a cada 15 s.
- Estados: código errado, vencido, 5 erros, limite por hora e WhatsApp indisponível (com sugestão
  de e-mail ou Google).

Contrato: [chamadas do portal ao Supabase Auth](../../../specs/017-login-multiplo/contracts/portal-auth-flows.md).

## Critérios de aceite

- [ ] Teste simulado de ponta a ponta: pedido, hook, webhook, verificação e sessão.
- [ ] Código errado 5 vezes invalida o código; depois de 10 minutos, "código vencido".
- [ ] Mensagem de outro número não entrega código (coberto em {{issue:03}}; aqui, a tela explica).
- [ ] Em 375 px, o botão "Abrir WhatsApp" e o campo do código ficam visíveis sem rolagem com o
      teclado aberto.
- [ ] Nenhum telefone ou código em `sessionStorage` depois de terminar ou falhar (só o telefone
      mascarado para exibição, apagado ao fim).
- [ ] Método entra desligado em `AUTH_METHODS` até `BLK-WA-01` e `BLK-HOOK-01`.

## Dependências

- {{issue:01}} `01-tela-de-entrada.md` e {{issue:03}} `03-ponte-whatsapp-worker.md`.

## Referências

- `specs/017-login-multiplo/spec.md` (US3); tasks T027 a T030.
