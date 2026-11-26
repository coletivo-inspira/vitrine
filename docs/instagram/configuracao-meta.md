# Configuração Meta para integração Instagram

Data: 14/11/2026. Status: checklist de configuração da issue #48 concluído como documento; cada requisito está **Confirmado** ou **Pendente** com responsável. Sem código de integração e sem deploy nesta entrega. O app Meta da Vitrine já existe (**ColetivoInspira**, tipo **Empresa**, modo **desenvolvimento**); este documento registra o estado visto no console em 12/11/2026 e guia o que falta configurar.

Este documento detalha a etapa 1 do roteiro [`docs/instagram-integration-roadmap.md`](../instagram-integration-roadmap.md), alinhado à [arquitetura proposta](../architecture.md), ao [roadmap](../roadmap.md) e ao vocabulário de [`CONTEXT.md`](../../CONTEXT.md).

> **O que pode e o que não pode ser registrado aqui.** O ID do app Meta (`1358511666092768`) e o ID do portfólio que aparece nos links do console são identificadores públicos (aparecem na URL de login que qualquer pessoa vê) e já constam na issue #48; por isso podem ser citados. **Nunca registre** neste repositório a chave secreta do app, a chave secreta do app do Instagram, o `config_id`, a URL de login gerada pelo painel, tokens gerados ou capturas de tela que mostrem esses valores. Os campos abaixo usam marcadores como `<META_APP_SECRET>`.

> **Atualização de 2026-11-26 (proposta, ADR 0017).** A AutoResposta ([`docs/integrations/auto-reply/meta-setup.md`](../integrations/auto-reply/meta-setup.md)) pede `instagram_manage_messages` numa configuração própria do login unificado, separada desta. As decisões 2 e 6 abaixo continuam valendo para a leitura do feed; para a AutoResposta, valem as decisões D1 e D9 do ADR 0017 (webhook `messages`).

## Modelo: aplicativo Meta único da Vitrine

- **Propriedade centralizada da equipe**: a Vitrine Inspira mantém **um único aplicativo Meta**, administrado pela equipe Inspira no console Meta for Developers e vinculado ao portfólio empresarial **Coletivo Inspira**, que atende todas as vitrines da plataforma.
- **Experiência do proprietário da vitrine**: nenhum proprietário de vitrine cria aplicativo, acessa o console Meta ou lida com chaves. Ele entra no painel (`painel.inspira.dev.br`), seleciona sua vitrine e autoriza a própria conta profissional do Instagram na tela oficial da Meta.
- **Isolamento por vitrine**: cada vitrine conecta no máximo uma conta profissional do Instagram, e cada conta do Instagram fica conectada a no máximo uma vitrine. A autorização dada para uma vitrine não concede acesso a outras (ADR 0002).
- **Vitrine como central para sites consumidores**: sites externos (como o da Ganja) não consultam a API da Meta nem recebem tokens; consomem só a projeção pública servida pela Vitrine.
- **Custo operacional zero**: retorno OAuth, guarda de segredos e sincronização rodam nos limites gratuitos já aprovados (Cloudflare Workers Free e Supabase Free; ADR 0001, ADR 0003 e ADR 0005).

## Estado do console (checkpoint de 12/11/2026)

