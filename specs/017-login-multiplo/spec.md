# Feature Specification: Login múltiplo no painel (e-mail, telefone e código pelo WhatsApp)

**Feature Branch**: `cursor/login-multiplo-whatsapp-564b`

**Created**: 2026-11-22

**Status**: Draft (proposta; depende do [ADR 0015](../../docs/adr/0015-login-multiplo-whatsapp.md), ainda proposto)

**Input**: Pedido do Lino: adotar na entrada do painel um layout minimalista como o da referência (campo de identificação, senha, "Esqueceu sua senha?", botão "Entrar", divisor "ou entrar com", botões redondos de login social e "Não tem uma conta? Cadastre-se"). Só o Google limita quem consegue criar conta; acrescentar e-mail e senha, telefone e senha e entrada por telefone com código enviado pelo WhatsApp. SMS não será usado, porque não há orçamento para o serviço.

Vocabulário em [`CONTEXT.md`](../../CONTEXT.md). Decisões anteriores: [ADR 0004](../../docs/adr/0004-google-sign-in.md) (Google via Supabase Auth; propriedade pelo `user.id`), [ADR 0005](../../docs/adr/0005-zero-cost-mvp.md) (custo zero, sem contratação automática) e [`docs/instagram/login-meta.md`](../../docs/instagram/login-meta.md) (separar "entrar no painel" de "conectar canais"). Pesquisa e números de cota em [`research.md`](research.md).

## Ponto de partida

- A seção `#auth-section` de `web/portal/index.html` tem um único botão, "Entrar com Google". `startGoogleLogin()` e `exchangePkceCode()` em `web/portal/portal.js` fazem o PKCE com o Supabase Auth e entregam o `access_token` a `POST /api/auth/session`, que grava o cookie `__Host-vitrine_session`.
- `workers/api.mjs` valida qualquer JWT do projeto Supabase (ES256 via JWKS, `iss`, `aud`, `role`, `exp`), sem depender do provedor. Por isso, qualquer método de login do Supabase Auth reaproveita a sessão atual sem mudança no modelo de autorização.
- Não há SMTP próprio configurado, provedor de SMS, número de WhatsApp Business nem Auth Hook no projeto Supabase. Nada aqui afirma que esses itens existem.
- A constituição (0.1.0) diz "Login inicial será Google via Supabase Auth"; esta especificação depende da emenda proposta 0.2.0.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pessoa vê uma tela de entrada simples, com todos os métodos (Priority: P1)

Quem abre `/portal/` sem sessão vê um formulário curto: "E-mail ou telefone", "Senha", "Esqueceu sua senha?", botão "Entrar", o divisor "ou entrar com" e botões redondos (Google e WhatsApp), além de "Não tem uma conta? Cadastre-se".

**Why this priority**: é a base visual e de acessibilidade de todos os outros métodos; sozinha, já mantém o Google funcionando na nova tela.

**Independent Test**: abrir `/portal/` sem sessão em 1280 × 900 e 375 × 812, navegar só pelo teclado, usar um leitor de tela e entrar com Google pela nova fileira de botões.

**Acceptance Scenarios**:

1. **Given** uma pessoa sem sessão, **When** abre `/portal/`, **Then** vê, nesta ordem: marca, título "Entrar no Painel", campo "E-mail ou telefone", campo "Senha" com botão de mostrar e ocultar, link "Esqueceu sua senha?" alinhado à direita, botão "Entrar", divisor "ou entrar com", botões redondos de 56 px com rótulo acessível ("Entrar com Google", "Entrar com código pelo WhatsApp") e a linha "Não tem uma conta? Cadastre-se".
2. **Given** a tela em 375 px, **When** a pessoa a observa, **Then** não há rolagem horizontal, cada alvo de toque tem pelo menos 44 × 44 px e o teclado do celular abre como `email` quando o texto contém "@" e como `tel` no modo telefone.
3. **Given** o botão "Entrar" com os campos vazios, **When** a pessoa o aciona, **Then** o foco vai para o primeiro campo com erro e a mensagem é lida pelo leitor de tela (`aria-live="polite"`), sem enviar nada à rede.
4. **Given** a pessoa toca em "Cadastre-se", **When** a tela muda para o modo "Criar conta", **Then** o título vira "Criar conta", aparece "Confirmar senha" e a linha final vira "Já tem uma conta? Entrar", sem recarregar a página.
5. **Given** o servidor informa em `GET /api/auth/config` os métodos disponíveis, **When** um método está desligado (por exemplo, WhatsApp antes do passo humano BLK-WA-01), **Then** o botão dele não aparece e o restante da tela continua usável.
6. **Given** o tema escuro, **When** a tela é exibida, **Then** usa os tokens `dark-*` do `DESIGN.md`, com contraste mínimo de 4,5:1 nos textos.

