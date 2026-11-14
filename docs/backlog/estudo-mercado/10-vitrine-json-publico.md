---
titulo: "[Estudo de mercado] Endpoint público /<endereço>/vitrine.json para robôs de conversa"
rotulos: estudo-mercado, vitrine-publica, enhancement
depende: 02, 08
---
## Contexto

No plano Profissional, robôs do Manychat Pro ou do BotConversa Pro consultam a vitrine
por HTTP GET para responder horário, links e agenda sem que o dono mantenha a
informação em dois lugares. A vitrine já publica `menu.json` imutável; o
[contrato do feed do Instagram](../../instagram/interface-publica-feed.md) já define
um padrão de leitura pública com cache na borda.

## Escopo

- Rota `GET /<endereço>/vitrine.json` (e no domínio próprio, `/vitrine.json`) servida
  do snapshot publicado, sem consultar tabelas privadas (ADR 0008).
- Campos: nome, endereço canônico, descrição curta, horário e "aberto agora" calculado
  no momento (issue {{issue:08}}), endereço público, links diretos, WhatsApp público
  (o da Mila no modo Mila, ADR 0012), itens ativos com nome, preço em centavos e link,
  `updatedAt` da publicação e `schemaVersion: 1`.
- Só para vitrines com o recurso `public_json` (issue {{issue:02}}); sem o recurso,
  `404`.
- `cache-control: public, max-age=300, stale-while-revalidate=86400`, `ETag` pelo hash
  da publicação, `access-control-allow-origin: *` só nesta rota, só `GET` e `HEAD`.
- Documentar o contrato em `docs/vitrine-json.md`, com exemplo para Manychat e
  BotConversa.

## Fora de escopo

- Escrita, autenticação de robôs ou chaves de API.
- Feed do Instagram (issue [#51](https://github.com/coletivo-inspira/vitrine/issues/51)).

## Critérios de aceite

- [ ] Vitrine Profissional responde `200` com `schemaVersion: 1` e os campos do contrato.
- [ ] Vitrine `free` ou suspensa responde `404`.
- [ ] Com o modo Mila ligado, o telefone do dono não aparece no JSON (teste).
- [ ] Itens ocultos e rascunhos não publicados não aparecem.
- [ ] `If-None-Match` com o `ETag` atual responde `304`.
- [ ] `POST` responde `405`; CORS aberto só nesta rota (teste das outras rotas).
- [ ] CPU por requisição dentro do limite do Workers Free (sem consulta ao banco no caminho quente).

## Dependências

- {{issue:02}} `02-direitos-por-plano.md` e {{issue:08}} `08-aberto-agora-rota-e-qr-code.md`.

## Referências

- Estudo: [seção 6, item 2](../../market-study-2026.md#6-estratégias-de-aquisição).
- ADR 0008, ADR 0012, `docs/instagram/interface-publica-feed.md`.
