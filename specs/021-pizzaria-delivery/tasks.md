# Tasks: Delivery para pizzarias

**Input**: [spec.md](spec.md), [plan.md](plan.md). Marcadores: `[P]` pode correr em paralelo; `[USn]` história da spec.

## Fase 1 - Base

- [x] T001 Criar `specs/021-pizzaria-delivery/` e apontar `AGENTS.md` e `.specify/feature.json` para ela.

## Fase 2 - Plataformas, taxa e pagamento (US2, US3)

- [x] T010 [P] [US2] `web/assets/delivery.mjs`: links do iFood e do 99Food, taxa, pagamento e entregadores + `test/delivery.test.mjs`.
- [x] T011 [US2] Validação no rascunho e projeção pública (`deliveryPlatforms`, `orderFields.deliveryFeeCents`, `orderFields.payment`, `{pagamento}`); `deliveryCouriers` como chave privada.
- [x] T012 [US2] Vitrine: bloco "Também estamos no", links no passo dos dados, taxa no total e na mensagem, seletor de pagamento.

## Fase 3 - Opções do item (US1)

- [x] T020 [P] [US1] `web/assets/item-options.mjs` (tamanhos, meio a meio, adicionais) + `test/item-options.test.mjs`.
- [x] T021 [US1] Validação e projeção de `sizes`, `halfAndHalf` e `extras`.
- [x] T022 [US1] Cartão da vitrine com as escolhas, preço da unidade, total e linha da mensagem; tamanhos na página sem JavaScript.
- [x] T023 [US3] `web/portal/item-options-field.mjs` no cartão do item do editor.

## Fase 4 - Delivery no painel e despacho (US3, US4)

- [x] T030 [US3] `web/portal/delivery-panel.mjs` em Configurações > Delivery.
- [x] T031 [P] [US4] `web/portal/dispatch.mjs` (extração e mensagem) + `test/dispatch.test.mjs`.
- [x] T032 [US4] `web/portal/dispatch-panel.mjs` na aba Pedidos.

## Fase 5 - Endereço com mapa (US5)

- [x] T050 [P] [US5] `web/assets/geo.mjs` (projeção, link do Maps e resultado do Photon) e `src/geo-proxy.mjs` (rotas `/api/geo/`) + `test/address-map.test.mjs`.
- [x] T051 [US5] `web/assets/address-map.mjs` no campo de endereço da vitrine, link do ponto na mensagem e no despacho, opção em Configurações > Delivery e `Permissions-Policy` da vitrine.
- [x] T052 [US5] Política de privacidade: busca de endereço pelo Photon e mapa do OpenStreetMap.

## Fase 6 - Demonstração e QA

- [x] T040 Vitrine da Forno de Minas com tamanhos, meio a meio, borda, taxa e pagamento.
- [x] T041 `npm test` e capturas em 1280 e 375 px.
