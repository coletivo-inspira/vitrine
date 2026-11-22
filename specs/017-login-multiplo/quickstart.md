# Quickstart: login múltiplo

Roteiro para validar cada método depois de implementado. Nada aqui foi executado ainda; os passos marcados com BLK dependem de ação humana em sistemas externos.

## 1. Local, sem serviços externos

```bash
npm test
npm run build
npm run preview
```

- Abrir `http://127.0.0.1:<porta>/portal/` em 1280 × 900 e 375 × 812.
- Com `AUTH_METHODS` vazio, a tela mostra só o botão redondo do Google e os campos ficam ocultos (US1, cenário 5). É o valor versionado em `wrangler.jsonc` até T045 (`test/auth-methods-off.test.mjs`).
- Com `AUTH_METHODS=email_password,whatsapp_otp` só no ambiente local e os testes com `fetch` simulado, conferir os modos "Entrar", "Criar conta", "Esqueceu sua senha?" e "Entrar com código pelo WhatsApp".

## 2. Passos humanos (uma vez)

*Decisão proposta (revisar no PR; research S1)*: antes da ratificação (T045), o projeto Supabase de produção (`qawlpsrfewosxsfgmmpm`) fica com os provedores Email e Phone desligados (FR-017). Todos os passos que mexem no Supabase Auth rodam primeiro no projeto de teste, nesta ordem:

| Ordem | Passo | O que fazer | Onde |
|---|---|---|---|
| 1 | BLK-AUTH-01 | No projeto de produção, registrar em `docs/supabase-provisioning.md` o estado de *Providers* (Email, Phone, Google), *Confirm email*, *Allow new users to sign up*, *Hooks* e *Rate Limits*. Se Email ou Phone estiverem ligados, desligar e conferir que o Google continua funcionando (T046). | Supabase (produção) |
| 2 | BLK-SBTEST-01 | Criar o projeto gratuito de teste (proposta: `vitrine-inspira-teste`), aplicar as migrações do repositório e preparar um Worker de teste que aponte para ele (`wrangler dev` exposto por túnel gratuito ou Worker separado em `*.workers.dev`). Conferir o limite de projetos gratuitos e a pausa por inatividade. | Supabase (teste), Cloudflare |
| 3 | BLK-SMTP-01 | Criar conta gratuita no provedor de e-mail escolhido (Resend ou Brevo), publicar SPF e DKIM de `inspira.dev.br` e preencher *SMTP Settings* no projeto de teste. Ligar o provedor Email com *Confirm email* ligado (FR-019) e ajustar os modelos de e-mail para português. | Provedor de e-mail, Cloudflare DNS, Supabase (teste) |
| 4 | BLK-WA-01 | No app Meta da Vitrine, adicionar o produto WhatsApp, registrar um número dedicado, aprovar o nome de exibição, criar usuário do sistema com `whatsapp_business_messaging` e assinar o campo `messages` do webhook. Até T045, a URL do webhook é a do Worker de teste. | Meta for Developers, Meta Business Suite |
| 5 | BLK-HOOK-01 | No projeto de teste, em *Authentication > Hooks*, criar o Send SMS Hook do tipo HTTP para `<Worker de teste>/api/auth/hooks/send-sms`, copiar o segredo e ligar *Phone provider* com confirmação de telefone, *SMS OTP Expiry* de 600 s e *SMS OTP Length* de 6. Confirmar que o recurso está disponível no plano Free. | Supabase (teste) |
| 6 | BLK-RATE-01 | Confirmar os valores propostos de FR-018 (research S2), aplicá-los em *Authentication > Rate Limits* e nas opções dos provedores do projeto de teste e registrar a conferência em `docs/supabase-provisioning.md` (T055). | Supabase (teste) |
| 7 | BLK-TURNSTILE-01 | Criar o site Turnstile para `painel.inspira.dev.br` e para o endereço do Worker de teste, guardar a chave pública em `TURNSTILE_SITE_KEY` e cadastrar a chave secreta em *Bot and Abuse Protection* do projeto de teste. | Cloudflare, Supabase (teste) |

Depois de T045: repetir os passos 3, 5, 6 e 7 no projeto de produção (com o hook em `https://painel.inspira.dev.br/api/auth/hooks/send-sms`), mudar a URL do webhook da Meta para `https://painel.inspira.dev.br/api/whatsapp/webhook` e só então ligar `AUTH_METHODS` em produção.

Segredos do Worker de teste (e, depois de T045, do de produção), depois dos passos acima:

```bash
npx wrangler secret put SUPABASE_AUTH_HOOK_SECRET
npx wrangler secret put AUTH_OTP_ENC_KEY
npx wrangler secret put AUTH_PHONE_PEPPER
npx wrangler secret put WHATSAPP_APP_SECRET
npx wrangler secret put WHATSAPP_VERIFY_TOKEN
npx wrangler secret put WHATSAPP_ACCESS_TOKEN
```

## 3. Roteiro de aceite (no projeto de teste, com os passos humanos concluídos)

1. **E-mail e senha**: criar conta com e-mail novo, confirmar, sair, entrar, recuperar a senha e entrar com a nova (US2).
2. **Vínculo e pré-sequestro**: criar conta com e-mail e senha usando um e-mail de teste com conta Google e não confirmar; tentar entrar com essa senha (deve falhar); entrar com Google com o mesmo e-mail; tentar de novo a senha (não pode dar acesso à conta). Registrar o comportamento observado do Supabase (US2, cenários 6 e 7; T054).
3. **Código pelo WhatsApp**: informar um celular, tocar em "Abrir WhatsApp", enviar, receber o código, entrar. Repetir com código errado 5 vezes (a quinta resposta já diz "Muitas tentativas. Peça um novo código."), com código depois de 10 minutos e com um número diferente (US3).
4. **Telefone e senha**: criar conta, confirmar pelo WhatsApp, sair, entrar com senha, recuperar pelo código (US4).
5. **Abuso**: pedir código 6 vezes em uma hora (o sexto mostra "Muitas tentativas"); passar do limite de cadastros por IP; chamar hook e webhook sem assinatura com `curl` e conferir `401` (US5).
6. **Limites**: conferir no painel do projeto de teste os valores de BLK-RATE-01 e anotar quais rotas contaram em cada limite por IP (FR-018).
7. **Produção desligada**: com a chave pública do projeto de produção, chamar `/auth/v1/signup` com e-mail e `/auth/v1/otp` com telefone e conferir que o Supabase recusa (US5, cenário 5).
8. **Isolamento**: com duas contas de métodos diferentes, conferir que uma não vê as vitrines da outra (Princípio II).
9. **Custo**: depois de uma semana de piloto, conferir em *WhatsApp Manager > Insights* que não houve cobrança e, no provedor de e-mail, o volume enviado.