Resumo do [comentário de checkpoint na issue #48](https://github.com/coletivo-inspira/vitrine/issues/48). Nada além do que está ali é dado como confirmado.

| Item no console | Estado visto |
| --- | --- |
| App | **ColetivoInspira**, ID `1358511666092768`, tipo **Empresa**, gerenciado pelo portfólio **Coletivo Inspira**, modo desenvolvimento |
| Permissões e recursos | `instagram_business_basic` adicionada com **Acesso padrão**, pronta para uso; há outras permissões do Instagram adicionadas além dela |
| Login unificado | A aba existe, mas a Meta informa que **não há configuração compatível**; nenhuma URL de redirecionamento cadastrada |
| Configurações básicas | Política de Privacidade, Termos de Serviço e instruções de exclusão de dados **vazios** |
| Funções e testadores | **0 de 50** testadores; nenhuma conta do Instagram adicionada para gerar token |
| Webhooks | URL de callback e token de verificação vazios; o console avisa que o app precisa estar publicado para receber webhooks |
| Revisão do app | Nenhum envio; Verificação da empresa não iniciada |

Evidências (exigem login com função no app; não mostram segredos):

- [Configuração do login unificado](https://developers.facebook.com/apps/1358511666092768/instagram-business/Unified-Login-API-Setup/?business_id=204526489420194)
- [Configurações básicas](https://developers.facebook.com/apps/1358511666092768/settings/basic/?business_id=204526489420194)
- [Funções e testadores](https://developers.facebook.com/apps/1358511666092768/roles/roles/?business_id=204526489420194)
- [Permissões e recursos](https://developers.facebook.com/apps/1358511666092768/app-review/permissions/?business_id=204526489420194)
- [Envios de análise](https://developers.facebook.com/apps/1358511666092768/app-review/submissions/?business_id=204526489420194)

## Qual configuração da Meta usar

A Meta oferece hoje três configurações para a API do Instagram ([visão geral oficial, atualizada em 29/10/2026](https://developers.facebook.com/documentation/instagram-platform/overview)):

| | **Login unificado** (escolhida) | Login empresarial no Instagram (obsoleta) | Login do Facebook |
| --- | --- | --- | --- |
| Como o dono entra | Instagram **ou** Facebook | Só Instagram | Só Facebook |
| Página do Facebook | Não precisa | Não precisa | Obrigatória |
| Portfólio empresarial | Obrigatório (do app e do cliente) | Não precisa | Depende |
| Autorização | Facebook Login for Business com `config_id` | Business Login for Instagram com `scope` | Facebook Login for Business |
| Token | Token de usuário do sistema do portfólio do cliente (*Business Integration System User Access Token*) | Token de usuário do Instagram, renovado a cada 60 dias | Token de usuário ou de Página |
| Host da API | `graph.facebook.com` | `graph.instagram.com` | `graph.facebook.com` |
| Permissão de leitura | `instagram_basic` | `instagram_business_basic` | `instagram_basic` + permissões de Página |
| Credenciais do servidor | ID e chave secreta do **app Meta** | ID e chave secreta do **app do Instagram** | ID e chave secreta do app Meta |

A tela atual do painel mostra o aviso de que a "Configuração da API com login empresarial no Instagram" está obsoleta e que a "Configuração da API com login unificado" é a recomendada e a única que receberá novos recursos. A Meta não anunciou data de desligamento da configuração antiga, mas toda conexão feita nela precisaria ser refeita pelo dono na migração. Como nenhuma vitrine está conectada ainda, a Vitrine adota o **login unificado** desde o início (decisão de [#91](https://github.com/coletivo-inspira/vitrine/pull/91)).

O que o login unificado muda em relação ao plano anterior:

1. **Permissão**: `instagram_business_basic` dá lugar a `instagram_basic`, equivalente oficial na tabela de migração da Meta (leitura de perfil e mídias).
2. **Credenciais**: o servidor usa o **ID do app Meta** e a **chave secreta do app Meta** (Configurações do app → Básico), e não o "ID do app do Instagram" e a "Chave secreta do app do Instagram" que aparecem na tela antiga.
3. **Token**: o token pertence ao portfólio empresarial do cliente, não à pessoa que fez login, e a expiração é escolhida na configuração. Com "nunca expira", acaba o job de renovação de 60 dias.
4. **Identificação da conta**: depois do login, o servidor descobre a conta compartilhada em `GET /me/assigned_instagram_accounts`; `/me` representa o usuário do sistema, não a conta do Instagram.
5. **Experiência do dono**: a tela da Meta pede que ele escolha um portfólio empresarial e a conta do Instagram a compartilhar. O login pelo Instagram abre no navegador (exige a senha) e a conta já precisa ser profissional; a conversão de conta pessoal não acontece durante o login.

### `instagram_basic` e `instagram_business_basic`

A issue #48 e o checkpoint do console citam `instagram_business_basic`; este documento usa `instagram_basic`. As duas não se contradizem:

- `instagram_business_basic` é o nome da permissão de leitura de perfil e mídias na família de permissões `instagram_business_*`, usada pela configuração com login do Instagram. É ela que aparece com Acesso padrão no checkpoint de 12/11/2026.
- `instagram_basic` é o nome da mesma capacidade de leitura na configuração com login unificado (Facebook Login for Business). A tabela de migração da Meta trata uma como equivalente da outra.
- A revisão da Meta é por nome de permissão: uma aprovação de `instagram_business_basic` não vale para `instagram_basic`.
- O alvo é `instagram_basic` no login unificado. `instagram_business_basic` fica no app como caminho de reserva do piloto (decisão 3) e não deve ser removida até a configuração unificada gerar um token de teste com sucesso (decisão 11).
- Se o console mostrar que `instagram_basic` ainda não está adicionada ao caso de uso, isso entra no item 9 do checklist; o checkpoint não registrou o estado dela.

## Permissão mínima e ativos solicitados

- **Única permissão**: `instagram_basic` (ler perfil e mídias da conta profissional compartilhada).
- **Único ativo**: conta do Instagram. Sem conta de anúncios.
- **Fora do escopo**: `instagram_manage_messages`, `instagram_manage_comments`, `instagram_content_publish`, `instagram_manage_insights`, `instagram_manage_events`, `ads_management`, `ads_read` e `business_management`, além dos equivalentes `instagram_business_*` (mensagens, comentários, publicação e insights). Mensagens seguem como evolução futura ([`mensagens-futuro.md`](mensagens-futuro.md)).
- **Atenção à configuração padrão**: o botão "Criar nova configuração" da aba de login unificado gera um modelo que inclui, além de `instagram_basic`, `instagram_manage_messages` (marcada como sempre incluída), comentários, publicação e anúncios. O passo 3 do roteiro abaixo explica como chegar a uma configuração só com `instagram_basic`.

### Revisão das permissões extras já presentes no app

O checkpoint mostra outras permissões do Instagram adicionadas ao app além de `instagram_business_basic`, sem listar quais. Regra para revisá-las (item 10 do checklist):

1. Listar em **Permissões e recursos** cada permissão adicionada e o nível de acesso dela.
2. Manter apenas `instagram_basic` (alvo) e `instagram_business_basic` (reserva, até a decisão 11 permitir removê-la).
3. Não pedir **Acesso avançado** nem incluir na Revisão do app nenhuma outra permissão. Remover do caso de uso as que o painel permitir remover; as que o painel mantiver por padrão ficam sem uso e fora da configuração de login, e não entram no `config_id`.
4. Registrar na issue (sem segredos) a lista final que ficou no app.

## Credenciais no servidor

| Variável no cofre do servidor | Origem no console | É segredo? |
| --- | --- | --- |
| `META_APP_ID` | Configurações do app → Básico → ID do app | Não (identificador público), mas é lido do ambiente do Worker, não fixado no código |
| `META_APP_SECRET` | Configurações do app → Básico → Chave secreta do app | **Sim**: só no *secret store* do Worker (`wrangler secret`), nunca em repositório, docs, logs ou navegador |
| `META_IG_CONFIG_ID` | Aba de login unificado → configuração selecionada | Não (a Meta diz que não dá acesso a dados), mas fica no servidor e fora dos docs |
| `META_GRAPH_VERSION` | Versão fixada da Graph API (hoje `v27.0` nos exemplos oficiais) | Não |

Os nomes `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` do plano anterior deixam de ser usados: o ID e a chave secreta do app do Instagram só servem para a configuração obsoleta. O contrato [`meta-compliance-routes-contract.md`](../../specs/010-ux-audit-meta-readiness/contracts/meta-compliance-routes-contract.md) e o bloqueio `BLK-META-02` em [`data-model.md`](../../specs/010-ux-audit-meta-readiness/data-model.md) da Spec 010 ainda citam `instagram_business_basic`, `INSTAGRAM_APP_SECRET` e a troca por token de 60 dias; para a configuração Meta, este documento prevalece (decisão 13).

## Passo a passo no console Meta (a partir da tela atual)

Ponto de partida: painel do app, tela **Configuração da API com login empresarial no Instagram**, com o aviso amarelo de obsolescência.

### 1. Abrir a configuração com login unificado

1. No aviso amarelo, clique no link **Configuração da API com login unificado**. Caminho equivalente: **Casos de uso** → **Gerenciar mensagens e conteúdo no Instagram** → **Personalizar** → aba **Configuração da API com login unificado** (*API setup with Unified login*). Link direto na seção de evidências acima.
2. Não use o botão **Adicionar conta** da tela antiga nem a seção de webhooks dela: tudo o que for feito ali vale só para a configuração obsoleta.

### 2. Se a aba de login unificado não aparecer

A aba só aparece para apps **vinculados a um portfólio empresarial** e que usam **Facebook Login for Business** (apps do tipo Empresa já usam). No checkpoint de 12/11/2026 a aba já estava acessível e o app aparece gerenciado pelo portfólio Coletivo Inspira, então este passo não deve ser necessário.

1. Vá em **Configurações do app** → **Básico** e confira o campo de portfólio empresarial. Se estiver vazio, vincule o app ao portfólio da Inspira (o administrador precisa ter controle total do portfólio).
2. Volte ao passo 1.

### 3. Criar a configuração (etapa "Configurar o app" da aba)

É este passo que resolve o aviso "não existe configuração compatível" do checkpoint.

1. Clique em **Criar nova configuração**.
2. Abra a prévia da configuração e confira o **tipo de token**: deve ser **Token de acesso de usuário do sistema** (*System-user access token*). Em **expiração**, escolha **Nunca**, se disponível.
3. Clique em **Editar permissões** e deixe marcada **somente** `instagram_basic`. Desmarque mensagens, comentários, publicação, insights, eventos e anúncios. Se houver opção de conta de anúncios, remova-a.
4. **Se o painel não deixar desmarcar `instagram_manage_messages`**: vá em **Facebook Login for Business** → **Configurações** (*Configurations*) → **Criar configuração** e preencha: nome `Vitrine — leitura do Instagram`; token **de usuário do sistema** com expiração **Nunca**; ativo **somente contas do Instagram**; permissão **somente** `instagram_basic`. Volte à aba de login unificado e confira se essa configuração aparece com o rótulo **Instagram Login Compatible**; se aparecer, selecione-a.
5. **Se nenhuma configuração compatível ficar sem mensagens**: pare aqui e avise a equipe. Não aceite `instagram_manage_messages` só para avançar, pois isso obrigaria a pedir revisão de uma permissão que a Vitrine não usa (ver decisão 3 abaixo).
6. Clique em **Usar esta configuração**.
7. Em **URL de redirecionamento**, informe `https://painel.inspira.dev.br/api/instagram/oauth/callback` e clique em **Salvar**. (A rota ainda não existe no Worker; o botão "Gerar token" do passo 6 funciona sem ela.)
8. Copie o **config_id** e guarde-o no gerenciador de senhas da equipe, junto ao futuro `META_IG_CONFIG_ID`. Não cole a **URL de login** gerada em docs, issues ou chats.

### 4. Convidar a conta de teste (*Instagram Tester*)

No modo desenvolvimento, só contas com papel no app conseguem conectar. O checkpoint mostra 0 de 50 testadores.

1. Na etapa **Gerar tokens de acesso** da aba de login unificado, clique em **Adicionar conta** e convide a conta profissional de teste como **Testador do Instagram** (até 50 contas). Caminho alternativo: **Funções do app** → **Funções** → **Testadores do Instagram** → **Adicionar**.
2. Conta recomendada para o primeiro teste: `@ganjastudio.br`, se já for profissional (item 1 do checklist). A documentação do Facebook Login for Business pede que o portfólio do cliente seja **separado** do portfólio dono do app; uma conta do Instagram que pertença ao próprio portfólio Coletivo Inspira pode não aparecer na tela de consentimento.
3. A Meta não aceita usuários de teste fictícios neste fluxo: use uma conta profissional real.

### 5. Aceitar o convite na conta do Instagram

Quem controla a conta convidada faz, no **Instagram pela web** (instagram.com, não no app do celular):

1. **Configurações** → **Permissões do site** (*Website permissions*) → **Apps e sites** → **Convites de testador** (*Tester Invites*).
2. Aceite o convite do app da Vitrine. Depois disso, a conta aparece na tabela da etapa **Gerar tokens de acesso**.

### 6. Gerar um token de teste

1. Na tabela da etapa **Gerar tokens de acesso**, clique em **Gerar token** na linha da conta e conclua o login (Instagram ou Facebook), escolhendo o portfólio e a conta do Instagram.
2. O token aparece **uma única vez**. Guarde-o só no gerenciador de senhas, nunca em docs, issues, chats, prints ou no repositório. Ele serve apenas para teste manual; a Vitrine obterá os tokens das vitrines pelo fluxo OAuth do painel (#49).
3. Teste opcional no terminal local (substitua os marcadores e não salve o histórico do shell com o token):

   ```bash
   curl -G -d 'fields=id,username' -d "access_token=$TOKEN" \
     "https://graph.facebook.com/v27.0/me/assigned_instagram_accounts"
   curl -G -d 'fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp' \
     -d 'limit=5' -d "access_token=$TOKEN" \
     "https://graph.facebook.com/v27.0/<INSTAGRAM_ACCOUNT_ID>/media"
   ```

   Se a primeira chamada devolver `data: []`, confira se a conta é profissional e se o portfólio escolhido no login é o dono da conta.

### 7. Webhooks da Meta: adiar

Deixe a etapa **Configurar webhooks** em branco (URL de callback e token de verificação vazios, como no checkpoint). Com apenas `instagram_basic` não existe campo de webhook para novas publicações (os campos da Meta cobrem comentários, menções, mensagens e insights de stories), e o console informa que o app precisa estar publicado para recebê-los. O feed é lido pela sincronização periódica ([`sincronizacao.md`](sincronizacao.md)). O webhook `instagram.feed.updated` que a Vitrine envia aos sites conectados ([`interface-publica-feed.md`](interface-publica-feed.md)) é outra coisa e não depende do console Meta.

### 8. URLs obrigatórias

As páginas de conformidade já estão no pacote público do repositório (PR [#89](https://github.com/coletivo-inspira/vitrine/pull/89)): `web/privacidade/index.html`, com a seção `#exclusao-dados`, e `web/termos/index.html`, geradas em `dist/privacidade/` e `dist/termos/` por `npm run build` e cobertas por `test/marketing-build.test.mjs`. O que ainda falta é publicá-las no endereço definitivo: não há deploy remoto nem DNS de `inspira.dev.br` verificado (ADR 0006). Depois que `https://vitrine.inspira.dev.br/privacidade` e `/termos` responderem por HTTPS, cadastre-as em **Configurações do app** → **Básico** (item 13 do checklist).

As rotas `/api/instagram/oauth/callback`, `/api/instagram/deauthorize` e `/api/instagram/data-deletion` **não existem** em `workers/api.mjs`. São pré-requisito de código das issues do fluxo de conexão ([#49](https://github.com/coletivo-inspira/vitrine/issues/49)) e da sincronização ([#50](https://github.com/coletivo-inspira/vitrine/issues/50)), não desta issue. Enquanto elas não existirem, no campo **Exclusão de dados do usuário** use a opção de **URL de instruções** apontando para `https://vitrine.inspira.dev.br/privacidade#exclusao-dados` e deixe o callback de desautorização vazio (decisão 10).

### 9. O que não fazer agora

- Não mudar o app para **Ao vivo**.
- Não enviar **Revisão do app** nem iniciar a **Verificação da empresa** antes de existir o fluxo do painel para gravar o screencast.
- Não remover a configuração obsoleta nem `instagram_business_basic` antes do primeiro token de teste no login unificado.
- Não configurar webhooks da Meta.

## URLs HTTPS obrigatórias e onde cadastrá-las

Todas as URLs usam HTTPS estrito nos domínios planejados no [ADR 0006](../adr/0006-public-addresses.md), sem redirecionamentos abertos nem curingas que alcancem vitrines de clientes. Nenhuma contém credenciais ou parâmetros secretos.

| Finalidade | Endereço HTTPS planejado | Onde cadastrar no console | Existe hoje? |
| --- | --- | --- | --- |
| **URL de redirecionamento (retorno OAuth)** | `https://painel.inspira.dev.br/api/instagram/oauth/callback` | Aba de login unificado → configuração → **URL de redirecionamento**; e **Facebook Login for Business** → **Configurações** → **URIs de redirecionamento do OAuth válidos** | Não: rota a implementar em #49 |
| **Domínio do app** | `inspira.dev.br` | Configurações do app → Básico → **Domínios do app** | DNS não verificado (ADR 0006) |
| **Política de Privacidade** | `https://vitrine.inspira.dev.br/privacidade` | Configurações do app → Básico → **URL da Política de Privacidade** | No pacote (`web/privacidade/`); publicação remota pendente |
| **Termos de Uso** | `https://vitrine.inspira.dev.br/termos` | Configurações do app → Básico → **URL dos Termos de Serviço** | No pacote (`web/termos/`); publicação remota pendente |
| **Instruções de exclusão (página pública)** | `https://vitrine.inspira.dev.br/privacidade#exclusao-dados` | Configurações do app → Básico → **Exclusão de dados do usuário** → **URL de instruções** (enquanto o callback não existir) | No pacote; publicação remota pendente |
| **Exclusão de dados (callback)** | `https://painel.inspira.dev.br/api/instagram/data-deletion` | Configurações do app → Básico → **Exclusão de dados do usuário** → **URL de retorno de chamada** | Não: rota a implementar (#49/#50) |
| **Callback de desautorização** | `https://painel.inspira.dev.br/api/instagram/deauthorize` | **Facebook Login for Business** → **Configurações** → **URL de retorno de chamada para cancelar autorização** | Não: rota a implementar (#49/#50) |

Papel de cada rota futura: o retorno OAuth recebe `code` e `state`, valida o `state` e troca o código no servidor; o callback de exclusão valida o `signed_request` com `META_APP_SECRET`, apaga tokens e mídias e devolve `url` de acompanhamento e `confirmation_code`; o callback de desautorização valida o `signed_request` e marca a conexão como revogada ([`conectar-por-vitrine.md`](conectar-por-vitrine.md)).

> **Homologação**: enquanto o DNS de `inspira.dev.br` não estiver verificado (ADR 0006), os testes no modo desenvolvimento podem usar temporariamente a URL HTTPS de *staging* do Worker (`*.workers.dev`) na URL de redirecionamento, removendo-a antes do modo Ao vivo.

> **Identificador nos callbacks**: com o token de usuário do sistema, o `signed_request` dos callbacks pode trazer um identificador que não é o da conta do Instagram. O primeiro teste em modo desenvolvimento deve registrar qual identificador chega. Até lá, o Worker sempre responde ao callback de exclusão com `confirmation_code`; se não localizar a vitrine, registra o pedido para tratamento manual. Quando o dono remove o app no portfólio, o token deixa de funcionar e a sincronização seguinte coloca a vitrine em `reconnect_required` ([`conectar-por-vitrine.md`](conectar-por-vitrine.md)).

## Testadores, revisão (App Review) e acesso externo

1. **Modo desenvolvimento**: ao salvar a configuração, o app recebe **Acesso padrão** a `instagram_basic`, suficiente para testar com quem tem papel no app (testadores do Instagram que aceitaram o convite, ou pessoas com função no app que entrem pelo Facebook). Serve para o piloto fechado com a Ganja.
2. **Modo Ao vivo para clientes externos**: exige **Acesso avançado** a `instagram_basic` via **Revisão do app** e o app em modo **Ao vivo**. A Meta classifica a Vitrine como *Tech Provider* (app que atende vários negócios), o que torna a **Verificação da empresa** do portfólio Coletivo Inspira obrigatória.
3. **Revisão**: pede ícone 1024×1024, URL da política de privacidade, categoria, e-mail comercial, instruções para o revisor entrar no painel e um screencast mostrando o dono entrando no painel, escolhendo a vitrine, clicando em "Conectar Instagram", escolhendo portfólio e conta na tela da Meta e vendo as mídias na vitrine publicada.
4. **Aprovações anteriores**: uma aprovação de `instagram_business_basic` não vale para `instagram_basic`; a revisão é por nome de permissão.
5. **Acesso de contas externas**: só depois de login configurado, conta de teste validada, URLs públicas no ar, rotas de callback implementadas, revisão aprovada e verificação concluída. Antes disso, "Conectar Instagram" fica restrito a testadores.

## Checklist de requisitos e status (#48)

Responsáveis: **Lino** (administrador do app Meta e do portfólio Coletivo Inspira), **dono da conta Ganja** (quem controla `@ganjastudio.br`) e **Equipe Vitrine** (documentação e código).

| # | Requisito | Status | Responsável | Observação / Evidência |
| --- | --- | --- | --- | --- |
| 1 | Tipo da conta `@ganjastudio.br` (Profissional: Empresa ou Criador) e portfólio empresarial que a possui | **Pendente** | Dono da conta Ganja | O checkpoint confirma só o tipo do **app**; a conta precisa ser verificada no app do Instagram e na Central de Contas. |
| 2 | Responsável nominal pelo app Meta e pelo portfólio Coletivo Inspira registrado | **Pendente** | Lino | Registrar na issue quem é administrador com controle total (necessário para recuperação e revisão). |
| 3 | Modelo de aplicativo Meta único servindo todas as vitrines | **Confirmado** | Equipe Vitrine | Proprietários conectam pelo painel sem acessar o console Meta. |
| 4 | Configuração com **login unificado** e permissão única `instagram_basic` | **Confirmado** (decisão) | Equipe Vitrine | PR #91; relação com `instagram_business_basic` explicada acima. |
| 5 | App criado (ColetivoInspira, ID `1358511666092768`, tipo Empresa, modo desenvolvimento) | **Confirmado** | Lino | Checkpoint de 12/11/2026 (configurações básicas). |
| 6 | App vinculado ao portfólio Coletivo Inspira, aba de login unificado acessível | **Confirmado** | Lino | Checkpoint: app gerenciado pelo portfólio; aba aberta, ainda sem configuração compatível. |
| 7 | `instagram_business_basic` com Acesso padrão (reserva do piloto) | **Confirmado** | Lino | Checkpoint (permissões e recursos). |
| 8 | Configuração do login unificado criada só com `instagram_basic`, token de usuário do sistema, expiração "Nunca", URL de redirecionamento salva e `config_id` guardado | **Pendente** | Lino | Passo 3. Se mensagens não puder ser removida, aplicar a decisão 3. |
| 9 | `instagram_basic` presente no caso de uso com Acesso padrão | **Pendente** | Lino | O checkpoint não registrou o estado dela; confirmar ao fazer o item 8. |
| 10 | Permissões extras revisadas: lista registrada, nada além do mínimo pedido ou incluído na configuração | **Pendente** | Lino | Seção "Revisão das permissões extras". |
| 11 | Conta de teste convidada como *Instagram Tester*, convite aceito e token de teste gerado | **Pendente** | Lino + dono da conta Ganja | Passos 4 a 6; hoje 0 de 50 testadores. |
| 12 | Páginas `/privacidade` (com `#exclusao-dados`) e `/termos` no pacote público | **Confirmado** | Equipe Vitrine | `web/privacidade/index.html` e `web/termos/index.html` (PR #89), testadas no build. |
| 13 | Publicação remota das páginas, DNS de `inspira.dev.br` verificado e URLs de privacidade, termos, instruções de exclusão e domínio cadastradas em Configurações básicas | **Pendente** | Lino | Depende do deploy e do ADR 0006; campos estão vazios no checkpoint. |
| 14 | Rotas `/api/instagram/oauth/callback`, `/api/instagram/deauthorize` e `/api/instagram/data-deletion` implementadas e testadas no Worker | **Pendente** (código futuro) | Equipe Vitrine | Não existem em `workers/api.mjs`; escopo de #49 e #50. Só então cadastrar os callbacks no console. |
| 15 | `META_APP_ID`, `META_APP_SECRET` e `META_IG_CONFIG_ID` no cofre do Worker | **Pendente** | Lino + Equipe Vitrine | Só quando o fluxo #49 for implementado; nunca no repositório. |
| 16 | Identificador recebido no `signed_request` com token de usuário do sistema registrado | **Pendente** | Equipe Vitrine + Lino | Primeiro teste em modo desenvolvimento, depois do item 14. |
| 17 | Webhooks da Meta | **Adiado** (decisão 6) | Equipe Vitrine | Sem campo útil com `instagram_basic`; exige app publicado. |
| 18 | Verificação da empresa do portfólio Coletivo Inspira | **Pendente** | Lino | Obrigatória para *Tech Provider*; não iniciada. |
| 19 | Revisão do app (`instagram_basic`, Acesso avançado) e modo Ao vivo | **Pendente** | Lino + Equipe Vitrine | Nenhum envio feito; precisa do screencast do fluxo do painel. |
| 20 | Acesso de contas externas validado com uma conta fora da equipe | **Pendente** | Lino + Equipe Vitrine | Depois dos itens 13, 14, 18 e 19. |
| 21 | Restrição a planos gratuitos | **Confirmado** | Equipe Vitrine | ADR 0005; sem planos pagos ou upgrades automáticos. |

## Bloqueios antes da liberação a clientes

Antes de publicar as páginas de conformidade, confirme o texto institucional e o canal de privacidade, verifique se alguma vitrine publicada usa os endereços reservados e valide as URLs por HTTPS. Cadastre os callbacks no console somente depois de implementar e testar os endpoints correspondentes.

1. **Piloto fechado (Ganja)**: itens 1, 2, 8, 9, 10 e 11; depois, a implementação do fluxo do painel (#49) com os itens 14, 15 e 16.
2. **Liberação geral**: itens 13, 18, 19 e 20.

Estes itens correspondem aos bloqueios `BLK-META-01` (item 1) e `BLK-META-02` (itens 2, 8 a 11, 13, 15, 18 e 19) da Spec 010.

## Decisões registradas

Revisões de 12/11/2026 (decisões 1 a 8) e 14/11/2026 (decisões 9 a 14).

1. **Login unificado no app existente.** A Vitrine usa a *Configuração da API com login unificado* no app Meta já criado, sem criar outro app e sem usar a configuração obsoleta de login empresarial no Instagram.
2. **`instagram_basic` como única permissão** e conta do Instagram como único ativo, equivalentes no login unificado à decisão anterior de usar só `instagram_business_basic`. Mensagens continuam fora.
3. **Configuração sem mensagens.** Se o modelo padrão não deixar remover `instagram_manage_messages`, usa-se uma configuração própria do Facebook Login for Business compatível com o login unificado. Se nenhuma configuração compatível funcionar sem mensagens, o piloto fechado roda temporariamente na configuração antiga com `instagram_business_basic` (ainda disponível para este app, sem data de fim anunciada) e a migração é refeita quando a Meta permitir. A Vitrine não pede permissão de mensagens só para destravar o painel.
4. **Token de usuário do sistema com expiração "Nunca".** Não há job de renovação de 60 dias; token inválido leva a vitrine a `reconnect_required`. Se "Nunca" não estiver disponível, usa-se a maior validade oferecida e o painel avisa antes do vencimento, sem pedir `business_management` para renovar por API.
5. **Credenciais do app Meta.** O servidor usa `META_APP_ID`, `META_APP_SECRET` e `META_IG_CONFIG_ID`; o ID e a chave secreta do app do Instagram não são usados.
6. **Sem webhooks da Meta nesta fase.** Não há campo de webhook para novas mídias com `instagram_basic`; o feed segue pela sincronização periódica.
7. **Exclusão de dados por callback** (`/api/instagram/data-deletion`), com a página `/privacidade#exclusao-dados` como instrução pública.
8. **Uma conta do Instagram por vitrine e uma vitrine por conta do Instagram** (detalhes em [`conectar-por-vitrine.md`](conectar-por-vitrine.md)).
9. **ID do app pode ser citado.** O ID `1358511666092768` e o ID do portfólio nos links do console são públicos e já estão na issue; segredos, `config_id`, URL de login e tokens continuam proibidos no repositório.
10. **Instruções de exclusão antes do callback.** Enquanto `/api/instagram/data-deletion` e `/api/instagram/deauthorize` não existirem, o console recebe só a URL de instruções `/privacidade#exclusao-dados` e o callback de desautorização fica vazio; os callbacks entram depois de implementados e testados em #49/#50.
11. **`instagram_business_basic` fica como reserva.** A permissão já aprovada em Acesso padrão não é removida até a configuração unificada gerar um token de teste; depois disso, sai do app se a decisão 3 não tiver sido acionada.
12. **Permissões extras não são pedidas.** Nenhuma permissão além de `instagram_basic` (e da reserva da decisão 11) vai para Acesso avançado, Revisão do app ou configuração de login.
13. **Este documento prevalece sobre a Spec 010 na configuração Meta.** O contrato de rotas e `BLK-META-02` ainda citam `instagram_business_basic`, `INSTAGRAM_APP_SECRET` e token de 60 dias; a atualização deles fica para a issue de implementação do fluxo de conexão (#49), sem mudar o escopo desta issue.
14. **#48 fecha com o checklist documentado.** As ações restantes são humanas (console, conta, DNS) ou de código em #49/#50 e seguem acompanhadas pelos itens pendentes acima e pelos bloqueios `BLK-META-01` e `BLK-META-02`.

## Referências

- Roteiro geral da integração: [`docs/instagram-integration-roadmap.md`](../instagram-integration-roadmap.md)
- Issue de acompanhamento: [vitrine #48 — Mapear configuração Meta para integração Instagram](https://github.com/coletivo-inspira/vitrine/issues/48)
- Arquitetura e decisões: [`docs/architecture.md`](../architecture.md), [`docs/roadmap.md`](../roadmap.md), [ADR 0002](../adr/0002-site-access-boundary.md), [ADR 0005](../adr/0005-zero-cost-mvp.md) e [ADR 0006](../adr/0006-public-addresses.md)
- Documentação oficial Meta (consultada em 12/11/2026):
  - [Visão geral da Plataforma do Instagram](https://developers.facebook.com/documentation/instagram-platform/overview)
  - [API do Instagram com login unificado](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login)
  - [Primeiros passos com login unificado](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started)
  - [Autenticação e tokens](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication)
  - [Permissões do login unificado](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/permissions)
  - [Onboarding do cliente](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/business-onboarding)
  - [Elegibilidade e solução de problemas](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/eligibility-and-troubleshooting)
  - [Guia de migração de apps com login do Instagram](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/migration-guide)
  - [Facebook Login for Business](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business)
  - [Campos de webhook do Instagram](https://developers.facebook.com/documentation/instagram-platform/webhooks/fields)
  - [Revisão do app para a Plataforma do Instagram](https://developers.facebook.com/documentation/instagram-platform/app-review)