---

### User Story 2 - Pessoa cria conta e entra com e-mail e senha (Priority: P2)

Quem não tem conta Google, ou não quer usá-la, cria conta com e-mail e senha, confirma pelo link recebido e entra.

**Why this priority**: é o método mais esperado depois do Google e não depende de número de WhatsApp Business.

**Independent Test**: com o SMTP do passo humano BLK-SMTP-01, criar conta com um e-mail novo, confirmar pelo link, sair, entrar com e-mail e senha, pedir "Esqueceu sua senha?", definir senha nova e entrar com ela.

**Acceptance Scenarios**:

1. **Given** o modo "Criar conta" com um e-mail novo e senha válida (mínimo de 8 caracteres, com letra e número), **When** a pessoa envia, **Then** vê "Enviamos um link de confirmação para o seu e-mail" e ainda não entra no painel.
2. **Given** o link de confirmação aberto em até 1 hora, **When** volta ao `/portal/`, **Then** a sessão é criada por `POST /api/auth/session` e a pessoa cai no painel inicial.
3. **Given** um e-mail já cadastrado, **When** alguém tenta criar conta com ele, **Then** a resposta é a mesma do cadastro novo (sem revelar que a conta existe).
4. **Given** e-mail ou senha errados, **When** a pessoa tenta entrar, **Then** vê "E-mail, telefone ou senha incorretos", sem dizer qual dos dois está errado.
5. **Given** "Esqueceu sua senha?" com um e-mail, **When** a pessoa abre o link recebido, **Then** vê o formulário "Definir nova senha" e, ao salvar, entra no painel; o link não funciona de novo.
6. **Given** uma pessoa que criou conta com e-mail e senha e depois entra com Google usando o mesmo e-mail verificado, **When** o login termina, **Then** é a mesma conta (o mesmo `user.id`) e ela vê as mesmas vitrines.

---

### User Story 3 - Pessoa entra com o telefone recebendo um código pelo WhatsApp (Priority: P3)

A pessoa toca no botão do WhatsApp, informa o telefone, abre o WhatsApp com uma mensagem pronta para o número da Vitrine, envia e recebe na resposta um código de 6 dígitos que digita no painel.

**Why this priority**: atende quem só usa o celular e o WhatsApp, sem e-mail à mão, sem custo por mensagem para a Vitrine.

**Independent Test**: com os passos humanos BLK-WA-01 e BLK-HOOK-01 concluídos, informar um telefone novo, enviar a mensagem pronta, receber o código, digitá-lo e entrar; repetir com código errado, código vencido e código já usado.

**Acceptance Scenarios**:

1. **Given** o modo "Entrar com código pelo WhatsApp", **When** a pessoa informa um celular brasileiro válido e toca em "Continuar", **Then** vê "Toque em Abrir WhatsApp e envie a mensagem para receber seu código", o botão "Abrir WhatsApp" (link `https://wa.me/<número-da-vitrine>?text=...`) e o campo de 6 dígitos.
2. **Given** a mensagem pronta enviada do mesmo número informado, **When** o Worker recebe o webhook, **Then** responde em até 10 segundos, pelo próprio WhatsApp, com "Seu código de acesso à Vitrine é 123456. Ele vale por 10 minutos. Não compartilhe com ninguém."
3. **Given** o código correto digitado em até 10 minutos, **When** a pessoa confirma, **Then** entra no painel; se o telefone era novo, a conta é criada nesse momento.
4. **Given** um código errado, **When** a pessoa erra 5 vezes, **Then** o código deixa de valer e ela precisa pedir outro.
5. **Given** uma mensagem enviada de um número diferente do informado, **When** chega ao Worker, **Then** nenhum código é entregue e a resposta (gratuita) orienta a iniciar o acesso pelo painel com aquele número.
6. **Given** a pessoa já falou com o número da Vitrine nas últimas 24 horas, **When** pede um código, **Then** recebe o código direto, sem precisar enviar outra mensagem.
7. **Given** a mesma pessoa pedindo códigos em sequência, **When** passa de 5 pedidos em uma hora, **Then** vê "Muitas tentativas. Tente de novo em alguns minutos." e nenhuma mensagem nova é enviada.
8. **Given** um número antigo de celular brasileiro cujo identificador no WhatsApp não tem o nono dígito, **When** a mensagem chega, **Then** o número é reconhecido como o mesmo informado no painel.

---

### User Story 4 - Pessoa cria conta e entra com telefone e senha (Priority: P4)

