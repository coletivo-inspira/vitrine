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
- O hook tem tempo limite curto (cerca de 5 segundos); o Worker responde `200` depois de gravar e, se houver janela aberta, de enviar, dentro de um prazo total de 4 s (S8). Quando o limite por telefone estoura, responde `429` (S7).
- Disponibilidade dos Auth Hooks no plano Free: a documentação indica hooks de envio em todos os planos; confirmar no passo BLK-HOOK-01 antes de depender disso.

**Alternativa recusada**: provedor de SMS "falso" configurado no Supabase. Não existe no produto; o hook é o caminho suportado.

## R3. Onde guardar o código até a pessoa enviar a mensagem

**Decisão**: tabela `private.auth_otp_outbox` no Supabase, acessada só pelo Worker com a chave `service_role`, com código cifrado (AES-GCM, chave derivada de `AUTH_OTP_ENC_KEY`) e telefone substituído por HMAC (`AUTH_PHONE_PEPPER`). Validade de 10 minutos; apagado ao entregar. O `wa_id` da janela de atendimento também fica cifrado (S3).

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
- *Confirm email* precisa estar ligado junto com o provedor Email; é o que impede o vínculo automático com o Google de aproveitar um cadastro não confirmado (S6).

## R6. Telefone e senha

Supabase Auth aceita `phone` + `password` em `/auth/v1/signup` e em `/auth/v1/token?grant_type=password`. Com "confirmar telefone" ligado, o cadastro dispara o Send SMS Hook (R2) e a confirmação usa `/auth/v1/verify` com `type: "sms"`. A recuperação é uma entrada por código (R1) seguida de `PUT /auth/v1/user` com a nova senha.

## R7. Proteção contra abuso

**Decisão**: Cloudflare Turnstile (gratuito) integrado ao Supabase Auth (*Bot and Abuse Protection*), com o token enviado em `gotrue_meta_security.captcha_token`.

- Exige acrescentar `https://challenges.cloudflare.com` a `script-src` e `frame-src` da CSP do `/portal/` (hoje `script-src 'self'`), só nessa rota.
- Limites: o Supabase Auth já limita por IP os pedidos de código e de cadastro (valores ajustáveis em *Rate Limits*; reduzir o de mensagens por telefone para o piloto). O hook não conhece o IP da pessoa, então o Worker acrescenta só o limite por telefone: 5 pedidos por hora, contados na própria `private.auth_otp_outbox`. Os valores propostos para cada limite do Supabase estão em S2 (FR-018).
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

O Supabase vincula automaticamente identidades com o mesmo e-mail verificado (Google e e-mail e senha); o comportamento com cadastro por e-mail ainda não confirmado é verificado em S6. Contas por telefone não têm e-mail e ficam separadas. Como a propriedade usa `user.id` (ADR 0004), não há risco de uma pessoa ganhar acesso a vitrine alheia por coincidência de e-mail ou telefone. Vincular manualmente identidades (`linkIdentity`) fica para depois.

## Decisões de segurança propostas

Estas decisões resolvem os oito achados altos da análise Spec Kit de 2026-11-22 (C1, A1, A2, A3, U1, U2, I1 e I2). Todas são **decisão proposta (revisar no PR)**: nada foi configurado nem implementado, e todo comportamento ou valor de fornecedor citado aqui é a reconferir (Princípio IV).

### S1. Provedores desligados em produção até a ratificação (achado C1)

**Decisão proposta (revisar no PR)**: os provedores Email e Phone ficam desligados no projeto de produção (`qawlpsrfewosxsfgmmpm`) até T045 (FR-017). Os passos humanos que ligam provedores ou mudam o Auth (BLK-SMTP-01, BLK-HOOK-01, BLK-RATE-01 e BLK-TURNSTILE-01) rodam antes num projeto Supabase de teste separado e gratuito (BLK-SBTEST-01), com um Worker de teste ligado a ele; em produção, só depois de T045. A tarefa T046 registra o estado atual dos provedores (BLK-AUTH-01) e a T047 testa que `AUTH_METHODS` continua vazio no `wrangler.jsonc` versionado enquanto a constituição estiver em "0.2.0 (proposta)".

