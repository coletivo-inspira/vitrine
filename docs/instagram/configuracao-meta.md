# Configuração Meta para integração Instagram

Data: 12/11/2026. Status: mapeamento documental (`Refs #48`), revisado para a **Configuração da API com login unificado**; sem código de integração e sem deploy nesta entrega. O app Meta da Vitrine já existe (tipo **Empresa**, modo **desenvolvimento**); este documento guia a configuração dele no console.

Este documento detalha a etapa 1 do roteiro [`docs/instagram-integration-roadmap.md`](../instagram-integration-roadmap.md), alinhado à [arquitetura proposta](../architecture.md), ao [roadmap](../roadmap.md) e ao vocabulário de [`CONTEXT.md`](../../CONTEXT.md).

> **Nunca registre neste repositório** o identificador real do app, o identificador do app do Instagram, a chave secreta, o `config_id` copiado do painel, tokens gerados ou capturas de tela que mostrem esses valores. Os campos abaixo usam marcadores como `<META_APP_ID>`.

## Modelo: aplicativo Meta único da Vitrine

- **Propriedade centralizada da equipe**: a Vitrine Inspira mantém **um único aplicativo Meta**, administrado pela equipe Inspira no console Meta for Developers e vinculado ao portfólio empresarial da Inspira, que atende todas as vitrines da plataforma.
- **Experiência do proprietário da vitrine**: nenhum proprietário de vitrine cria aplicativo, acessa o console Meta ou lida com chaves. Ele entra no painel (`painel.inspira.dev.br`), seleciona sua vitrine e autoriza a própria conta profissional do Instagram na tela oficial da Meta.
- **Isolamento por vitrine**: cada vitrine conecta no máximo uma conta profissional do Instagram, e cada conta do Instagram fica conectada a no máximo uma vitrine. A autorização dada para uma vitrine não concede acesso a outras (ADR 0002).
- **Vitrine como central para sites consumidores**: sites externos (como o da Ganja) não consultam a API da Meta nem recebem tokens; consomem só a projeção pública servida pela Vitrine.
- **Custo operacional zero**: retorno OAuth, guarda de segredos e sincronização rodam nos limites gratuitos já aprovados (Cloudflare Workers Free e Supabase Free; ADR 0001, ADR 0003 e ADR 0005).

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

A tela atual do painel mostra o aviso de que a "Configuração da API com login empresarial no Instagram" está obsoleta e que a "Configuração da API com login unificado" é a recomendada e a única que receberá novos recursos. A Meta não anunciou data de desligamento da configuração antiga, mas apps novos já não conseguem ativá-la e toda conexão feita nela precisaria ser refeita pelo dono na migração. Como nenhuma vitrine está conectada ainda, a Vitrine adota o **login unificado** desde o início.

O que o login unificado muda em relação ao plano anterior:

1. **Permissão**: `instagram_business_basic` dá lugar a `instagram_basic`, equivalente oficial na tabela de migração da Meta (leitura de perfil e mídias).
2. **Credenciais**: o servidor usa o **ID do app Meta** e a **chave secreta do app Meta** (Configurações do app → Básico), e não o "ID do app do Instagram" e a "Chave secreta do app do Instagram" que aparecem na tela antiga.
3. **Token**: o token pertence ao portfólio empresarial do cliente, não à pessoa que fez login, e a expiração é escolhida na configuração. Com "nunca expira", acaba o job de renovação de 60 dias.
4. **Identificação da conta**: depois do login, o servidor descobre a conta compartilhada em `GET /me/assigned_instagram_accounts`; `/me` representa o usuário do sistema, não a conta do Instagram.
5. **Experiência do dono**: a tela da Meta pede que ele escolha um portfólio empresarial e a conta do Instagram a compartilhar. O login pelo Instagram abre no navegador (exige a senha) e a conta já precisa ser profissional; a conversão de conta pessoal não acontece durante o login.

## Permissão mínima e ativos solicitados

