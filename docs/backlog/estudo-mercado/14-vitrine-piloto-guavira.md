---
titulo: "[Estudo de mercado] Vitrine piloto Guavira Fotos publicada como mostruário"
rotulos: estudo-mercado, aquisicao
depende:
---
## Contexto

O estudo recomenda começar publicando o piloto Guavira Fotos e trazer portfólios
anteriores como mostruário para patrocinadores e clientes. A seção Possibilidades
(spec 015) e `content/portfolio.json` já recebem exemplos revisados por PR.

## Escopo

- Montar a vitrine `guavira-fotos` no painel com o conteúdo autorizado pela Guavira
  (serviços, pacotes, portfólio, contato).
- Usar o que já existir das issues {{issue:07}} e {{issue:08}} (SEO local, horário,
  rota e QR); sem esperar recursos que ainda não existem.
- Incluir como case em `content/portfolio.json` e em Possibilidades, com autorização
  escrita registrada no PR (sem dados privados).
- Checklist de publicação: fotos em WebP ≤ 200 KB (ADR 0011), textos revisados,
  cartão de prévia conferido.

## Fora de escopo

- Domínio próprio da Guavira (depende de plano e de #44).
- Migrar outros portfólios (uma issue por cliente, quando autorizados).

## Critérios de aceite

- [ ] Autorização da Guavira registrada antes de publicar (passo humano `BLK-GUAVIRA-01`).
- [ ] `vitrine.inspira.dev.br/guavira-fotos` abre em 1280 e 375 px, com capturas no PR.
- [ ] O link do WhatsApp abre a conversa certa num aparelho, sem enviar.
- [ ] O case aparece em Possibilidades e o teste de terminologia passa.

## Dependências

Nenhuma obrigatória. Desejável depois de {{issue:07}} `07-seo-local-e-cartao-de-previa.md`
e {{issue:08}} `08-aberto-agora-rota-e-qr-code.md`.

## Referências

- Estudo: [seção 6, item 5](../../market-study-2026.md#6-estratégias-de-aquisição).
- Spec 015, `content/portfolio.json`, ADR 0011.
