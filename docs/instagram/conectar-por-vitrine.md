# Conectar Instagram no painel por vitrine

Data: 12/11/2026 (revisado no mesmo dia para o login unificado da Meta). Status: planejamento documental (sem implementação de código, migração de banco, configuração remota na Meta ou deploy nesta entrega).

Este documento detalha a etapa 4 do roteiro [`docs/instagram-integration-roadmap.md`](../instagram-integration-roadmap.md) e atende à issue [#49](https://github.com/coletivo-inspira/vitrine/issues/49): como a pessoa proprietária autentica sua sessão no painel, seleciona uma vitrine específica, autoriza a leitura da conta profissional do Instagram via OAuth no servidor (Cloudflare Worker) e gerencia o ciclo de vida da conexão (estados, reconexão, revogação e exclusão de dados).

A autorização usa a **Configuração da API com login unificado** da Meta, decidida em [`configuracao-meta.md`](configuracao-meta.md) (#48): a pessoa entra com Instagram **ou** Facebook numa tela do Facebook Login for Business identificada por `config_id`, escolhe o portfólio empresarial e a conta do Instagram a compartilhar, e o servidor recebe um token de usuário do sistema daquele portfólio com a permissão `instagram_basic`.

---

## 1. Premissas e fronteiras do modelo

1. **App Meta único da plataforma**: a Vitrine Inspira opera um único aplicativo no console da Meta, administrado pela equipe Inspira (configuração detalhada em [`configuracao-meta.md`](configuracao-meta.md), issue #48). Nenhuma pessoa proprietária de vitrine precisa criar aplicativo ou acessar o console de desenvolvedor da Meta.
2. **Uma conta Instagram por vitrine**: cada vitrine (`site_id`) pode vincular no máximo **uma** conta profissional do Instagram por vez. Não há agregação de múltiplas contas na mesma vitrine.
3. **Isolamento estrito entre vitrines (ADR 0002)**: uma pessoa pode administrar várias vitrines, mas toda operação de conexão, consulta de estado, reconexão ou desconexão é escopada por `site_id`. Ter acesso a uma vitrine nunca autoriza conectar, ler credenciais ou alterar a conexão de outra vitrine.
4. **Imagens fora da base própria**: o vínculo autoriza a leitura periódica de metadados do perfil e das mídias pela API oficial; os arquivos de imagem permanecem na origem (Instagram) sob responsabilidade do dono, sem armazenamento binário das mídias do feed na base da plataforma.
5. **Infraestrutura a custo zero (ADR 0001, ADR 0003, ADR 0005)**: todo o fluxo OAuth roda sobre o Cloudflare Worker (`workers/api.mjs`) e o Supabase Postgres com RLS no plano gratuito atual, sem contratação de planos pagos ou serviços externos pagos.
6. **Zero segredos no cliente**: a chave secreta do app Meta (`META_APP_SECRET`), códigos de autorização (`code`) trocados e tokens de acesso existem apenas no servidor; jamais trafegam em respostas JSON para o navegador, URLs públicas, artefatos publicados ou logs.

---

## 2. Separação entre login do painel e autorização do Instagram

A identidade administrativa no portal e a permissão para ler o feed do Instagram são fluxos independentes, com finalidades, escopos e ciclos de vida distintos:

| Dimensão | Sessão administrativa no painel | Autorização de leitura do Instagram |
| --- | --- | --- |
| **Finalidade** | Identificar a pessoa usuária (`auth.users`) que administra uma ou mais vitrines no `/portal/`. | Conceder à vitrine selecionada (`site_id`) permissão para sincronizar perfil e publicações de uma conta profissional do Instagram. |
| **Provedor principal** | Google via Supabase Auth (ADR 0004). *(Opção extra de login no painel via Meta será avaliada separadamente em `docs/instagram/login-meta.md` — a confirmar).* | Login unificado da Meta (Facebook Login for Business com `config_id`; a pessoa entra com Instagram ou Facebook) com a permissão única de leitura `instagram_basic` (#48). |
| **Verificação no Worker** | `resolveSessionUser` em `workers/api.mjs`: valida JWT ES256/HS256 via JWKS do Supabase, aceito via cabeçalho `Authorization: Bearer` ou cookie `__Host-vitrine_session` (`HttpOnly; Secure; SameSite=Lax`), mais verificação de cabeçalho `Origin` em mutações (`validateMutationOriginAndJson`). | Fluxo OAuth iniciado apenas por sessão já autenticada no painel e autorizada na vitrine (`TEAM_ROLES`: `owner` ou `admin` em `sites`/`site_memberships` — *a confirmar se `admin` além de `owner` poderá conectar*). |
| **Escopo do vínculo** | Vinculado ao usuário (`user_id`). | Vinculado exclusivamente à vitrine (`site_id`), registrando em auditoria (`audit_logs`) qual `user_id` realizou a conexão. |
| **Impacto de expiração/logout** | Encerrar a sessão do painel (`POST /api/auth/logout`) desconecta apenas o navegador da pessoa usuária; **não** interrompe a sincronização periódica da vitrine. | Revogar ou desconectar o Instagram interrompe a leitura do feed daquela vitrine; **não** encerra a sessão da pessoa no painel nem altera seu acesso à vitrine. |

---

## 3. Fluxo ponta a ponta: conectar Instagram à vitrine

```mermaid
sequenceDiagram
    autonumber
    actor Dono as Proprietário (Navegador / Painel)
    participant Worker as Cloudflare Worker (workers/api.mjs)
    participant DB as Supabase Postgres (RLS)
    participant Meta as Meta (Facebook Login for Business / graph.facebook.com)

    Dono->>Worker: POST /api/sites/:siteId/instagram/connect (Cookie __Host-vitrine_session + Origin)
    Worker->>Worker: resolveSessionUser() + validateMutationOriginAndJson()
    Worker->>DB: getSite(siteId, user.id) — exige papel autorizado na vitrine
    Worker->>Worker: Gera state criptográfico de uso único (nonce, siteId, userId, exp)
    Worker-->>Dono: URL de login (client_id, config_id, redirect_uri, response_type=code, state, prompt=login) + cookie efêmero HttpOnly com o contexto do state
    Dono->>Meta: Redireciona para a tela oficial da Meta (entra com Instagram ou Facebook, escolhe portfólio e conta)
    alt Proprietário autoriza leitura
        Meta-->>Dono: Redireciona GET /api/instagram/oauth/callback?code=...&state=...
        Dono->>Worker: GET /api/instagram/oauth/callback (com __Host-vitrine_session + cookie de state)
        Worker->>Worker: Valida sessão ativa, integridade/expiração do state e correspondência (userId, siteId)
        Worker->>DB: Revalida permissão de userId sobre siteId
        Worker->>Meta: Troca code por token de usuário do sistema (servidor-a-servidor, META_APP_ID + META_APP_SECRET)
        Worker->>Meta: GET /me?fields=client_business_id e GET /me/assigned_instagram_accounts?fields=id,username
        Worker->>Worker: Aplica a regra de conta única (exatamente uma conta compartilhada, ou a já vinculada na reconexão)
        Worker->>DB: Persiste vínculo 1:1 em site_id (estado connected) + audit_logs
        Worker-->>Dono: Limpa cookie de state e redireciona 302 para /portal/ (vitrine selecionada)
    else Proprietário cancela ou recusa
        Meta-->>Dono: Redireciona GET /api/instagram/oauth/callback?error=access_denied&state=...
        Dono->>Worker: GET /api/instagram/oauth/callback
        Worker->>Worker: Valida e invalida state; não altera credenciais
        Worker-->>Dono: Redireciona 302 para /portal/ com aviso de autorização cancelada
    end
```

### Etapas no servidor (Worker)

1. **Seleção da vitrine e início do fluxo**:
   - No painel (`/portal/`), com sessão ativa, a pessoa proprietária abre a vitrine desejada (`site_id`) e aciona **Conectar Instagram**.
   - A ação chama uma rota autenticada do Worker (ex.: `POST /api/sites/:siteId/instagram/connect` — *contrato final de rota a confirmar*).
   - O Worker executa `resolveSessionUser(request, env, deps)`, valida `Origin` igual à origem do painel (`validateMutationOriginAndJson`) e consulta `store.getSite(siteId, user.id, options)`, recusando com `401 UNAUTHORIZED` se não houver sessão ou `404 SITE_NOT_FOUND` se o usuário não pertencer à vitrine com papel administrativo (`TEAM_ROLES`).
2. **Geração da proteção do retorno (`state`)**:
   - O Worker gera um `state` de uso único e curta duração (ex.: TTL de 10 minutos), assinado com HMAC no servidor e/ou persistido em estado efêmero associado a um cookie `__Host-vitrine_ig_oauth` (`HttpOnly; Secure; SameSite=Lax; Path=/api/instagram/oauth/callback; Max-Age=600`).
   - O contexto vinculado ao `state` amarra explicitamente: `nonce` aleatório de 256 bits, `site_id` alvo, `user_id` que iniciou o fluxo e carimbo de expiração (`exp`).
   - **Sem PKCE**: o fluxo manual documentado do Facebook Login, base do login unificado, não traz `code_challenge`. A proteção fica no `state` assinado de uso único, no cookie HttpOnly e na troca do `code` servidor-a-servidor com a chave secreta do app Meta, que nunca sai do Worker.
3. **Consentimento na Meta**:
   - O navegador é redirecionado (página inteira, sem SDK JavaScript da Meta no painel) para `https://www.facebook.com/dialog/oauth` com `client_id` (`META_APP_ID`), `config_id` (`META_IG_CONFIG_ID`), `redirect_uri` HTTPS fixo, `response_type=code`, `state` e `prompt=login` (mostra sempre as opções Instagram e Facebook, mesmo com sessão do Facebook aberta no navegador).
   - Não se envia `scope`: as permissões e o ativo solicitados (só `instagram_basic` e uma conta do Instagram) vêm da configuração salva no console.
   - Antes do botão, o painel explica que a Meta vai pedir para escolher um **portfólio empresarial** e a **conta do Instagram**, que o login pelo Instagram abre no navegador e pede a senha, e que a conta já precisa ser profissional.
4. **Validação do retorno (`callback`) e associação segura à vitrine**:
   - Como a URL de redirecionamento cadastrada na configuração da Meta é única para o aplicativo (`https://painel.inspira.dev.br/api/instagram/oauth/callback`), o `site_id` **nunca** vem de parâmetro editável pelo cliente no callback: ele é recuperado exclusivamente do `state` validado pelo Worker.
   - Ao receber o `GET` de retorno, o Worker verifica:
     1. Sessão ativa do painel (`__Host-vitrine_session`) pertencente ao **mesmo `user_id`** registrado no `state`.
     2. Correspondência exata, assinatura válida, não expiração e uso único do `state` (descartando o cookie/nonce imediatamente para impedir replay).
     3. Revalidação no banco (`store.getSite(siteId, user.id)`) confirmando que o `user_id` continua autorizado naquela `site_id` no momento da conclusão.
   - Se qualquer verificação falhar (CSRF, sessão expirada, tentativa de usar o callback de uma vitrine em outra ou manipulação de parâmetros), o Worker aborta antes de trocar o `code`, não grava nada no banco e retorna erro seguro.
5. **Troca de código e persistência do vínculo**:
   - Com o `state` validado e `code` presente, o Worker chama `GET https://graph.facebook.com/<versão>/oauth/access_token` servidor-a-servidor com `client_id`, `client_secret` (`META_APP_SECRET`), `redirect_uri` e `code`, e recebe direto um **token de usuário do sistema** do portfólio escolhido pelo dono. Não há segunda troca por token de longa duração; a expiração vem da configuração (decidida como "Nunca" em #48). A URL dessa chamada contém a chave secreta e nunca é registrada em logs.
   - O Worker lê `GET /me?fields=client_business_id` (portfólio do cliente) e `GET /me/assigned_instagram_accounts?fields=id,username` (contas compartilhadas, com paginação por cursor). Nesse token, `/me` é o usuário do sistema, não a conta do Instagram.
   - **Escolha da conta**: nenhuma conta compartilhada → nada é gravado e o painel explica que é preciso compartilhar uma conta profissional; exatamente uma → é a conta da vitrine; mais de uma → na reconexão, mantém a conta já vinculada se ela estiver na lista; na primeira conexão, nada é gravado e o painel pede para conectar de novo compartilhando só a conta desejada (sem seletor nesta fase).
   - O Worker grava na vitrine (`site_id`) o `ig_account_id`, o `@username`, o `client_business_id`, o `config_id` usado e o token cifrado (detalhes de cifragem e armazenamento em [`sincronizacao.md`](sincronizacao.md), #50), registra a ação em `audit_logs` e agenda a primeira sincronização (*mecanismo de disparo inicial a confirmar em [`sincronizacao.md`](sincronizacao.md) / #50*).

---

## 4. Estados da conexão por vitrine e reconexão

Cada vitrine apresenta no painel um estado claro para a integração com o Instagram, sem expor tokens ou detalhes internos de credenciais:

| Estado | Significado | O que aparece no painel da vitrine | Comportamento da sincronização e da vitrine pública |
| --- | --- | --- | --- |
| **`disconnected`** (Desconectado) | Nenhuma conta vinculada (estado inicial, após cancelamento no primeiro consentimento ou após desconexão explícita). | Botão **Conectar Instagram** e explicação de que é necessária uma conta profissional (Empresa ou Criador). | Nenhuma coleta agendada para esta vitrine. A vitrine pública não exibe feed ativo *(resposta exata da API pública para vitrine desconectada definida em `docs/instagram/interface-publica-feed.md` / #51 — a confirmar)*. |
| **`connected`** (Conectado) | Conta profissional autorizada e token válido. | `@username` conectado, data/hora da última sincronização bem-sucedida e ações **Reconectar** e **Desconectar**. | Sincronização periódica ativa conforme cronograma do Worker (`docs/instagram/sincronizacao.md` / #50 — *a confirmar*). |
| **`error`** (Falha transitória de leitura) | Conta continua autorizada, mas a última coleta falhou por indisponibilidade temporária ou limite de requisições da Meta (`429`/`5xx`). | `@username` conectado, aviso de instabilidade temporária com horário da última sincronização válida. | O sincronizador aplica backoff/retentativa automática no próximo ciclo (#50 — *a confirmar*) e preserva a última projeção pública válida (#51 — *a confirmar*). |
| **`reconnect_required`** (Reconexão necessária) | O token deixou de funcionar: o dono removeu o app do portfólio empresarial, moveu a conta do Instagram para outro portfólio, revogou o acesso, a conta deixou de ser profissional ou (se a configuração não for "Nunca") o token venceu. | Alerta destacado informando que a autorização do Instagram precisa ser renovada, com botão **Reconectar Instagram** e opção **Desconectar**. | Coletas periódicas para esta vitrine ficam pausadas até nova autorização; a última projeção pública conhecida é tratada conforme política de cache/indisponibilidade (#51 — *a confirmar*). |

### Cancelamento da autorização

- Quando a pessoa proprietária clica em "Cancelar" ou "Agora não" na tela da Meta, o callback recebe `error=access_denied` (ou `error_reason=user_denied`).
- **Primeira conexão**: a vitrine permanece em `disconnected`, nenhum registro de credencial é criado e o painel exibe mensagem informativa ("A autorização no Instagram foi cancelada. Nenhuma conta foi conectada à vitrine.").
- **Durante uma tentativa de reconexão**: se a vitrine estava em `connected` ou `reconnect_required` e a pessoa cancela a tela da Meta, o Worker não apaga os dados já sincronizados por acidente; mantém o estado anterior e informa que a reconexão não foi concluída.

### Fluxo de reconexão

- Acionar **Reconectar Instagram** inicia um novo fluxo OAuth completo (com novo `state`) vinculado ao mesmo `site_id`. Se a conta mudou de portfólio, o dono escolhe o portfólio novo na tela da Meta.
- Se o retorno autenticar o **mesmo `ig_user_id`**, o servidor substitui o token antigo pelo novo, limpa o marcador de erro, restaura o estado para `connected` e registra a reconexão em `audit_logs`.
- Se o retorno autenticar um **`ig_user_id` diferente** do que estava vinculado à vitrine, aplica-se a regra de uma conta por vitrine descrita a seguir.

---

## 5. Regra de uma conta por vitrine

- A tabela de vínculo do Instagram no Supabase Postgres (esquema exato a detalhar em conjunto com `docs/instagram/sincronizacao.md` / #50 — *a confirmar*) terá restrição de unicidade `UNIQUE (site_id)`, garantindo em nível de banco que uma vitrine jamais possua duas conexões simultâneas.
- **Troca de conta Instagram na mesma vitrine**:
  - Uma vitrine não mistura publicações de duas contas diferentes do Instagram.
  - Caso a pessoa proprietária deseje substituir a conta conectada (por exemplo, trocar `@conta_antiga` por `@conta_nova`), o fluxo recomendado é **desconectar a conta atual** (removendo os dados sincronizados da conta anterior) e em seguida **conectar a nova conta**.
  - Se durante uma **Reconexão** a pessoa autorizar no Instagram uma conta com `ig_user_id` distinto do vinculado àquela vitrine, o Worker rejeita a substituição silenciosa (evitando misturar mídias de contas diferentes por engano em navegadores com múltiplas contas logadas) e orienta o proprietário a desconectar explicitamente a conta anterior antes de vincular outra *(ou confirmar substituição explícita com limpeza integral das mídias anteriores — UX final a confirmar)*.
- **Uma vitrine por conta do Instagram**: a mesma conta (`ig_user_id`) não pode estar conectada a duas vitrines ao mesmo tempo, com restrição `UNIQUE (ig_user_id)` além de `UNIQUE (site_id)`. Se outra vitrine já usa a conta, o Worker não grava o vínculo e o painel orienta a desconectá-la lá primeiro. Motivo: cada conexão recebe um token próprio do portfólio, e callbacks de desautorização e exclusão da Meta precisam apontar para uma única vitrine, sem sincronização duplicada da mesma conta. O isolamento de tokens e mídias por `site_id` permanece estrito.

---

## 6. Desconexão, revogação e exclusão de dados

### 6.1. Desconexão iniciada no painel da Vitrine

Quando a pessoa proprietária aciona **Desconectar Instagram** na vitrine (`DELETE /api/sites/:siteId/instagram/connection` ou rota equivalente — *a confirmar*):

1. **Validação de segurança**: o Worker exige sessão autenticada (`resolveSessionUser`), cabeçalho `Origin` válido (`validateMutationOriginAndJson`) e papel administrativo (`TEAM_ROLES`) especificamente naquela `site_id`.
2. **Revogação de credenciais**: o token de acesso associado à `site_id` é imediatamente removido do armazenamento seguro no servidor. A revogação remota do token de usuário do sistema exigiria a permissão `business_management`, que a Vitrine não pede (#48); por isso o painel informa que, para cortar o acesso também do lado da Meta, o dono pode remover o app em **Configurações do negócio** → **Integrações** → **Apps conectados** no portfólio dele.
3. **Exclusão dos dados sincronizados da vitrine**: os metadados de perfil e a lista de mídias do Instagram sincronizados para aquela `site_id` são apagados do Supabase Postgres *(detalhes de tabelas e retenção em `docs/instagram/sincronizacao.md` / #50 — a confirmar)*. Como as imagens em si não são copiadas para o armazenamento da plataforma, não há arquivos binários órfãos para remover.
4. **Atualização da projeção pública e cache**: a projeção pública do feed daquela vitrine passa ao estado desconectado/vazio, invalidando o cache na borda e notificando o site consumidor quando aplicável *(integração com publicação, cache e webhook definida em `docs/instagram/interface-publica-feed.md` / #51 — a confirmar)*.
5. **Auditoria e estado**: a operação é registrada em `audit_logs` (com `site_id`, `actor_id` e ação de desconexão) e a vitrine volta ao estado `disconnected`. Os demais dados da vitrine (itens da vitrine, páginas, domínio e equipe) permanecem intactos.

### 6.2. Revogação externa pelo usuário no Instagram e callbacks da Meta

A pessoa proprietária também pode remover o acesso fora do painel: removendo o app do portfólio empresarial (**Configurações do negócio** → **Integrações** → **Apps conectados**), movendo a conta para outro portfólio ou removendo o app nas configurações da conta ("Apps e sites"):

1. **Detecção na sincronização**: a próxima execução do sincronizador (#50) recebe erro de token da API da Meta, para de tentar, apaga o token local e coloca a vitrine em `reconnect_required`. Este é o caminho garantido, porque com o token de usuário do sistema o identificador que chega nos callbacks abaixo ainda precisa ser confirmado em teste (ver [`configuracao-meta.md`](configuracao-meta.md)).
2. **Callback de desautorização (URL de retorno para cancelar autorização)**: quando a Meta chamar a URL cadastrada em Facebook Login for Business → Configurações ([`configuracao-meta.md`](configuracao-meta.md)), o Worker valida a assinatura (`signed_request` com `META_APP_SECRET`), localiza o vínculo pelo identificador recebido (comparando com `client_business_id`, `ig_user_id` ou outro identificador registrado no primeiro teste) e marca a conexão como revogada, apagando o token de acesso.
3. **Callback de solicitação de exclusão de dados**: quando a Meta acionar o endpoint de exclusão de dados assinado com `signed_request`:
   - O Worker valida a assinatura HMAC do `signed_request` usando `META_APP_SECRET` no servidor.
   - Remove imediatamente do Supabase Postgres os tokens, metadados do perfil Instagram e registros de mídias sincronizados do vínculo localizado.
   - Retorna o JSON exigido pela Meta contendo a URL de acompanhamento de status e o código de confirmação (`confirmation_code`) sem expor dados privados da vitrine. Se o vínculo não for localizado, responde do mesmo jeito e registra o pedido (sem dados pessoais além do identificador) para tratamento manual.

---

## 7. Dependências com outros documentos (a confirmar)

Para manter cada decisão isolada em seu respectivo documento sem conflito entre frentes paralelas, os pontos abaixo estão referenciados como **a confirmar**:

| Tema dependente | Documento / Issue de referência | O que fica a confirmar |
| --- | --- | --- |
| Configuração do app Meta, escopos e URLs de callback | [`configuracao-meta.md`](configuracao-meta.md) ([#48](https://github.com/coletivo-inspira/vitrine/issues/48)) | **Decidido**: login unificado, permissão `instagram_basic`, sem PKCE, URLs finais de redirecionamento, desautorização e exclusão. **Pendente (ação humana)**: conta `@ganjastudio.br` profissional, `config_id` criado no console e identificador recebido nos callbacks assinados. |
| Persistência de tokens, renovação e coleta periódica | `docs/instagram/sincronizacao.md` ([#50](https://github.com/coletivo-inspira/vitrine/issues/50)) | Esquema das tabelas no Supabase Postgres, cifragem em repouso do token de longa duração, disparo da primeira coleta após o callback e política de retentativas em `error`. |
| Projeção pública, cache na borda e webhook para sites | `docs/instagram/interface-publica-feed.md` ([#51](https://github.com/coletivo-inspira/vitrine/issues/51)) | Comportamento da API pública de leitura e invalidação de cache quando a vitrine entra em `disconnected`, `error` ou `reconnect_required`. |
| Entrar no painel com conta Meta | `docs/instagram/login-meta.md` | Avaliação de login opcional no painel via Meta/Facebook em separado do Google Auth, sem misturar com o fluxo de conectar o feed de uma vitrine. |

---

## 8. Critérios de validação para a futura implementação

Quando este planejamento for convertido em especificação e código pelo fluxo Spec Kit, a implementação deverá comprovar em testes automatizados (`npm test`):

- [ ] **Autenticação obrigatória**: requisição para iniciar conexão ou concluir callback sem sessão válida (`__Host-vitrine_session` / Bearer) retorna `401 UNAUTHORIZED`.
- [ ] **Isolamento entre vitrines**: usuário autenticado com acesso apenas à vitrine A (`site_id` A) recebe `404 SITE_NOT_FOUND` ao tentar iniciar conexão, concluir callback, reconectar ou desconectar a vitrine B (`site_id` B).
- [ ] **Proteção contra CSRF e troca de vitrine no retorno**: callback OAuth sem `state`, com `state` expirado, já utilizado, assinado incorretamente ou iniciado por outro `user_id` é rejeitado antes de qualquer chamada à Meta ou escrita no banco.
- [ ] **Cancelamento seguro**: retorno com `error=access_denied` limpa o `state` efêmero e preserva o estado anterior da vitrine sem gravar tokens.
- [ ] **Uma conta por vitrine e uma vitrine por conta**: constraints de unicidade impedem duas contas ativas no mesmo `site_id` e a mesma conta em duas vitrines; reconexão com `ig_user_id` divergente exige desconexão/substituição explícita.
- [ ] **Contas compartilhadas**: retorno com zero contas ou com mais de uma conta (fora do caso de reconexão da conta já vinculada) não grava vínculo e mostra a orientação correta.
- [ ] **URL de login**: contém `config_id`, `response_type=code`, `state` e `prompt=login`, e não contém `scope` nem a chave secreta.
- [ ] **Desconexão e exclusão completas**: desconectar pelo painel ou acionar o callback assinado de exclusão de dados apaga tokens e mídias sincronizadas daquela vitrine, invalida a projeção pública correspondente e registra o evento em `audit_logs`.
- [ ] **Ausência de segredos**: nenhuma rota do painel, projeção pública ou log contém `access_token`, `client_secret` ou a URL de troca do código.
