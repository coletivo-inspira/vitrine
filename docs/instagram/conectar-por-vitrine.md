# Conectar Instagram no painel por vitrine

Data: 12/11/2026. Status: planejamento documental (sem implementação de código, migração de banco, configuração remota na Meta ou deploy nesta entrega).

Este documento detalha a etapa 4 do roteiro [`docs/instagram-integration-roadmap.md`](../instagram-integration-roadmap.md) e atende à issue [#49](https://github.com/coletivo-inspira/vitrine/issues/49): como a pessoa proprietária autentica sua sessão no painel, seleciona uma vitrine específica, autoriza a leitura da conta profissional do Instagram via OAuth no servidor (Cloudflare Worker) e gerencia o ciclo de vida da conexão (estados, reconexão, revogação e exclusão de dados).

---

## 1. Premissas e fronteiras do modelo

1. **App Meta único da plataforma**: a Vitrine Inspira opera um único aplicativo no console da Meta, administrado pela equipe Inspira (configuração detalhada em `docs/instagram/configuracao-meta.md`, issue #48 — *a confirmar*). Nenhuma pessoa proprietária de vitrine precisa criar aplicativo ou acessar o console de desenvolvedor da Meta.
2. **Uma conta Instagram por vitrine**: cada vitrine (`site_id`) pode vincular no máximo **uma** conta profissional do Instagram por vez. Não há agregação de múltiplas contas na mesma vitrine.
3. **Isolamento estrito entre vitrines (ADR 0002)**: uma pessoa pode administrar várias vitrines, mas toda operação de conexão, consulta de estado, reconexão ou desconexão é escopada por `site_id`. Ter acesso a uma vitrine nunca autoriza conectar, ler credenciais ou alterar a conexão de outra vitrine.
4. **Imagens fora da base própria**: o vínculo autoriza a leitura periódica de metadados do perfil e das mídias pela API oficial; os arquivos de imagem permanecem na origem (Instagram) sob responsabilidade do dono, sem armazenamento binário das mídias do feed na base da plataforma.
5. **Infraestrutura a custo zero (ADR 0001, ADR 0003, ADR 0005)**: todo o fluxo OAuth roda sobre o Cloudflare Worker (`workers/api.mjs`) e o Supabase Postgres com RLS no plano gratuito atual, sem contratação de planos pagos ou serviços externos pagos.
6. **Zero segredos no cliente**: `client_secret` do app Meta, códigos de autorização (`code`) trocados e tokens de acesso do Instagram existem apenas no servidor; jamais trafegam em respostas JSON para o navegador, URLs públicas, artefatos publicados ou logs.

---

## 2. Separação entre login do painel e autorização do Instagram

A identidade administrativa no portal e a permissão para ler o feed do Instagram são fluxos independentes, com finalidades, escopos e ciclos de vida distintos:

| Dimensão | Sessão administrativa no painel | Autorização de leitura do Instagram |
| --- | --- | --- |
| **Finalidade** | Identificar a pessoa usuária (`auth.users`) que administra uma ou mais vitrines no `/portal/`. | Conceder à vitrine selecionada (`site_id`) permissão para sincronizar perfil e publicações de uma conta profissional do Instagram. |
| **Provedor principal** | Google via Supabase Auth (ADR 0004). *(Opção extra de login no painel via Meta será avaliada separadamente em `docs/instagram/login-meta.md` — a confirmar).* | Instagram Login (OAuth 2.0 oficial da Meta) com escopo mínimo de leitura (`instagram_business_basic` — *a confirmar em #48*). |
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
    participant Meta as Instagram / Meta OAuth

    Dono->>Worker: POST /api/sites/:siteId/instagram/connect (Cookie __Host-vitrine_session + Origin)
    Worker->>Worker: resolveSessionUser() + validateMutationOriginAndJson()
    Worker->>DB: getSite(siteId, user.id) — exige papel autorizado na vitrine
    Worker->>Worker: Gera state criptográfico (nonce, siteId, userId, exp) + PKCE (code_verifier / code_challenge)
    Worker-->>Dono: URL de autorização Meta + cookie efêmero HttpOnly com contexto do state/PKCE
    Dono->>Meta: Redireciona para tela oficial de consentimento do Instagram
    alt Proprietário autoriza leitura
        Meta-->>Dono: Redireciona GET /api/instagram/oauth/callback?code=...&state=...
        Dono->>Worker: GET /api/instagram/oauth/callback (com __Host-vitrine_session + cookie de state)
        Worker->>Worker: Valida sessão ativa, integridade/expiração do state e correspondência (userId, siteId)
        Worker->>DB: Revalida permissão de userId sobre siteId
        Worker->>Meta: Troca code (+ code_verifier) por token (servidor-a-servidor)
        Worker->>Meta: Obtém ig_user_id e @username da conta profissional
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
2. **Geração da proteção do retorno (`state` e `PKCE`)**:
   - O Worker gera um `state` de uso único e curta duração (ex.: TTL de 10 minutos), assinado com HMAC no servidor e/ou persistido em estado efêmero associado a um cookie `__Host-vitrine_ig_oauth` (`HttpOnly; Secure; SameSite=Lax; Path=/api/instagram/oauth/callback; Max-Age=600`).
   - O contexto vinculado ao `state` amarra explicitamente: `nonce` aleatório de 256 bits, `site_id` alvo, `user_id` que iniciou o fluxo e carimbo de expiração (`exp`).
   - O Worker gera o par PKCE (`code_verifier` secreto mantido apenas no contexto de servidor/cookie seguro e `code_challenge` derivado por `SHA-256` em Base64URL). *(Compatibilidade do parâmetro `code_challenge` no endpoint de Instagram Login da Meta a confirmar em `docs/instagram/configuracao-meta.md` / #48; o `state` assinado e a troca servidor-a-servidor com segredo do app permanecem obrigatórios em qualquer cenário).*
3. **Consentimento no Instagram**:
   - O navegador é redirecionado para a URL de autorização da Meta com `client_id` público do app da Vitrine, `redirect_uri` HTTPS fixo (cadastrado no console Meta — *a confirmar em #48*), `response_type=code`, `scope` mínimo (`instagram_business_basic` — *a confirmar em #48*), `state` e parâmetros PKCE.
4. **Validação do retorno (`callback`) e associação segura à vitrine**:
   - Como o `redirect_uri` no console da Meta é único para o aplicativo (ex.: `https://painel.inspira.dev.br/api/instagram/oauth/callback` — *URL exata a confirmar em #48*), o `site_id` **nunca** vem de parâmetro editável pelo cliente no callback: ele é recuperado exclusivamente do `state` validado pelo Worker.
   - Ao receber o `GET` de retorno, o Worker verifica:
     1. Sessão ativa do painel (`__Host-vitrine_session`) pertencente ao **mesmo `user_id`** registrado no `state`.
     2. Correspondência exata, assinatura válida, não expiração e uso único do `state` (descartando o cookie/nonce imediatamente para impedir replay).
     3. Revalidação no banco (`store.getSite(siteId, user.id)`) confirmando que o `user_id` continua autorizado naquela `site_id` no momento da conclusão.
   - Se qualquer verificação falhar (CSRF, sessão expirada, tentativa de usar o callback de uma vitrine em outra ou manipulação de parâmetros), o Worker aborta antes de trocar o `code`, não grava nada no banco e retorna erro seguro.
5. **Troca de código e persistência do vínculo**:
   - Com o `state` validado e `code` presente, o Worker realiza a requisição HTTPS servidor-a-servidor para a Meta trocando o `code` pelo token de curta duração e, em seguida, pelo token de longa duração (detalhes de renovação, cifragem e armazenamento seguro do token definidos em `docs/instagram/sincronizacao.md`, issue #50 — *a confirmar*).
   - O Worker consulta a identificação básica da conta (`ig_user_id`, `@username`, tipo de conta) e grava o vínculo na vitrine (`site_id`), registrando a ação em `audit_logs` e agendando/disparando a primeira sincronização (*mecanismo de disparo inicial a confirmar em `docs/instagram/sincronizacao.md` / #50*).

---

## 4. Estados da conexão por vitrine e reconexão

Cada vitrine apresenta no painel um estado claro para a integração com o Instagram, sem expor tokens ou detalhes internos de credenciais:

| Estado | Significado | O que aparece no painel da vitrine | Comportamento da sincronização e da vitrine pública |
| --- | --- | --- | --- |
| **`disconnected`** (Desconectado) | Nenhuma conta vinculada (estado inicial, após cancelamento no primeiro consentimento ou após desconexão explícita). | Botão **Conectar Instagram** e explicação de que é necessária uma conta profissional (Empresa ou Criador). | Nenhuma coleta agendada para esta vitrine. A vitrine pública não exibe feed ativo *(resposta exata da API pública para vitrine desconectada definida em `docs/instagram/interface-publica-feed.md` / #51 — a confirmar)*. |
| **`connected`** (Conectado) | Conta profissional autorizada e token válido. | `@username` conectado, data/hora da última sincronização bem-sucedida e ações **Reconectar** e **Desconectar**. | Sincronização periódica ativa conforme cronograma do Worker (`docs/instagram/sincronizacao.md` / #50 — *a confirmar*). |
| **`error`** (Falha transitória de leitura) | Conta continua autorizada, mas a última coleta falhou por indisponibilidade temporária ou limite de requisições da Meta (`429`/`5xx`). | `@username` conectado, aviso de instabilidade temporária com horário da última sincronização válida. | O sincronizador aplica backoff/retentativa automática no próximo ciclo (#50 — *a confirmar*) e preserva a última projeção pública válida (#51 — *a confirmar*). |
| **`reconnect_required`** (Reconexão necessária) | O token expirou sem possibilidade de renovação, a permissão foi revogada no app do Instagram, a senha da conta mudou ou a conta deixou de ser profissional. | Alerta destacado informando que a autorização do Instagram precisa ser renovada, com botão **Reconectar Instagram** e opção **Desconectar**. | Coletas periódicas para esta vitrine ficam pausadas até nova autorização; a última projeção pública conhecida é tratada conforme política de cache/indisponibilidade (#51 — *a confirmar*). |

### Cancelamento da autorização

- Quando a pessoa proprietária clica em "Cancelar" ou "Agora não" na tela da Meta, o callback recebe `error=access_denied` (ou `error_reason=user_denied`).
- **Primeira conexão**: a vitrine permanece em `disconnected`, nenhum registro de credencial é criado e o painel exibe mensagem informativa ("A autorização no Instagram foi cancelada. Nenhuma conta foi conectada à vitrine.").
- **Durante uma tentativa de reconexão**: se a vitrine estava em `connected` ou `reconnect_required` e a pessoa cancela a tela da Meta, o Worker não apaga os dados já sincronizados por acidente; mantém o estado anterior e informa que a reconexão não foi concluída.

### Fluxo de reconexão

- Acionar **Reconectar Instagram** inicia um novo fluxo OAuth completo (com novo `state` e `PKCE`) vinculado ao mesmo `site_id`.
- Se o retorno autenticar o **mesmo `ig_user_id`**, o servidor substitui o token antigo pelo novo, limpa o marcador de erro, restaura o estado para `connected` e registra a reconexão em `audit_logs`.
- Se o retorno autenticar um **`ig_user_id` diferente** do que estava vinculado à vitrine, aplica-se a regra de uma conta por vitrine descrita a seguir.

---

## 5. Regra de uma conta por vitrine

- A tabela de vínculo do Instagram no Supabase Postgres (esquema exato a detalhar em conjunto com `docs/instagram/sincronizacao.md` / #50 — *a confirmar*) terá restrição de unicidade `UNIQUE (site_id)`, garantindo em nível de banco que uma vitrine jamais possua duas conexões simultâneas.
- **Troca de conta Instagram na mesma vitrine**:
  - Uma vitrine não mistura publicações de duas contas diferentes do Instagram.
  - Caso a pessoa proprietária deseje substituir a conta conectada (por exemplo, trocar `@conta_antiga` por `@conta_nova`), o fluxo recomendado é **desconectar a conta atual** (removendo os dados sincronizados da conta anterior) e em seguida **conectar a nova conta**.
  - Se durante uma **Reconexão** a pessoa autorizar no Instagram uma conta com `ig_user_id` distinto do vinculado àquela vitrine, o Worker rejeita a substituição silenciosa (evitando misturar mídias de contas diferentes por engano em navegadores com múltiplas contas logadas) e orienta o proprietário a desconectar explicitamente a conta anterior antes de vincular outra *(ou confirmar substituição explícita com limpeza integral das mídias anteriores — UX final a confirmar)*.
- *(Caso duas vitrines distintas da mesma organização tentem conectar o mesmo `ig_user_id`, a política de bloqueio ou permissão por `ig_user_id` fica a confirmar com #48 e #50; o isolamento de tokens e mídias por `site_id` permanece estrito).*

---

## 6. Desconexão, revogação e exclusão de dados

### 6.1. Desconexão iniciada no painel da Vitrine

Quando a pessoa proprietária aciona **Desconectar Instagram** na vitrine (`DELETE /api/sites/:siteId/instagram/connection` ou rota equivalente — *a confirmar*):

1. **Validação de segurança**: o Worker exige sessão autenticada (`resolveSessionUser`), cabeçalho `Origin` válido (`validateMutationOriginAndJson`) e papel administrativo (`TEAM_ROLES`) especificamente naquela `site_id`.
2. **Revogação de credenciais**: o token de acesso associado à `site_id` é imediatamente removido do armazenamento seguro no servidor *(e, quando suportado pelo endpoint da Meta configurado em #48, revogado remotamente via chamada servidor-a-servidor — a confirmar)*.
3. **Exclusão dos dados sincronizados da vitrine**: os metadados de perfil e a lista de mídias do Instagram sincronizados para aquela `site_id` são apagados do Supabase Postgres *(detalhes de tabelas e retenção em `docs/instagram/sincronizacao.md` / #50 — a confirmar)*. Como as imagens em si não são copiadas para o armazenamento da plataforma, não há arquivos binários órfãos para remover.
4. **Atualização da projeção pública e cache**: a projeção pública do feed daquela vitrine passa ao estado desconectado/vazio, invalidando o cache na borda e notificando o site consumidor quando aplicável *(integração com publicação, cache e webhook definida em `docs/instagram/interface-publica-feed.md` / #51 — a confirmar)*.
5. **Auditoria e estado**: a operação é registrada em `audit_logs` (com `site_id`, `actor_id` e ação de desconexão) e a vitrine volta ao estado `disconnected`. Os demais dados da vitrine (itens da vitrine, páginas, domínio e equipe) permanecem intactos.

### 6.2. Revogação externa pelo usuário no Instagram e callbacks da Meta

A pessoa proprietária também pode remover o acesso do aplicativo diretamente nas configurações da própria conta do Instagram ("Sites e aplicativos"):

1. **Detecção na sincronização**: se a revogação ocorrer fora do painel e antes de um webhook, a próxima execução do sincronizador (#50 — *a confirmar*) receberá erro de autorização da API da Meta, invalidará o token local e transicionará a vitrine para `reconnect_required`.
2. **Callback de desautorização (Deauthorize Callback URL)**: quando a Meta notificar a URL de desautorização configurada no app (`docs/instagram/configuracao-meta.md` / #48 — *a confirmar*), o Worker valida a assinatura (`signed_request` com o segredo do app Meta), localiza o vínculo pelo `ig_user_id` e marca a conexão como revogada, apagando o token de acesso.
3. **Callback de solicitação de exclusão de dados (Data Deletion Request Callback URL)**: em conformidade com as exigências da plataforma Meta (#48 — *a confirmar*), quando a Meta acionar o endpoint de exclusão de dados assinado com `signed_request`:
   - O Worker valida a assinatura HMAC do `signed_request` usando o segredo do app Meta no servidor.
   - Remove imediatamente do Supabase Postgres os tokens, metadados do perfil Instagram e registros de mídias sincronizados vinculados àquele `ig_user_id`.
   - Retorna o JSON exigido pela Meta contendo a URL de acompanhamento de status e o código de confirmação (`confirmation_code`) sem expor dados privados da vitrine.

---

## 7. Dependências com outros documentos (a confirmar)

Para manter cada decisão isolada em seu respectivo documento sem conflito entre frentes paralelas, os pontos abaixo estão referenciados como **a confirmar**:

| Tema dependente | Documento / Issue de referência | O que fica a confirmar |
| --- | --- | --- |
| Configuração do app Meta, escopos e URLs de callback | `docs/instagram/configuracao-meta.md` ([#48](https://github.com/coletivo-inspira/vitrine/issues/48)) | ID público do app, confirmação da conta `@ganjastudio.br`, escopo exato (`instagram_business_basic`), suporte a PKCE no endpoint Instagram Login e URLs finais de `redirect_uri`, desautorização e exclusão. |
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
- [ ] **Uma conta por vitrine**: constraint de unicidade impede duas contas ativas no mesmo `site_id`, e tentativa de reconexão com `ig_user_id` divergente exige desconexão/substituição explícita.
- [ ] **Desconexão e exclusão completas**: desconectar pelo painel ou acionar o callback assinado de exclusão de dados apaga tokens e mídias sincronizadas daquela vitrine, invalida a projeção pública correspondente e registra o evento em `audit_logs`.
- [ ] **Ausência de segredos**: nenhuma rota do painel ou projeção pública retorna `access_token`, `client_secret` ou `code_verifier`.