**Motivo**: `AUTH_METHODS` só esconde botões. Com a chave pública, que vai no bundle, qualquer pessoa chama `/auth/v1/signup` e `/auth/v1/otp` direto no Supabase. Ligar o Phone provider em produção no BLK-HOOK-01, antes de T045, colocaria o método no ar enquanto a emenda 0.2.0 ainda é proposta. Projetos novos do Supabase vêm com o provedor Email ligado por padrão (a reconferir no BLK-AUTH-01); por isso o estado atual precisa ser registrado e, se for o caso, desligado. Desligar Email não deve afetar o Google, que é outro provedor (a reconferir no mesmo passo).

**Alternativas**: bloquear no Worker (não funciona: o navegador fala direto com o Supabase); desligar *Allow new users to sign up* (bloquearia também cadastros novos pelo Google); ligar tudo só depois de T045, sem projeto de teste (a ratificação ficaria sem o teste real de hook, SMTP e vínculo de contas).

**Riscos residuais**: a configuração do painel do Supabase não fica no repositório; T047 só enxerga o `wrangler.jsonc`, e uma mudança manual no painel continua possível (mitigação: BLK-AUTH-01 registra o estado e T044 o reconfere). O projeto de teste conta no limite de projetos gratuitos e pausa sem uso (a reconferir). O app Meta tem uma única URL de webhook: até T045, ela aponta para o Worker de teste.

### S2. Valores dos limites do Supabase Auth (achado A1)

**Decisão proposta (revisar no PR)**: aplicar os valores da tabela (FR-018) no projeto de teste e, depois de T045, no de produção. Pendência **BLK-RATE-01**: confirmar os valores, aplicá-los no painel e registrar a conferência em `docs/supabase-provisioning.md` (T055).

| Limite | Nome no painel (a reconferir) | Padrão (a reconferir) | Proposta para o piloto |
|---|---|---|---|
| E-mails de Auth por hora, no projeto | *Rate limit for sending emails* | 30 por hora com SMTP próprio | 10 por hora |
| Intervalo entre e-mails ao mesmo endereço | intervalo mínimo do provedor Email | 60 s | 60 s |
| Códigos por telefone por hora, no projeto | *Rate limit for sending SMS messages* | 30 por hora | 20 por hora |
| Intervalo entre códigos ao mesmo telefone | intervalo mínimo do provedor Phone | 60 s | 60 s |
| Pedidos de código por telefone | limite do Worker (FR-010) | não existe | 5 por hora |
| Cadastros e entradas por IP | *Rate limit for sign-ups and sign-ins* | 30 a cada 5 min | 15 a cada 5 min |
| Verificações de código por IP | *Rate limit for token verifications* | 30 a cada 5 min | 30 a cada 5 min (S5) |
| Renovações de sessão por IP | *Rate limit for token refreshes* | 150 a cada 5 min | 150 a cada 5 min |
| Validade e tamanho do código por telefone | *SMS OTP Expiry* e *SMS OTP Length* | 60 s e 6 dígitos | 600 s e 6 dígitos |

**Motivo**: o piloto tem até 10 vitrines e dezenas de pessoas; os valores ficam bem acima do uso esperado e abaixo dos padrões. 10 e-mails por hora cabem nas cotas gratuitas de Resend (100 por dia) e Brevo (300 por dia) num dia normal; o teto diário do provedor é a barreira final e não gera cobrança automática (a reconferir em BLK-SMTP-01). A validade de 600 s é a dos 10 minutos da US3, necessária para a pessoa abrir o WhatsApp e enviar a mensagem.

**Alternativas**: manter todos os padrões (mais folga para robôs); limites próprios no Worker para e-mail e IP (não alcançam as chamadas que o navegador faz direto ao Supabase).