- **Única permissão**: `instagram_basic` (ler perfil e mídias da conta profissional compartilhada).
- **Único ativo**: conta do Instagram. Sem conta de anúncios.
- **Fora do escopo**: `instagram_manage_messages`, `instagram_manage_comments`, `instagram_content_publish`, `instagram_manage_insights`, `instagram_manage_events`, `ads_management`, `ads_read` e `business_management`. Mensagens seguem como evolução futura ([`mensagens-futuro.md`](mensagens-futuro.md)).
- **Atenção à configuração padrão**: o botão "Criar nova configuração" da aba de login unificado gera um modelo que inclui, além de `instagram_basic`, `instagram_manage_messages` (marcada como sempre incluída), comentários, publicação e anúncios. O passo 3 do roteiro abaixo explica como chegar a uma configuração só com `instagram_basic`.

## Credenciais no servidor

| Variável no cofre do servidor | Origem no console | É segredo? |
| --- | --- | --- |
| `META_APP_ID` | Configurações do app → Básico → ID do app | Não, mas fica só no servidor e fora dos docs |
| `META_APP_SECRET` | Configurações do app → Básico → Chave secreta do app | **Sim**: só no *secret store* do Worker (`wrangler secret`), nunca em repositório, docs, logs ou navegador |
| `META_IG_CONFIG_ID` | Aba de login unificado → configuração selecionada | Não (a Meta diz que não dá acesso a dados), mas fica no servidor |
| `META_GRAPH_VERSION` | Versão fixada da Graph API (hoje `v27.0` nos exemplos oficiais) | Não |

Os nomes `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` do plano anterior deixam de ser usados: o ID e a chave secreta do app do Instagram só servem para a configuração obsoleta.

## Passo a passo no console Meta (a partir da tela atual)

Ponto de partida: painel do app, tela **Configuração da API com login empresarial no Instagram**, com o aviso amarelo de obsolescência.

### 1. Abrir a configuração com login unificado

1. No aviso amarelo, clique no link **Configuração da API com login unificado**. Caminho equivalente: **Casos de uso** → **Gerenciar mensagens e conteúdo no Instagram** → **Personalizar** → aba **Configuração da API com login unificado** (*API setup with Unified login*).
2. Não use o botão **Adicionar conta** da tela antiga nem a seção de webhooks dela: tudo o que for feito ali vale só para a configuração obsoleta.

### 2. Se a aba de login unificado não aparecer

A aba só aparece para apps **vinculados a um portfólio empresarial** e que usam **Facebook Login for Business** (apps do tipo Empresa já usam).

1. Vá em **Configurações do app** → **Básico** e confira o campo de portfólio empresarial. Se estiver vazio, vincule o app ao portfólio da Inspira (o administrador precisa ter controle total do portfólio).
2. Volte ao passo 1.

### 3. Criar a configuração (etapa "Configurar o app" da aba)

1. Clique em **Criar nova configuração**.
2. Abra a prévia da configuração e confira o **tipo de token**: deve ser **Token de acesso de usuário do sistema** (*System-user access token*). Em **expiração**, escolha **Nunca**, se disponível.
3. Clique em **Editar permissões** e deixe marcada **somente** `instagram_basic`. Desmarque mensagens, comentários, publicação, insights, eventos e anúncios. Se houver opção de conta de anúncios, remova-a.
4. **Se o painel não deixar desmarcar `instagram_manage_messages`**: vá em **Facebook Login for Business** → **Configurações** (*Configurations*) → **Criar configuração** e preencha: nome `Vitrine — leitura do Instagram`; token **de usuário do sistema** com expiração **Nunca**; ativo **somente contas do Instagram**; permissão **somente** `instagram_basic`. Volte à aba de login unificado e confira se essa configuração aparece com o rótulo **Instagram Login Compatible**; se aparecer, selecione-a.
5. **Se nenhuma configuração compatível ficar sem mensagens**: pare aqui e avise a equipe. Não aceite `instagram_manage_messages` só para avançar, pois isso obrigaria a pedir revisão de uma permissão que a Vitrine não usa (ver decisão 3 abaixo).
6. Clique em **Usar esta configuração**.
7. Em **URL de redirecionamento**, informe `https://painel.inspira.dev.br/api/instagram/oauth/callback` e clique em **Salvar**. (A rota ainda não existe no Worker; o botão "Gerar token" do passo 5 funciona sem ela.)
8. Copie o **config_id** e guarde-o no gerenciador de senhas da equipe, junto ao futuro `META_IG_CONFIG_ID`. Não cole a **URL de login** gerada em docs, issues ou chats: ela contém o ID do app.