A pessoa cria conta com telefone e senha, confirma o telefone com o código pelo WhatsApp uma vez e, nas próximas vezes, entra só com telefone e senha.

**Why this priority**: evita receber um código a cada acesso para quem prefere senha; reaproveita a ponte da US3.

**Independent Test**: criar conta com telefone e senha, confirmar pelo código, sair, entrar com telefone e senha, esquecer a senha, recuperá-la pelo código e entrar com a nova.

**Acceptance Scenarios**:

1. **Given** o modo "Criar conta" com um telefone e senha válida, **When** a pessoa envia, **Then** vê o mesmo passo "Abrir WhatsApp" da US3 para confirmar o número; a conta só entra no painel depois do código.
2. **Given** um telefone confirmado, **When** a pessoa informa telefone e senha em "Entrar", **Then** entra sem código.
3. **Given** "Esqueceu sua senha?" com um telefone, **When** a pessoa confirma o código pelo WhatsApp, **Then** vê "Definir nova senha" e, ao salvar, entra no painel.
4. **Given** um telefone cadastrado e senha errada, **When** a pessoa tenta entrar, **Then** vê a mesma mensagem neutra da US2.

---

### User Story 5 - Plataforma resiste a abuso e não expõe dados pessoais (Priority: P5)

Cadastro, entrada com senha e pedido de código passam por um desafio invisível (Cloudflare Turnstile) e por limites por telefone, e-mail e endereço IP; nenhum log guarda e-mail, telefone, senha ou código.

**Why this priority**: os novos métodos abrem formulários públicos; sem proteção, robôs podem criar contas ou disparar mensagens. Precisa estar pronta antes de ligar os métodos em produção.

**Independent Test**: enviar cadastro sem o token do Turnstile, repetir pedidos de código acima do limite, chamar o hook sem assinatura e procurar e-mail, telefone ou código nos logs de teste.

**Acceptance Scenarios**:

1. **Given** um pedido de cadastro, senha ou código sem token válido do Turnstile, **When** chega ao Supabase Auth, **Then** é recusado e a tela pede para tentar de novo.
2. **Given** `POST /api/auth/hooks/send-sms` sem assinatura válida ou com carimbo de tempo com mais de 5 minutos, **When** chega ao Worker, **Then** responde `401` e não grava nada.
3. **Given** `POST /api/whatsapp/webhook` sem `X-Hub-Signature-256` válido, **When** chega ao Worker, **Then** responde `401` e não envia mensagem.
4. **Given** a suíte de testes, **When** os logs são inspecionados, **Then** não aparecem e-mails, telefones, senhas, códigos nem tokens.

---

### Edge Cases

