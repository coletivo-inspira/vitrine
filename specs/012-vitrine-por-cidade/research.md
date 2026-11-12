# Pesquisa e decisões — Vitrine por cidade

Perguntas em aberto foram decididas pelo agente, coerentes com a constituição (projeção pública explícita, isolamento, custo zero) e o roadmap. Cada decisão traz alternativa rejeitada.

## D1. De onde vem a cidade

**Decisão**: campo explícito por vitrine no rascunho, `locality = { listed, city, uf }`, editado em Ajustes → "Página por cidade". UF vem de lista fechada (27 estados); cidade é texto livre (2–60 caracteres; letras, espaços, hífen, apóstrofo e ponto).

**Por quê**: o perfil (`profiles.city`) é dado pessoal privado do proprietário e uma mesma pessoa pode ter vitrines em cidades diferentes (ADR 0002: fronteira por vitrine). O endereço do módulo "Horários e localização" é texto livre e granular demais (rua, número).

**Rejeitadas**: cidade do perfil (vaza dado pessoal e mistura vitrines); geolocalização do visitante (exige permissão e API externa); CEP (granular demais e exige API); base IBGE embarcada (≈5.570 municípios, peso e manutenção sem ganho no piloto).

## D2. Autorização explícita e desligada por padrão

**Decisão**: `locality.listed` começa `false`. Só com a caixa marcada **e** após publicar a vitrine entra na página. A projeção pública só inclui `locality` quando `listed = true` e cidade/UF são válidas.

**Por quê**: Princípio I (projeção explícita) e LGPD — juntar itens de várias vitrines muda o alcance da exposição, então pede consentimento próprio.

## D3. Normalização e identificador da cidade

**Decisão**: `citySlug = slug(cidade sem acento) + "-" + uf` (ex.: `sao-paulo-sp`). Nome exibido é o digitado pelo dono, com espaços normalizados. Variações de acento e caixa colapsam no mesmo slug; homônimos de estados diferentes ficam separados pela UF.

## D4. Onde a listagem é calculada

**Decisão**: tabela derivada `public.city_listings`, preenchida por trigger `SECURITY DEFINER` em `public.publications` (insert/update). A cada publicação, reversão ou alternância rápida, as linhas da vitrine são apagadas e recriadas a partir do manifesto público. Exclusão da vitrine remove por `on delete cascade`.

**Por quê**: o Worker faz 1 consulta indexada por página, sem varrer manifestos; o dado vem só do manifesto público (nunca do rascunho), então nada privado pode vazar por aqui.

**Rejeitadas**: Worker varrendo todas as publicações (N subrequests, estoura o limite de 50 do Workers Free); job agendado (atraso e mais um ponto de falha); view sobre `publications` com `jsonb_array_elements` (sem índice eficiente para paginar).

## D5. Quais itens entram

**Decisão**: itens ativos do manifesto com `priceMode` em `offer`, `donation`, `trade`. Venda e cotas de apoio (`quota`, spec 014) ficam de fora: a cota é arrecadação da própria vitrine, não troca entre vizinhos, e a spec 014 não prevê exposição agregada. O teto continua o da vitrine (20 ativos).

## D6. Filtros

**Decisão**: cidade (no caminho) e modo (`?modo=lance|doacao|troca`, ausente = todos), exibidos como links. Sem busca textual nesta fatia.

**Por quê**: links funcionam sem JavaScript e sem mudar a CSP (`form-action 'none'` bloquearia um formulário). Busca textual pede índice de texto e entra depois, se o volume justificar.

## D7. Paginação

**Decisão**: paginação por cursor (keyset), 24 itens por página, ordem do mais recentemente publicado. Cada linha tem `sort_key` texto único = `epoch_us(16) ~ slug ~ (999 − posição)(3)`, indexado com a cidade e o modo. O cursor é o próprio `sort_key` do último item (`?depois=`), validado por regex; cursor inválido volta ao início. Sem `OFFSET` e sem contagem exata por página; a contagem por cidade vem de uma view agregada só no índice.

