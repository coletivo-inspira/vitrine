# Interface pública do feed Instagram e webhook para sites conectados

Data: 12/11/2026. Status: especificação documental da interface pública ([vitrine #51](https://github.com/coletivo-inspira/vitrine/issues/51)); sem implementação de código, configuração remota ou deploy nesta entrega. Este documento detalha a etapa 7 do roteiro [docs/instagram-integration-roadmap.md](../instagram-integration-roadmap.md).

## 1. Visão geral: a Vitrine como central

No modelo aprovado (`Instagram → Vitrine → Site conectado`), a Vitrine Inspira concentra a integração com a Meta e a governança do conteúdo por vitrine:

- Sites externos — como o site da Ganja — **não consultam a API do Instagram diretamente** nem armazenam credenciais da Meta.
- Cada site conectado consome apenas a **API pública de leitura da Vitrine** (via HTTP `GET` com cache na borda) e, opcionalmente, recebe um **webhook assinado por HMAC** sempre que uma sincronização periódica alterar o feed publicado daquela vitrine.
- Os arquivos binários de foto e vídeo não são copiados para a base da Vitrine: a projeção pública expõe os metadados validados e as URLs públicas de mídia retornadas pela sincronização, permanecendo dentro dos limites do **Cloudflare Workers Free** e do **Supabase Free** ([docs/architecture.md](../architecture.md)).
- O proprietário controla no painel quais vitrines expõem o feed e como o site externo consome esses dados.

As decisões sobre configuração do app Meta (#48), fluxo OAuth e desconexão no painel (#49), agendamento e retenção da sincronização (#50) e mensagens futuras (#52) pertencem aos seus respectivos documentos e aparecem aqui marcadas como **a confirmar** onde há interface entre as camadas.

---

## 2. Resolução por vitrine e rotas públicas

A leitura pública do feed segue a mesma convenção de resolução por vitrine e artefatos imutáveis definida em `src/publication-engine.mjs` e nos ADRs 0005 e 0008 ([docs/architecture.md](../architecture.md)):

1. **Por caminho canônico da vitrine (`slug`)**:
   - Rota de leitura atual (com paginação e cabeçalhos de cache):
     `GET /data/vitrines/:slug/instagram-feed.json`
   - Rota imutável por revisão/hash do snapshot (quando aplicável para pré-carregamento estático):
     `GET /data/vitrines/:slug/instagram-releases/:hash.json`
2. **Por cabeçalho `Host` (domínio personalizado vinculado à vitrine)**:
   - Quando a requisição chega por um domínio verificado em `public.custom_domains` (ADR 0008), o Worker resolve internamente o `slug` correspondente à vitrine ativa sem permitir cruzamento com outras vitrines.

### Parâmetros de consulta (paginação)

| Parâmetro | Tipo | Padrão | Limite | Descrição |
| --- | --- | --- | --- | --- |
| `limit` | inteiro | `12` | `1` a `24` | Quantidade de publicações retornadas na página. |
| `cursor` | string opaca | ausente | até 128 caracteres | Cursor da página seguinte (`nextCursor` da resposta anterior), ordenado por `publishedAt` decrescente e `id` estável. |

---

## 3. Contrato mínimo de leitura pública

A resposta JSON pública contém exclusivamente dados aprovados para exibição aos visitantes do site conectado.

### Exemplo de resposta (`200 OK`)

```json
{
  "schemaVersion": 1,
  "slug": "ganja",
  "status": "active",
  "revision": 14,
  "hash": "8f3c2d91a4b7e605c1209d4e8b7a6f5123456789abcdef0123456789abcdef01",
  "syncedAt": "2026-11-12T15:00:00.000Z",
  "profile": {
    "username": "ganjastudio.br",
    "displayName": "Ganja Studio",
    "profileUrl": "https://www.instagram.com/ganjastudio.br/",
    "avatarUrl": "https://scontent.cdninstagram.com/v/t51.2885-19/exemplo-avatar.jpg"
  },
  "pageInfo": {
    "limit": 12,
    "hasNextPage": true,
    "nextCursor": "MjAyNi0xMS0xMFQxODozMDowMFp8MTc5MjkzODQ3NTY="
  },
  "items": [
    {
      "id": "17929384756102938",
      "mediaType": "CAROUSEL_ALBUM",
      "mediaUrl": "https://scontent.cdninstagram.com/v/t51.29350-15/capa.jpg",
      "thumbnailUrl": "https://scontent.cdninstagram.com/v/t51.29350-15/capa.jpg",
      "caption": "Nova coleção disponível na nossa vitrine.",
      "permalink": "https://www.instagram.com/p/DC1a2B3c4D5/",
      "publishedAt": "2026-11-11T19:42:10.000Z",
      "children": [
        {
          "id": "17929384756102939",
          "mediaType": "IMAGE",
          "mediaUrl": "https://scontent.cdninstagram.com/v/t51.29350-15/foto-1.jpg"
        },
        {
          "id": "17929384756102940",
          "mediaType": "VIDEO",
          "mediaUrl": "https://scontent.cdninstagram.com/v/t50.2886-16/video-2.mp4",
          "thumbnailUrl": "https://scontent.cdninstagram.com/v/t51.29350-15/capa-video-2.jpg"
        }
      ]
    }
  ]
}
```

### Campos garantidos no contrato

- **Identidade pública do perfil (`profile`)**:
  - `username` (string obrigatória): identificador público da conta profissional no Instagram.
  - `displayName` (string opcional): nome público de exibição do perfil, quando disponível na sincronização (**a confirmar** conforme campos retornados pela permissão `instagram_basic`, decidida em #48, na sincronização de #50).
  - `profileUrl` (string HTTPS obrigatória): endereço canônico do perfil no Instagram.
  - `avatarUrl` (string HTTPS opcional): URL da foto de perfil, validada como HTTPS pública segura.
- **Mídia (`items[]`)**:
  - `id` (string obrigatória): identificador público estável da mídia sincronizada.
  - `mediaType` (`"IMAGE"` | `"VIDEO"` | `"CAROUSEL_ALBUM"`): tipo de mídia suportado (regras de importação detalhadas em #50, **a confirmar**).
  - `mediaUrl` (string HTTPS obrigatória): URL pública de exibição da mídia principal.
  - `thumbnailUrl` (string HTTPS opcional): URL de capa obrigatória quando `mediaType === "VIDEO"`.
  - `caption` (string opcional): legenda em texto puro (nunca HTML executável; o consumidor deve renderizar com escape).
  - `permalink` (string HTTPS obrigatória): link original da publicação no Instagram (`https://www.instagram.com/p/...` ou `/reel/...`).
  - `publishedAt` (string ISO-8601 UTC obrigatória): data e hora de publicação original no Instagram.
  - `children` (lista opcional): presente apenas em `CAROUSEL_ALBUM`, contendo `id`, `mediaType`, `mediaUrl` e `thumbnailUrl` opcional de cada item do carrossel.
- **Paginação (`pageInfo`)**:
  - `limit`: tamanho solicitado/aplicado à página.
  - `hasNextPage`: booleano indicando se há mais mídias sincronizadas.
  - `nextCursor`: cursor opaco para buscar a página seguinte (`null` quando `hasNextPage === false`).

---

## 4. Projeção pública sem segredos

Seguindo a arquitetura de `src/publication-engine.mjs` (`FORBIDDEN_PUBLIC_KEYS`, allowlists explícitas e `assertNoPrivateLeakage`), a geração da projeção pública do feed aplica validação estrita por lista de permissão (*allowlist*) antes de persistir ou servir qualquer artefato:

1. **Separação de tabelas e escopos**:
   - Credenciais OAuth, tokens de longa duração, estado de renovação, identificadores internos de usuário (`owner_user_id`, `user_id`, `site_id`), segredos de webhook e logs de erro operacional ficam restritos ao backend autenticado/servidor (**estrutura de tabelas a confirmar** em #49 e #50).
   - Rascunhos da vitrine (`drafts`) e configurações administrativas não publicadas nunca entram no JSON do feed.
   - A rota pública nunca utiliza `service_role` em consultas abertas ao cliente; ela lê apenas a projeção pública consolidada.
2. **Chaves explicitamente proibidas na projeção pública**:
   - Além de `FORBIDDEN_PUBLIC_KEYS` já definidas em `src/publication-engine.mjs` (`owner_user_id`, `ownerUserId`, `ownerEmail`, `email`, `userId`, `user_id`, `siteId`, `site_id`, `session`, `token`, `accessToken`, `refreshToken`, `service_role`, `serviceRoleKey`, `internalCost`, `internalNotes`, `active`, `available`, `password`, `secret`), a projeção do feed bloqueia:
     - `instagramAccessToken`, `access_token`, `tokenExpiresAt`, `token_expires_at`, `oauthState`, `oauth_state`, `appSecret`, `webhookSecret`, `webhook_secret`, `webhookUrl`, `webhook_url`, `rawApiError`.
3. **Validação de URLs e texto**:
   - Todas as URLs (`profileUrl`, `avatarUrl`, `mediaUrl`, `thumbnailUrl`, `permalink`) passam por validação HTTPS pública equivalente a `validateSafePublicHttpsUrl` em `src/portal-validation.mjs` (rejeitando esquemas `javascript:`, `data:`, `http:` ou endereços privados).
   - O campo `caption` é tratado como texto simples, sem interpretação de HTML/JS.

---

## 5. O que o proprietário configura no painel para o site conectado

Dentro do painel autenticado (`/portal/`), no escopo exclusivo da vitrine selecionada, o proprietário (ou membro autorizado da equipe da vitrine com permissão de edição) controla como o feed sincronizado é entregue ao site externo:

1. **Exibição pública do feed (`enabled`)**:
   - Alternância para ativar ou pausar a exposição pública do feed da vitrine sem precisar revogar a conexão OAuth com o Instagram.
2. **Curadoria e filtros básicos**:
   - **Limite padrão por página**: quantidade padrão de itens entregues na primeira página (ex.: 6, 9, 12 ou 24 publicações).
   - **Filtro de tipos de mídia**: opção de exibir todos os formatos (`IMAGE`, `CAROUSEL_ALBUM`, `VIDEO`) ou ocultar vídeos/Reels no site conectado.
   - **Ocultação manual de publicações específicas**: possibilidade de marcar uma mídia sincronizada como oculta na vitrine para que não saia na projeção pública na próxima publicação, sem apagá-la do Instagram.
3. **Origens permitidas (CORS)**:
   - Lista explícita de origens HTTPS autorizadas a ler a API pública diretamente pelo navegador (ex.: `https://ganjastudio.com.br` ou o domínio vinculado à vitrine). Requisições de origens não listadas não recebem cabeçalho `Access-Control-Allow-Origin`.
4. **Destino do webhook de atualização (opcional)**:
   - **URL HTTPS do webhook**: endereço do servidor/pipeline do site conectado que receberá o aviso de atualização (ex.: endpoint de revalidação do site da Ganja).
   - **Segredo HMAC do webhook**: chave exclusiva por vitrine gerada no servidor. O painel exibe o segredo apenas no momento da criação ou rotação (ou permite rotacionar o segredo sob demanda) e nunca o expõe na API pública.
   - **Botão de teste de entrega**: dispara um evento sintético `instagram.feed.ping` assinado para o proprietário validar a integração do site externo, respeitando limite de taxa por minuto.

---

## 6. Webhook assinado (`instagram.feed.updated`) para sites conectados

Para que sites externos como o da Ganja atualizem seu cache ou reconstruam páginas estáticas apenas quando houver mudança real no feed, a Vitrine envia uma notificação HTTP `POST` assinada com HMAC-SHA256 via Web Crypto API (`crypto.subtle`).

### Quando o webhook é disparado

- Ao final de um ciclo de sincronização periódica (#50, **a confirmar**) ou de uma alteração de curadoria publicada no painel, o servidor calcula o hash SHA-256 (`computeSha256Hex`) da nova projeção pública do feed.
- **Deduplicação por hash**: o webhook **só é enviado se o novo `hash` divergir do último `hash` publicado** para aquela vitrine. Sincronizações que apenas confirmam que não houve postagem nova não geram tráfego de webhook.

### Cabeçalhos HTTP enviados

| Cabeçalho | Valor / Formato | Descrição |
| --- | --- | --- |
| `Content-Type` | `application/json; charset=utf-8` | Corpo JSON serializado de forma canônica. |
| `User-Agent` | `Vitrine-Inspira-Webhook/1.0` | Identificação do emissor. |
| `X-Vitrine-Event` | `instagram.feed.updated` ou `instagram.feed.ping` | Tipo do evento. |
| `X-Vitrine-Delivery` | UUID v4 da entrega | Identificador único para idempotência no receptor. |
| `X-Vitrine-Timestamp` | Unix epoch em segundos (ex.: `1794495600`) | Instante da assinatura para proteção contra *replay*. |
| `X-Vitrine-Signature-256` | `sha256=<hex>` | HMAC-SHA256 calculado sobre `${timestamp}.${rawBody}` usando o segredo exclusivo da vitrine. |

### Corpo (payload) do webhook

O webhook envia um aviso enxuto com o novo hash e o endereço público de leitura, evitando trafegar payloads grandes na notificação:

```json
{
  "event": "instagram.feed.updated",
  "deliveryId": "c9a6f4e2-81b3-4c12-9a0e-5f7d8e9a1b2c",
  "occurredAt": "2026-11-12T15:00:02.000Z",
  "storefront": {
    "slug": "ganja"
  },
  "feed": {
    "status": "active",
    "revision": 14,
    "previousHash": "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809",
    "hash": "8f3c2d91a4b7e605c1209d4e8b7a6f5123456789abcdef0123456789abcdef01",
    "feedUrl": "https://vitrine.inspira.dev.br/data/vitrines/ganja/instagram-feed.json",
    "immutableFeedUrl": "https://vitrine.inspira.dev.br/data/vitrines/ganja/instagram-releases/8f3c2d91a4b7e605c1209d4e8b7a6f5123456789abcdef0123456789abcdef01.json"
  }
}
```

### Verificação pelo site receptor (ex.: Ganja)

1. Ler o cabeçalho `X-Vitrine-Timestamp` e rejeitar entregas com diferença superior a 5 minutos (`300` segundos) em relação ao relógio atual.
2. Concatenar o timestamp, um ponto (`.`) e o corpo bruto (`rawBody`) exatamente como recebido.
3. Calcular o HMAC-SHA256 com o segredo configurado para a vitrine e comparar em tempo constante (`timingSafeEqual`) com o valor de `X-Vitrine-Signature-256`.
4. Se válido, buscar `feed.immutableFeedUrl` (ou `feed.feedUrl`) para atualizar os dados exibidos no site.

### Limites de execução no Cloudflare Workers Free

- **Execução assíncrona**: o disparo utiliza `ctx.waitUntil(...)` com timeout rígido de `5000 ms` por requisição (`AbortSignal.timeout(5000)`), sem bloquear a resposta ao painel nem estourar o limite de CPU de `10 ms` do plano gratuito (pois espera de I/O de rede não consome tempo de CPU no Workers).
- **Cota de subrequests**: até 1 URL de webhook por vitrine, consumindo apenas 1 subrequest HTTP por vitrine cujo feed efetivamente mudou (bem abaixo do limite de 50 subrequests por invocação no Workers Free).
- **Retentativas sem fila paga**: em caso de resposta `429` ou `5xx` (ou timeout), o status da entrega fica registrado junto ao estado de sincronização da vitrine e uma nova tentativa (máximo de 3 tentativas com recuo) ocorre no próximo ciclo agendado do Cron Trigger do Worker (**intervalo exato a confirmar** em #50), sem exigir Cloudflare Queues nem planos pagos.
- **Prevenção de SSRF**: a URL do webhook só aceita `https://`, porta padrão (`443`), hostname público válido e bloqueia `localhost`, IPs literais privados/loopback e o próprio domínio administrativo da plataforma.

---

## 7. Cache na borda compatível com a arquitetura de publicação

O cache da API de leitura do feed respeita a arquitetura de artefatos imutáveis e `Cache API` na borda (ADR 0008):

1. **Rota principal (`/data/vitrines/:slug/instagram-feed.json`)**:
   - Cabeçalhos:
     - `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=3600`
     - `ETag: "<hash>"`
   - O Worker consulta primeiro `caches.default` na borda Cloudflare. Em caso de *cache hit* fresco, responde imediatamente com CPU `< 1,5 ms` sem acionar o Supabase.
   - Suporta `If-None-Match`: se o cliente ou site conectado já possui o `hash` atual, recebe `304 Not Modified` sem corpo.
2. **Rota imutável por hash (`/data/vitrines/:slug/instagram-releases/:hash.json`)**:
   - Cabeçalho:
     - `Cache-Control: public, max-age=31536000, immutable`
   - Ideal para consumo após o recebimento do webhook `instagram.feed.updated`, garantindo leitura instantânea e determinística da nova versão sem esperar a expiração do TTL da rota principal.
3. **Renovação de URLs de mídia assinadas pelo CDN da Meta**:
   - Como URLs de mídia do Instagram (`scontent.cdninstagram.com`) possuem assinatura temporal da própria Meta e podem expirar com o tempo, a sincronização periódica (#50, **a confirmar**) atualiza as URLs expiradas na projeção pública, gerando um novo `hash` e atualizando o cache na borda de forma transparente.

---

## 8. Respostas para feed vazio, indisponível e desconectado

Para que o site conectado (como o da Ganja) degrade de forma elegante e previsível sem quebrar a página do visitante, a API pública adota contratos explícitos para cada estado:

| Cenário | Status HTTP | Campo `status` no JSON | Comportamento e garantias |
| --- | --- | --- | --- |
| **Conectado e com publicações** | `200 OK` | `"active"` | Retorna `profile`, `items` preenchido e `pageInfo`. |
| **Feed vazio** (conta recém-conectada sem postagens ou todas ocultadas no painel) | `200 OK` | `"empty"` | Retorna `profile` válido, `items: []`, `pageInfo: { "limit": 12, "hasNextPage": false, "nextCursor": null }`. Permite ao site exibir estado vazio amigável com link para o perfil. |
| **Instagram temporariamente indisponível** (falha ou limite de taxa na API da Meta durante a sincronização, mas já existe snapshot anterior válido) | `200 OK` | `"stale"` | Conserva e entrega a **última projeção pública válida** (mesma regra de publicação: falha nunca apaga versão ativa), adicionando `"stale": true` e mantendo `syncedAt` da última leitura bem-sucedida. |
| **Indisponível sem snapshot prévio** (primeira sincronização ainda em andamento ou falhou antes do primeiro snapshot) | `503 Service Unavailable` | `"unavailable"` | Corpo `{ "error": "FEED_UNAVAILABLE", "status": "unavailable", "message": "O feed desta vitrine ainda não está disponível." }` com `Retry-After: 300` e `Cache-Control: public, max-age=30`. Sem detalhes internos da falha. |
| **Instagram desconectado, revogado ou desativado pelo proprietário** (ou vitrine inexistente) | `404 Not Found` | `"disconnected"` | Corpo `{ "error": "FEED_NOT_FOUND", "status": "disconnected", "message": "Nenhum feed público ativo para esta vitrine." }` com `Cache-Control: public, max-age=60`. Quando o proprietário desconecta a conta ou solicita exclusão (#49, **a confirmar**), a projeção pública anterior deixa de ser servida. |

---

## 9. Isolamento entre vitrines e ausência de segredos em respostas e logs

O isolamento multi-inquilino segue estritamente o ADR 0002 ([docs/architecture.md](../architecture.md)):

1. **Uma conta Instagram e uma projeção por vitrine**:
   - Cada vitrine possui seu próprio vínculo, sua própria projeção pública e seu próprio segredo de webhook, indexados por `site_id` / `slug`.
   - O fato de uma mesma pessoa ser proprietária de duas vitrines (ex.: `ganja` e `loja2`) não compartilha conexão Instagram, cache de feed, origens CORS nem destino de webhook entre elas.
2. **Isolamento na leitura pública e nos cursores de paginação**:
   - O cursor de paginação (`cursor`) é vinculado criptograficamente ou validado contra o `site_id`/`slug` da vitrine consultada: um cursor emitido para `/data/vitrines/ganja/instagram-feed.json` é rejeitado com `400 Bad Request` (`INVALID_CURSOR`) se enviado para `/data/vitrines/loja2/instagram-feed.json`.
   - Chaves da `Cache API` na borda incluem a URL canônica completa com o `slug` normalizado da vitrine.
3. **Isolamento na administração e no webhook**:
   - Políticas RLS no Supabase verificam propriedade ou associação ativa à vitrine (`site_memberships`) antes de ler ou alterar configurações do feed ou rotacionar o segredo do webhook.
   - O disparo do webhook da vitrine A usa exclusivamente a URL e o segredo HMAC configurados para a vitrine A.
4. **Higiene de logs e erros**:
   - Nenhum log do Worker ou resposta de erro HTTP pode incluir `access_token`, `refresh_token`, `webhook_secret`, cabeçalhos `Authorization` ou cookies de sessão.
   - Erros de validação ou de comunicação com a Meta são registrados apenas por código classificatório (`TOKEN_EXPIRED`, `META_RATE_LIMIT`, `WEBHOOK_TIMEOUT`) e identificador da vitrine, nunca despejando payloads brutos com credenciais.

---

## 10. Cenários de validação (critérios de aceite para implementação futura)

Quando a especificação for implementada via Spec Kit, a suíte automatizada (`npm test`) deverá cobrir obrigatoriamente:

1. **Contrato de leitura e paginação**:
   - Projeção pública retorna `profile`, `items` (`IMAGE`, `VIDEO` com `thumbnailUrl`, `CAROUSEL_ALBUM` com `children`), `caption`, `permalink`, `publishedAt` e `pageInfo` paginado sem duplicatas entre páginas.
2. **Bloqueio de vazamento privado (`assertNoPrivateLeakage`)**:
   - Qualquer tentativa de incluir `accessToken`, `refreshToken`, `webhookSecret`, `owner_user_id`, `site_id` ou campos fora da allowlist na projeção do feed lança erro `PRIVATE_FIELD_LEAKAGE` antes de publicar ou responder.
3. **Isolamento entre duas vitrines (`vitrine-a` e `vitrine-b`)**:
   - Ler o feed de `vitrine-a` jamais retorna mídias ou perfil de `vitrine-b`.
   - Reutilizar cursor de `vitrine-a` em `vitrine-b` falha com `400 INVALID_CURSOR`.
   - Usuário autenticado na equipe de `vitrine-a` não consegue ler nem alterar configurações de webhook/feed de `vitrine-b`.
4. **Estados de degradação**:
   - Conta conectada sem mídias retorna `200 OK` com `status: "empty"` e `items: []`.
   - Falha na sincronização preserva o último snapshot válido (`200 OK`, `status: "stale"`).
   - Desconexão da conta remove a projeção ativa e passa a responder `404 Not Found` (`status: "disconnected"`).
5. **Assinatura e deduplicação do webhook**:
   - Mudança no hash do feed dispara `POST` com `X-Vitrine-Signature-256` verificável pelo segredo da vitrine.
   - Sincronização sem alteração de hash não dispara requisição de webhook.

---

## 11. Dependências e decisões a confirmar em outros documentos

| Tema | Documento / Issue | Status |
| --- | --- | --- |
| Permissões exatas do app Meta (`instagram_basic`, login unificado) e campos públicos do perfil disponíveis | [`configuracao-meta.md`](configuracao-meta.md) ([vitrine #48](https://github.com/coletivo-inspira/vitrine/issues/48)) | Permissão decidida; campos a confirmar no primeiro teste |
| Fluxo de conexão OAuth por vitrine, revogação e limpeza dos dados na desconexão | `docs/instagram/conectar-por-vitrine.md` ([vitrine #49](https://github.com/coletivo-inspira/vitrine/issues/49)) | A confirmar |
| Frequência do Cron Trigger no Workers Free, tabelas de persistência, renovação de URLs da Meta e política de retenção | `docs/instagram/sincronizacao.md` ([vitrine #50](https://github.com/coletivo-inspira/vitrine/issues/50)) | A confirmar |
| Evolução futura para mensagens no Instagram (fora do escopo do feed) | `docs/instagram/mensagens-futuro.md` ([vitrine #52](https://github.com/coletivo-inspira/vitrine/issues/52)) | A confirmar |
| Roteiro geral da integração | [docs/instagram-integration-roadmap.md](../instagram-integration-roadmap.md) | Publicado na `main` |