- Telefone com ou sem `+55`, com máscara, com o nono dígito ou sem ele: tudo é normalizado para E.164 antes de qualquer uso.
- Número fixo ou estrangeiro: o modo WhatsApp aceita só celular brasileiro no MVP e explica isso na tela; números estrangeiros ficam para depois.
- WhatsApp fora do ar ou Graph API com erro: a tela informa "Não conseguimos enviar o código agora" e sugere e-mail ou Google; o código guardado expira sozinho.
- A pessoa fecha o WhatsApp sem enviar a mensagem: o código fica guardado até vencer (10 minutos) e é apagado.
- A mesma pessoa com contas separadas (uma por telefone, outra por Google): continuam separadas no MVP; vincular identidades fica fora de escopo.
- O link de confirmação de e-mail aberto em outro navegador: a troca PKCE falha e a tela pede para entrar com e-mail e senha, já confirmados.
- Vitrine pública: nada desta especificação muda artefatos publicados (Princípio I).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A tela de entrada DEVE seguir a ordem e os textos da US1 e usar os tokens do `DESIGN.md` (sem novas cores nem cantos fora de `rounded.control` e `rounded.surface`; os botões sociais são círculos).
- **FR-002**: `GET /api/auth/config` DEVE informar `authMethods` (`emailPassword`, `phonePassword`, `whatsappOtp`) e `socialProviders` (inicialmente `["google"]`), além de `turnstileSiteKey` quando configurado; nenhum segredo entra nessa resposta.
- **FR-003**: O campo "E-mail ou telefone" DEVE tratar como e-mail o texto com "@" e como telefone o texto com 10 ou mais dígitos; CPF não é aceito.
- **FR-004**: Cadastro e entrada com e-mail ou telefone e senha DEVEM usar a API do Supabase Auth (`/auth/v1/signup`, `/auth/v1/token?grant_type=password`, `/auth/v1/verify`, `/auth/v1/recover`, `/auth/v1/user`) e terminar sempre em `POST /api/auth/session`.
- **FR-005**: Os fluxos com link por e-mail (confirmação e recuperação) DEVEM usar PKCE, como o Google, e distinguir o tipo de retorno para abrir "Definir nova senha" quando for recuperação.
- **FR-006**: A senha DEVE ter no mínimo 8 caracteres, com letra e número, validada no navegador e no Supabase Auth.
- **FR-007**: O código pelo WhatsApp DEVE ser gerado e verificado pelo Supabase Auth; o Worker só o recebe pelo Send SMS Hook, guarda cifrado (AES-GCM) por no máximo 10 minutos e o apaga ao entregar ou vencer.
- **FR-008**: O Worker DEVE enviar o código apenas como resposta dentro da janela de atendimento de 24 horas aberta pela pessoa (mensagem de serviço); NÃO DEVE usar modelos de mensagem pagos.
- **FR-009**: O Worker DEVE identificar a pessoa pelo número remetente do webhook, normalizado e transformado em HMAC com segredo próprio; o telefone em texto puro NÃO DEVE ser gravado na tabela de envio.
- **FR-010**: Pedidos de código DEVEM ter limite por telefone (5 por hora) além dos limites do Supabase Auth, e a verificação DEVE recusar o código após 5 erros.
- **FR-011**: Respostas de cadastro, entrada e recuperação DEVEM ser neutras quanto à existência da conta.
- **FR-012**: Cadastro, entrada com senha e pedido de código DEVEM exigir token do Cloudflare Turnstile quando `turnstileSiteKey` estiver configurado.
- **FR-013**: Hook e webhook DEVEM validar assinatura em tempo constante, recusar repetição pelo identificador da mensagem e responder em menos de 5 segundos.
- **FR-014**: A propriedade de vitrines DEVE continuar ligada ao `user.id` do Supabase; nenhum método novo usa e-mail ou telefone como chave de acesso.
- **FR-015**: Logs, respostas de erro e o bundle NÃO DEVEM conter e-mail, telefone, senha, código, token ou segredo.
- **FR-016**: Cada método DEVE poder ser desligado por configuração do Worker sem novo deploy do front-end.

### Key Entities

- **Método de entrada**: forma de autenticar no painel (Google, e-mail e senha, telefone e senha, código pelo WhatsApp), ligada ou desligada pelo servidor.
- **Código de acesso pendente**: código de 6 dígitos emitido pelo Supabase Auth para um telefone, guardado cifrado pelo Worker até ser entregue pelo WhatsApp ou vencer.
- **Janela de atendimento**: intervalo de 24 horas após a última mensagem que a pessoa enviou ao número da Vitrine, durante o qual a resposta não é cobrada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma pessoa sem conta Google consegue criar conta e chegar ao painel inicial em até 2 minutos com e-mail e senha ou com telefone e código pelo WhatsApp.
- **SC-002**: O custo mensal com mensagens de WhatsApp e e-mail fica em R$ 0 no piloto (até 10 vitrines), comprovado pela fatura da Meta e pelo painel do provedor de e-mail.
- **SC-003**: Em 1280 e 375 px, a tela de entrada não tem rolagem horizontal e passa na verificação automática de acessibilidade usada no projeto sem violações sérias.
- **SC-004**: 100% dos testes de hook e webhook sem assinatura, com assinatura errada ou repetidos são recusados sem efeito colateral.
- **SC-005**: Nenhum teste encontra e-mail, telefone, código ou segredo em logs, bundle ou `dist/`.

## Assumptions

- O Supabase Free permite Send SMS Hook por HTTP, Turnstile e confirmação por e-mail com SMTP próprio; isso precisa ser confirmado nos passos humanos (BLK-HOOK-01, BLK-TURNSTILE-01, BLK-SMTP-01).
- A Meta não cobra mensagens de serviço dentro da janela de atendimento (regra de preço por mensagem vigente desde 1º de julho de 2025); a regra é reconferida antes de ligar o método (Princípio IV).
- O número da Vitrine no WhatsApp Business é um número dedicado, não um celular pessoal.
- O público inicial é brasileiro; outros países ficam para depois.

## Fora de escopo

- SMS, ligação de voz e modelos de autenticação pagos do WhatsApp.
- Apple (exige programa pago de desenvolvedor), TikTok (sem provedor nativo no Supabase), Facebook e X (issue "depois"), e CPF como identificador.
- Vincular uma conta de telefone a uma conta Google ou de e-mail já existente.
- Autenticação em dois fatores (MFA).
- Login de clientes finais nas vitrines públicas; esta especificação trata só do painel.
