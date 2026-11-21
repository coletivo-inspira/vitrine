# Contrato: redirecionamento ao projeto externo na borda (`016`)

Comportamento público do Worker quando a vitrine tem um vínculo `active` válido (condições em
[data-model.md](../data-model.md) seção 9). Fonte do estado: RPC anônima
`public.public_showcase_overrides(slug)`, lida em `readPublicSiteState`
(`src/site-lifecycle.mjs`) com cache de 30 s por isolate. Nenhuma subrequest a mais por visita em
relação a hoje.

## Resposta de redirecionamento

```http
HTTP/1.1 302 Found
location: https://orbit.cliente.com.br/?utm_source=instagram&utm_campaign=lancamento
cache-control: no-store
x-robots-tag: noindex, nofollow
referrer-policy: no-referrer
x-content-type-options: nosniff
```

- Sem corpo, sem página intermediária, sem `link rel=canonical` (FR-036, FR-038).
- Parâmetros: só `utm_source`, `utm_medium`, `utm_campaign`, `utm_term` e `utm_content` da URL
  pedida, cada valor com até 100 caracteres, acrescentados ao destino (substituem chaves iguais já
  presentes no destino). Todo o resto (inclusive `fbclid`, `gclid`, caminho e fragmento pedidos) é
  descartado.
- Sem mapeamento de caminhos no alcance "Vitrine inteira": todos os endereços levam ao mesmo
  destino (spec, Assumptions).
- `HEAD` recebe o mesmo `302` e não conta nos Insights.

## Onde se aplica

| Pedido | Alcance "Vitrine inteira" | Alcance "Página da vitrine" |
| --- | --- | --- |
| `GET /<endereço>`, `/<endereço>/`, `/<endereço>/index.html` | `302` | normal |
| `GET /<endereço>/<página>` (página emoldurada ou rota de página) | `302` | `302` só para `<página>` = `pageSlug` |
| `GET /<endereço>/item/<item>` | `302` | normal |
| Domínio próprio: `/`, `/<página>`, `/item/<item>` | `302` (antes do cache da borda) | `302` só para `/<pageSlug>` |
| `/data/vitrines/<endereço>/menu.json`, `/<endereço>/vitrine.json`, `vitrine.json` no domínio próprio | `404` `no-store` | normal |
| `/__preview/<siteId>…` (prévia autenticada) | normal, com faixa "Projeto externo ativo: visitantes vão para <host>" | idem |
| Painel, APIs e host isolado | sem mudança | sem mudança |

Ordem no Worker: vitrine pausada (`respondIfShowcasePaused`) vem antes do redirecionamento; vitrine
pausada continua mostrando a página de pausa.

## Menu e links internos (alcance "Página da vitrine")

- A vitrine renderizada recebe `redirect` como opção de renderização (não está no snapshot).
- Todo link `pagina:<pageSlug>` (menus e ações do hero) vira o destino com os mesmos parâmetros
  `utm_*` da página atual.
- `menuOpen = "new_tab"`: `target="_blank" rel="noopener noreferrer"`, ícone de "abre em outro
  site" e texto acessível "(abre em outra aba)" (FR-037). `same_tab`: link comum.
- A página emoldurada com redirecionamento continua salva; o redirecionamento prevalece (edge case).

## Indexação e compartilhamento

- `302` com `x-robots-tag: noindex, nofollow`; nenhuma página da vitrine declara canônico para o
  endereço redirecionado; a plataforma não tem mapa do site hoje, e o teste de regressão garante
  que um mapa futuro exclua endereços redirecionados (FR-038).
- Quem compartilha o endereço vê a prévia do destino, porque os robôs de prévia seguem o `302`.

## Insights

- Cada `GET` redirecionado grava, em `ctx.waitUntil`, um evento `external_redirect` para a vitrine
  com `source` normalizado a partir de `utm_source` e `campaign` a partir de `utm_campaign` (mesmas
  regras de `web/assets/metrics-source.mjs` e do Worker: lista fechada, até 32 caracteres,
  descarte de campanha com e-mail ou seis dígitos seguidos), sem IP nem cookie (FR-039).
- O painel mostra a soma por dia e por origem como "Levados ao projeto externo". O que acontece no
  destino não é medido.
- `/api/metrics` (eventos vindos do navegador) **não** aceita `external_redirect`.

## Verificação de destino (salvar, ativar, restaurar e Cron)

1. Começa no destino configurado, com `redirect: "manual"`, `HEAD` (se `405`/`501`, `GET` lendo no
   máximo 1 KiB), tempo limite de 5 s por salto, sem cookies.
2. Segue `location` por até 5 saltos, resolvendo URLs relativas.
3. Recusa (`EXTERNAL_URL_LOOP`) se algum salto apontar para `inspira.dev.br` ou subdomínio,
   `*.workers.dev`, `*.pages.dev`, um domínio de `custom_domains` da vitrine, ou repetir uma URL
   já visitada.
4. Disponível: alguma resposta final `2xx` ou `3xx` além do 5º salto não conta; `4xx`/`5xx` final ou
   falha de rede é "fora do ar" (só avisa depois de 3 dias seguidos, FR-041; na ativação, impede).
5. Subrequests: até 6 por verificação; contam no orçamento do Cron.
