# Imagens da vitrine via Google Drive (sem ocupar a base)

Status: especificação técnica e arquitetural. Prioridade sobre a integração do Instagram ([PR #53](https://github.com/coletivo-inspira/vitrine/pull/53)) para o fornecimento de fotos dos itens da vitrine. Opera integralmente dentro dos limites gratuitos do **Cloudflare Workers Free** e do **Supabase Free** (ADR 0001, ADR 0003, ADR 0004, ADR 0005, ADR 0008 e ADR 0011), sem exigir planos pagos, cartão de crédito ou armazenamento binário próprio.

---

## 1. Contexto e princípio arquitetural

Na Vitrine Inspira (`CONTEXT.md`, `docs/architecture.md` e `docs/roadmap.md`), a base de dados e o armazenamento do projeto não devem acumular cópias binárias de mídia quando o proprietário já mantém suas fotos organizadas em nuvem própria:

1. **Fonte de verdade no Google Drive do proprietário**: as fotos dos itens da vitrine são importadas a partir de uma pasta pública ou de arquivos públicos no Google Drive do próprio proprietário. O proprietário permanece responsável por manter os arquivos disponíveis e públicos no seu Drive.
2. **Base enxuta (apenas vínculos e metadados)**: no PostgreSQL do Supabase Free (franquia de 500 MB), guardam-se exclusivamente o identificador do arquivo (`driveFileId`), o vínculo opcional da pasta (`driveFolderId`), a URL pública resolvida (`imageUrl`) e metadados leves de verificação. Nenhum byte de imagem do Drive é gravado no banco ou no bucket do Supabase Storage.
3. **Prioridade de produto**: para fotos dos itens da vitrine (produtos, serviços ou portfólio), o fluxo via Google Drive tem precedência sobre a sincronização do feed do Instagram, pois cada foto no Drive corresponde diretamente a um item estruturado da vitrine.

---

## 2. Como as fotos dos itens são guardadas hoje

O código atual já separa os metadados do item do armazenamento binário em três pontos principais:

### 2.1. Validação e modelo JSON de rascunho (`src/portal-validation.mjs`)

- Cada rascunho (`public.drafts.content`) tem limite rígido de **256 KiB** (`MAX_DRAFT_BYTES = 262144`), até **100 itens totais** (`MAX_TOTAL_ITEMS = 100`) e até **20 itens ativos** no plano gratuito (`MAX_ACTIVE_ITEMS = 20`).
- O componente visual de imagem é habilitado por `components.photo` (booleano validado por `validateComponentsConfig`).
- Em cada item da vitrine, o campo de foto atual é `imageUrl`, validado por `validateOptionalUrlFields` e `validateSafePublicHttpsUrl`:
  - Exige string HTTPS válida (`parsed.protocol === 'https:'`), até 2048 caracteres, sem usuário ou senha embutidos na URL e sem esquemas ou marcações executáveis (`assertNoDangerousTextPayload`).

### 2.2. Projeção e publicação imutável (`src/publication-engine.mjs` e `supabase/migrations/202611120001_public_publications.sql`)

- Durante a publicação (`projectPublicStorefrontMenu` e `compilePublicStorefront`), apenas itens ativos entram no manifesto público (`public.publications.menu` e histórico das últimas 5 versões em `public.publication_releases.menu`).
- O conjunto de chaves permitidas por item público (`ALLOWED_ITEM_KEYS`) aceita `id`, `name`, `priceCents`, `description`, `imageUrl`, `minQuantity`, `durationMinutes` e `section`.
- Qualquer campo privado ou credencial (`FORBIDDEN_PUBLIC_KEYS`) é bloqueado por `assertNoPrivateLeakage` e pelas constraints SQL das tabelas `public.publications` e `public.publication_releases`.

### 2.3. Biblioteca de ativos WebP (`supabase/migrations/202611120007_assets_sandbox_domains.sql` e `src/storage-adapter.mjs`)

- A migração `202611120007_assets_sandbox_domains.sql` e o ADR 0011 introduziram a tabela `public.assets` (limite de 100 arquivos ou 20 MB por vitrine em `private.enforce_site_asset_quota()`) para uploads diretos convertidos em WebP (`<= 200 KB`) no navegador (`web/portal/editor.js`), gravados via `SupabaseStorageProvider` (1 GB de espaço e 2 GB/mês de saída no Supabase Free) ou `R2StorageProvider`.
- **Diferença com o Google Drive**: ao vincular fotos do Google Drive, a vitrine **não consome** a cota de 1 GB / 2 GB de saída do Supabase Storage Free nem exige upload de binários pelo Worker (`POST /api/sites/:siteId/upload`). O item referencia diretamente a foto mantida no Drive do proprietário, preservando 100% da franquia do Storage gratuito.

---

## 3. Reaproveitamento do login Google atual

### 3.1. Estado atual da autenticação (`web/portal/portal.js` e `workers/api.mjs`)

1. O login aprovado para o painel (ADR 0004 e `docs/google-auth-setup.md`) utiliza **Google via Supabase Auth** com fluxo OAuth 2.0 + PKCE (`startGoogleLogin` e `exchangePkceCode` em `web/portal/portal.js`).
2. O navegador obtém `supabaseUrl` e `publishableKey` em `GET /api/auth/config`, gera `pkce_verifier` e `code_challenge` (`S256`), redireciona para `${supabaseUrl}/auth/v1/authorize?provider=google` e troca o código em `POST ${supabaseUrl}/auth/v1/token?grant_type=pkce`.
3. O JWT emitido pelo Supabase Auth é validado no Cloudflare Worker (`POST /api/auth/session` em `workers/api.mjs`) contra o endpoint JWKS (`/auth/v1/.well-known/jwks.json`, com cache em memória `JWKS_CACHE_TTL_MS` de 10 minutos), verificando assinatura, emissor (`iss`), audiência (`aud = authenticated`), papel (`role = authenticated`) e expiração (`exp`).
4. O Worker estabelece a sessão administrativa por cookie `__Host-vitrine_session` (`HttpOnly; Secure; SameSite=Lax; Path=/`).
5. Conforme `docs/google-auth-setup.md`, o login inicial no painel pede **apenas identidade básica** (`openid email profile`), sem permissões de Google Drive e sem tokens offline.

### 3.2. Estratégia de reaproveitamento com autorização incremental

Para manter o login do painel rápido e sem telas de permissão invasivas no primeiro acesso:

1. **Login no painel permanece sem escopo do Drive**: entrar na Vitrine Inspira continua solicitando apenas identidade básica via Supabase Auth.
2. **Autorização incremental sob demanda (*Incremental Auth*)**: somente quando o proprietário (ou membro com papel `owner`, `admin` ou `editor` na vitrine) clica em **"Importar do Google Drive"** no editor (`web/portal/editor.js`), o painel solicita o consentimento específico para seleção de arquivos no Drive, reutilizando o **mesmo Client ID OAuth Google** do projeto da Vitrine e preenchendo `login_hint` com a conta autenticada (`include_granted_scopes=true`).
3. **Token do Google restrito à sessão de seleção**:
   - Quando o proprietário escolhe arquivos ou uma pasta via Google Picker, o token de acesso OAuth do Google é usado apenas durante a escolha/importação para ler os metadados dos arquivos públicos selecionados (`id`, `name`, `mimeType`, `md5Checksum`, `modifiedTime`, dimensões).
   - **Nenhum refresh token do Google Drive precisa ser salvo no banco** para servir a vitrine pública, pois a leitura das imagens pelos visitantes ocorre sobre arquivos públicos do Drive cacheados na borda.
4. **Isolamento por vitrine (ADR 0002)**: a conta Google usada no Picker não altera a propriedade da vitrine (`public.sites.owner_user_id`) nem concede acesso a outras vitrines; toda gravação no rascunho passa pela sessão `__Host-vitrine_session` e pelas políticas RLS de `public.drafts`.

---

## 4. Escopo mínimo do Google: `drive.readonly` vs. Picker com `drive.file`

| Critério | Google Picker + `drive.file` (Recomendado) | Link/ID público direto (Complementar) | Escopo `drive.readonly` (Evitar no MVP) |
| :--- | :--- | :--- | :--- |
| **Escopo OAuth** | `https://www.googleapis.com/auth/drive.file` | Nenhum escopo adicional além do login | `https://www.googleapis.com/auth/drive.readonly` |
| **Classificação no Google** | **Não sensível** (*non-sensitive*): aprovação simples, sem auditoria CASA | Sem tela de consentimento extra | **Sensível / Restrito**: exige verificação rigorosa da aplicação pelo Google |
| **Superfície de acesso** | Acesso somente aos arquivos/pastas que o proprietário clicar e escolher no Picker | Acesso somente ao arquivo ou pasta cujo link público o proprietário colar | Permissão de leitura sobre **todos** os arquivos do Google Drive do usuário |
| **Experiência no painel** | Navegação visual pelas pastas e fotos do Drive dentro do editor | Colagem rápida de URL de compartilhamento do Drive no campo do item | Navegação própria construída no painel via chamadas `files.list` |
| **Alinhamento com `docs/google-auth-setup.md`** | Respeita o princípio de menor privilégio | Respeita o princípio de menor privilégio | Excede o privilégio mínimo necessário para escolher fotos |

### Decisão de escopo

1. **Caminho principal — Google Picker API com `drive.file`**: o proprietário seleciona no Picker os arquivos de imagem ou a pasta pública onde mantém as fotos da vitrine. O escopo `drive.file` é o menor escopo OAuth possível na API do Google Drive e não expõe o restante do Drive do proprietário.
2. **Caminho complementar zero-escopo — Colar link de arquivo/pasta pública**: o proprietário pode colar diretamente o link compartilhado como *"Qualquer pessoa com o link pode ler"* (`https://drive.google.com/file/d/<FILE_ID>/view` ou `https://drive.google.com/drive/folders/<FOLDER_ID>`). O Worker extrai o identificador validado (`^[A-Za-z0-9_-]{10,128}$`) e verifica se o recurso está público.
3. **Quando `drive.readonly` seria considerado**: apenas se uma evolução futura exigir varredura automática em segundo plano de subpastas inteiras que não tenham sido abertas via Picker nem compartilhadas publicamente por link. Enquanto as fotos da vitrine forem públicas no Drive do proprietário, `drive.readonly` **não deve ser solicitado**.

---

## 5. Modelo de dados e metadados do item (sem binários na base)

Nenhuma migração de armazenamento binário é necessária. Os dados das imagens importadas do Drive cabem no JSONB de `public.drafts.content` (limite de 256 KiB) e são projetados para `public.publications.menu`:

### 5.1. Metadados no rascunho (`public.drafts.content`)

Em cada item de `categories[].items[]` (ou `items[]`), além do campo `imageUrl` já existente:

```json
{
  "id": "item-margherita",
  "name": "Margherita Artesanal",
  "description": "Molho de tomate italiano, muçarela fresca e manjericão.",
  "priceCents": 4800,
  "active": true,
  "imageUrl": "https://vitrine.inspira.dev.br/assets/drive/00000000-0000-0000-0000-000000000101/1a2B3c4D5e6F7g8H9i0J?v=8f3a1c",
  "imageSource": {
    "provider": "google_drive",
    "fileId": "1a2B3c4D5e6F7g8H9i0J",
    "folderId": "9z8Y7x6W5v4U3t2S1r0Q",
    "mimeType": "image/jpeg",
    "versionTag": "8f3a1c",
    "status": "ok",
    "checkedAt": "2026-11-12T16:00:00.000Z"
  }
}
```

- **Associação por nome ou seleção direta**: ao importar uma pasta pública do Drive, o editor pode sugerir o vínculo automático entre o nome do arquivo (ex.: `margherita-artesanal.jpg`) e o item correspondente da vitrine, ou permitir que o proprietário escolha a foto de cada item visualmente.
- **Formatos permitidos**: apenas `image/jpeg`, `image/png` e `image/webp`. Arquivos SVG, HTML, vídeos ou documentos são recusados na validação (`422 INVALID_IMAGE_FORMAT`).
- **Projeção pública (`src/publication-engine.mjs`)**: `projectPublicStorefrontMenu` projeta apenas `imageUrl` (apontando para a rota pública de borda da própria Vitrine) no manifesto publicado (`public.publications.menu`), mantendo `ALLOWED_ITEM_KEYS` enxuto e sem expor metadados internos de sincronização (`folderId`, `checkedAt`, etc.).

---

## 6. O que fazer quando o arquivo some ou fica privado

Como o arquivo reside no Google Drive do proprietário, três falhas externas podem acontecer depois da importação:
- O arquivo é **excluído** ou movido para a lixeira (`404 Not Found`);
- O compartilhamento do arquivo ou da pasta é alterado para **restrito/privado** (`403 Forbidden` ou redirecionamento `302` do Google para página HTML de login);
- O Google Drive aplica **bloqueio temporário de cota** ou verificação de vírus em arquivo grande (`429` / página HTML intermediária).

### 6.1. Comportamento na vitrine pública (para o visitante)

1. **Nunca retornar HTML do Google como imagem**: o proxy de borda no Worker valida o código HTTP (`200 OK`) e o cabeçalho `Content-Type` (`^image\/(jpeg|png|webp)\b`) da resposta do Drive. Se o Drive responder `302` para `accounts.google.com`, `403`, `404` ou `text/html`, o Worker rejeita a resposta de origem.
2. **Aproveitamento do cache na borda durante indisponibilidade transitória**: se a versão já estiver em cache na borda (`stale-while-revalidate`), a Cloudflare continua entregando a imagem válida em cache sem interromper a experiência do visitante.
3. **Degradação visual limpa quando não há cache (`404` de imagem)**:
   - Se o arquivo sumiu ou ficou privado e não há cópia em cache, a rota `/assets/drive/...` retorna `404 Not Found` (com `Cache-Control: public, max-age=60` para evitar chamadas repetidas ao Drive a cada visita).
   - No navegador do visitante, o elemento `<img>` do item oculta o quadro quebrado com fallback gracioso para o layout textual do item, preservando título, descrição, preço em BRL e botão de pedido no WhatsApp (`wa.me`). A vitrine publicada **nunca fica fora do ar** por causa de uma foto ausente no Drive.

### 6.2. Comportamento no painel administrativo (`/portal/`)

1. **Diagnóstico no editor da vitrine**:
   - Ao abrir o editor ou clicar em **"Verificar fotos do Drive"**, o painel consulta o estado dos arquivos vinculados.
   - Cada item com falha recebe um selo claro no editor:
     - `privado` (`403` / redirecionamento para login): *"Esta foto está privada no Google Drive. Mude o acesso para 'Qualquer pessoa com o link' ou escolha outra foto."*
     - `nao_encontrado` (`404` / lixeira): *"Arquivo não encontrado no Google Drive. Ele pode ter sido movido para a lixeira."*
2. **Ações de recuperação em 1 clique**:
   - **Revalidar**: testa novamente a foto após o proprietário ajustar a permissão no Drive e atualiza o `versionTag` para limpar o cache negativo.
   - **Trocar foto**: abre o seletor para vincular outro arquivo do Drive.
   - **Remover foto do item**: limpa `imageUrl` e `imageSource`, mantendo o item ativo apenas com texto e preço.
3. **Comportamento no momento de publicar**:
   - Ao publicar uma nova revisão, se algum item ativo apontar para uma foto marcada como `privado` ou `nao_encontrado`, o painel avisa o proprietário antes de confirmar a publicação, permitindo corrigir a permissão no Drive ou publicar o item sem a foto indisponível. A última publicação ativa nunca é corrompida por falha no rascunho (`docs/architecture.md`).

---

## 7. Cache na borda (Cloudflare Workers Free)

### 7.1. Por que usar rota de cache na borda em vez de URL direta do Drive no HTML

Embutir links diretos de `drive.google.com/uc?export=view&id=...` ou `lh3.googleusercontent.com` diretamente nas tags `<img>` da vitrine pública traz problemas de confiabilidade, segurança e privacidade:
- Redirecionamentos `302` constantes aumentam a latência em redes móveis;
- Políticas `Cross-Origin-Resource-Policy` e bloqueadores de rastreamento de navegadores frequentemente bloqueiam imagens carregadas de `drive.google.com` em domínios de terceiros;
- O endereço IP e o `Referer` de todos os visitantes da vitrine seriam enviados diretamente ao Google;
- Exigiria abrir a diretiva `img-src` da Content Security Policy (CSP) nas vitrines públicas para múltiplos domínios `*.googleusercontent.com` e `drive.google.com`.

### 7.2. Desenho da rota `/assets/drive/:siteId/:fileId` com `caches.default`

A Vitrine serve as imagens importadas por uma rota pública GET no próprio Cloudflare Worker (`GET /assets/drive/:siteId/:fileId?v=:versionTag`):

1. **Chave determinística e consulta ao `caches.default`**:
   - Na entrada da requisição `GET` ou `HEAD`, o Worker valida `:siteId` (UUID) e `:fileId` (`^[A-Za-z0-9_-]{10,128}$`) e consulta `caches.default.match(cacheKey)` na borda da Cloudflare.
   - Em caso de *cache hit*, a resposta é devolvida imediatamente na borda (**CPU `< 1 ms`**, sem consultar o Supabase nem o Google Drive).
2. **Busca em *streaming* no *cache miss* (0 ms de processamento de imagem)**:
   - Em caso de *cache miss*, o Worker verifica se o `:fileId` pertence à publicação ativa (ou rascunho autenticado no modo prévia) daquela vitrine — impedindo que a rota seja usada como proxy aberto (*open proxy*) para arquivos arbitrários do Drive de terceiros.
   - O Worker faz `fetch` da URL pública de conteúdo do arquivo no Drive e retransmite o `ReadableStream` (`response.body`) diretamente, **sem decodificar nem recodificar pixels**, respeitando com folga o limite de **10 ms de CPU** do Cloudflare Workers Free.
   - Impõe limite máximo de leitura por arquivo (ex.: rejeitar respostas com `Content-Length > 2097152` bytes / 2 MB com `413 Payload Too Large`), incentivando fotos leves para web.
3. **Cabeçalhos de cache na borda**:
   - Quando a URL contém `?v=<versionTag>` (derivado de `md5Checksum` ou `modifiedTime` do arquivo no Drive):
     - `Cache-Control: public, max-age=31536000, immutable` (`IMMUTABLE_CACHE_CONTROL` em `workers/api.mjs`).
   - Quando requisitada sem versão explícita:
     - `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`.
   - Respostas de erro (`403`/`404` na origem do Drive):
     - `Cache-Control: public, max-age=60` (cache negativo curto para absorver picos de tráfego sem esgotar a cota diária do Worker Free).
4. **Invalidação sem custo**:
   - Quando o proprietário troca a foto no Drive ou clica em "Atualizar fotos do Drive" e republica a vitrine, o `versionTag` na `imageUrl` muda automaticamente (gerando nova URL imutável) e o Worker também pode remover a chave anterior com `caches.default.delete`, exatamente como já faz para as rotas públicas no momento da publicação (`workers/api.mjs`).

---

## 8. Content Security Policy (CSP) atual (`img-src`) e evolução

### 8.1. Mapeamento da CSP atual no código

Em `workers/api.mjs` (linhas 54–63) e `web/_headers`, a aplicação define cinco perfis de `Content-Security-Policy`:

| Constante / Regra | Onde é aplicada | Diretiva `img-src` atual |
| :--- | :--- | :--- |
| `STRICT_CSP_HEADER` (`workers/api.mjs` e `web/_headers` `/*`) | Site institucional e vitrines públicas sem imagens no Storage externo | `img-src 'self'` |
| `STOREFRONT_STORAGE_CSP_HEADER` (`workers/api.mjs`) | Vitrines públicas (`/<slug>`) quando algum item possui `imageUrl` | `img-src 'self' ${SUPABASE_PUBLIC_PROJECT_URL}` |
| `PORTAL_CSP_HEADER` (`workers/api.mjs` e `web/_headers` `/portal*`) | Painel administrativo (`/portal` e `/portal/*`) | `img-src 'self'` |
| `PORTAL_STORAGE_CSP_HEADER` (`workers/api.mjs`) | Perfil preparado para pré-visualização de ativos no painel | `img-src 'self' ${SUPABASE_PUBLIC_PROJECT_URL} data: blob:` |
| `SANDBOX_CSP` (`workers/api.mjs`) | Componentes isolados em `sandbox.inspira.dev.br` | `img-src data:` |

### 8.2. Como o fluxo do Google Drive se encaixa na CSP

1. **Vitrines públicas (`/<slug>` e domínios personalizados) — zero abertura para terceiros**:
   - Como a `imageUrl` projetada para os itens com foto do Drive aponta para a rota de borda da própria Vitrine (`/assets/drive/<site_id>/<file_id>?v=<versionTag>`), a imagem é carregada da mesma origem (`'self'`).
   - Tanto `STRICT_CSP_HEADER` quanto `STOREFRONT_STORAGE_CSP_HEADER` já autorizam `img-src 'self'`.
   - **Resultado**: **não é necessário abrir `img-src` para `*.googleusercontent.com` nem `drive.google.com` nas vitrines públicas**, mantendo a política de segurança estrita para todos os visitantes.
2. **Painel administrativo (`/portal` e `/portal/*`)**:
   - **Pré-visualização no editor**: ao renderizar as fotos já vinculadas via `/assets/drive/:siteId/:fileId` e os *blobs* locais, a diretiva `img-src 'self' ${SUPABASE_PUBLIC_PROJECT_URL} data: blob:` (`PORTAL_STORAGE_CSP_HEADER`) cobre todas as imagens do editor.
   - **Quando o widget interativo Google Picker estiver ativo no `/portal/`**: o Google Picker carrega um iframe de `https://docs.google.com/picker` com script de `https://apis.google.com` e miniaturas de `https://*.googleusercontent.com` / `https://drive-thirdparty.googleusercontent.com` / `https://ssl.gstatic.com`.
   - Portanto, **exclusivamente nas respostas de `/portal` e `/portal/*`** (e nunca nas vitrines públicas), se o widget visual do Picker for habilitado no navegador, a CSP do painel deve:
     - Aplicar `PORTAL_STORAGE_CSP_HEADER` como base; e
     - Caso o modo Picker no navegador esteja ativo (ou alternativamente, se a escolha for feita por colagem de link público sem script externo, mantendo `'self'`), liberar apenas no `/portal/*`:
       - `img-src 'self' ${SUPABASE_PUBLIC_PROJECT_URL} data: blob: https://*.googleusercontent.com https://ssl.gstatic.com`
       - `script-src 'self' https://apis.google.com`
       - `frame-src https://docs.google.com https://drive.google.com`
   - Enquanto a importação operar por link público do Drive validado pelo Worker, nem `script-src` nem `frame-src` de terceiros precisam ser abertos no `/portal/`, bastando `PORTAL_STORAGE_CSP_HEADER`.

---

## 9. Enquadramento nos planos gratuitos (Cloudflare Workers Free + Supabase Free)

| Recurso | Limite do Plano Gratuito | Impacto das Imagens via Google Drive |
| :--- | :--- | :--- |
| **Supabase Database Free** | 500 MB de banco PostgreSQL | Guarda apenas JSON de texto (`fileId`, `imageUrl`, `versionTag`, `status`) dentro de `public.drafts` e `public.publications` ($\le 200\text{ bytes}$ por item). |
| **Supabase Storage Free** | 1 GB de armazenamento / 2 GB de egress mensal | **0 bytes consumidos** (binários permanecem no Google Drive do proprietário). |
| **Supabase Auth Free** | 50.000 MAUs com login social Google | Reaproveita o mesmo projeto OAuth Google já aprovado no ADR 0004. |
| **Cloudflare Workers Free (CPU)** | 10 ms de CPU por invocação | Proxy faz apenas *streaming* de bytes (`response.body`) no *cache miss* e entrega direto do `caches.default` no *cache hit* (`< 1 ms` de CPU), sem reprocessar imagens. |
| **Cloudflare Workers Free (Requisições)** | 100.000 requisições/dia | Imagens servidas com `Cache-Control: public, max-age=31536000, immutable` (por `versionTag`) e cache negativo de 60 s para erros `404`/`403`. |

---

## 10. Critérios de aceite para uma implementação futura

1. **Zero armazenamento binário na base**: vincular fotos do Google Drive a itens da vitrine persiste apenas ID/URL e metadados no rascunho e na publicação, sem gravar arquivos em `public.assets` ou no bucket do Supabase Storage.
2. **Escopo mínimo**: o login principal no `/portal/` não pede permissões do Google Drive; a importação funciona com link público e/ou Google Picker (`drive.file`), sem exigir `drive.readonly`.
3. **Proteção contra *open proxy***: a rota `/assets/drive/:siteId/:fileId` serve apenas identificadores de arquivo vinculados àquela vitrine (`:siteId`), recusando IDs arbitrários de terceiros.
4. **Resiliência a arquivo removido ou privado**: se a foto no Drive retornar `403`, `404` ou HTML de login, o Worker não faz cache de HTML como imagem, a vitrine pública degrada graciosamente mantendo o item funcional para pedidos no WhatsApp, e o painel indica claramente o status `privado` ou `nao_encontrado` para o proprietário.
5. **CSP preservada**: vitrines públicas mantêm `img-src 'self'` (sem abrir domínios externos do Google para os visitantes), e toda a suíte `npm test` permanece verde.
