# Contrato de Módulos, Templates e Manifesto Público (`009-modular-admin-platform`)

**Feature**: `009-modular-admin-platform`
**Date**: 2026-11-12
**Spec**: [../spec.md](../spec.md) | **Data Model**: [../data-model.md](../data-model.md)

---

## 1. Resolução em Cascata de Modelos e Sobreposições (Herança Segura)

Para permitir que cada cliente personalize sua vitrine sem quebrar quando o Coletivo Inspira evoluir um modelo base, toda vitrine é compilada aplicando uma função pura determinística de resolução em 3 camadas:

1. **Camada 1 — Defaults do Modelo Base (`templates.default_tokens` e `templates.default_sections`)**: define cores padrão, tipografia, estrutura de seções e comportamento padrão da vertical.
2. **Camada 2 — Configuração de Catálogo e Módulos da Vertical (`products`, `booking`, `quote`, `links_bio`)**: define os componentes de item ativos (`name`, `description`, `photo`, `price`, `minQuantity`, `quantitySelector`, `durationMinutes`) e campos do pedido (`date`, `timeSlots`, `deliveryOrPickup`, `customerName`, `notes`).
3. **Camada 3 — Sobreposições da Vitrine (`sites.theme_overrides`, `pages`, `sections`, `navigation_menus`, `drafts.content`)**: aplica exclusivamente as chaves permitidas pelo schema do modelo, preservando itens, fotos e textos do cliente mesmo se o modelo base ganhar novos tokens opcionais.

---

## 2. Esquema JSON do Manifesto Público Compilado (`PublicStorefrontManifest`)

O artefato salvo em `public.publications.menu` (e versionado em `public.publication_releases.menu`) possui tamanho máximo de `256 KiB`, é verificado por `assertNoPrivateLeakage()` e assinado com `artifact_hash` (`SHA-256`):

```json
{
  "schemaVersion": 2,
  "template": "products-v1",
  "templateVersion": 1,
  "storefrontType": "food",
  "catalogType": "products",
  "slug": "bar-da-cassia",
  "businessName": "Bar da Cássia",
  "whatsapp": "5551999999999",
  "theme": {
    "accentColor": "#C74414",
    "fontPair": "editorial-syne",
    "buttonStyle": "pill"
  },
  "navigation": {
    "header": [
      { "label": "Cardápio", "href": "#catalogo" },
      { "label": "Horários", "href": "#horarios" }
    ],
    "footer": [
      { "label": "Falar no WhatsApp", "href": "https://wa.me/5551999999999" }
    ]
  },
  "components": {
    "name": true,
    "description": true,
    "photo": true,
    "price": true,
    "minQuantity": false,
    "quantitySelector": true,
    "durationMinutes": false
  },
  "orderFields": {
    "date": false,
    "timeSlots": [],
    "deliveryOrPickup": true,
    "customerName": true,
    "notes": true
  },
  "messages": {
    "heroTitle": "Petiscos e bebidas geladas",
    "welcomeText": "Escolha seus itens abaixo e envie seu pedido direto para o nosso WhatsApp.",
    "ctaLabel": "Enviar pedido no WhatsApp",
    "whatsappTemplate": "Olá! Meu nome é {nome}. Gostaria de pedir:\n{itens}\nTotal estimado: {total}\nModalidade: {endereco}"
  },
  "pages": [
    {
      "slug": "home",
      "title": "Início",
      "sections": [
        { "id": "sec-hero", "moduleCode": "hero", "config": {} },
        { "id": "sec-catalog", "moduleCode": "catalog_grid", "config": { "columns": 2 } },
        {
          "id": "sec-hours",
          "moduleCode": "hours_location",
          "config": {
            "scheduleText": "Terça a Domingo, das 18h às 23h30",
            "addressText": "Centro Histórico — Porto Alegre/RS"
          }
        }
      ]
    }
  ],
  "categories": [
    { "id": "cat-porcoes", "name": "Porções", "displayOrder": 0 }
  ],
  "items": [
    {
      "id": "item-bolinho",
      "categoryId": "cat-porcoes",
      "name": "Bolinho de Bacalhau (8 un.)",
      "description": "Crocante por fora e macio por dentro, acompanha limão.",
      "priceCents": 3800,
      "imageUrl": "https://qawlpsrfewosxsfgmmpm.supabase.co/storage/v1/object/public/catalog-images/site-1/bolinho.webp",
      "minQuantity": 1,
      "durationMinutes": null
    }
  ],
  "sandboxWidgets": []
}
```

---

## 3. Contrato de Isolamento para Componentes em Sandbox (`sandboxWidgets`)

Quando uma seção utiliza `moduleCode: "custom_sandbox"`, o manifesto público referencia apenas metadados públicos imutáveis aprovados:

```json
{
  "widgetId": "wdg-calculadora-frete",
  "sandboxSrc": "https://sandbox.inspira.dev.br/embed/wdg-calculadora-frete?v=1.0.0",
  "bundleHashSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "title": "Calculadora de Entrega",
  "maxHeightPx": 420,
  "allowedEvents": ["resize", "append_order_note"]
}
```

- **Atributos obrigatórios do elemento `<iframe>` renderizado**:
  - `sandbox="allow-scripts"` (proibido incluir `allow-same-origin`, `allow-top-navigation` ou `allow-popups-to-escape-sandbox`).
  - `referrerpolicy="no-referrer"`
  - `loading="lazy"`
- **Mensagens `postMessage` aceitas pelo hospedeiro**:
  - `{"type": "vitrine:sandbox:resize", "widgetId": "...", "heightPx": 320}` (limitado a `120 <= heightPx <= 1200`).
  - `{"type": "vitrine:sandbox:append_order_note", "widgetId": "...", "note": "..."}` (string de texto puro `<= 280` caracteres, escapada antes de ser exibida no resumo do pedido).
