# Contrato: entrega do pacote no host isolado (`016`)

Host: valor de `SANDBOX_ORIGIN` (padrão `https://sandbox.inspira.dev.br`). Atendido pelo mesmo
Worker, antes de qualquer outra rota (hoje `workers/api.mjs` l. 4059). Substitui
`handleSandboxPage` (`workers/api.mjs` l. 3839–3864). Nenhum cookie é lido ou definido neste host.

## `GET|HEAD /embed/:versionId?v=<sha256>[&t=<token>]`

| Parâmetro | Regra |
| --- | --- |
| `versionId` | UUID |
| `v` | 64 caracteres hexadecimais minúsculos; precisa ser o SHA-256 gravado da versão |
| `t` | opcional; token de prévia (ver abaixo) |

Qualquer outro método, caminho ou formato → `404` vazio com os cabeçalhos de segurança.

### Modo público (sem `t`)

1. Procura em `caches.default` a chave `<SANDBOX_ORIGIN>/embed/<versionId>?v=<sha256>`.
2. **Acerto com menos de 300 s** (cabeçalho interno `x-vitrine-checked-at`): responde do cache.
3. **Acerto com 300 s ou mais**: chama `html_version_servable(versionId, sha256)`; `true` → regrava
   o carimbo e responde do cache; `false` → apaga a entrada e responde "indisponível".
4. **Falta**: chama `read_html_version(versionId, sha256)`; recebe `content`, `external_hosts` e os
   domínios próprios ativos da vitrine, ou nada.
5. Recalcula o SHA-256 de `content`; diferente de `v` → "indisponível" (FR-014), nunca outro
   conteúdo.
6. Responde `200` com o conteúdo e grava no cache.

Leitura do banco falhou (rede, 5xx) com entrada no cache → serve o cache (o conteúdo é imutável);
sem cache → `502` vazio.

### Modo prévia (com `t`)

Token HMAC de portador (10 minutos) emitido pela API do proprietário ou da revisão, vinculado a
`versionId` e `sha256`. Válido → `service_read_html_version(versionId)` com `service_role`, aceita
`ready`, `pending_review`, `changes_requested` e `approved`. Resposta com `cache-control: no-store`
e nunca gravada no cache. Token inválido ou vencido → `404`.

### Resposta "indisponível"

`200` com um documento HTML estático da plataforma (sem script) com o texto "Conteúdo
indisponível no momento", nas cores neutras da vitrine, `cache-control: no-store`. A página da
vitrine continua mostrando o botão de contato fora da moldura (edge case "Pacote retirado do ar").
`200` em vez de `410` porque a moldura não lê o status; o evento `load` dispara do mesmo jeito.

## Cabeçalhos da resposta `200` de conteúdo

```http
content-type: text/html; charset=utf-8
content-security-policy: default-src 'none'; script-src 'unsafe-inline' https://cdn.tailwindcss.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: blob:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'none'; frame-ancestors https://vitrine.inspira.dev.br https://painel.inspira.dev.br https://cardapio.cliente.com.br; sandbox allow-scripts allow-forms
cache-control: public, max-age=300
x-content-type-options: nosniff
x-robots-tag: noindex, nofollow
referrer-policy: no-referrer
cross-origin-opener-policy: same-origin
permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), display-capture=(), fullscreen=(), clipboard-read=(), clipboard-write=(), publickey-credentials-get=(), screen-wake-lock=(), xr-spatial-tracking=()
etag: "<sha256>"
```

- `script-src`, `style-src` e `font-src` só incluem os hosts de `external_hosts` daquela versão;
  sem nenhum, ficam `script-src 'unsafe-inline'`, `style-src 'unsafe-inline'` e `font-src 'none'`.
- `frame-ancestors`: `PUBLIC_SITE_ORIGIN`, `PORTAL_ORIGIN` e cada domínio próprio `active` da
  vitrine dona (`https://<hostname>`). Em ambiente local, as origens configuradas.
- Proibido em qualquer caso: `allow-same-origin`, `allow-top-navigation*`, `allow-popups*`,
  `allow-modals`, `allow-downloads`, `allow-pointer-lock` na diretiva `sandbox`.

## Moldura na página da vitrine

```html
<iframe class="storefront-html-frame"
  src="https://sandbox.inspira.dev.br/embed/<versionId>?v=<sha256>"
  title="Protótipo Orbit"
  sandbox="allow-scripts allow-forms"
  referrerpolicy="no-referrer"
  allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'; fullscreen 'none'; clipboard-read 'none'; clipboard-write 'none'"
  loading="lazy"
  data-height-mode="content"></iframe>
```

- Página emoldurada: sem `loading="lazy"` (está na primeira dobra).
- A página da vitrine acrescenta `frame-src <SANDBOX_ORIGIN>` à sua CSP só quando o documento tem
  moldura, e não acrescenta mais nada (continua `script-src 'self'`).

## Testes de contrato (para `/speckit-tasks`)

- Hash divergente, versão não aprovada, retirada, vitrine sem recurso e sem `html_bespoke`,
  vitrine arquivada → "indisponível" ou `404`, nunca conteúdo.
- CSP com só os hosts usados; `frame-ancestors` com domínio próprio ativo e sem domínio pendente.
- Revalidação: depois de "Retirar do ar", acerto de cache com carimbo antigo responde
  "indisponível".
- Token de prévia: aceita versão `pending_review`, recusa vencido, recusa outra versão, nunca grava
  cache.
- Pacote hostil (SC-003) executado em navegador real no aceite manual (quickstart).