### 4. Convidar a conta de teste (*Instagram Tester*)

No modo desenvolvimento, só contas com papel no app conseguem conectar.

1. Na etapa **Gerar tokens de acesso** da aba de login unificado, clique em **Adicionar conta** e convide a conta profissional de teste como **Testador do Instagram** (até 50 contas). Caminho alternativo: **Funções do app** → **Funções** → **Testadores do Instagram** → **Adicionar**.
2. Conta recomendada para o primeiro teste: `@ganjastudio.br`, se já for profissional (item 5 do checklist). A documentação do Facebook Login for Business pede que o portfólio do cliente seja **separado** do portfólio dono do app; uma conta do Instagram que pertença ao próprio portfólio da Inspira pode não aparecer na tela de consentimento.
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

### 7. Webhooks da Meta: pular por enquanto

Deixe a etapa **Configurar webhooks** em branco. Com apenas `instagram_basic` não existe campo de webhook para novas publicações (os campos da Meta cobrem comentários, menções, mensagens e insights de stories); o feed é lido pela sincronização periódica ([`sincronizacao.md`](sincronizacao.md)). O webhook `instagram.feed.updated` que a Vitrine envia aos sites conectados ([`interface-publica-feed.md`](interface-publica-feed.md)) é outra coisa e não depende do console Meta.

### 8. URLs obrigatórias (quando as páginas e rotas existirem)

As páginas `/privacidade` e `/termos` e as rotas de desautorização e exclusão ainda não estão publicadas. A Meta só exige esses campos para revisão e modo Ao vivo; preencha-os quando estiverem no ar, nos locais da tabela da próxima seção.

### 9. O que não fazer agora

- Não mudar o app para **Ao vivo**.
- Não enviar **Revisão do app** nem iniciar a **Verificação da empresa** antes de existir o fluxo do painel para gravar o screencast.
- Não remover a configuração obsoleta nem gerar tokens nela.

## URLs HTTPS obrigatórias e onde cadastrá-las

Todas as URLs usam HTTPS estrito nos domínios planejados no [ADR 0006](../adr/0006-public-addresses.md), sem redirecionamentos abertos nem curingas que alcancem vitrines de clientes.

| Finalidade | Endereço HTTPS planejado | Onde cadastrar no console | Papel na arquitetura |
| --- | --- | --- | --- |
| **URL de redirecionamento (retorno OAuth)** | `https://painel.inspira.dev.br/api/instagram/oauth/callback` | Aba de login unificado → configuração → **URL de redirecionamento**; e **Facebook Login for Business** → **Configurações** → **URIs de redirecionamento do OAuth válidos** | Recebe `code` e `state`; o Worker valida o `state` e troca o código no servidor. |
| **Domínio do app** | `inspira.dev.br` | Configurações do app → Básico → **Domínios do app** | Restringe os domínios aceitos pelo app. |
| **Política de Privacidade** | `https://vitrine.inspira.dev.br/privacidade` | Configurações do app → Básico → **URL da Política de Privacidade** | Descreve a leitura restrita a perfil e mídias da vitrine autorizada. |
| **Termos de Uso** | `https://vitrine.inspira.dev.br/termos` | Configurações do app → Básico → **URL dos Termos de Serviço** | Condições de uso e responsabilidade do dono sobre o conteúdo. |
| **Exclusão de dados (callback)** | `https://painel.inspira.dev.br/api/instagram/data-deletion` | Configurações do app → Básico → **Exclusão de dados do usuário** → opção **URL de retorno de chamada** | Endpoint assinado (`signed_request`) que apaga tokens e mídias e devolve `url` de acompanhamento e `confirmation_code`. |
| **Instruções de exclusão (página pública)** | `https://vitrine.inspira.dev.br/privacidade#exclusao-dados` | Citada na política de privacidade e na URL de acompanhamento do callback | Explica como desconectar pelo painel ou pedir remoção completa. |
| **Callback de desautorização** | `https://painel.inspira.dev.br/api/instagram/deauthorize` | **Facebook Login for Business** → **Configurações** → **URL de retorno de chamada para cancelar autorização** | Endpoint assinado chamado quando o app é removido; marca a conexão como revogada. |

