# Sincronização periódica do perfil e feed do Instagram

Data: 12/11/2026. Status: planejamento de arquitetura e operação (referente à [issue #50](https://github.com/coletivo-inspira/vitrine/issues/50)); sem implementação de código, migração de banco ou deploy nesta entrega.

Este documento detalha as etapas 5 e 6 do roteiro [`docs/instagram-integration-roadmap.md`](../instagram-integration-roadmap.md) dentro do modelo em que a Vitrine opera um único aplicativo Meta centralizado e sites externos (como o da Ganja) consomem apenas a projeção pública gerada pela Vitrine.

---

## 1. Premissas e fronteiras

- **Escopo**: leitura periódica de dados básicos do perfil e das mídias publicadas em uma conta profissional do Instagram previamente autorizada pelo proprietário da vitrine no painel.
- **Isolamento por vitrine (ADR 0002)**: cada vitrine (`site_id`) possui no máximo uma conta do Instagram vinculada. Credenciais, cursores, falhas e mídias sincronizadas são estritamente isolados por `site_id`, sem compartilhamento automático entre vitrines do mesmo proprietário.
- **Imagens e vídeos fora da base**: arquivos binários de fotos e vídeos **não são baixados nem copiados** para o banco PostgreSQL nem para o armazenamento de objetos da plataforma. A Vitrine persiste apenas metadados textuais e links (`media_url`, `thumbnail_url` e `permalink`), mantendo o armazenamento das mídias na origem (Instagram, sob responsabilidade do proprietário da conta, assim como ocorre com fotos de itens da vitrine em pastas públicas do Google Drive).
- **Sem tempo real e sem histórico ilimitado**: a atualização ocorre por agendamento periódico, sem promessa de reflexão instantânea após uma postagem no aplicativo do Instagram e sem retenção de histórico ilimitado.
- **Dependências entre documentos (a confirmar)**:
  - Configuração do aplicativo Meta único: **decidida** no documento da [issue #48](https://github.com/coletivo-inspira/vitrine/issues/48) ([`configuracao-meta.md`](configuracao-meta.md)) — login unificado, permissão única `instagram_basic`, chamadas em `graph.facebook.com` com o ID da conta do Instagram no caminho, token de usuário do sistema configurado para não expirar e nenhum webhook da Meta nesta fase (não há campo de webhook para novas mídias).
  - Esquema final da tabela de vínculo OAuth, troca inicial do código de autorização por token de longa duração e ações de reconexão/desconexão no painel: **a confirmar** no documento da [issue #49](https://github.com/coletivo-inspira/vitrine/issues/49) (`docs/instagram/conectar-por-vitrine.md`).
  - Formato exato do contrato JSON público de leitura, invalidação de cache na borda e disparo de webhook assinado ("feed atualizado") para sites conectados: **a confirmar** no documento da [issue #51](https://github.com/coletivo-inspira/vitrine/issues/51) (`docs/instagram/interface-publica-feed.md`).

---

## 2. Executor e agendador na infraestrutura gratuita (ADR 0001, ADR 0003 e ADR 0005)

A sincronização utiliza exclusivamente a infraestrutura gratuita já adotada no repositório, sem contratação de filas pagas, bancos adicionais ou upgrades automáticos:

### Cloudflare Workers Free (Executor e Cron Trigger)

- **Ponto de entrada**: handler `scheduled(event, env, ctx)` em `workers/api.mjs`, acionado pelo Cron Trigger já declarado em `wrangler.jsonc` (`"triggers": { "crons": ["17 * * * *"] }`), compartilhando o agendamento com a rotina existente `refreshPendingDomainCertificates(env)`.
- **Limites reais do plano Workers Free observados pelo desenho**:
  - **Tempo de CPU por invocação**: máximo de **10 ms de CPU**. O tempo de espera de rede (`await fetch(...)` para a API do Instagram e para o PostgREST do Supabase) não consome tempo de CPU, mas o processamento em memória (validação, normalização de payload JSON e montagem do lote de escrita) deve ser enxuto e sem laços pesados.
  - **Subrequests por invocação**: máximo de **50 subrequests** (`fetch` de saída) por execução do Worker, somando as chamadas de verificação de domínios pendentes, consultas/escritas REST no Supabase e requisições à API do Instagram.
  - **Cron Triggers por conta**: limite de até **5 agendamentos cron** no plano gratuito; reutilizar a expressão horária `17 * * * *` evita consumir novos gatilhos.
  - **Volume diário**: teto de **100.000 requisições/dia** compartilhado com o tráfego HTTP do Worker.

### Supabase Free (Persistência e controle de estado)

- **Armazenamento no PostgreSQL (limite de 500 MB no plano Free)**: guarda apenas o registro da conexão por vitrine, estado de sincronização e metadados das mídias dentro da janela ativa. Como não há cópia de imagens ou vídeos, cada vitrine consome apenas algumas dezenas de kilobytes.
- **Prevenção de pausa por inatividade**: a execução horária do Cron Trigger consulta o Supabase regularmente, evitando a pausa automática após 7 dias sem atividade do plano gratuito.
- **Acesso no servidor**: o job executa no Worker usando `SUPABASE_SERVICE_ROLE_KEY` apenas em ambiente de servidor (nunca exposta ao cliente), operando sobre tabelas protegidas por RLS.

---

## 3. Frequência, escalonamento e orçamento de subrequests

Para não violar o teto de **50 subrequests** nem os **10 ms de CPU** por execução do Cron Trigger (e respeitar os limites de taxa da API da Meta por conta conectada):

1. **Disparo do agendador**: o Cron Trigger roda **1 vez por hora** (minuto `17` de cada hora, conforme `wrangler.jsonc`).
2. **Intervalo alvo por vitrine**: cada vitrine conectada é sincronizada a cada **2 a 6 horas** (intervalo base de **3 horas**, **a confirmar** após medição no piloto de até 10 vitrines definido no ADR 0006). O painel deixará explícito ao proprietário que a sincronização é periódica e não em tempo real.
3. **Processamento em pequenos lotes (*batching*)**:
   - Em cada execução horária, o Worker busca no Supabase apenas as vitrines com `connection_status = 'connected'` e `next_sync_at <= now()`, ordenadas por `next_sync_at ASC`, limitadas a **no máximo 5 vitrines por invocação**.
   - **Orçamento de subrequests por invocação (estimativa máxima para 5 vitrines)**:
     - Até 10 subrequests reservadas para `refreshPendingDomainCertificates(env)`.
     - 1 subrequest no Supabase para listar o lote de até 5 vitrines elegíveis.
     - Por vitrine (até 5 vitrines × 4 subrequests = 20 subrequests):
       - 1 subrequest à Graph API para dados do perfil (`id`, `username`, `name`, `profile_picture_url`, `media_count`);
       - 1 a 2 subrequests ao Instagram para buscar páginas de mídias com filhos de carrossel embutidos;
       - 1 subrequest em lote (`UPSERT`) ao Supabase para gravar mídias e atualizar os ponteiros de sincronização da vitrine.
     - Total estimado: **~31 subrequests**, mantendo folga segura abaixo do limite rígido de 50 subrequests do Cloudflare Workers Free.
4. **Espalhamento (*jitter*)**: ao agendar o próximo ciclo (`next_sync_at`), o Worker adiciona uma variação aleatória de alguns minutos para distribuir vitrines entre execuções horárias distintas.

---

## 4. Importação inicial paginada e tipos de mídia

Na primeira conexão da vitrine (ou após reconexão), o sincronizador importa o conteúdo acessível pela API oficial (API do Instagram com login unificado, permissão `instagram_basic`, decidida em #48) chamando `GET https://graph.facebook.com/<versão>/<ig_account_id>` para o perfil e `GET https://graph.facebook.com/<versão>/<ig_account_id>/media` para as mídias (nunca `/me`, que nesse token representa o usuário do sistema), usando paginação baseada em cursor:

### Paginação fatiada entre ciclos

- A consulta à coleção de mídias solicita lotes de até **25 itens por página** usando expansão de campos em uma única chamada HTTP:
  `id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}`.
- **Importação inicial (*backfill*) controlada**: se a conta possuir mais páginas (`paging.next` / `paging.cursors.after`) e ainda não tiver atingido o teto de retenção da vitrine, o Worker processa no máximo **2 páginas por execução** para aquela vitrine, grava o cursor `backfill_cursor` no banco e agenda a continuação para a execução horária seguinte (`next_sync_at` no próximo ciclo).
- Quando não houver mais `paging.next` ou quando o limite de itens retidos por vitrine for alcançado, `backfill_cursor` é limpo (`NULL`) e a vitrine passa para o modo incremental (lendo apenas a primeira página mais recente a cada ciclo para capturar novidades e renovar URLs assinadas).

### Tratamento por tipo de mídia

| Tipo retornado pela API | Tratamento na sincronização | Dados persistidos (somente links e metadados) |
| --- | --- | --- |
| **`IMAGE`** (foto única) | Importada diretamente. | `ig_media_id`, `media_type = 'IMAGE'`, `media_url`, `permalink`, `caption`, `published_at` (`timestamp`). |
| **`CAROUSEL_ALBUM`** (carrossel) | Obtém os itens filhos no mesmo request via subcampo `children{...}` sem disparar uma requisição HTTP por item filho. | Metadados do álbum pai + lista ordenada de filhos (`child_media_id`, `media_type` `IMAGE` ou `VIDEO`, `media_url`, `thumbnail_url`), mantendo como capa principal o primeiro item do álbum. |
| **`VIDEO`** / **`REELS`** (`media_type = 'VIDEO'`, `media_product_type = 'REELS'` ou `'FEED'`) | Importado com capa estática obrigatória para evitar carregamento automático de vídeo pesado na vitrine pública. | `ig_media_id`, `media_type = 'VIDEO'`, `media_product_type`, `thumbnail_url` (capa estática usada nos cards), `media_url` (link temporário do vídeo), `permalink`, `caption`, `published_at`. |

Caso um registro de vídeo não traga `thumbnail_url` válido da API, o item permanece registrado com `permalink` para abertura direta no Instagram, sem quebrar a renderização da vitrine (**comportamento visual final a confirmar** em #51).

---

## 5. Deduplicação, atualização de URLs assinadas e posts removidos

### Deduplicação idempotente

- Todas as mídias sincronizadas são identificadas pela chave natural composta `(site_id, ig_media_id)` com restrição `UNIQUE` no PostgreSQL.
- As gravações utilizam `UPSERT` em lote (`ON CONFLICT (site_id, ig_media_id) DO UPDATE`), garantindo que reexecuções do Cron Trigger, paginações sobrepostas ou sincronizações manuais nunca criem publicações duplicadas.

### Renovação de URLs de mídia expiradas (`media_url` e `thumbnail_url`)

- Os links de CDN retornados pelo Instagram (`media_url`, `thumbnail_url` e `profile_picture_url`) contêm parâmetros de assinatura com expiração temporária (tipicamente poucos dias).
- Como a Vitrine **não copia imagens para sua base**, a sincronização periódica reconsulta a janela ativa de publicações da vitrine e sobrescreve `media_url`, `thumbnail_url`, `caption` e `last_seen_at` no `UPSERT`.
- Sempre que links ou publicações da janela ativa mudarem, a projeção pública da vitrine é atualizada (e o eventual webhook de "feed atualizado" para sites conectados é acionado, **conforme regras a confirmar** em #51).

### Posts removidos ou ocultados no Instagram

- Cada execução bem-sucedida que percorre a janela ativa atualiza o carimbo `last_seen_sync_id` (ou `last_seen_at`) das mídias retornadas pela API.
- Publicações previamente salvas na janela ativa da vitrine que deixarem de aparecer na listagem oficial da conta (por terem sido apagadas ou arquivadas no Instagram) são removidas da tabela ativa (ou marcadas como `removed`) ao final da reconciliação completa da janela, deixando de constar na projeção pública seguinte.

---

## 6. Credenciais no servidor, renovação de token e reconexão

- **Segredos restritos ao servidor**: o token OAuth de longa duração de cada vitrine fica armazenado apenas no backend (tabela privada sem leitura via `anon` ou `authenticated` comum, acessível somente pelo Worker no servidor, **esquema detalhado a confirmar** em #49). Nenhum token, chave de API ou cabeçalho de autorização é incluído em logs, URLs públicas, artefatos publicados ou respostas ao navegador.
- **Sem renovação periódica**:
  - Com o login unificado, cada vitrine recebe um token de usuário do sistema do portfólio empresarial do dono, configurado no console para **não expirar** (#48). Não há job de renovação de 60 dias nem chamada a `ig_refresh_token`, o que também libera subrequests do Cron Trigger.
  - Se a configuração da Meta não oferecer "Nunca", `token_expires_at` guarda a validade recebida e o painel avisa o dono **15 dias** antes do vencimento para reconectar; a Vitrine não pede `business_management` para renovar tokens por API.
- **Expiração, revogação e necessidade de reconexão**:
  - Se a leitura do feed receber erro de token da Meta (HTTP `400`/`401`, código OAuth `190`: app removido do portfólio, conta movida para outro portfólio, acesso revogado ou token vencido), ou erro `(#10)` de conta que deixou de ser profissional, o Worker **interrompe imediatamente** os agendamentos automáticos daquela vitrine (`next_sync_at = NULL`), altera o estado do vínculo para `reconnect_required` (**nomenclatura final de estados a confirmar** em #49) e registra apenas o código de diagnóstico sanitizado (`TOKEN_EXPIRED` ou `PERMISSION_REVOKED`).
  - O painel passa a exibir o aviso para que o proprietário clique novamente em "Conectar Instagram" naquela vitrine.

---

## 7. Retries limitados, falhas transitórias e metadados de última sincronização

Para proteger as cotas gratuitas da Cloudflare e do Supabase e evitar bloqueios por limite de taxa na Meta:

- **Sem retries em laço na mesma execução**: se uma chamada HTTP à Meta ou ao Supabase falhar durante o Cron Trigger, o Worker **não** faz novas tentativas com `sleep` dentro da mesma invocação (preservando os 10 ms de CPU e as 50 subrequests).
- **Backoff exponencial entre ciclos**:
  - Falhas transitórias (erro de rede, timeout, HTTP `429 Too Many Requests` ou `5xx` da Meta) incrementam `consecutive_failures` da vitrine e agendam `next_sync_at` com *exponential backoff* (`1h`, `2h`, `4h`, `8h`, até o teto de `24h`).
  - Após **5 falhas consecutivas**, a vitrine entra em estado de alerta operacional (`degraded` / `sync_error`, **a confirmar** em #49) com tentativa espaçada a cada 24 horas ou mediante ação manual no painel.
  - Uma sincronização concluída com sucesso zera `consecutive_failures`, limpa `last_sync_error_code` e grava `last_synced_at = now()`.
- **Visibilidade de última sincronização**: cada vitrine mantém os campos operacionais `last_synced_at`, `last_sync_status` (`ok`, `partial_backfill`, `transient_error`, `reconnect_required`), `last_sync_error_code` (texto técnico curto e sanitizado, sem dados sensíveis) e `next_sync_at`.

---

## 8. Retenção, indisponibilidade e exclusão de dados

### Limite de retenção por vitrine (sem histórico ilimitado)

- A Vitrine **não atua como arquivo permanente** do histórico do Instagram.
- O banco mantém apenas as **N publicações mais recentes** por vitrine necessárias para a exibição pública (proposta inicial: teto de **até 50 publicações ativas por vitrine**, respeitando o teto geral de 100 itens por vitrine do piloto no ADR 0006 — **valor exato a confirmar** em #51 e com o proprietário da marca Ganja).
- Ao final de uma sincronização que ultrapasse o teto `N`, os metadados mais antigos daquela vitrine (`published_at` inferior aos `N` mais recentes) são descartados automaticamente no banco.

### Comportamento em indisponibilidade da API da Meta

- Se a API do Instagram estiver indisponível (`5xx`, timeout ou bloqueio temporário de cota `429`), a sincronização preserva integralmente o último conjunto válido de metadados sincronizados no banco e a última publicação ativa da vitrine.
- Os sites consumidores continuam lendo a última projeção válida, acompanhada do carimbo `last_synced_at` (**política de cache e cabeçalhos públicos a confirmar** em #51).

### Comportamento em desconexão ou revogação de consentimento

- **Desconexão pelo proprietário no painel ou callback de exclusão/desautorização da Meta** (**fluxos detalhados a confirmar** em #48 e #49):
  - O token de acesso armazenado no servidor é revogado/apagado imediatamente;
  - Todos os metadados de perfil e mídias do Instagram vinculados àquele `site_id` são excluídos do banco (`DELETE` restrito ao `site_id`);
  - A projeção pública da vitrine é regenerada sem dados do Instagram (exibindo estado desconectado/vazio, **conforme contrato a confirmar** em #51).

---

## 9. Resumo de verificação do checklist da Issue #50

| Item da issue #50 | Definição neste plano |
| --- | --- |
| Executor e agendador na infraestrutura existente sem planos pagos | `scheduled()` em `workers/api.mjs` via Cron Trigger gratuito (`17 * * * *` em `wrangler.jsonc`), respeitando 10 ms de CPU e 50 subrequests por execução no Cloudflare Workers Free e armazenamento apenas de metadados no Supabase Free (500 MB). |
| Importação inicial paginada e tipos de mídia | Paginação por cursor (`after`) fatiada em até 2 páginas por execução (`backfill_cursor`), cobrindo `IMAGE`, `CAROUSEL_ALBUM` (com `children` na mesma chamada) e `VIDEO`/`REELS` (com `thumbnail_url` obrigatório para capa), salvando apenas links e metadados. |
| Intervalo proposto após validar cotas (sem tempo real) | Agendador horário processando lotes de até 5 vitrines por execução, com intervalo alvo de 2 a 6 horas por vitrine (base de 3 horas com *jitter*). |
| Credenciais no servidor, proteção, renovação e reconexão | Tokens de usuário do sistema (login unificado, sem expiração) restritos ao servidor (`SUPABASE_SERVICE_ROLE_KEY`), sem job de renovação; erros OAuth `190`/`401` pausam o cron da vitrine e exigem reconexão no painel. |
| Deduplicação, atualização de URLs, posts removidos, retries e última sincronização | `UPSERT` idempotente por `(site_id, ig_media_id)`, atualização periódica de `media_url`/`thumbnail_url` assinadas, remoção de posts ausentes na janela ativa, *exponential backoff* entre ciclos (até 5 falhas consecutivas) e registro de `last_synced_at`. |
| Retenção/exclusão e comportamento em indisponibilidade e revogação | Teto de retenção ativa por vitrine (proposta de até 50 publicações, sem histórico ilimitado), preservação da última leitura válida em falhas `5xx`/`429` da Meta e exclusão completa por `site_id` em desconexão/revogação. |
