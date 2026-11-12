# Entrar com Instagram/Meta no painel: análise de opções

Data: 12/11/2026. Status: estudo e decisão arquitetural pendente; sem alteração de código, configuração de provedor remoto, planos pagos ou deploy nesta entrega.

## Contexto e escopo

O login principal do painel administrativo (`painel.inspira.dev.br`, rota `/portal/`) permanece sendo **Entrar com Google** via Supabase Auth (ADR 0004). Este documento avalia a viabilidade de oferecer **Entrar com Instagram/Meta** como opção adicional de autenticação para proprietários e membros de equipe no painel, em alinhamento com o [roteiro de integração do Instagram](../instagram-integration-roadmap.md) (`docs/instagram-integration-roadmap.md`).

As decisões detalhadas sobre o cadastro do aplicativo no console da Meta, o fluxo de conexão de conta por vitrine, a sincronização periódica e a API pública estão distribuídas nos demais documentos de planejamento (`docs/instagram/`) e permanecem **a confirmar** nos respectivos escopos.

## Separação fundamental: entrar no painel vs. autorizar leitura do feed (#49)

Na arquitetura da Vitrine Inspira, a identidade da pessoa que administra o painel e a conexão de uma conta do Instagram a uma vitrine específica cumprem papéis distintos e não devem ser confundidas:

