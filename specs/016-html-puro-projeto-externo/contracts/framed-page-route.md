# Contrato: rota e documento da página HTML emoldurada (`016`)

Rota pública nova servida só a partir do snapshot publicado (ADR 0008/0009). Leiaute medido na
maquete (`research-usabilidade.md`, M-01 e M-02).

## Rotas

| Pedido | Resposta |
| --- | --- |
| `GET /<endereço>/<página>` e com `/` final | documento da página emoldurada, se o snapshot tem página `kind: "html_frame"` ativa com esse slug |
| Domínio próprio `GET /<página>` | mesmo documento (`customDomainPath` mapeia para `/<endereço>/<página>`; `customDomainPublicPaths` aceita os slugs de páginas emolduradas do snapshot) |
| `GET /__preview/<siteId>/<página>?token=…` | prévia autenticada (`noindex`, `no-store`), aceita versões não aprovadas com token de prévia da moldura |
| Página inexistente ou nativa | `404` da vitrine (páginas nativas continuam em `#pagina-<slug>` na home) |
| Vitrine sem `html_packages` e sem `html_bespoke` vigente | `302` para `/<endereço>` (`cache-control: no-store`), página fora do menu (FR-059) |
| Vitrine pausada | página de pausa (precede tudo) |
| Projeto externo ativo para a vitrine ou para esta página | `302` ([redirect-behaviour.md](redirect-behaviour.md)) |

Cabeçalhos do documento: os de `PUBLIC_SECURITY_HEADERS`, CSP da vitrine com `frame-src
<SANDBOX_ORIGIN>`, `cache-control: public, max-age=300, stale-while-revalidate=86400`
(`STOREFRONT_CACHE_CONTROL`) e `etag` com o hash da publicação.

## Estrutura do documento

```text
<a class="skip-link" href="#vitrine-principal">Pular para o conteúdo</a>
<header>                         cabeçalho da vitrine (64 px; 56 px abaixo de 640 px)
<main id="vitrine-principal">
  <div class="storefront-frame-titlebar">   barra de título (56/44 px)
    <h1>Protótipo Orbit</h1>                 título; descrição só a partir de 640 px
    <a>Conversar no WhatsApp</a>             botão de contato da vitrine
  </div>
  <a class="skip-link" href="#depois-do-conteudo">Pular conteúdo interativo</a>
  <div class="storefront-frame" data-state="loading">
    <div class="storefront-frame-placeholder" aria-hidden="true">…título e indicador…</div>
    <div class="storefront-frame-failure" role="status" hidden>…mensagem, Tentar novamente, contato…</div>
    <iframe class="storefront-html-frame" title="Protótipo Orbit" …>
  </div>
  <span id="depois-do-conteudo" tabindex="-1"></span>
</main>
<footer>                         rodapé da vitrine
```

## Medidas

| Largura da tela | Margem lateral | Altura da moldura ("Altura da tela") | Mínimo | Cantos |
| --- | --- | --- | --- | --- |
| ≥ 1024 px (ref. 1280) | 24 px; largura máxima 1280 px | altura visível − cabeçalho − barra de título − 24 px | 560 px | 16 px |
| 640–1023 px | 16 px | altura visível − cabeçalho − barra de título − 16 px | 560 px | 16 px |
| < 640 px (ref. 375) | 8 px | altura visível − cabeçalho − barra de título − 8 px | 480 px | 12 px |

- "Altura visível" = `100dvh` (com `100vh` como alternativa), acompanhando as barras do navegador
  móvel (FR-019).
- Referências esperadas: ~1230 × 754 px em 1280 × 900; ~357 × 702 px em 375 × 812 (M-01).
- Celular deitado (altura visível < 480 px): a moldura fica com 480 px e a página rola (US7-4).
- Nenhuma largura entre 320 e 1440 px tem rolagem horizontal.
- O rodapé da vitrine fica depois da moldura e é alcançável pelas margens, pela barra de título ou
  pela própria rolagem sobre a moldura (M-02, US7-3).

## Metadados

- `<title>`: "Protótipo Orbit — Nome da vitrine".
- `description` e `og:description`: descrição da página ou, sem ela, a da vitrine.
- `og:image`: imagem de compartilhamento da vitrine (`shareMetaFor`).
- `link rel=canonical` e `og:url`: `https://vitrine.inspira.dev.br/<endereço>/<página>` ou o
  domínio próprio canônico; ausente quando a página redireciona (FR-038).
- `robots`: indexável; o conteúdo da moldura não conta (outra origem com `noindex`).
- JSON-LD de negócio local: o mesmo da vitrine, sem itens.

## Bloco HTML numa página nativa

`<section id="<sectionId>" class="storefront-module storefront-html-block">` com a mesma
estrutura de camada, falha e moldura, `loading="lazy"` e:

- "Altura do conteúdo": 320 px até a primeira mensagem, depois 120–4000 px (FR-024).
- "Altura fixa": `min(640px, 75dvh)` (~1070 × 640 em 1280; ~349 × 609 em 375, M-08).
- Até 3 por página; título acessível = `config.title` ou nome do pacote.
