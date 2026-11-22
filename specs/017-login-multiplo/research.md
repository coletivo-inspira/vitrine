# Pesquisa: login múltiplo no painel

Data: 2026-11-22. Os números de cota e preço abaixo vêm da documentação pública dos fornecedores na data da pesquisa e DEVEM ser reconferidos antes de ligar cada método (Princípio IV). Nenhum deles é SLA.

## R1. Como enviar o código pelo WhatsApp sem custo

**Decisão**: entrega iniciada pela pessoa. Ela envia uma mensagem pronta ao número da Vitrine (`https://wa.me/<número>?text=...`) e o Worker responde com o código dentro da janela de atendimento de 24 horas.

**Motivo**:

- Na WhatsApp Business Platform, a Meta cobra por mensagem de modelo (*template*) desde 1º de julho de 2025. Modelos da categoria autenticação são cobrados em todos os países, inclusive no Brasil.
- Mensagens de serviço (texto livre respondendo à pessoa dentro da janela de 24 horas aberta por ela) não são cobradas. Os limites de envio por número (*messaging limits*) valem para conversas iniciadas pela empresa, não para respostas.
- O remetente da mensagem é o próprio número que está sendo comprovado: só quem controla o WhatsApp daquele número recebe o código.

**Alternativas recusadas**:

- Modelo de autenticação enviado pela empresa (fluxo "clássico"): cobrado por mensagem; viola o ADR 0005.
- Twilio Verify ou Twilio WhatsApp (único canal WhatsApp nativo do Supabase Auth): pago por verificação e por mensagem.
- SMS: pago; recusado pelo Lino.
- Validar só pela mensagem recebida, sem código do Supabase: exigiria o Worker criar sessão com a chave `service_role` (geração de link mágico ou de token próprio), aumentando a superfície de ataque. Usar o OTP do Supabase mantém a emissão de sessão no Supabase Auth.

**Custo de uso para a pessoa**: precisa ter WhatsApp no número informado e tocar em "enviar" uma vez. Se ela já falou com o número nas últimas 24 horas, o código chega direto.

## R2. Como o código chega do Supabase ao Worker

**Decisão**: Send SMS Hook do Supabase Auth, do tipo HTTP, apontando para `POST https://painel.inspira.dev.br/api/auth/hooks/send-sms`.

- O Supabase continua gerando, guardando e verificando o código (`/auth/v1/otp`, `/auth/v1/signup` com telefone, `/auth/v1/verify` com `type: "sms"`); o hook só recebe o código para entrega.
- O hook usa o padrão Standard Webhooks: cabeçalhos `webhook-id`, `webhook-timestamp` e `webhook-signature` (`v1,<base64 HMAC-SHA256 de "id.timestamp.corpo">`), com segredo `v1,whsec_<base64>` gerado no painel do Supabase.
- O hook tem tempo limite curto (cerca de 5 segundos); o Worker responde `200` depois de gravar e, se houver janela aberta, de enviar.
- Disponibilidade dos Auth Hooks no plano Free: a documentação indica hooks de envio em todos os planos; confirmar no passo BLK-HOOK-01 antes de depender disso.

**Alternativa recusada**: provedor de SMS "falso" configurado no Supabase. Não existe no produto; o hook é o caminho suportado.

## R3. Onde guardar o código até a pessoa enviar a mensagem

**Decisão**: tabela `private.auth_otp_outbox` no Supabase, acessada só pelo Worker com a chave `service_role`, com código cifrado (AES-GCM, chave `AUTH_OTP_ENC_KEY`) e telefone substituído por HMAC (`AUTH_PHONE_PEPPER`). Validade de 10 minutos; apagado ao entregar.

- Workers Free tem KV com cota diária de escrita pequena; a tabela no Postgres já existente evita outro serviço e segue o padrão de tabelas `private.*` do projeto.
- Expirados são apagados no Cron Trigger já existente (`17 * * * *` em `wrangler.jsonc`) e também ignorados na leitura.

## R4. Número brasileiro e o nono dígito

O identificador `wa_id` que chega no webhook pode vir sem o nono dígito para celulares brasileiros antigos (por exemplo, `55 11 8xxx-xxxx` em vez de `55 11 98xxx-xxxx`). A normalização DEVE gerar a forma canônica com 13 dígitos (`55` + DDD + `9` + 8 dígitos) antes do HMAC, tanto no hook quanto no webhook. O envio da resposta usa o `wa_id` recebido, não a forma canônica.