**Riscos residuais**: os limites de e-mails e de códigos valem para o projeto todo; um robô que passe pelo Turnstile pode esgotá-los e bloquear cadastros legítimos por até uma hora. Por endereço e por telefone, o Supabase só oferece o intervalo de 60 s. Quais rotas contam em cada limite por IP é a reconferir.

### S3. `wa_id` cifrado e nada de telefone em texto puro (achado A2)

**Decisão proposta (revisar no PR)**:

- O `wa_id` de `private.whatsapp_service_windows` passa a ser gravado cifrado (`wa_id_ciphertext` e `wa_id_iv`), com AES-GCM de 256 bits e vetor de inicialização novo a cada gravação; `store_auth_otp` devolve o `wa_id` cifrado e o Worker só o decifra para enviar.
- O segredo continua um só, `AUTH_OTP_ENC_KEY`, que vira chave-mestra: o Worker deriva com HKDF-SHA256 uma chave para o código (`info` = `vitrine/auth/otp/v1`) e outra para o `wa_id` (`info` = `vitrine/auth/wa-id/v1`). Os dados associados do AES-GCM levam o `phone_hash`, para que um valor cifrado copiado para outra linha não decifre.
- `last_message_id` guarda o HMAC-SHA256 do `messages[].id`, com chave derivada de `AUTH_PHONE_PEPPER` (`info` = `vitrine/auth/wamid/v1`), porque o `wamid` costuma trazer o número codificado (a reconferir).
- A busca continua pelo `phone_hash` (HMAC-SHA256 do telefone canônico com `AUTH_PHONE_PEPPER`), que já é a coluna de busca com chave. A coluna separada `wa_id_hmac` sugerida na análise não foi adotada: o webhook normaliza o `wa_id` para a forma canônica antes do HMAC (R4), então ela repetiria o `phone_hash`. Revisar no PR.
- FR-009 passa a valer para as três tabelas, com a retenção máxima de cada uma.

**Motivo**: o `wa_id` é o próprio número de telefone, com ou sem o nono dígito, e ficava em texto puro por até cerca de 25 horas, inclusive em cópias de segurança do banco. O FR-009 só cobria a tabela de envio.

**Alternativas**: manter em texto puro protegido só pelo esquema `private` (um vazamento da `service_role` ou de uma cópia de segurança exporia os números); segredo novo `AUTH_WA_ID_ENC_KEY` (mais um segredo para girar, com o mesmo efeito da derivação); não guardar o `wa_id` (impossível: o envio precisa do `wa_id` recebido, que pode não ter o nono dígito).

**Riscos residuais**: quem obtiver o banco e `AUTH_OTP_ENC_KEY` ao mesmo tempo lê os `wa_id` e códigos das últimas 25 horas. Como as duas chaves derivam do mesmo segredo, um vazamento afeta ambas; girar o segredo invalida códigos pendentes e janelas abertas (aceitável: duram no máximo 10 minutos e 25 horas). Telefones têm pouca entropia: com o `AUTH_PHONE_PEPPER` vazado, os HMAC podem ser revertidos por força bruta.

### S4. Teste estático de acessibilidade (achado A3)

**Decisão proposta (revisar no PR)**: `test/auth-a11y-static.test.mjs`, com `node:test` e sem dependência nova, lê `web/portal/index.html` e confere em `#auth-section`:

- todo `input` tem rótulo associado (`label[for]` igual ao `id`, ou `aria-labelledby`);
- "E-mail ou telefone" com `type="text"` e `autocomplete="username"`; senha de entrada com `type="password"` e `autocomplete="current-password"`; senha e confirmação no cadastro e em "Definir nova senha" com `autocomplete="new-password"`; telefone do modo WhatsApp com `type="tel"`, `inputmode="tel"` e `autocomplete="tel"`; código com `inputmode="numeric"`, `autocomplete="one-time-code"` e `maxlength="6"`;
- regiões de erro e de estado com `aria-live="polite"`;
- todo `button` e todo link com nome acessível (texto ou `aria-label`), inclusive os botões redondos;
- nenhum `tabindex` positivo.

