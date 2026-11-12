# Research: Leilão (`013-leilao`)

## R1. Como impedir que o banco aceite lances fora do Worker

- **Decisão**: segredo dedicado `AUCTION_BID_SECRET` enviado pelo Worker no cabeçalho `x-vitrine-bid-key`; a função `private.place_auction_bid` lê `current_setting('request.headers')` (exposto pelo PostgREST) e compara o SHA-256 com `private.auction_settings.bid_key_sha256`. Sem configuração, recusa (falha fechada).
- **Racional**: a chave anônima é pública; sem um segredo, qualquer pessoa chamaria a RPC com identificadores de visitante forjados e escaparia dos limites. O segredo é mínimo (só autoriza lances) e revogável (trocar o hash).
- **Alternativas**: `service_role` no Worker (rejeitada: `docs/operations-guide.md` proíbe no Worker público e o privilégio é amplo demais); só limites por WhatsApp (rejeitada: telefones forjáveis); `pgcrypto`/HMAC no banco (rejeitada: extensão a mais, sem ganho sobre o hash).

## R2. Identificador de visitante sem guardar IP

- **Decisão**: `HMAC-SHA-256(AUCTION_BID_SECRET, "visitor:" + CF-Connecting-IP)`, 32 caracteres hexadecimais.
- **Racional**: irreversível sem o segredo; estável o suficiente para janelas de 15 s a 24 h; LGPD — dado pseudonimizado e apagado em 90 dias.
- **Alternativas**: cookie (rejeitada: a vitrine não usa cookies; trivial de apagar); fingerprint no navegador (rejeitada: invasivo e forjável).

## R3. Concorrência

- **Decisão**: `insert ... on conflict do nothing` + `select ... for update` no lote antes de validar o mínimo.
- **Racional**: serializa lances do mesmo lote dentro da transação da RPC; o segundo lance igual vê o novo mínimo.

## R4. Encerramento e prorrogação

- **Decisão**: status derivado de `ends_at > now()`; prorrogação de 3 min com teto +60 min (constraint na tabela).
- **Racional**: dispensa cron (Workers Free já usa 1 cron para domínios) e evita "sniping".

## R5. Atualização do quadro na vitrine

- **Decisão**: polling de 30 s só com `document.visibilityState === 'visible'`, mais leitura após cada lance; resposta `no-store`.
- **Racional**: Workers Free (100 mil requisições/dia) e Supabase Free; Realtime exigiria cliente Supabase no navegador e abrir `connect-src`.

## R6. Cotas e condições (Princípio IV)

- Workers Free: 100.000 requisições/dia, 10 ms de CPU por requisição; cada lance/quadro usa 1 subrequest (limite 50).
- Supabase Free: 500 MB de banco; um lance ocupa < 300 bytes; teto de 300 lances por lote e limpeza em 90 dias.
- Falhas: Supabase fora → 503 `AUCTIONS_UNAVAILABLE` no lance e quadro vazio na vitrine (demais itens seguem).
