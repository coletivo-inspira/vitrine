# Quickstart: Curtidas por Item

## Validação local

```bash
npm test
npm run build
npx wrangler deploy --dry-run
```

## Ver na vitrine e no painel (Worker em memória)

```bash
npm run build
node scripts/capture-curtidas-screenshots.mjs --serve
```

- Vitrine: `http://127.0.0.1:8788/loja1` — toque no coração de um item; recarregue e confira que o estado persiste.
- Painel: `http://127.0.0.1:8788/portal/#insights` — o servidor de captura injeta uma sessão de dono de teste local.

Sem `--serve`, o script gera as capturas em `media/curtidas/` do store do projeto (1280 e 375 px, claro e escuro).

## Chamadas diretas

```bash
curl -i -X POST http://127.0.0.1:8788/api/likes \
  -H 'origin: http://127.0.0.1:8788' -H 'content-type: application/json' \
  -H 'user-agent: Mozilla/5.0' \
  -d '{"slug":"loja1","itemId":"margherita-verace","liked":true}'
```

## Produção (ação humana)

1. Rodar o workflow **Supabase Database Migrate** com `dry_run=true`, conferir a saída e depois com `dry_run=false` para aplicar `20261112192000_item_likes.sql`.
2. Até isso acontecer, a vitrine em produção não mostra botões de curtir (degradação silenciosa).
