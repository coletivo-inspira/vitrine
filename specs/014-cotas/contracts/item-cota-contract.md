# Contrato: item de cota no rascunho, na publicação e no WhatsApp

## 1. `PUT /api/sites/:siteId/draft` (sem rota nova)

O corpo segue o contrato existente do rascunho. Um item de cota válido:

```json
{
  "id": "forno",
  "name": "Forno novo da padaria",
  "priceMode": "quota",
  "priceCents": 2000,
  "quotaTotal": 50,
  "quotaFilled": 32,
  "quotaReward": "1 pão de fermentação natural por cota",
  "conditions": "Pães entregues quando a meta fechar",
  "active": true
}
```

Respostas de erro (status 422, corpo `{ "error": { "code", "message" } }` como nos demais erros de validação):

| Situação | `code` |
|---|---|
| `priceCents` ausente ou `≤ 0` | `INVALID_QUOTA_PRICE` |
| `quotaTotal` ausente, não inteiro ou fora de 2–1000 | `INVALID_QUOTA_TOTAL` |
| `quotaFilled` negativo, não inteiro ou maior que o total | `INVALID_QUOTA_FILLED` |
| `quotaReward` com mais de 240 caracteres | `INVALID_QUOTA_REWARD` |
| `quotaReward` com marcação executável ou protocolo inseguro | `INVALID_ITEM` |
| Item de cota com termo proibido (rifa, sorteio, prêmio, lucro…) | `QUOTA_PROHIBITED_TERMS` |
| Item de outro tipo com termo de rifa/sorteio | `RAFFLE_NOT_ALLOWED` |

## 2. `POST /api/sites/:siteId/publish` e `/data/vitrines/:slug/menu.json`

O artefato público inclui, para itens de cota, `priceMode`, `priceCents`, `quotaTotal`, `quotaFilled` (padrão 0), `quotaReward` (se houver) e `conditions` (se houver). Nenhum outro campo novo. Itens de outros tipos não carregam campos de cota.

## 3. Mensagem do WhatsApp

Linha por item de cota:

```text
- 3 cotas de apoio: Forno novo da padaria (3 × R$ 20,00 = R$ 60,00)
```

Linhas adicionais quando há cotas na reserva:

```text
Cotas reservadas (à parte do total): R$ 60,00     ← só quando há produtos de preço fixo ou lances
Cotas: reserva sem sorteio; o pagamento é combinado nesta conversa.
```

Quando a reserva só tem cotas (e eventualmente doações ou trocas), `{total}` do modelo de mensagem vira `R$ 60,00 em cotas`.