Para o teste enxergar todos os modos, o HTML de cada modo fica no próprio `index.html`, alternado com `hidden` por `auth-form.mjs`.

**Motivo**: o projeto não tem axe nem pa11y, e o SC-003 citava uma verificação automática que não existe. As regras acima cobrem o que a US1 exige da marcação.

**Alternativas**: axe-core com jsdom ou navegador (dependência nova); pa11y (exige Chromium na suíte).

**Riscos residuais**: o teste estático não mede contraste (US1, cenário 6), ordem de foco em execução nem o DOM montado em tempo de execução. Contraste segue os tokens do `DESIGN.md` e as capturas de T021; teclado e leitor de tela continuam manuais (T044).

### S5. Verificação do código pelo Worker (achado U1)

**Decisão proposta (revisar no PR)**: o painel confirma códigos por telefone só por `POST /api/auth/otp/verify` (contrato em [`contracts/portal-auth-flows.md`](contracts/portal-auth-flows.md)). O Worker reserva uma tentativa no código pendente (`failed_attempts` em `private.auth_otp_outbox`, por `phone_hash`) antes de repassar a `/auth/v1/verify`; no quinto erro, invalida o código e recusa novas tentativas até um código novo ser pedido (`store_auth_otp` zera o contador).

**Motivo**: a verificação ia do navegador direto ao Supabase, e o Worker não tinha onde contar os erros do FR-010.

**Alternativas**: confiar só no limite por IP do Supabase (não cumpre o FR-010); o Worker pedir um código novo depois de 5 erros para invalidar o antigo no Supabase (gasta o limite por telefone e pode mandar mensagem inesperada se a janela estiver aberta; a avaliar); recusar em `POST /api/auth/session` sessões de código que não passaram pelo Worker, usando o `amr` do JWT e um registro de verificação recente (a avaliar; não cobre o acesso direto do token ao Supabase).

**Riscos residuais (a reconferir)**:

- Uma chamada direta a `/auth/v1/verify` com a chave pública não passa pelo contador. Fica limitada pelo limite de verificações por IP (30 a cada 5 minutos, S2) e pela validade de 10 minutos: um IP faz até 60 tentativas por código, cerca de 0,006% de chance contra 6 dígitos; com 5 códigos por hora por telefone, cerca de 0,03% por IP por hora, multiplicado pelo número de IPs de quem ataca. Mitigações possíveis: baixar o limite de verificações por IP, encurtar a validade do código (por exemplo, para 300 s) e a recusa por `amr` descrita acima.
- O Supabase pode enxergar as chamadas do Worker com os IPs de saída da Cloudflare; nesse caso, o limite por IP vale para várias pessoas ao mesmo tempo. Por isso a proposta mantém o padrão de 30 verificações a cada 5 minutos até medir. Repassar `X-Forwarded-For` não é proposto, porque o valor pode ser forjado.
- Não se sabe se o Supabase Auth aceita token do Turnstile em `/auth/v1/verify` nem se invalida o código depois de erros.

### S6. *Confirm email* e pré-sequestro de conta (achado U2)

**Decisão proposta (revisar no PR)**: *Confirm email* ligado no BLK-SMTP-01, sempre junto com o provedor Email, primeiro no projeto de teste (S1). Resultado esperado, a verificar no projeto de teste (T054): (1) a conta criada com e-mail e senha não entra antes da confirmação; (2) quando a dona do e-mail entra com Google, a senha escolhida por quem criou a conta não dá acesso, antes nem depois do vínculo. Se o Supabase mantiver essa senha utilizável, `emailPassword` continua desligado e a decisão volta para revisão (FR-019). T053 cobre o lado do painel com `fetch` simulado.

**Motivo**: o vínculo automático da US2, cenário 6, depende de o e-mail estar confirmado; com *Confirm email* desligado, um cadastro feito por terceiros com o e-mail de outra pessoa pode ser vinculado à conta Google dela. O BLK-SMTP-01 não pedia esse ajuste e nenhum teste cobria o cenário.

