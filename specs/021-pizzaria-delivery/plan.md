# Implementation Plan: Delivery para pizzarias

**Branch**: `cursor/pizzaria-delivery-0896` | **Date**: 2026-11-28 | **Spec**: [spec.md](spec.md)

## Summary

Opções de item (tamanhos, meio a meio e adicionais), taxa de entrega, forma de pagamento e links das lojas no iFood e no 99Food na vitrine pública; seção Delivery no painel com a lista privada de entregadores; "Despachar entrega" na aba Pedidos, que monta o `wa.me` do motoboy a partir da mensagem colada.

## Technical Context

- **Módulos puros compartilhados** (Worker, Node e navegador): `web/assets/item-options.mjs` (normalização, preço da unidade e descrição da escolha) e `web/assets/delivery.mjs` (links das plataformas, taxa, pagamento e entregadores).
- **Validação e publicação**: `src/portal-validation.mjs` (rascunho) e `src/publication-engine.mjs` (projeção pública e chaves privadas).
- **Vitrine**: `web/assets/storefront-renderer.mjs` (cartão, carrinho, passo dos dados e mensagem), `web/vitrine/vitrine.css`.
- **Painel**: `web/portal/item-options-field.mjs` (cartão do item), `web/portal/delivery-panel.mjs` (Configurações > Delivery), `web/portal/dispatch.mjs` e `web/portal/dispatch-panel.mjs` (aba Pedidos).
- **Banco**: nenhuma migração. Tudo fica no rascunho (`draft_content`), que só a equipe da vitrine lê.
- **Custo**: zero; nenhuma API paga, nenhum envio de mensagem. O endereço com mapa usa o Photon (busca, uso justo) e os blocos do OpenStreetMap, sempre pelo Worker, com User-Agent próprio e cache só dos blocos.

## Constitution Check

- **I. Administração privada e publicação pública**: entregadores ficam no rascunho e na lista de chaves privadas; os links das plataformas são públicos por natureza. OK.
- **II. Isolamento entre vitrines**: nada novo no banco; o rascunho já é isolado por vitrine. OK.
- **III. Credenciais apenas no servidor**: nenhuma credencial. OK.
- **IV. Custo e condições**: sem planos pagos nem APIs. OK.
- **V. Entregas verificáveis**: testes em `test/item-options.test.mjs`, `test/delivery.test.mjs` e `test/dispatch.test.mjs`. OK.

## Verificação

`npm test`, `npm run build` e capturas em 1280 e 375 px da vitrine `/forno-de-minas` e do painel via `npm run preview`. Não há deploy remoto nesta entrega além do que o merge na `main` já faz.