> **Homologação**: enquanto o DNS de `inspira.dev.br` não estiver verificado (ADR 0006), os testes no modo desenvolvimento podem usar temporariamente a URL HTTPS de *staging* do Worker (`*.workers.dev`) na URL de redirecionamento, removendo-a antes do modo Ao vivo.

> **Identificador nos callbacks**: com o token de usuário do sistema, o `signed_request` dos callbacks pode trazer um identificador que não é o da conta do Instagram. O primeiro teste em modo desenvolvimento deve registrar qual identificador chega. Até lá, o Worker sempre responde ao callback de exclusão com `confirmation_code`; se não localizar a vitrine, registra o pedido para tratamento manual. Quando o dono remove o app no portfólio, o token deixa de funcionar e a sincronização seguinte coloca a vitrine em `reconnect_required` ([`conectar-por-vitrine.md`](conectar-por-vitrine.md)).

## Testadores, revisão (App Review) e acesso externo

1. **Modo desenvolvimento**: ao salvar a configuração, o app recebe **Acesso Padrão** a `instagram_basic`, suficiente para testar com quem tem papel no app (testadores do Instagram que aceitaram o convite, ou pessoas com função no app que entrem pelo Facebook). Serve para o piloto fechado com a Ganja.
2. **Modo Ao vivo para clientes externos**: exige **Acesso Avançado** a `instagram_basic` via **Revisão do app** e o app em modo **Ao vivo**. A Meta classifica a Vitrine como *Tech Provider* (app que atende vários negócios), o que torna a **Verificação da empresa** obrigatória.
3. **Revisão**: pede ícone 1024×1024, URL da política de privacidade, categoria, e-mail comercial, instruções para o revisor entrar no painel e um screencast mostrando o dono entrando no painel, escolhendo a vitrine, clicando em "Conectar Instagram", escolhendo portfólio e conta na tela da Meta e vendo as mídias na vitrine publicada.
4. **Aprovações anteriores**: uma aprovação de `instagram_business_basic` não vale para `instagram_basic`; a revisão é por nome de permissão.

## Checklist de requisitos e status (#48)

