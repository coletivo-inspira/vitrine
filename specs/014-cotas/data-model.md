# Modelo de dados: item de cota (`014-cotas`)

Sem tabela nova e sem migração. O item continua dentro de `drafts.content` (rascunho) e de `publications.menu` (artefato público), como os modos `offer`, `donation` e `trade`.

## Rascunho (`drafts.content.categories[].items[]`)

| Campo | Tipo | Regra | Erro (422) |
|---|---|---|---|
| `priceMode` | `"quota"` | Novo valor em `ALLOWED_ITEM_PRICE_MODES` | `INVALID_PRICE_MODE` |
| `priceCents` | inteiro | `> 0` (valor de **cada** cota, em centavos) | `INVALID_QUOTA_PRICE` |
| `quotaTotal` | inteiro | `2 ≤ quotaTotal ≤ 1000`, obrigatório | `INVALID_QUOTA_TOTAL` |
| `quotaFilled` | inteiro | opcional; `0 ≤ quotaFilled ≤ quotaTotal` (padrão 0) | `INVALID_QUOTA_FILLED` |
| `quotaReward` | texto | opcional; até 240 caracteres; sem marcação executável | `INVALID_QUOTA_REWARD` / `INVALID_ITEM` |
| `conditions` | texto | reaproveitado; até 240 caracteres | `INVALID_ITEM_CONDITIONS` |
| `name`, `description`, `section`, `tradeFor`, `quotaReward`, `conditions` | texto | sem termos de rifa/sorteio em qualquer item; sem termos de prêmio/retorno financeiro em item de cota | `RAFFLE_NOT_ALLOWED` / `QUOTA_PROHIBITED_TERMS` |

Valores derivados (não armazenados):

- **Saldo** = `quotaTotal − quotaFilled`.
- **Meta** = `priceCents × quotaTotal`.
- **Máximo por reserva** = `min(saldo, 99)`.

## Artefato público (`publications.menu.items[]` e `categories[].items[]`)

Campos adicionados a `ALLOWED_ITEM_KEYS` do publicador: `quotaTotal`, `quotaFilled`, `quotaReward`. Só são projetados quando `priceMode === "quota"`; `quotaFilled` ausente vira `0`. Itens de outros modos com campos de cota esquecidos no rascunho não os publicam. `assertNoPrivateLeakage` continua rejeitando qualquer chave fora da lista.

```json
{
  "id": "forno",
  "name": "Forno novo da padaria",
  "priceMode": "quota",
  "conditions": "Pães entregues quando a meta fechar",
  "quotaTotal": 50,
  "quotaFilled": 32,
  "quotaReward": "1 pão de fermentação natural por cota",
  "description": "Ajude a comprar o forno que vai dobrar a produção.",
  "priceCents": 2000
}
```

## Estado no navegador (vitrine pública)

`StorefrontRenderer.cart` guarda `itemId → quantidade de cotas`. `getCartTotal()` soma só itens de preço fixo; `getQuotaTotal()` soma as cotas; `getQuotaCount()` conta as cotas reservadas. Nada disso é enviado ao servidor; a reserva sai apenas na mensagem `wa.me`.

## Regras compartilhadas

`web/assets/quota-rules.mjs` concentra limites (`QUOTA_MIN_TOTAL`, `QUOTA_MAX_TOTAL`, `QUOTA_MAX_PER_SELECTION`, `QUOTA_TEXT_MAX_LENGTH`), avisos fixos e `findProhibitedQuotaTerm()`. É importado pelo validador do servidor (`src/portal-validation.mjs`), pelo editor (`web/portal/editor.js`) e pela vitrine (`web/assets/storefront-renderer.mjs`), para que painel e API apliquem a mesma lista.
