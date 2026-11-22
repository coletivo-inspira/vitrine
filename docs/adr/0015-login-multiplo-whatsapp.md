---
status: proposed
---
# Login múltiplo no painel: e-mail, telefone e código pelo WhatsApp

Emenda a [ADR 0004](0004-google-sign-in.md). Relaciona-se com as ADRs
[0003](0003-supabase-backend.md) e [0005](0005-zero-cost-mvp.md).
Origem: [`specs/017-login-multiplo`](../../specs/017-login-multiplo/plan.md).

## Contexto e Problema

A ADR 0004 começou só com "Entrar com Google" para não operar senhas nem e-mails de recuperação.
Na prática, isso afasta quem não tem conta Google ou não quer usá-la para o negócio, e boa parte
do público usa só o celular e o WhatsApp. O Lino pediu e-mail e senha, telefone e senha e entrada
por telefone com código enviado pelo WhatsApp, numa tela minimalista. SMS foi descartado por custo.
Tudo precisa caber no Supabase Free e no Workers Free, sem contratação automática (ADR 0005).

## Opções Consideradas

1. **Manter só o Google**: sem custo e sem operação nova, mas mantém a barreira de cadastro.
2. **Código por modelo de autenticação do WhatsApp, enviado pela empresa** (direto pela Meta ou
   pela Twilio, único canal WhatsApp nativo do Supabase Auth): experiência mais conhecida, mas
   cobrada por mensagem.
3. **Código pelo WhatsApp iniciado pela pessoa**: ela envia uma mensagem pronta ao número da
   Vitrine e recebe o código como resposta de serviço, sem cobrança, dentro da janela de 24 horas.

## Decisão

Adotamos a **Opção 3** junto com e-mail e senha e telefone e senha, todos pelo Supabase Auth:

1. **Métodos**: Google (mantido), e-mail e senha, telefone e senha e código pelo WhatsApp. Cada
   método pode ser ligado ou desligado no Worker (`AUTH_METHODS`) e todos terminam em
   `POST /api/auth/session`, sem mudar a validação do JWT nem a autorização por vitrine.
2. **Código gerado e verificado pelo Supabase Auth**. O Send SMS Hook (HTTP, assinado no padrão
   Standard Webhooks) entrega o código ao Worker, que o guarda cifrado (AES-GCM) por até 10
   minutos em `private.auth_otp_outbox`, com o telefone substituído por HMAC.
3. **Entrega só como resposta de serviço** pela WhatsApp Cloud API, quando a pessoa envia a
   mensagem pronta ou já tem janela aberta. Modelos de mensagem (`template`) são proibidos neste
   fluxo.
4. **Propriedade continua pelo `user.id`** (ADR 0004). E-mail e telefone nunca são chave de
   acesso; contas com o mesmo e-mail verificado são vinculadas pelo Supabase; contas por telefone
   ficam separadas.
5. **E-mail transacional por SMTP próprio gratuito** (Resend ou Brevo, escolha no passo humano),
   porque o SMTP padrão do Supabase é só para testes.
6. **Proteção**: Cloudflare Turnstile no Supabase Auth, limite de 5 pedidos de código por telefone
   por hora, mensagens neutras quanto à existência de conta e nenhum dado pessoal em logs.
7. **Botões sociais** configuráveis; o MVP mostra Google e WhatsApp. Facebook e X ficam para
   depois. Apple (programa pago) e TikTok (sem provedor nativo) ficam fora.

## Consequências

- **Positivas**: cadastro sem conta Google; entrada só com o celular; custo de mensagens zero;
  nenhuma mudança no modelo de sessão e autorização.
- **Negativas / Trade-offs**:
  - A pessoa precisa tocar em "enviar" no WhatsApp antes de receber o código; é um passo a mais
    que o código automático.
  - Passamos a operar senhas pelo Supabase Auth: recuperação, confirmação de e-mail e suporte a
    quem perde o acesso. A proteção contra senhas vazadas é paga e fica desligada.
  - Um número de WhatsApp Business dedicado e um app Meta com o produto WhatsApp viram dependência
    operacional; se a Meta mudar a regra de cobrança das respostas de serviço, o método deve ser
    desligado até nova decisão.
  - O código fica guardado cifrado no Postgres por até 10 minutos; a chave fica só no Worker.
  - A CSP do `/portal/` passa a permitir `https://challenges.cloudflare.com` para o Turnstile.
- **Pendências**: passos humanos BLK-SMTP-01, BLK-WA-01, BLK-HOOK-01 e BLK-TURNSTILE-01
  (`specs/017-login-multiplo/quickstart.md`); ratificação desta ADR e da constituição 0.2.0.
  Nada foi implementado nem configurado.
- **Decisões propostas (revisar no PR)**: a análise Spec Kit acrescentou as decisões de segurança
  S1 a S8 de `specs/017-login-multiplo/research.md`. As principais: provedores Email e Phone
  desligados no projeto Supabase de produção até a ratificação, com os passos humanos num projeto
  de teste (BLK-AUTH-01, BLK-SBTEST-01); verificação do código pelo Worker, com 5 erros por código;
  `wa_id` cifrado; *Confirm email* ligado; e limites do Supabase Auth a confirmar (BLK-RATE-01).