| Dimensão | Entrar no painel (Autenticação de usuário) | Conectar Instagram à vitrine ([issue #49](https://github.com/coletivo-inspira/vitrine/issues/49)) |
| --- | --- | --- |
| **Objetivo** | Identificar a pessoa (`auth.users`) que acessa o painel para administrar suas vitrines. | Autorizar a plataforma a ler perfil e mídias de uma conta profissional do Instagram para exibi-las em uma vitrine específica. |
| **Escopo no domínio** | Por pessoa (`user_id` estável no Supabase Auth). Uma pessoa pode ser proprietária ou membro de várias vitrines (ADR 0002). | Estritamente por vitrine (`site_id`). Uma conta do Instagram por vitrine; o acesso a uma vitrine não autoriza outra. |
| **Momento do fluxo** | Antes de acessar qualquer área autenticada do portal (`/portal/`). | Dentro do painel, após a pessoa já estar autenticada e selecionar uma vitrine na qual possui permissão. |
| **Credenciais e tokens** | Sessão do painel validada pelo Worker (`__Host-vitrine_session`) a partir do JWT emitido pelo Supabase Auth (`aud = authenticated`). | Token de usuário do sistema do portfólio empresarial do dono (login unificado), guardado apenas no servidor e vinculado ao `site_id`, sem renovação periódica quando configurado para não expirar (detalhes em #49 e #50). |
| **Permissões solicitadas** | Identidade básica do usuário (id, nome, email quando disponível). | Permissão única de leitura de conta profissional `instagram_basic`, pelo login unificado da Meta ([`configuracao-meta.md`](configuracao-meta.md), #48). |

Consequências diretas dessa separação:

1. **Entrar com Google e conectar Instagram**: o proprietário entra no painel com sua conta Google e, dentro da vitrine escolhida, aciona "Conectar Instagram" (#49) apenas para autorizar a leitura do feed daquela vitrine.
2. **Entrar com Meta/Instagram não conecta vitrines automaticamente**: mesmo que a pessoa entre no painel usando uma credencial Meta, o vínculo de leitura do feed continua exigindo a seleção explícita da vitrine e o fluxo dedicado de autorização por vitrine (#49).
3. **Múltiplas vitrines e equipes**: uma pessoa autenticada pode administrar vitrines com contas de Instagram diferentes, e membros da equipe da vitrine entram no painel com suas próprias identidades individuais sem compartilhar a senha do Instagram da marca.

## Estado atual do login no painel (Google via Supabase Auth)

O fluxo implementado hoje em `web/portal/` e `workers/api.mjs` opera inteiramente sobre o padrão OAuth 2.0 com PKCE do Supabase Auth (GoTrue):

1. **Configuração pública (`/api/auth/config`)**: o portal consulta o Worker para obter `supabaseUrl` e a chave pública (`publishableKey` / `anon`), rejeitando qualquer chave secreta (`service_role`).
2. **Início do PKCE no navegador (`web/portal/portal.js`)**: `startGoogleLogin()` gera um `pkce_verifier` aleatório em `sessionStorage`, calcula o `code_challenge` (SHA-256 em Base64URL) e redireciona para `${supabaseUrl}/auth/v1/authorize?provider=google&code_challenge=...&code_challenge_method=s256&redirect_to=.../portal/`.
3. **Troca do código (`exchangePkceCode`)**: no retorno ao portal com `?code=...`, o navegador envia `auth_code` e `code_verifier` para `${supabaseUrl}/auth/v1/token?grant_type=pkce` e recebe o `access_token` (JWT assinado pelo Supabase).
4. **Sessão HttpOnly no Worker (`/api/auth/session`)**: o portal envia o `access_token` via `POST /api/auth/session` (com validação de cabeçalho `Origin`). O Worker verifica criptograficamente a assinatura (`verifyJwtEs256` via JWKS em `/auth/v1/.well-known/jwks.json` ou `verifyJwtHs256`), valida `exp`, `nbf`, `iss`, `aud = authenticated` e `role = authenticated`, extrai o `sub` (`user.id`) e grava o cookie `__Host-vitrine_session` (`HttpOnly; Secure; SameSite=Lax; Path=/`).
5. **Autorização no banco (RLS)**: todas as chamadas do Worker ao PostgREST repassam `Authorization: Bearer <token>`, aplicando as políticas de Row Level Security em `sites`, `site_memberships`, `drafts`, `publications` e `profiles` com base em `auth.uid()`.
6. **Portão de perfil (`#profile-gate`)**: no primeiro acesso, o painel lê `user_metadata` (`full_name`/`name`, `avatar_url`/`picture`) e `email` para pré-preencher o cartão de conta conectada antes de liberar a criação de vitrines.

## Limitação do Supabase Auth: Facebook vs. Instagram

O Supabase Auth (GoTrue) **possui provedor nativo para Facebook (`provider=facebook`), mas não possui provedor nativo para Instagram Login**:

- Os provedores sociais embutidos no GoTrue seguem fluxos de identidade que retornam perfil básico e, em geral, endereço de email verificado (como Google e Facebook Login).
- A Meta descontinuou a antiga API de exibição básica para contas pessoais (*Instagram Basic Display API*) e concentrou a integração oficial na **API do Instagram com Instagram Login** voltada a contas profissionais (Empresa ou Criador), cujos escopos (`instagram_business_basic`) e endpoints de troca de token diferem do provedor OAuth padrão do Facebook no GoTrue.
- Além disso, a API de Instagram Login não fornece endereço de email da pessoa na resposta padrão de identidade, o que impede o GoTrue de unificar ou criar identidades por email da mesma forma que faz com Google ou Facebook.

### O login unificado da Meta não é um login de pessoa

Em 12/11/2026 a Vitrine adotou a **Configuração da API com login unificado** para conectar o Instagram às vitrines ([`configuracao-meta.md`](configuracao-meta.md)). Embora a tela da Meta deixe a pessoa "entrar com Instagram ou Facebook", ela não serve como login do painel:

- O resultado é um **token de usuário do sistema do portfólio empresarial** escolhido, não um token da pessoa. Nesse token, `/me` representa o usuário do sistema, e o token continua válido mesmo se a pessoa sair do negócio.
- Não há email nem identidade estável da pessoa para criar ou localizar um registro em `auth.users`.
- O app Meta da Vitrine usa **Facebook Login for Business**, em que a tela é definida por `config_id` e o parâmetro `scope` não deve ser usado. O provedor `facebook` do Supabase Auth monta a autorização com `scope` (`email`, `public_profile`) para o Facebook Login clássico, então não deve reaproveitar o app da integração do Instagram.

Diante dessas restrições técnicas e da regra de manter a infraestrutura em custo zero (Cloudflare Workers Free e Supabase Free, sem planos pagos), existem três saídas possíveis.

## Avaliação das alternativas

### Opção A — Usar o provedor nativo Facebook do Supabase Auth (`provider=facebook`)

Consiste em habilitar o provedor `facebook` já suportado pelo Supabase Auth, permitindo que a pessoa entre no painel com a conta Facebook/Meta (frequentemente vinculada à página ou conta profissional do negócio na Central de Contas da Meta).

- **Como funcionaria**: no portal, um botão secundário "Entrar com Meta (Facebook)" chamaria o mesmo fluxo PKCE (`${supabaseUrl}/auth/v1/authorize?provider=facebook...`). A troca de código, a emissão do JWT pelo Supabase, a validação em `/api/auth/session` e as políticas RLS em `workers/api.mjs` funcionariam sem mudança arquitetural no Worker.
- **Vantagens**:
  - Reaproveita 100% da validação de JWT, JWKS, cookies `__Host-vitrine_session` e RLS já implementados.
  - Zero custo adicional de infraestrutura ou execução no Worker.
  - O Facebook Login solicita o escopo `email` por padrão, facilitando a correspondência de identidade no Supabase Auth.
- **Limitações e riscos**:
  - **Expectativa do usuário**: donos de negócios que usam apenas o aplicativo do Instagram no celular podem não lembrar a senha do Facebook ou não ter conta Facebook vinculada.
  - **Não substitui o #49**: entrar com Facebook no painel apenas autentica o usuário (`auth.users`); para ler o feed da vitrine sem exigir página do Facebook atrelada, o fluxo de "Conectar Instagram" (#49, a confirmar) continua sendo um passo separado.
  - **Dependências no console Meta**: exige um **app Meta separado**, do tipo Consumidor, com o *Facebook Login* clássico, URL de callback do Supabase (`/auth/v1/callback`), política de privacidade, exclusão de dados e revisão própria do escopo `email`. O app da integração do Instagram (tipo Empresa, Facebook Login for Business com `config_id`) não deve ser reaproveitado para isso, para não misturar a revisão de *Tech Provider* com login de pessoas.

### Opção B — Implementar OAuth próprio de Instagram Login no Cloudflare Worker

Consiste em implementar um fluxo OAuth 2.0 customizado diretamente no Cloudflare Worker (`/api/auth/instagram/...`), conversando com a Meta e gerenciando a criação/vinculação de usuários no Supabase Auth via API administrativa (`service_role`) ou emissão de tokens próprios.

- **Como funcionaria**: o Worker redirecionaria o navegador para o endpoint de autorização do Instagram, receberia o `code` no callback, trocaria pelo token na Meta usando o segredo do app no servidor e precisaria localizar ou criar um registro em `auth.users` no Supabase para emitir uma sessão compatível com `auth.uid()` no PostgREST.
- **Vantagens**:
  - Permite que o usuário autentique diretamente com o usuário/senha do Instagram (conta profissional).
- **Limitações e riscos**:
  - **Ausência de identidade de pessoa**: a configuração antiga de login do Instagram retorna `user_id` (escopado por app) e `username`, sem email; o login unificado, adotado pela Vitrine, retorna um token do portfólio empresarial, sem identidade da pessoa. Criar usuários sintéticos no Supabase Auth sem email verificado quebra premissas do painel (como exibição de conta no `#profile-gate` e recuperação de acesso).
  - **Exposição e uso de `service_role` no fluxo de login**: para criar usuários ou emitir sessões fora do GoTrue nativo, o Worker precisaria operar com privilégio administrativo (`SUPABASE_SERVICE_ROLE_KEY`) em rotas públicas de autenticação, aumentando a superfície de risco que a arquitetura atual evita (hoje o Worker só repassa o JWT do próprio usuário ao PostgREST).
  - **Restrição a contas profissionais**: a API atual com Instagram Login exige conta profissional (Empresa ou Criador); membros da equipe ou proprietários com conta pessoal no Instagram falhariam ao tentar entrar no painel.
  - **Confusão entre login e conexão de vitrine**: usar a mesma tela de consentimento da Meta tanto para entrar no painel quanto para conectar o feed de uma vitrine (#49) mistura escopos pessoais de sessão com autorizações de leitura de uma vitrine específica.
  - **Complexidade de manutenção**: exige manter estado OAuth customizado, proteção CSRF própria, rotação de chaves e testes de segurança paralelos ao PKCE já homologado no Supabase Auth.

### Opção C — Adiar o login com Instagram/Meta no painel (manter Google no login + Instagram apenas por vitrine no #49)

Consiste em manter **Entrar com Google** como único método de login do painel na entrega atual e concentrar toda a integração com a Meta no fluxo autenticando de **"Conectar Instagram" por vitrine (#49)**.

- **Como funcionaria**: o proprietário entra no painel com Google (fluxo já implementado), escolhe a vitrine e clica em "Conectar Instagram". Todo o OAuth com a Meta ocorre apenas para vincular a leitura do feed àquela vitrine (`site_id`), sem alterar `auth.users` nem `/api/auth/session`.
- **Vantagens**:
  - **Foco na prioridade real**: entrega o valor central do roteiro (exibir o feed do Instagram na vitrine e nos sites consumidores como a Ganja) sem duplicar fluxos de autenticação de usuários.
  - **Reaproveita o login Google para o Google Drive**: conversa diretamente com a frente de importação de imagens da vitrine via Google Drive (`docs/imagens-google-drive.md`, a confirmar), onde a conta Google do proprietário já é a identidade principal.
  - **Zero risco de colisão de contas**: elimina o problema de um mesmo proprietário criar duas contas separadas no painel (uma via Google e outra via Meta/Instagram) e perder de vista suas vitrines.
  - **Isolamento limpo de segurança**: mantém `/api/auth/*` enxuto, sem `service_role` e 100% baseado em PKCE + JWKS do Supabase.
- **Limitações**:
  - Proprietários ainda precisam de uma conta Google para acessar o painel administrativo (premissa já aceita no ADR 0004).

### Quadro comparativo

| Critério | Opção A: Provedor Facebook (Supabase Auth) | Opção B: OAuth Instagram próprio no Worker | Opção C: Adiar login Meta (focar no #49 por vitrine) |
| --- | --- | --- | --- |
| **Suporte nativo no Supabase Auth** | Sim (`provider=facebook`) | Não (exige ponte customizada) | Sim (mantém `provider=google`) |
| **Retorna email verificado** | Sim (quando a conta Facebook possui email) | Não (Instagram API não fornece email) | Sim (Google) |
| **Impacto em `workers/api.mjs` e RLS** | Mínimo (mesmo JWT e `/api/auth/session`) | Alto (exige `service_role` ou emissor paralelo) | Nenhum no login do painel |
| **Funciona para conta pessoal de membro** | Sim | Não (exige conta profissional Instagram) | Sim |
| **Risco de contas duplicadas (`auth.users`)** | Médio (se email do Facebook diferir do Google) | Alto (sem email para conciliar com Google) | Nenhum |
| **Custo de infraestrutura** | Zero (Supabase Free / Workers Free) | Zero financeiro, alto custo de manutenção | Zero |

## Vinculação de contas (*Account Linking*) e riscos de segurança

Caso uma segunda opção de login (Opção A ou Opção B) seja ativada no futuro, os seguintes cenários de vinculação de contas e segurança precisam ser tratados antes da liberação:

1. **Duplicação de usuário (`owner_user_id` e `site_memberships`)**:
   - No modelo de dados da Vitrine (`docs/architecture.md` e ADR 0004), a propriedade de uma vitrine (`sites.owner_user_id`) e a participação na equipe (`site_memberships.user_id`) apontam para o UUID estável em `auth.users`, e **não** para o endereço de email.
   - Se o proprietário criou sua vitrine entrando com Google (`maria@gmail.com`) e depois entra com Meta usando uma conta com outro email (ou sem email, no caso do Instagram), o provedor de autenticação criará um novo `user_id`. Para o banco (RLS), esse novo `user_id` não terá acesso às vitrines existentes e cairá novamente na tela de cadastro inicial (`#profile-gate`).
2. **Comportamento de unificação automática por email no Supabase Auth**:
   - O Supabase Auth vincula identidades automaticamente apenas quando ambos os provedores retornam o **mesmo endereço de email confirmado**.
   - Se o usuário usa emails diferentes no Google e no Facebook, ou se a conta Facebook foi criada apenas com número de telefone (sem email verificado), a vinculação automática não ocorre.
   - Para permitir que um usuário já cadastrado adicione outro método de entrada sem criar nova conta, seria necessário implementar um fluxo explícito de vinculação autenticado (*manual identity linking* no painel em `#perfil`), exigindo sessão válida prévia.
3. **Prevenção de tomada de conta (*Account Takeover*)**:
   - **Nunca vincular contas automaticamente por nome de exibição ou `@username` do Instagram**: nomes de usuário no Instagram são mutáveis e podem ser reutilizados se uma pessoa trocar de `@handle`. Usar `username` ou email não verificado como chave de fusão permitiria que terceiros assumissem vitrines alheias.
   - Qualquer vínculo manual entre identidades de login deve exigir que a pessoa já esteja autenticada na sessão principal (`__Host-vitrine_session`) e complete o fluxo PKCE do segundo provedor na mesma sessão.
4. **Desconexão entre login do painel e permissão da vitrine**:
   - Revogar ou desvincular uma identidade de login nunca deve transferir a propriedade da vitrine nem expor tokens de leitura do feed (#49) a outros membros da equipe.
   - Da mesma forma, desconectar o Instagram de uma vitrine (#49) remove apenas o token de leitura do feed daquela vitrine, sem encerrar nem bloquear o login da pessoa no painel.
5. **Isolamento de estado no navegador e CSP**:
   - O logout (`/api/auth/logout`) deve continuar limpando `__Host-vitrine_session` e chaves temporárias de `sessionStorage` (`pkce_verifier`, `supabase_publishable_key`), garantindo que a troca entre provedores no mesmo navegador não misture dados de rascunho ou perfil entre sessões.
   - A política de Content Security Policy do portal (`PORTAL_CSP_HEADER` em `workers/api.mjs`) mantém `connect-src 'self' <SUPABASE_URL>`; fluxos OAuth operam por redirecionamento de página inteira (navegação top-level), sem carregar SDKs JavaScript externos da Meta dentro do painel administrativo.

## Recomendação e próximos passos

1. **Recomendação imediata (Opção C)**: manter **Entrar com Google** como login único do painel nesta fase e tratar a integração com a Meta exclusivamente como **"Conectar Instagram" por vitrine** ([issue #49](https://github.com/coletivo-inspira/vitrine/issues/49)), depois que a pessoa já estiver autenticada no painel. O login unificado da Meta confirma essa separação: a pessoa até pode escolher entrar com Instagram ou Facebook na tela da Meta, mas isso só autoriza a leitura do feed de uma vitrine e não cria sessão no painel.
2. **Evolução futura se houver demanda de login social adicional (Opção A)**: caso surja necessidade comprovada de login alternativo para usuários sem conta Google, priorizar o provedor nativo **Facebook/Meta do Supabase Auth**, num app Meta separado do tipo Consumidor, com fluxo explícito de vinculação de conta no perfil (`#perfil`), evitando a construção de um emissor OAuth customizado no Worker (Opção B).
3. **Dependências em outros documentos**:
   - Configuração do app Meta único da Vitrine, permissão `instagram_basic` e URLs de retorno no console Meta ([`configuracao-meta.md`](configuracao-meta.md), ref. #48 — decidido; ações no console pendentes).
   - Fluxo detalhado de autorização OAuth por vitrine, estados de conexão e revogação ([`conectar-por-vitrine.md`](conectar-por-vitrine.md), ref. #49).
   - Armazenamento seguro, renovação de tokens e sincronização periódica (`docs/instagram/sincronizacao.md`, ref. #50 — a confirmar).
   - Contrato público de leitura e webhook para sites conectados (`docs/instagram/interface-publica-feed.md`, ref. #51 — a confirmar).

## Referências

- [Roteiro de integração Instagram → Vitrine → Ganja](../instagram-integration-roadmap.md) (`docs/instagram-integration-roadmap.md`)
- [Issue #49 — Planejar Conectar Instagram no painel por vitrine](https://github.com/coletivo-inspira/vitrine/issues/49)
- [Arquitetura proposta da Vitrine](../architecture.md)
- [ADR 0002 — Limite de acesso por vitrine](../adr/0002-site-access-boundary.md)
- [ADR 0004 — Login Google via Supabase Auth no MVP](../adr/0004-google-sign-in.md)
- [Preparação do login Google](../google-auth-setup.md)
- [Vocabulário do domínio (`CONTEXT.md`)](../../CONTEXT.md)