| # | Requisito | Status | Responsável | Observação / Evidência |
| --- | --- | --- | --- | --- |
| 1 | Modelo de aplicativo Meta único da Vitrine servindo todas as vitrines | **Confirmado** | Equipe Vitrine | Proprietários conectam pelo painel sem acessar o console Meta. |
| 2 | Configuração com **login unificado** e permissão única `instagram_basic` | **Confirmado** (decisão) | Equipe Vitrine | Substitui *API with Instagram Login* e `instagram_business_basic`; sem mensagens ou escrita. |
| 3 | Mapa de URLs HTTPS e local de cadastro de cada uma | **Confirmado** | Equipe Vitrine | Tabela acima; endereços do ADR 0006. |
| 4 | Restrição a planos gratuitos | **Confirmado** | Equipe Vitrine | ADR 0005; sem planos pagos ou upgrades automáticos. |
| 5 | Confirmar se `@ganjastudio.br` é conta Profissional (Empresa ou Criador) e qual portfólio empresarial a possui | **Pendente** | Proprietário da marca Ganja | Verificação no app do Instagram e na Central de Contas. |
| 6 | Registrar o responsável nominal pelo app Meta e pelo portfólio empresarial da Inspira | **Pendente** | Lino (administrador Meta) | Necessário para recuperação administrativa e revisão. |
| 7 | App criado (tipo Empresa, modo desenvolvimento) | **Confirmado** | Lino | Visto no painel em 12/11/2026; o ID não é registrado aqui. |
| 8 | App vinculado ao portfólio empresarial da Inspira (aba de login unificado visível) | **Pendente** | Lino | Passo 2 do roteiro. |
| 9 | Configuração criada só com `instagram_basic`, token de usuário do sistema e expiração "Nunca"; `config_id` guardado | **Pendente** | Lino | Passo 3. Se mensagens não puder ser removida, aplicar a decisão 3. |
| 10 | Conta de teste convidada como *Instagram Tester*, convite aceito e token de teste gerado | **Pendente** | Lino + dono da conta de teste | Passos 4 a 6. |
| 11 | `META_APP_ID`, `META_APP_SECRET` e `META_IG_CONFIG_ID` no cofre do Worker | **Pendente** | Lino + Equipe Vitrine | Só quando o fluxo #49 for implementado; nunca no repositório. |
| 12 | Publicar `/privacidade` e `/termos`, verificar DNS de `inspira.dev.br` e cadastrar as URLs da tabela | **Pendente** | Equipe Vitrine + Lino | Pré-requisito do ADR 0006 e da revisão. |
| 13 | Verificação da empresa e Revisão do app (`instagram_basic`, Acesso Avançado) e modo Ao vivo | **Pendente** | Lino + Equipe Vitrine | Antes de liberar "Conectar Instagram" para clientes fora da lista de testadores. |

## Bloqueios antes da liberação a clientes

O pacote público inclui as páginas `/privacidade/` (com `#exclusao-dados`) e `/termos/`, conforme a [Spec 010](../../specs/010-ux-audit-meta-readiness/spec.md). Antes de publicar, confirme o texto institucional e o canal de privacidade, verifique se alguma vitrine publicada usa os endereços reservados e valide as URLs por HTTPS. Cadastre os callbacks no console somente depois de implementar e testar os endpoints correspondentes.

1. **Piloto fechado (Ganja)**: itens 5, 8, 9 e 10; depois, a implementação do fluxo do painel (#49) com o item 11.
2. **Liberação geral**: itens 12 e 13.

## Decisões registradas (revisão de 12/11/2026)

1. **Login unificado no app existente.** A Vitrine usa a *Configuração da API com login unificado* no app Meta já criado, sem criar outro app e sem usar a configuração obsoleta de login empresarial no Instagram.
2. **`instagram_basic` como única permissão** e conta do Instagram como único ativo, equivalentes no login unificado à decisão anterior de usar só `instagram_business_basic`. Mensagens continuam fora.
3. **Configuração sem mensagens.** Se o modelo padrão não deixar remover `instagram_manage_messages`, usa-se uma configuração própria do Facebook Login for Business compatível com o login unificado. Se nenhuma configuração compatível funcionar sem mensagens, o piloto fechado roda temporariamente na configuração antiga com `instagram_business_basic` (ainda disponível para este app, sem data de fim anunciada) e a migração é refeita quando a Meta permitir. A Vitrine não pede permissão de mensagens só para destravar o painel.
4. **Token de usuário do sistema com expiração "Nunca".** Não há job de renovação de 60 dias; token inválido leva a vitrine a `reconnect_required`. Se "Nunca" não estiver disponível, usa-se a maior validade oferecida e o painel avisa antes do vencimento, sem pedir `business_management` para renovar por API.
5. **Credenciais do app Meta.** O servidor usa `META_APP_ID`, `META_APP_SECRET` e `META_IG_CONFIG_ID`; o ID e a chave secreta do app do Instagram não são usados.
6. **Sem webhooks da Meta nesta fase.** Não há campo de webhook para novas mídias com `instagram_basic`; o feed segue pela sincronização periódica.
7. **Exclusão de dados por callback** (`/api/instagram/data-deletion`), com a página `/privacidade#exclusao-dados` como instrução pública.
8. **Uma conta do Instagram por vitrine e uma vitrine por conta do Instagram** (detalhes em [`conectar-por-vitrine.md`](conectar-por-vitrine.md)).

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
