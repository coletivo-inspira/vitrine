# Modelo de Dados: Motor de Publicação Determinístico e Imutável (`005-publication-engine`)

**Feature**: `005-publication-engine`  
**Date**: 2026-11-11  
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## 1. Artefato Público de Cardápio (`PublicMenuArtifact`)

Gerado exclusivamente por `compilePublicStorefront(draftContent, site)` em `src/publication-engine.mjs` através de `publicMenu()` de `src/public-menu.mjs`:

```json
{
  "schemaVersion": 1,
  "template": "pizzeria-v1",
  "slug": "loja1",
  "name": "Forno & Praça Pizzaria Artesanal",
  "whatsapp": "5511999999999",
  "currency": "BRL",
  "items": [
    {
      "id": "margherita-classica",
      "name": "Margherita Clássica",
      "description": "Molho de tomate San Marzano, muçarela fresca, manjericão e azeite extravirgem.",
      "priceCents": 4800
    }
  ],
  "categories": [
    {
      "id": "pizzas-artesanais",
      "name": "Pizzas Artesanais",
      "items": [
        {
          "id": "margherita-classica",
          "name": "Margherita Clássica",
          "description": "Molho de tomate San Marzano, muçarela fresca, manjericão e azeite extravirgem.",
          "priceCents": 4800
        }
      ]
    }
  ]
}
```

### 1.1. Invariantes de Projeção Explícita

| Campo | Tipo | Regra de Projeção |
|---|---|---|
| `schemaVersion` | `integer` | Sempre `1` (fixado por `publicMenu()`). |
| `template` | `string` | Sempre `"pizzeria-v1"` (validado por `publicMenu()`). |
| `slug` | `string` | Validado contra `^[a-z0-9]+(?:-[a-z0-9]+)*$` e lista de slugs reservados. |
| `name` | `string` | Nome público higienizado (`1..160` caracteres). |
| `whatsapp` | `string` | Somente dígitos internacionais `^[1-9]\d{7,14}$`. |
| `currency` | `string` | Sempre `"BRL"`. |
| `items` | `Array<PublicMenuItem>` | Lista plana de itens ativos (`1..20` itens), contendo apenas `{ id, name, priceCents, description? }`, 100% compatível com `whatsappLink(menu, itemId)`. |
| `categories` | `Array<PublicMenuCategory>` | Lista ordenada de categorias com ao menos 1 item ativo, contendo apenas `{ id, name, items }`. |

**Campos terminantemente proibidos no artefato público**: `owner_user_id`, `ownerUserId`, `ownerEmail`, `email`, `userId`, `siteId`, `session`, `token`, `accessToken`, `service_role`, `internalCost`, `internalNotes`, `active`, `available` e quaisquer itens com `active: false` ou `available: false`.

---

## 2. Envelope de Publicação (`PublicationRecord`)

Retornado por `POST /api/sites/:siteId/publish`:

```json
{
  "publication": {
    "siteId": "20000000-0000-0000-0000-000000000001",
    "slug": "pizza-a",
    "revision": 2,
    "hash": "a3f5c8...64_hex_chars",
    "publishedAt": "2026-11-11T20:00:00.000Z",
    "url": "/pizza-a",
    "menuUrl": "/data/vitrines/pizza-a/menu.json",
    "immutableMenuUrl": "/data/vitrines/pizza-a/releases/a3f5c8...64_hex_chars.json",
    "menu": {
      "schemaVersion": 1,
      "template": "pizzeria-v1",
      "slug": "pizza-a",
      "name": "Pizza A",
      "whatsapp": "5511999999999",
      "currency": "BRL",
      "items": [],
      "categories": []
    }
  }
}
```

---

## 3. Transição Atômica e Preservação de Publicação Anterior

1. O store mantém `publicationsBySlug` (`slug -> PublicationRecord`) e `publicationsByHash` (`${slug}:${hash} -> PublicMenuArtifact`).
2. Ao receber `POST /api/sites/:siteId/publish`:
   - Verifica autenticação (`401 UNAUTHORIZED`) e permissão na vitrine (`404 SITE_NOT_FOUND`).
   - Lê o rascunho atual (`store.getDraft(siteId, userId)`).
   - Executa `compilePublicStorefront(draft.content, site, { revision: draft.revision, siteId })`.
   - Se qualquer validação falhar (`EMPTY_PUBLIC_MENU`, `INVALID_PRICE_CENTS`, `INVALID_WHATSAPP`, `ACTIVE_ITEMS_LIMIT_EXCEEDED`, etc.), lança `PortalValidationError(422, ...)` **antes** de tocar em `publicationsBySlug`, mantendo a publicação anterior intacta.
   - Se a compilação suceder, grava o artefato imutável em `publicationsByHash` e atualiza atomicamente o ponteiro `publicationsBySlug.set(slug, publication)`.
