# Modelo de Dados: Editor de Cardápio e Rascunho (`004-catalog-editor`)

**Feature**: `004-catalog-editor`  
**Date**: 2026-11-11  
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Contract**: [contracts/portal-api.md](contracts/portal-api.md)

---

## 1. Persistência Relacional (`public.drafts`)

Definida na migração base `supabase/migrations/202611070001_site_access.sql` e reforçada incrementalmente em `supabase/migrations/202611110001_portal_schema.sql`:

| Coluna | Tipo SQL | Restrições | Descrição |
|---|---|---|---|
| `site_id` | `uuid` | `PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE` | Identificador da vitrine proprietária do rascunho (relação 1:1 no MVP). |
| `content` | `jsonb` | `NOT NULL DEFAULT '{}'` + `CHECK (jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 262144)` + check incremental de metadados do template | Conteúdo estruturado do rascunho de cardápio. |
| `revision` | `integer` | `NOT NULL DEFAULT 1 CHECK (revision > 0)` | Versão monotônica incrementada automaticamente pelo trigger `private.bump_draft_revision()` em cada `UPDATE`. |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Carimbo de tempo atualizado automaticamente pelo trigger em cada `UPDATE`. |

---

## 2. Estrutura JSON do Rascunho (`DraftContent` — `pizzeria-v1`)

### 2.1. Envelope HTTP de `Draft`

```json
{
  "siteId": "20000000-0000-0000-0000-000000000001",
  "revision": 1,
  "updatedAt": "2026-11-11T00:00:00.000Z",
  "content": {
    "schemaVersion": 1,
    "template": "pizzeria-v1",
    "slug": "pizzaria-bella",
    "businessName": "Pizzaria Bella",
    "whatsapp": "5511999999999",
    "categories": [
      {
        "id": "pizzas-tradicionais",
        "name": "Pizzas Tradicionais",
        "items": [
          {
            "id": "margherita",
            "name": "Margherita",
            "description": "Molho de tomate artesanal, muçarela e manjericão fresco.",
            "priceCents": 4500,
            "available": true
          }
        ]
      }
    ]
  }
}
```

### 2.2. Regras de Validação de Campos (`src/portal-validation.mjs`)

| Campo | Tipo | Obrigatório | Regra de Validação | Código de Erro HTTP / Domínio |
|---|---|---|---|---|
| `content` (serializado) | `object` (JSON) | Sim | Objeto plano não nulo; tamanho UTF-8 `<= 262144` bytes (256 KiB). | `413` `DRAFT_TOO_LARGE` / `422` `INVALID_DRAFT` |
| `revision` (no `PUT`) | `integer` | Sim | `Number.isSafeInteger(revision) && revision >= 1`. | `400` `INVALID_REVISION` |
| `content.schemaVersion` | `integer` | Opcional (default `1`) | Quando informado, deve ser `1`. | `422` `INVALID_DRAFT` |
| `content.template` | `string` | Opcional (default `"pizzeria-v1"`) | Quando informado, deve ser exatamente `"pizzeria-v1"`. | `422` `INVALID_TEMPLATE` |
| `content.whatsapp` | `string` | Sim | Dígitos internacionais sem `+` ou máscara: `/^[1-9]\d{7,14}$/`. | `422` `INVALID_WHATSAPP` |
| `item.id` | `string` | Sim (ou gerado/validado) | Texto não vazio `<= 64` chars, único dentro do rascunho. | `422` `DUPLICATE_ITEM_ID` / `INVALID_ITEM` |
| `item.name` | `string` | Sim | Texto com `trim()` entre 1 e 160 caracteres. | `422` `INVALID_ITEM` |
| `item.priceCents` | `integer` | Sim | `Number.isSafeInteger(priceCents) && priceCents > 0` (estritamente positivo em centavos). | `422` `INVALID_PRICE_CENTS` |
| `item.active` / `item.available` | `boolean` | Opcional (default `true`) | Item é considerado ativo quando `item.active !== false && item.available !== false`. | — |
| Contagem total de itens | `integer` | Sim | Soma de todos os itens (ativos + ocultos) `<= 100`. | `422` `TOTAL_ITEMS_LIMIT_EXCEEDED` |
| Contagem de itens ativos | `integer` | Sim | Soma dos itens ativos `<= 20` (Plano Básico Gratuito). | `422` `ACTIVE_ITEMS_LIMIT_EXCEEDED` |

---

## 3. Compatibilidade com `src/public-menu.mjs`

A função `toPublicMenuDraft(content, site)` em `src/portal-validation.mjs` normaliza qualquer rascunho válido do portal (quer utilize `categories[].items` e `businessName`, quer utilize lista plana `items` e `name`) para o formato de entrada de `publicMenu(draft)` em `src/public-menu.mjs`:

- `template`: `"pizzeria-v1"`
- `slug`: `content.slug || site.slug`
- `name`: `content.name || content.businessName || site.name`
- `whatsapp`: `content.whatsapp`
- `items`: lista plana de itens com `{ id, name, priceCents, active: item.active !== false && item.available !== false }`

---

## 4. Concorrência Otimista (`revision`)

1. Leitura (`GET /api/sites/:siteId/draft`) retorna `{ draft: { siteId, revision, updatedAt, content } }`.
2. Escrita (`PUT /api/sites/:siteId/draft`) recebe `{ revision, content }`.
3. Se `revision !== currentDraft.revision`:
   - Nenhuma alteração é aplicada.
   - Retorna `409 Conflict`:
     ```json
     {
       "error": {
         "code": "REVISION_CONFLICT",
         "message": "Este rascunho foi atualizado em outra aba ou dispositivo. Recarregue antes de salvar.",
         "currentRevision": 2
       }
     }
     ```
4. Se `revision === currentDraft.revision`:
   - Atualiza `content`, incrementa `revision` em `+1`, atualiza `updatedAt` e retorna `200 OK` com o novo `draft`.