**Alternativas**: desligar o vínculo automático (o Supabase não oferece essa opção; a reconferir); exigir que o Google seja sempre conta separada (mesma limitação).

**Riscos residuais**: o comportamento é do Supabase Auth, não do repositório, e pode mudar em atualizações; T044 o reconfere antes de ligar o método.

### S7. Hook responde `429` quando o limite estoura (achado I1)

**Decisão proposta (revisar no PR)**: acima de 5 pedidos por hora, o hook responde `429` com `{ "error": { "http_code": 429, "message": "too many requests" } }`, sem cabeçalho `retry-after`, e não substitui o código pendente. O painel traduz o `429` de `/auth/v1/otp` e `/auth/v1/signup` para "Muitas tentativas. Tente de novo em alguns minutos." (US3, cenário 7).

**Motivo**: com `200`, o Supabase respondia sucesso ao painel, que mostrava "Abrir WhatsApp" para um código que nunca chegaria.

**Alternativas**: manter `200` e contar os pedidos no navegador (fácil de contornar); pedir o código por uma rota do Worker (mais uma rota pública, sem ganho sobre o `429`).

**Riscos residuais**: é a reconferir, no projeto de teste, se o Supabase repassa o `http_code` `429` ao cliente e se repete a chamada; uma repetição com o mesmo `webhook-id` recebe `401` e não grava nada. O `429` revela que aquele telefone teve muitos pedidos na última hora, mas não revela se existe conta.

### S8. Prazos do hook e do webhook (achado I2)

**Decisão proposta (revisar no PR)**:

- Hook: prazo total de 4 s contado da chegada. Cada chamada à Graph API usa como tempo limite o menor valor entre 3 s e o tempo restante menos 300 ms, reservados para `take_auth_otp` e a resposta; a única nova tentativa (só para `5xx`) acontece se restarem pelo menos 1 s. Sem tempo ou com falha, o código continua pendente e é entregue quando a pessoa enviar a mensagem.
- Webhook: o Worker valida tamanho e assinatura, responde `200` à Meta e faz o restante (normalizar, `touch_whatsapp_window`, `take_auth_otp` e envio) em `ctx.waitUntil`, com prazo de 8 s contado da chegada e a mesma regra de nova tentativa.

**Motivo**: 3 s de tempo limite mais uma nova tentativa somavam cerca de 6 s, além das chamadas ao banco, acima dos 5 s do FR-013.

**Alternativas**: tempo limite fixo de 1,5 s por tentativa (falha mais em lentidões normais da Graph API); enviar também do hook em `ctx.waitUntil` (possível, mas o `429` de S7 e a gravação continuam síncronos; fica como opção se 4 s não bastarem).

**Riscos residuais**: o trabalho em `ctx.waitUntil` pode se perder se o Worker for encerrado; como a Meta já recebeu `200`, não repete, e a pessoa precisa enviar a mensagem de novo ou pedir outro código. Se o envio pelo hook der certo mas a resposta se perder no tempo limite, a pessoa pode receber o mesmo código duas vezes (mesmo número, sem risco novo). Os limites de CPU e de duração de `ctx.waitUntil` no Workers Free são a reconferir.

### Pendências com valores propostos

| Pendência | Proposta | Tarefa |
|---|---|---|
| BLK-AUTH-01: registrar o estado atual dos provedores no projeto de produção | Email e Phone desligados; Google ligado; *Confirm email* registrado como está | T046 |
| BLK-SBTEST-01: criar o projeto Supabase de teste | Projeto Free `vitrine-inspira-teste`, com as migrações do repositório e um Worker de teste que aponta para ele (`wrangler dev` exposto por túnel gratuito ou Worker separado em `*.workers.dev`; escolha no passo) | T046 |
| BLK-RATE-01: confirmar e aplicar os limites | Valores da tabela de S2 | T055 |
| Comportamentos do Supabase a reconferir no projeto de teste | Vínculo com e-mail não confirmado (S6), repasse do `429` do hook (S7), IP visto nas chamadas do Worker (S5) | T054, T044 |