## R5. E-mail e senha

**Decisão**: Supabase Auth com confirmação de e-mail e SMTP próprio gratuito.

- O SMTP padrão do Supabase serve só para testes: envia apenas para endereços da equipe do projeto e tem limite de poucas mensagens por hora. Para pessoas reais é preciso SMTP próprio (BLK-SMTP-01).
- Opções gratuitas na data: Resend (cerca de 3.000 e-mails por mês e 100 por dia) e Brevo (cerca de 300 por dia). Ambas exigem SPF e DKIM no domínio remetente (`inspira.dev.br`). A escolha final fica com o Lino no passo humano; o código não depende do fornecedor.
- A proteção contra senhas vazadas (Have I Been Pwned) do Supabase é recurso de plano pago; no Free usamos tamanho mínimo e exigência de letra e número.
- Confirmação e recuperação usam PKCE (`code_challenge` em `/auth/v1/signup` e `/auth/v1/recover`), reaproveitando `exchangePkceCode()`.

## R6. Telefone e senha

Supabase Auth aceita `phone` + `password` em `/auth/v1/signup` e em `/auth/v1/token?grant_type=password`. Com "confirmar telefone" ligado, o cadastro dispara o Send SMS Hook (R2) e a confirmação usa `/auth/v1/verify` com `type: "sms"`. A recuperação é uma entrada por código (R1) seguida de `PUT /auth/v1/user` com a nova senha.

## R7. Proteção contra abuso

**Decisão**: Cloudflare Turnstile (gratuito) integrado ao Supabase Auth (*Bot and Abuse Protection*), com o token enviado em `gotrue_meta_security.captcha_token`.

- Exige acrescentar `https://challenges.cloudflare.com` a `script-src` e `frame-src` da CSP do `/portal/` (hoje `script-src 'self'`), só nessa rota.
- Limites: o Supabase Auth já limita por IP os pedidos de código e de cadastro (valores ajustáveis em *Rate Limits*; reduzir o de mensagens por telefone para o piloto). O hook não conhece o IP da pessoa, então o Worker acrescenta só o limite por telefone: 5 pedidos por hora, contados na própria `private.auth_otp_outbox`.
- Mensagens neutras: o Supabase já devolve resposta igual para cadastro de e-mail existente quando a confirmação está ligada; o front-end NÃO DEVE diferenciar "conta não existe" de "senha errada".

## R8. Botões sociais

| Provedor | Situação | Motivo |
|---|---|---|
| Google | Mantido | ADR 0004; já funciona. |
| WhatsApp | Novo, como botão da fileira | Abre o modo de código (R1); não é OAuth. |
| Facebook | Depois | Exige app Meta de consumidor separado e revisão do escopo `email` (`docs/instagram/login-meta.md`). |
| X | Depois | Suportado pelo Supabase; conta de desenvolvedor gratuita, mas baixa demanda do público. |
| Apple | Fora | Exige o Apple Developer Program, pago por ano (ADR 0005). |
| TikTok | Fora | Sem provedor nativo no Supabase Auth; exigiria ponte OIDC própria. |

A fileira é montada a partir de `socialProviders` em `GET /api/auth/config`, para ligar um provedor novo sem mudar o HTML.

## R9. Layout da referência e o `DESIGN.md`

A referência usa campos e botões em formato de pílula com fundo cinza-claro. O `DESIGN.md` define `rounded.control` de 7 px. **Decisão**: manter a estrutura e a hierarquia da referência (campos preenchidos sem borda forte, botão principal largo, divisor com texto, botões redondos) com os tokens da Vitrine: campos com fundo `offer-surface`, botão "Entrar" no estilo `button-primary`, botões sociais circulares de 56 px com fundo `apricot` e borda `line`. Mudar o raio dos controles exigiria rever o `DESIGN.md` inteiro e fica fora deste escopo.

## R10. Vínculo de contas

O Supabase vincula automaticamente identidades com o mesmo e-mail verificado (Google e e-mail e senha). Contas por telefone não têm e-mail e ficam separadas. Como a propriedade usa `user.id` (ADR 0004), não há risco de uma pessoa ganhar acesso a vitrine alheia por coincidência de e-mail ou telefone. Vincular manualmente identidades (`linkIdentity`) fica para depois.
