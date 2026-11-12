# Quickstart: Leilão (`013-leilao`)

## Validar localmente

```bash
npm test
npm run build
npx wrangler deploy --dry-run
```

Testes relevantes: `test/auction-rules.test.mjs`, `test/auction-api.test.mjs`, `test/database/auction-bids.test.mjs`.

## Ativar em produção (ações humanas)

1. Gerar um segredo aleatório de 32 bytes num terminal confiável (ex.: `openssl rand -hex 32`) e guardá-lo no cofre.
2. Registrar no Worker sem passar o valor na linha de comando: `npx wrangler secret put AUCTION_BID_SECRET` (cole quando solicitado).
3. Calcular o SHA-256 do segredo no mesmo terminal (`printf '%s' "$SEGREDO" | sha256sum`) e, depois que a migração `20261112191347_auction_bids.sql` for aplicada, registrar **só o hash** no Supabase (SQL Editor do painel do Supabase, como administrador), para o segredo não ficar no histórico do editor:

```sql
insert into private.auction_settings (id, bid_key_sha256)
values (true, '<hash-sha256-em-hexadecimal>')
on conflict (id) do update set bid_key_sha256 = excluded.bid_key_sha256, updated_at = now();
```

4. Para revogar: rodar o mesmo comando com um novo segredo e repetir o passo 2.

Sem os passos 2 e 3 os lances respondem `503 AUCTIONS_UNAVAILABLE` (falha fechada); o restante da vitrine continua funcionando.

## Criar um leilão

1. No painel, editar a vitrine, marcar o item como "Item de lance".
2. Preencher "Lance mínimo", "Encerramento do leilão" e, se quiser, "Incremento mínimo".
3. Salvar e publicar. Acompanhar em "Leilões".
