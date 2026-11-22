# Pesquisa técnica: HTML puro, projeto externo e administração por cliente (`016`)

**Data**: 2026-11-21
**Base**: `main` em `c29ee4c` (especificação mesclada pelos PRs #174 e #175).
**Entrada**: [spec.md](spec.md), [research-usabilidade.md](research-usabilidade.md) (achados `U-*` e `M-*`),
ADRs [0005](../../docs/adr/0005-zero-cost-mvp.md), [0008](../../docs/adr/0008-multi-tenant-edge-routing.md),
[0009](../../docs/adr/0009-dynamic-cms-immutable-snapshots.md), [0010](../../docs/adr/0010-opaque-sandbox-custom-components.md),
[0011](../../docs/adr/0011-zero-cost-media-storage.md) e [0013](../../docs/adr/0013-plans-and-recurring-billing.md).

Cada tópico segue o formato **Decisão / Justificativa / Alternativas**. As referências a código
apontam para o estado de `main` acima; nada aqui foi implementado nem implantado. A autenticação
na Cloudflare não está configurada (`BLK-CLOUD-01`): nenhuma rota, DNS ou Cron remoto foi criado.

## 0. Ponto de partida verificado no código

| O que existe | Onde | Efeito no plano |
| --- | --- | --- |
| Seção `custom_sandbox` com `{ widgetId, bundleHash }`, validada como `uuid` e `hash` | `src/showcase-structure.mjs` l. 32 e 154–162 | Reaproveitada como "Bloco HTML"; ganha `versionId` e `heightMode` |
| Alvos de ação `selecao`, `whatsapp`, `pagina:<slug>`, `#âncora` | `src/showcase-structure.mjs` l. 10 | `pagina:<slug>` passa a valer também nos menus (FR-053) |
| Até 5 páginas por vitrine, cada uma `{ slug, title, sections, active }` | `src/showcase-structure.mjs` l. 183–200 | Página emoldurada vira um tipo de página (`kind`) dentro do mesmo limite |
| Páginas extras renderizadas como trechos `#pagina-<slug>` do mesmo documento | `src/publication-engine.mjs` l. 1062–1069 e 1212–1215 | Página emoldurada precisa de rota própria (dependência 2 da spec) |
| Moldura `sandbox="allow-scripts"`, `referrerpolicy="no-referrer"`, `loading="lazy"`, título genérico | `src/publication-engine.mjs` l. 1200–1201 | Atributos e título mudam (FR-012, FR-021) |
| `SANDBOX_HOST`, `SANDBOX_CSP` sem hosts externos e com `frame-ancestors https:`, `WIDGET_FRAME_CSP` | `workers/api.mjs` l. 129–131 | Política nova por versão (tópico 2) |
| `listWidgets`, `approveWidget`, `readSandboxBundle` (RPC anônima `read_sandbox_bundle`) | `workers/api.mjs` l. 2290–2317 | Substituídos por leitura de versões de pacote |
| `assertApprovedWidgets` na prévia, no salvamento da estrutura e na publicação | `workers/api.mjs` l. 3822, 3829–3837, 5256 | Estendido para versões aprovadas e páginas emolduradas |
| `handleSandboxPage`: `cache-control: no-store`, confere SHA-256 antes de servir | `workers/api.mjs` l. 3839–3864 | Mantém a conferência; passa a usar cache revalidado (tópico 1) |
| Despacho por host: `url.hostname === SANDBOX_HOST` antes de qualquer outra rota | `workers/api.mjs` l. 4059 | Host passa a vir de variável (tópico 3) |
| `POST /api/admin/custom-components`: só `platform_admin`, 64 KiB, grava já aprovado | `workers/api.mjs` l. 4453–4485 | Substituído pelo fluxo com revisão (US3, FR-048) |
| Domínios próprios: desafio `_vitrine-verify.<host>` = `vitrine=<uuid>` gerado em gatilho; consulta DoH em `cloudflare-dns.com` | `supabase/migrations/202611120007_assets_sandbox_domains.sql` l. 107–120; `src/custom-domains.mjs` l. 26–51 | Mesmo padrão para a comprovação de posse (tópico 7) |
| `scheduled()` com `Promise.allSettled` de 3 tarefas; Cron `17 * * * *` | `workers/api.mjs` l. 5856–5864; `wrangler.jsonc` l. 7 | Verificação diária entra como 4ª tarefa, com orçamento de subrequests |
| Estado público por vitrine (`public_site_state`) lido a cada pedido da vitrine, com cache de 30 s no isolate | `src/site-lifecycle.mjs` l. 274–293; migração `20261115000800` l. 52–64 | Ponto único para redirecionamento e liberação de HTML (tópicos 4 e 8) |
| Direitos por plano: `requirePlanFeature` → `403 PLAN_FEATURE_REQUIRED` com `feature` e `requiredPlan`; `planGateSummary` para o painel | `src/entitlements.mjs` l. 64–146 | Recurso `html_packages` e limite por vitrine (tópico 9) |
| `audit_logs` imutável e `private.record_audit_log` | migração `202611120005` l. 250–297 | Todas as ações novas auditadas |
| `read_platform_overview` com `databaseBytes` e limite de 500 MB | migração `202611120008` l. 3–21 | Ganha uso de pacotes HTML (SC-009) |
| `customization_requests` com `site_id` opcional e status `novo → em_analise → respondido → encerrado` | migrações `202611120002` l. 98–113 e `202611120008` l. 24–44 | Origem das customizações contratadas (FR-046) |
| Não há mapa do site (`sitemap`) em `src/`, `workers/` nem `scripts/` | busca no repositório | FR-038 "fora do mapa do site" vale por construção; teste impede regressão |
| Não há e-mail transacional (ADR 0005 veta SMTP contratado) | `docs/backend-research.md` l. 35 | Avisos ficam no painel (tópico 7) |
| Orbit: 166.225 bytes, SHA-256 `e888ce2a…d47c`, hosts `cdn.tailwindcss.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, 2 formulários, nenhum `postMessage` | `exemplos/orbit-prototipo.html` | Caso de referência dos testes e do quickstart |

## 1. Armazenamento dos pacotes (até 512 KiB, 5 versões aprovadas)

**Decisão**: guardar o conteúdo no Postgres do Supabase, numa tabela do esquema `private`
(`private.html_package_contents`, uma linha por versão, coluna `content text` com
`octet_length ≤ 524288`), separada dos metadados em `public.html_package_versions`. Cotas
gravadas no banco: **3 MiB por vitrine** (soma de `byte_size` das versões com conteúdo) e
**teto global de 100 MiB** de conteúdo bruto (`private.html_storage_quota`, contador único como
`private.custom_domain_quota`). Versões "Com erros" guardam só o relatório (sem conteúdo);
versões recusadas ou com ajustes pedidos têm o conteúdo apagado 30 dias depois da decisão
(FR-010). A integridade é o SHA-256 do texto em UTF-8, calculado no Worker no envio e conferido
de novo em toda entrega (FR-014), como `handleSandboxPage` já faz. Na borda, o host isolado
guarda a resposta em `caches.default` com chave `embed/<versionId>?v=<hash>`; o conteúdo é
imutável, mas a autorização não: depois de 300 s no cache, cada acerto refaz uma consulta pequena
de permissão (`html_version_servable`), sem baixar o arquivo de novo. O navegador recebe
`cache-control: public, max-age=300` (não `immutable`), para que "Retirar do ar" e a perda do
plano tenham efeito em até 5 minutos (FR-029, FR-059, SC-006).

**Justificativa**:
- Orçamento de 500 MB do Supabase Free (Princípio IV): no teto global, 100 MiB brutos; o TOAST
  do Postgres comprime valores de texto grandes, e HTML costuma comprimir várias vezes, então o
  espaço em disco tende a ser bem menor (a medir em `read_platform_overview`, não prometido).
  Com 3 MiB por vitrine, o teto global comporta ~33 vitrines no limite e centenas no uso típico
  (o Orbit tem 162 KiB).
- Sem cartão nem serviço novo (ADR 0005); R2 exige método de pagamento (ADR 0011).
- O conteúdo é texto que precisa de validação e de hash no mesmo pedido; gravar no banco na
  mesma transação dos metadados evita estados órfãos entre dois serviços.
- Tabela no esquema `private`: o PostgREST não expõe o conteúdo; leitura só por funções
  `security definer` que conferem situação, direito do plano e hash.
- O cache por hash na borda protege a cota de tráfego do Supabase: cada colo da Cloudflare baixa
  o arquivo uma vez e depois só revalida a permissão.
- Revalidar a cada 300 s em vez de `immutable` é o que permite retirada em até 5 minutos; o custo
  é uma subrequest pequena por colo a cada 5 minutos por versão em uso.

**Alternativas**:
- *Supabase Storage (bucket privado)*: 1 GB grátis, mas egress próprio de 2 GB/mês (ADR 0011),
  upload em dois passos (Worker + Storage) e leitura com URL assinada ou `service_role`; mais
  pontos de falha para arquivos de até 512 KiB. Fica como evolução se o banco apertar, atrás da
  mesma interface de leitura.
- *Cloudflare R2*: 10 GB e egress zero, mas exige cartão na conta (conflita com ADR 0005 enquanto
  a conta não tiver faturamento) e não há autenticação configurada.
- *Reaproveitar `public.custom_components.bundle_html`*: limite de 64 KiB no `check`,
  `approved_by not null` (não há estado pendente), único por `(site_id, slug, version_tag)` e
  sem dono da vitrine com escrita. Mudar tudo isso seria uma tabela nova com outro nome.
- *`cache-control: immutable` por um ano*: impede a retirada do ar em 5 minutos.

## 2. Política de conteúdo (CSP) por pacote, atributos da moldura e política de permissões

**Decisão**: a resposta do host isolado passa a ter uma CSP montada por versão, com só os hosts
permitidos que aquela versão usa (gravados em `external_hosts` na validação):

```text
default-src 'none';
script-src 'unsafe-inline' [https://cdn.tailwindcss.com];
style-src 'unsafe-inline' [https://fonts.googleapis.com];
font-src [https://fonts.gstatic.com];
img-src data: blob:; media-src data: blob:;
connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none';
frame-src 'none'; worker-src 'none'; manifest-src 'none';
frame-ancestors <origens da vitrine>;
sandbox allow-scripts allow-forms
```

`frame-ancestors` lista só `https://vitrine.inspira.dev.br`, `https://painel.inspira.dev.br`
(prévia e revisão) e os domínios próprios **ativos** da vitrine dona da versão, lidos junto com o
conteúdo. A moldura na vitrine usa `sandbox="allow-scripts allow-forms"`,
`referrerpolicy="no-referrer"`, `allow="camera 'none'; microphone 'none'; geolocation 'none';
payment 'none'; usb 'none'; fullscreen 'none'; clipboard-read 'none'; clipboard-write 'none'"`
e `title` igual ao título da página ou do bloco. Nunca `allow-same-origin`,
`allow-top-navigation*`, `allow-popups*`, `allow-modals`, `allow-downloads` ou
`allow-pointer-lock`. Cabeçalhos do host isolado: `permissions-policy` negando câmera, microfone,
geolocalização, pagamento, USB, serial, HID, Bluetooth, captura de tela, tela cheia,
área de transferência e credenciais; `x-content-type-options: nosniff`;
`x-robots-tag: noindex, nofollow`; `referrer-policy: no-referrer`;
`cross-origin-opener-policy: same-origin`. A página da vitrine mantém a CSP atual
(`STRICT_CSP_HEADER` ou `STOREFRONT_STORAGE_CSP_HEADER`) e acrescenta `frame-src <origem do host
isolado>` só quando o documento tem moldura, como `WIDGET_FRAME_CSP` faz hoje (`workers/api.mjs`
l. 3681–3682), com a origem vinda da configuração (tópico 3).

**Justificativa**:
- M-03 e M-04 mostraram que o Orbit só funciona com Tailwind e Google Fonts liberados; M-05 que
  `allow-forms` com `form-action 'none'` faz o `submit` disparar para o script sem nenhum envio
  de rede; M-06 que a origem opaca bloqueia cookies, armazenamento, DOM e navegação da janela de
  cima. A diretiva `sandbox` na própria CSP mantém o isolamento mesmo se alguém abrir a URL do
  pacote direto, fora da moldura.
- Montar a lista por versão segue o mínimo privilégio (Princípio III): um pacote que não usa
  fontes não recebe `font-src`.
- `frame-ancestors https:` (hoje) deixa qualquer site embutir o pacote e usar a reputação da
  plataforma; restringir às origens da vitrine evita isso. Domínios próprios mudam pouco, e a
  revalidação de 300 s do cache atualiza o cabeçalho.
- Tailwind por CDN avisa no console que não é para produção (M-03); é aceito porque é escolha do
  conteúdo do proprietário, isolada, e a política de privacidade passa a citar os hosts (dependência
  5 da spec).

**Alternativas**:
- *Uma CSP fixa com os três hosts para todos*: mais simples, mas libera fontes e scripts a quem não
  usa.
- *Hospedar cópias do Tailwind e das fontes no host isolado*: elimina terceiros, mas o Tailwind por
  CDN gera CSS em tempo de execução a partir do script; manter cópia exige atualizar e versionar
  bibliotecas de terceiros, fora do escopo.
- *`allow-same-origin` para que bibliotecas usem `localStorage`*: proibido pelo ADR 0010.
- *Sem `allow-forms`*: o chat e os comentários do Orbit quebram (M-05).

## 3. Roteamento do host isolado no Workers Free e equivalente local

**Decisão**: o mesmo Worker `vitrine-inspira` atende o host isolado, como hoje
(`workers/api.mjs` l. 4059). O nome deixa de ser constante e passa a vir da variável não secreta
`SANDBOX_ORIGIN` (padrão `https://sandbox.inspira.dev.br`), usada para o despacho por host, para
o `src` das molduras e para o `frame-src` da vitrine. Em produção, quando a autenticação existir,
o host entra como *Custom Domain* do Worker em `wrangler.jsonc`
(`routes: [{ "pattern": "sandbox.inspira.dev.br", "custom_domain": true }]`), junto com os
demais hosts que também ainda não têm rota. Localmente, os testes chamam `createApiHandler` com
`Request` para `https://sandbox.inspira.dev.br/...` (padrão já usado em
`test/assets-opaque-sandbox.test.mjs`); para conferência manual no navegador, `wrangler dev`
local com `SANDBOX_ORIGIN=http://sandbox.localhost:8787` e a vitrine em
`http://localhost:8787`: os navegadores resolvem `*.localhost` para a própria máquina, e as duas
origens são diferentes, então o isolamento pode ser observado. `npm run preview` continua servindo
só o `dist/` e não atende `/api` nem o host isolado (limitação já registrada em
`research-usabilidade.md`, seção 1).

**Justificativa**:
- *Custom Domain* cria DNS e certificado pela própria Cloudflare e não depende de rota curinga;
  Workers Free permite. O cookie de sessão é `__Host-vitrine_session` (sem `Domain`), então não
  chega ao subdomínio isolado.
- Um Worker só: mesma loja de dados, mesmo deploy e mesma cota de 100.000 pedidos/dia; cada visita a
  uma página emoldurada soma 2 pedidos (vitrine e pacote), como a spec já assume.
- Variável de origem permite testar isolamento real com origens locais diferentes, sem condicional
  de ambiente espalhada pelo código.

**Alternativas**:
- *Worker separado para o host isolado*: isola melhor falhas e código, mas duplica deploy,
  segredos e acesso ao banco; reavaliar quando houver autenticação e CI de deploy.
- *Domínio registrável próprio para o isolamento (outro `.com.br`)*: impede qualquer efeito de
  "mesmo site" entre `sandbox.inspira.dev.br` e `vitrine.inspira.dev.br`, mas exige comprar
  domínio (vetado pelo ADR 0005). Registrado como risco residual no ADR 0014.
- *Caminho na mesma origem (`/sandbox/...`)*: anula o isolamento de origem do ADR 0010.

## 4. Página emoldurada com endereço próprio, snapshots, SEO e compartilhamento

**Decisão**: a página emoldurada é uma página da estrutura com `kind: "html_frame"` e um objeto
`html` (`packageId`, `versionId`, `versionHash`, `heightMode`, `description`, `showInMenu`),
sem seções. O Worker ganha a rota pública `/<endereço-da-vitrine>/<página>` (e `/<página>` no
domínio próprio, por `customDomainPath`/`customDomainPublicPaths` em `src/item-page.mjs`
l. 107–117), que renderiza **a partir do snapshot publicado** (ADR 0008/0009) um documento com o
cabeçalho, o rodapé e o botão de contato da vitrine, uma barra de título e a moldura. Só páginas
`html_frame` ganham rota própria nesta entrega; as páginas nativas continuam como trechos
`#pagina-<slug>` (generalizar fica fora do escopo). O endereço `item` fica reservado como slug de
página (conflita com `/<endereço>/item/<item>`). A publicação grava no snapshot as referências
fixas (`packageId`, `versionId`, `versionHash`); a vitrine pública nunca lê rascunho. Metadados: `<title>`
"Título da página — Nome da vitrine", descrição curta da página ou da vitrine, imagem de
compartilhamento da vitrine, canônico próprio e indexação permitida (FR-022); o conteúdo do pacote
fica fora da indexação porque está em outra origem com `x-robots-tag: noindex, nofollow`. A prévia
autenticada ganha `/__preview/<siteId>/<página>?token=…` com `noindex` e `no-store`.

**Justificativa**:
- Reaproveita o padrão já aceito da página do item (`/<endereço>/item/<item>`, `DESIGN.md`
  "Página do item"): mesmo cabeçalho e rodapé, documento próprio, só snapshot.
- Fixar `versionId` e hash no snapshot preserva a imutabilidade (ADR 0009) e a conferência de
  integridade (FR-014). Retirada do ar e perda do plano agem fora do snapshot (tópico 1 e tópico 8).
- Restringir a rota própria às páginas emolduradas resolve a dependência 2 da spec sem mudar a
  navegação das vitrines atuais.

**Alternativas**:
- *Rota própria para todas as páginas*: muda links, âncoras e testes de todas as vitrines; vale uma
  especificação própria.
- *Página emoldurada como seção especial na home*: não tem endereço nem metadados próprios
  (contraria FR-015 e FR-022).
- *Referenciar só o pacote e servir sempre "a versão em uso"*: troca de versão sem publicar,
  quebrando o fluxo de publicação da US6 e a imutabilidade.

## 5. Contrato de `postMessage`, altura e estados de carregamento

**Decisão**: a única mensagem aceita do conteúdo é `{ "type": "vitrine:resize", "height": <número> }`.
O controlador da moldura (`web/assets/html-frame.mjs`, carregado por `web/vitrine/vitrine.js`,
sem script inline por causa de `script-src 'self'`) aceita a mensagem só quando
`event.source === iframe.contentWindow` **e** `event.origin === "null"`, `type` é exatamente
`vitrine:resize`, `height` é número finito entre 120 e 4000 (arredondado para inteiro), e no máximo
10 mensagens por segundo por moldura (balde de fichas; o excesso é descartado sem erro). Só vale
nos modos "Altura do conteúdo" (página e bloco); sem mensagem, o bloco fica com 320 px. A vitrine
não envia nenhuma mensagem para a moldura. Modo "Altura da tela": CSS com
`height: max(<mínimo>, calc(100dvh - var(--sf-header) - var(--sf-titlebar) - <margem>))`
(mínimos 560/480 px, margens 24/16/8 px), com `100vh` como alternativa para navegadores sem `dvh`
(FR-017 a FR-019). Modo "Altura fixa" do bloco: `min(640px, 75dvh)`. Estados: uma camada de
carregamento com as cores da vitrine e o título fica **por baixo** da moldura, que começa com
opacidade zero e aparece no evento `load`; sem `load` em 10 s, a camada mostra "O conteúdo
interativo não carregou", "Tentar novamente" (recarrega o `src`) e o botão de contato (FR-021,
US7-5). Blocos usam `loading="lazy"`; a camada por baixo resolve a área preta de M-09. Sem
JavaScript, a moldura aparece direto, sem camada. O link "Pular conteúdo interativo" aponta para a
âncora logo depois da moldura (FR-021, US7-2).

**Justificativa**:
- M-07 já validou a aceitação por fonte e origem opaca e a recusa de tipo desconhecido e altura
  99999. Conferir `event.source` impede que outra moldura ou janela finja ser o pacote.
- O evento `load` não depende de cooperação do pacote (o Orbit não envia mensagem nenhuma) e
  dispara depois dos scripts e estilos externos, que são a causa provável de demora.
- `dvh` acompanha as barras do navegador móvel (FR-019).

**Alternativas**:
- *Mensagem `vitrine:ready` vinda do pacote*: exigiria mudar o pacote e ampliaria o protocolo
  (FR-013 permite só a altura).
- *`ResizeObserver` através da moldura*: impossível com origem opaca.
- *Rolagem interna sem altura negociada*: produz barras duplas no bloco (FR-024 pede sem rolagem
  interna).

## 6. Validação automática no envio e máquina de estados da revisão

**Decisão**: um módulo compartilhado `web/assets/html-package-rules.mjs` (precedente:
`web/assets/quota-rules.mjs`, usado pelo editor e pelo servidor) define limites, lista de hosts e a
varredura. O painel roda a validação no navegador para resposta imediata; o Worker roda de novo
antes de gravar (a do navegador não vale como prova). A varredura é linear (um passo sobre o texto,
sem expressões com retrocesso), registra linha e coluna, e produz três níveis (FR-002):

| Nível | Regras |
| --- | --- |
| Erro (bloqueia a revisão) | mais de 524.288 bytes (recusado antes de gravar, sem criar versão); não é UTF-8 válido; sem `<!doctype html>` ou sem `<html>`; `src`, `href` de `<link rel=stylesheet>`, `@import`, `url()` ou `srcset` com host fora da lista; `http:` em qualquer recurso; `<iframe>`, `<frame>`, `<object>`, `<embed>`, `<portal>`; `<script src>` sem `https:`; `<base>` com `href` |
| Alerta (vai ao revisor) | `top.location`, `parent.location`, `window.open`, `<meta http-equiv="refresh">`, `target="_top"`/`_parent`/`_blank`; `<input type="password">`, `autocomplete="cc-*"`, campos com nome de cartão; `<form action>` com destino externo; uso de `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon` (bloqueados pela CSP); `localStorage`/`sessionStorage`/`document.cookie` (não funcionam em origem opaca) |
| Informação | tamanho, SHA-256, hosts externos usados, número de formulários ("formulários só funcionam por script e não enviam dados"), se envia `vitrine:resize` |

Atributos `xmlns` e textos (como `http://www.w3.org/2000/svg` no Orbit) não contam como recurso
externo. Estados da versão (rótulo da spec entre parênteses): `has_errors` (Com erros) e `ready`
(Pronta para revisão) saem da validação; o envio para revisão leva a `pending_review` (Aguardando
revisão); o operador decide `approved` (Aprovada), `changes_requested` (Ajustes pedidos) ou
`rejected` (Recusada); `approved` vai a `withdrawn` (Retirada do ar). "Em uso" e "Aprovada, fora de
uso" não são gravados: derivam de a versão estar ou não no snapshot publicado atual. Detalhes em
[data-model.md](data-model.md).

**Justificativa**:
- A validação no navegador mantém a CPU do Worker baixa no caminho feliz; a do servidor é
  obrigatória (Princípio II) e precisa caber em 10 ms de CPU no Workers Free com 512 KiB, daí a
  varredura linear. O tempo real deve ser medido numa tarefa com um arquivo de 512 KiB; se passar de
  ~5 ms em `wrangler dev`, a varredura do servidor se limita aos erros e os alertas ficam com o
  navegador e o revisor.
- Separar erro de alerta segue FR-003/FR-004: o que a CSP já bloqueia vira alerta (o pacote só
  quebra a si mesmo, M-05/M-06); o que muda a superfície de terceiros vira erro.
- Estados derivados evitam escrita a cada publicação e não ficam desatualizados.

**Alternativas**:
- *Parser HTML completo no Worker (biblioteca)*: dependência nova e CPU maior.
- *Só validação no navegador*: contorna-se com chamada direta (FR-056 exige servidor).
- *Gravar "Em uso" a cada publicação*: duplica a informação do snapshot.

## 7. Comprovação de posse do domínio, Cron diário e avisos

**Decisão**:
- **DNS**: consulta TXT por DNS sobre HTTPS no mesmo resolvedor já usado pelos domínios próprios
  (`https://cloudflare-dns.com/dns-query`, `accept: application/dns-json`, tempo limite de 5 s,
  `src/custom-domains.mjs` l. 26–40). A função de consulta é extraída para ser compartilhada. Nome
  `_vitrine-verify.<host>`, valor `vitrine=<código>`; `Status` diferente de 0 (NOERROR) e 3
  (NXDOMAIN) é erro temporário.
- **Arquivo**: `GET https://<host>/.well-known/vitrine-inspira-verificacao.txt` com
  `redirect: "manual"`; aceita até 2 redirecionamentos **no mesmo host e por `https:`**; vale só
  resposta 200 cujo corpo (lido até 1 KiB, sem espaços nas pontas) é exatamente `vitrine=<código>`.
- **Código**: `vitrine=<uuid>` gerado no banco por gatilho, como em `custom_domains`
  (migração `202611120007` l. 107–120), único por vínculo e host (`unique(code)` e
  `unique(link_id, hostname)`).
- **Agenda**: o Cron existente (`17 * * * *`) ganha a tarefa `runExternalProjectChecks`. Cada
  execução pega os vínculos cuja próxima verificação venceu (`next_check_at <= now()`, ativos
  primeiro) e para quando gasta **30 subrequests**, deixando folga dentro do limite de 50 por
  execução do Workers Free (`docs/operations-guide.md` l. 123–131) para as outras três tarefas.
  Erro temporário repete até 3 vezes no mesmo vínculo e rodada (FR-064). Resultado negativo de posse
  suspende o vínculo na mesma transação que grava o resultado; o redirecionamento deixa de valer no
  próximo pedido, porque o estado público tem cache de 30 s (tópico 8). No pior caso (posse e
  disponibilidade com 5 saltos, ~12 subrequests por vínculo), cada execução cobre 2 vínculos, ou
  48 por dia; no caso típico (~4 subrequests) 7 por execução, ou ~170 por dia. Acima disso, registrar
  e aumentar a frequência (sem custo) antes de ampliar o escopo.
- **Verificar agora**: mesma rotina, síncrona, limitada a 1 tentativa a cada 30 s por vínculo
  (gravado em `last_attempt_at`), dentro do SC-013.
- **Avisos**: não há e-mail (ADR 0005). Os avisos ficam numa tabela `public.panel_notices`
  (vitrine, público `owner` ou `operator`, tipo, dados mínimos, `read_at`), mostrados no Início e
  no grupo correspondente do proprietário e, para o operador, na Visão geral e na ficha do cliente;
  tudo também vai para `audit_logs`. O plano diz isso com franqueza: "avisar" significa aviso no
  painel, não e-mail.

**Justificativa**:
- O padrão de comprovação é o mesmo que o operador já conhece nos domínios próprios; o resolvedor
  DoH público é gratuito e não exige conta (Princípio IV: sem SLA; erro temporário não suspende).
- Não seguir redirecionamento para outro domínio impede comprovar posse com o arquivo de outra
  pessoa (edge case da spec).
- Um orçamento por execução, com fila por `next_check_at`, mantém o Cron dentro do limite qualquer
  que seja o número de vínculos, como `billing_lifecycle_tick` faz com as assinaturas.

**Alternativas**:
- *Google Public DNS JSON (`dns.google/resolve`)*: equivalente; fica como segunda opção se o
  resolvedor da Cloudflare responder de forma inconclusiva, sem mudar o contrato.
- *Cron diário dedicado (`0 6 * * *`)*: concentraria todos os vínculos numa execução e estouraria
  subrequests com volume; o Cron por hora com fila distribui o trabalho.
- *E-mail pelo SMTP do Supabase*: restrito e não serve para produção (`docs/backend-research.md`
  l. 35); SMTP contratado é vetado.

## 8. Redirecionamento na borda, parâmetros de campanha, laço, cache e Insights

**Decisão**:
- **Leitura do estado**: nova RPC anônima `public.public_showcase_overrides(target_slug)`
  devolve `{ paused, redirect, htmlEnabled }` e substitui `public_site_state` em
  `readPublicSiteState` (`src/site-lifecycle.mjs` l. 274–293), com o mesmo cache de 30 s por
  isolate e o mesmo recuo para a função antiga quando a nova responder 404. Nenhuma subrequest a
  mais por visita.
- **Resposta**: `302` com `location` = destino + parâmetros `utm_*` da URL pedida (só chaves
  `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, valores até 100
  caracteres; os demais são descartados), `cache-control: no-store`,
  `x-robots-tag: noindex, nofollow`, `referrer-policy: no-referrer`, sem corpo. Alcance "Vitrine
  inteira": páginas `/<endereço>`, `/<endereço>/`, `/<endereço>/<página>`,
  `/<endereço>/item/<item>` e as mesmas no domínio próprio, verificadas **antes** de consultar o
  cache da borda do domínio próprio (`handleCustomHostname`, `workers/api.mjs` l. 3986–3995).
  `menu.json` e `vitrine.json` respondem `404` com `no-store` enquanto o alcance for a vitrine
  inteira (FR-038: fora de `vitrine.json`). Alcance "Página da vitrine": só
  `/<endereço>/<página>`; a vitrine recebe `redirect` na renderização e o item de menu
  `pagina:<slug>` vira o destino (`target="_blank" rel="noopener noreferrer"` e indicação
  "abre em outra aba" quando "Nova aba").
- **Por que `no-store` e não 5 minutos de cache**: a spec admite cache de até 5 minutos; o estado
  já tem cache de 30 s no isolate, e `no-store` no navegador faz desativar e restaurar valerem
  logo, sem custo extra relevante.
- **Laço e destino**: ao salvar, ativar, restaurar e na verificação diária, o Worker segue o
  destino com `redirect: "manual"` por até 5 saltos (`HEAD`, e `GET` se `HEAD` for recusado),
  recusando qualquer salto para hosts da plataforma (`inspira.dev.br` e subdomínios,
  `*.workers.dev`, `*.pages.dev`) ou domínios vinculados à vitrine. Laço achado na verificação
  diária suspende o vínculo com o motivo "laço detectado" (a vitrine voltaria a ficar inacessível de
  outro modo) e avisa; destino fora do ar só avisa depois de 3 dias seguidos (FR-041).
- **Validação sintática do destino** (FR-034): `https:` apenas, sem usuário/senha, sem porta,
  host não pode ser IP (v4 ou v6) nem `localhost`, até 2048 caracteres, lista fechada de
  encurtadores em `content/url-shorteners.json` (precedente: `content/payment-link-domains.json`),
  host IDN mostrado também em punycode (`new URL().hostname` já devolve punycode).
- **Insights**: métrica nova `external_redirect` ("Levados ao projeto externo"), somada por dia e
  por origem (`utm_source` normalizado como em `web/assets/metrics-source.mjs`), gravada pelo
  Worker com `ctx.waitUntil` usando `record_site_metric_batch`. O nome entra em
  `private.site_metric_names()` (recriada numa migração nova, como pede `docs/architecture.md`
  "Insights por origem") mas **não** em `ALLOWED_METRIC_EVENT_TYPES` do navegador: o endpoint
  `/api/metrics` não aceita esse evento vindo da vitrine. `HEAD` não conta.

**Justificativa**:
- 302 é temporário e reversível (spec, Assumptions); sem página intermediária porque o destino foi
  comprovado e confirmado pelo operador.
- Reaproveitar a leitura de estado público já existente mantém a CPU e as subrequests por visita.
- O risco de inflar a métrica chamando a RPC anônima diretamente é o mesmo das visitas de hoje;
  registrado como risco aceito, coerente com o restante dos Insights.

**Alternativas**:
- *307*: preserva método, irrelevante para `GET`; 302 é o que a spec fixou.
- *Gravar o redirecionamento no snapshot*: exigiria republicar a vitrine para ativar ou desativar
  (contraria SC-006).
- *Página intermediária "Você está saindo"*: rejeitada na spec.

## 9. Recurso de plano, limite de pacotes e respostas do servidor

**Decisão** (números propostos na spec, adotados como decisão do agente e revisáveis antes de
publicar a página de preços):

| Plano | `html_packages` | `htmlPackagesPerVitrine` |
| --- | --- | --- |
| `free` | não | 0 |
| `essencial` | sim | 1 |
| `profissional` | sim | 3 |
| `equipe` | sim | 3 (por vitrine) |
| teto técnico | — | 5 (`MAX_HTML_PACKAGES`) |

- `content/plans.json`: recurso `html_packages` e limite `htmlPackagesPerVitrine` (0 a 5; o
  validador de `src/plans.mjs` aceita 0 só para este limite). `src/plans.mjs`: `PLAN_FEATURES`
  ganha `html_packages`. `public.plans` ganha `max_html_packages` (semeada do JSON;
  `test/database/plans-subscriptions.test.mjs` passa a comparar a coluna). A assinatura de
  `private.site_entitlements` **não muda**: o Worker deriva o limite do `plan_code` pela tabela
  em `src/entitlements.mjs` (`normalizeEntitlements` já recai no plano base), e o gatilho do banco
  lê `public.plans.max_html_packages` pelo mesmo código.
- Servidor: `requirePlanFeature(entitlements, 'html_packages')` em toda escrita de pacote pelo
  dono ou admin da vitrine → `403 PLAN_FEATURE_REQUIRED` com `feature` e `requiredPlan`
  (Essencial). No limite, `403 PLAN_FEATURE_REQUIRED` com `feature: "html_packages_limit"`,
  `limit`, `current` e `requiredPlan` = plano mais barato com limite maior, no mesmo formato de
  `assertItemBlocksAllowed` (`src/entitlements.mjs` l. 108–121). O banco repete as duas checagens
  num gatilho (defesa em profundidade).
- Pacotes do operador sob customização "Conteúdo HTML sob medida" vigente não conferem plano nem
  limite (FR-060); a liberação para visitantes considera "plano com o recurso **ou** customização
  vigente".
- Painel: `PANEL_GATED_FEATURES` ganha `html_packages`; `planGateSummary` devolve
  `limits.htmlPackages` e `locked.html_packages_limit`; `web/portal/plan-gate.mjs` mostra o selo
  "Disponível no plano Essencial" e leva a `#plano`, sem contratação automática (FR-057).
- A página de preços (`src/pricing-page.mjs`) ganha o rótulo "Conteúdo HTML próprio, com revisão
  da equipe" e marca o recurso como "em preparação" (`IN_PREPARATION`) até a entrega.

**Justificativa**: segue exatamente o padrão de `custom_domain` e blocos de itens; não muda a RPC
de direitos já testada; os números ficam numa tabela só.

**Alternativas**: *limite global por organização* (rejeitado: a spec fala em "por vitrine");
*recurso só no Profissional* (rejeitado pela decisão de 2026-11-21: a partir do Essencial).

## 10. Área "Clientes" da administração e reorganização dos Ajustes do proprietário

**Decisão**:
- **Quem é "cliente"**: a organização cliente (`public.tenants`); vitrines sem organização são
  agrupadas pelo proprietário (`sites.owner_user_id`), com a chave `owner:<uuid>`. A chave do
  cliente na API é `tenant:<uuid>` ou `owner:<uuid>`.
- **Acesso a dados**: RPCs `security definer` que começam com
  `if not private.is_platform_admin() then raise … 'FORBIDDEN_PLATFORM_ADMIN'` (padrão de
  `read_platform_overview` e `lookup_mila_relay`): `admin_list_clients(search, filter, after,
  page_size)` com paginação por cursor (nome normalizado + id, 25 por página, até 50) e
  `admin_read_client(client_key)` que devolve os grupos da ficha. O Worker ainda confere
  `isPlatformAdmin` antes (FR-049; `support_operator` e `sponsor` recebem 403). Busca pelo código
  da vitrine: o Worker normaliza `#VI-XXXXXX-XXXX` com `normalizeMilaRelayCode`, usa o prefixo para
  filtrar endereços e confirma com `buildMilaRelayCode` (`web/assets/mila-relay.mjs` l. 25–49),
  sem coluna nova.
- **Painel do operador**: a aba "Clientes" entra primeiro em "Administração da plataforma"
  (`web/portal/index.html` l. 385–391), com a fila "Revisões" logo depois; endereço direto
  `#administracao/clientes` e `#administracao/clientes/<chave>` (corrige U-14 conferindo a permissão
  antes de ler o endereço). Os pedidos de customização e a atividade recente passam a mostrar cliente
  e vitrine com link para a ficha (FR-047, U-02).
- **Ajustes do proprietário**: um componente de grupo recolhível único
  (`web/portal/settings-groups.mjs`) com título, resumo de uma linha, selo de situação, selo do
  plano e salvamento próprio, aplicado aos nove grupos da US5-3. Usa os tokens do portal em
  `DESIGN.md` ("Portal": pílulas, raio 20–28 px, foco laranja de 3 px, alvos de 44 px,
  `prefers-reduced-motion`) e substitui os dois estilos de painel de U-09. O título do painel passa
  a ser "Ajustes" (U-05). O editor de estrutura mostra as seções recolhidas e abre uma por vez
  (FR-051, U-06). O destino de link de menu vira uma lista (FR-053, U-07). Em 1280 px a prévia ao
  vivo pode ser recolhida para dar largura ao formulário (FR-054, U-08).

**Justificativa**: RLS de `platform_admin` já é o padrão das leituras administrativas; RPCs
agregadas evitam N consultas por linha da lista (subrequests) e mantêm a projeção explícita
(Princípio I); a paginação por cursor é estável com inserções.

**Alternativas**: *consultas PostgREST por tabela com `or=(…)`* (muitas subrequests por ficha);
*paginação por `offset`* (instável e mais cara com volume); *nova tela fora do portal* (duplica
autenticação e estilos).

## Riscos e pendências que continuam abertos

| Item | Situação | Dono |
| --- | --- | --- |
| Rota, DNS e certificado de `sandbox.inspira.dev.br`; autenticação na Cloudflare | Pendente (`BLK-CLOUD-01`); nada foi implantado | Humano |
| Contas de Operador Inspira com `platform_admin` para o aceite | Pendente (`BLK-HITL-72`) | Humano |
| Política de privacidade e termos citando os hosts de terceiros e o conteúdo enviado pelo proprietário | Texto a escrever em `web/privacidade/` e `web/termos/` antes de liberar o recurso | Tarefa + revisão humana |
| CPU da validação de 512 KiB no Worker | Medir em tarefa; plano B descrito no tópico 6 | Tarefa |
| Números de pacotes por plano | Adotados como decisão do agente; confirmar antes de tirar "em preparação" da página de preços | Lino |
| Inflar a métrica de redirecionamento pela RPC anônima | Risco aceito, igual às visitas | — |