**Por quê**: custo constante por página no Postgres Free, sem `count(*)` caro, e URLs estáveis para cache.

## D8. Privacidade do dono

**Decisão**: a página mostra só o nome público da vitrine, o endereço `/slug`, a cidade/UF e campos públicos do item. Não mostra WhatsApp (o contato acontece na vitrine), nome, e-mail ou endereço do dono. Para `anon`, a tabela não expõe `site_id` (grant por coluna).

**Por quê**: um diretório com telefones de toda a cidade facilitaria raspagem; dentro da vitrine o número já é público por escolha do dono, mas agregado muda o risco.

## D9. Custo e cache (Workers Free + Supabase Free)

**Decisão**: HTML e JSON renderizados no Worker com Cache API (`max-age=300, stale-while-revalidate=86400`) e chave = URL completa (cidade + modo + cursor). Cada falha de cache = até 2 subrequests ao PostgREST com `anon`: a view agregada de cidades (memorizada por 60 s no isolate, também usada para os contadores dos filtros) e uma página de itens. Estimativa: 10.000 vitrines × 20 itens = 200 mil linhas ≈ 120 MB no pior caso com descrições cheias — dentro de 500 MB; o piloto (200 linhas) é desprezível. Workers Free: 100 mil requisições/dia; a página reaproveita o mesmo orçamento das vitrines.

**Consequência**: remover a autorização leva até ~5 minutos para refletir (SC-004).

## D10. Lances hoje e ponto de encaixe com a spec 013

**Decisão**: o lance de hoje é uma proposta enviada pelo WhatsApp com valor mínimo opcional. A página mostra "Lance" + "a partir de R$ X" (ou "Faça sua oferta"), e o botão leva à vitrine, onde a proposta é feita como já funciona.

**Encaixe**: toda apresentação de preço passa por `describeListingPrice(listing)` em `src/city-listings.mjs`, e o contrato JSON já reserva `auction: null` por item. A spec 013 deve:

1. adicionar colunas de resumo do leilão em `city_listings` (ex.: `auction_ends_at`, `auction_top_bid_cents`, `auction_status`) em migração nova, preenchidas pelo mesmo trigger ou pelo fluxo de lances;
2. preencher `auction` em `toPublicListing()` a partir dessas colunas;
3. ensinar `describeListingPrice()` a mostrar "Maior lance R$ Y · termina em …" quando `auction` existir.

Nenhuma outra parte da página precisa mudar. Se a 013 mudar o valor de `priceMode` (ex.: `auction`), basta incluí-lo em `CITY_LISTING_PRICE_MODES` e no `check` da tabela.

## D11. Rotas e reserva de endereço

**Decisão**: `/por-cidade` (índice), `/por-cidade/<cidade-uf>` (lista), `/data/por-cidade/index.json` e `/data/por-cidade/<cidade-uf>.json`. `por-cidade` entra em `RESERVED_SLUGS`, nos caminhos reservados do Worker e em constraint `not valid` em `public.sites` (não quebra linhas antigas).

## D12. Renderização no servidor, sem JavaScript obrigatório

**Decisão**: páginas renderizadas no Worker com o visual do site de divulgação (`styles.css` + `por-cidade.css`), tema claro/escuro via `theme.js`. Fotos de item seguem a mesma CSP das vitrines (Supabase Storage).

## D13. Descoberta

**Decisão**: link "Por cidade" no rodapé das vitrines listadas ("Mais itens de lance, doação e troca em <Cidade>") e no índice. A navegação principal do site de divulgação não muda nesta fatia (evita conflito com outras frentes); pode entrar quando houver massa de itens.

## D14. Diretório da spec e `feature.json`

**Decisão**: `specs/012-vitrine-por-cidade/`. `.specify/feature.json` e a seção SPECKIT do `AGENTS.md` não foram alterados, porque outros workers editam em paralelo; o diretório é passado explicitamente aos comandos Spec Kit.
