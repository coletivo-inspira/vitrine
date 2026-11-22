# Quickstart: login múltiplo

Roteiro para validar cada método depois de implementado. Nada aqui foi executado ainda; os passos marcados com BLK dependem de ação humana em sistemas externos.

## 1. Local, sem serviços externos

```bash
npm test
npm run build
npm run preview
```

- Abrir `http://127.0.0.1:<porta>/portal/` em 1280 × 900 e 375 × 812.
- Com `AUTH_METHODS` vazio, a tela mostra só o botão redondo do Google e os campos ficam ocultos (US1, cenário 5).
- Com `AUTH_METHODS=email_password,whatsapp_otp` e os testes com `fetch` simulado, conferir os modos "Entrar", "Criar conta", "Esqueceu sua senha?" e "Entrar com código pelo WhatsApp".

## 2. Passos humanos (uma vez)

| Passo | O que fazer | Onde |
|---|---|---|
| BLK-SMTP-01 | Criar conta gratuita no provedor de e-mail escolhido (Resend ou Brevo), publicar SPF e DKIM de `inspira.dev.br` e preencher *SMTP Settings* no Supabase. Ajustar os modelos de e-mail para português. | Provedor de e-mail, Cloudflare DNS, Supabase |
| BLK-WA-01 | No app Meta da Vitrine, adicionar o produto WhatsApp, registrar um número dedicado, aprovar o nome de exibição, criar usuário do sistema com `whatsapp_business_messaging` e assinar o campo `messages` do webhook em `https://painel.inspira.dev.br/api/whatsapp/webhook`. | Meta for Developers, Meta Business Suite |
| BLK-HOOK-01 | Em *Authentication > Hooks*, criar o Send SMS Hook do tipo HTTP para `https://painel.inspira.dev.br/api/auth/hooks/send-sms`, copiar o segredo e ligar *Phone provider* com confirmação de telefone. Confirmar que o recurso está disponível no plano Free. | Supabase |
| BLK-TURNSTILE-01 | Criar o site Turnstile para `painel.inspira.dev.br`, guardar a chave pública em `TURNSTILE_SITE_KEY` e cadastrar a chave secreta em *Bot and Abuse Protection* do Supabase. | Cloudflare, Supabase |

Segredos do Worker, depois dos passos acima:

```bash
npx wrangler secret put SUPABASE_AUTH_HOOK_SECRET
npx wrangler secret put AUTH_OTP_ENC_KEY
npx wrangler secret put AUTH_PHONE_PEPPER
npx wrangler secret put WHATSAPP_APP_SECRET
npx wrangler secret put WHATSAPP_VERIFY_TOKEN
npx wrangler secret put WHATSAPP_ACCESS_TOKEN
```

## 3. Roteiro de aceite (com os passos humanos concluídos)

1. **E-mail e senha**: criar conta com e-mail novo, confirmar, sair, entrar, recuperar a senha e entrar com a nova (US2).
2. **Código pelo WhatsApp**: informar um celular, tocar em "Abrir WhatsApp", enviar, receber o código, entrar. Repetir com código errado 5 vezes, com código depois de 10 minutos e com um número diferente (US3).
3. **Telefone e senha**: criar conta, confirmar pelo WhatsApp, sair, entrar com senha, recuperar pelo código (US4).
4. **Abuso**: pedir código 6 vezes em uma hora; chamar hook e webhook sem assinatura com `curl` e conferir `401` (US5).
5. **Isolamento**: com duas contas de métodos diferentes, conferir que uma não vê as vitrines da outra (Princípio II).
6. **Custo**: depois de uma semana de piloto, conferir em *WhatsApp Manager > Insights* que não houve cobrança e, no provedor de e-mail, o volume enviado.
