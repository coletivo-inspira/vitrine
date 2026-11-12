# Modelo de Dados: Repaginação do Portal, Catálogo por Componentes, Planilha CSV e Métricas (`008-portal-redesign`)

**Feature**: `008-portal-redesign`  
**Date**: 2026-11-12  
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Contracts**: [contracts/portal-redesign-api.md](contracts/portal-redesign-api.md), [contracts/catalog-csv-contract.md](contracts/catalog-csv-contract.md)

---

## 1. Migrações Append-Only no PostgreSQL / Supabase

Conforme a Constituição e a regra de imutabilidade das migrações existentes (`202611070001_site_access.sql`, `202611110001_portal_schema.sql` e `202611120001_public_publications.sql` não são editadas), as alterações de banco da feature `008` constroem sobre o modelo de publicações persistidas em `public.publications` e `public.publication_releases` (com roteamento dinâmico `/<slug>` no Worker introduzido na PR #19) e são entregues em duas migrações incrementais com timestamps posteriores:

1. **PR (a)**: `supabase/migrations/202611120002_portal_profiles.sql` — Perfis, interesses, pedidos de customização, `sites.storefront_type`, expansão dos modelos permitidos em `sites.template`, `drafts.content`, `publications` e `publication_releases`, e políticas do bucket `catalog-images`.
2. **PR (e)**: `supabase/migrations/202611120003_site_metrics_daily.sql` — Tabela de contadores agregados `public.site_metrics_daily`, função `private.record_site_metric_batch(...)` (`SECURITY DEFINER`) validando contra `public.publications` com retenção de 13 meses e RLS de leitura exclusiva para membros da vitrine.

---

## 2. Entidades Relacionais — PR (a) (`202611120002_portal_profiles.sql`)

### 2.1. `public.profiles` (1:1 com `auth.uid()`)

| Coluna | Tipo SQL | Restrições | Descrição |
|---|---|---|---|
| `user_id` | `uuid` | `PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE` | Identificador opaco `auth.uid()` do proprietário do perfil (ADR 0004). |
| `display_name` | `text` | `NOT NULL DEFAULT '' CHECK (length(trim(display_name)) <= 120)` | Nome de exibição da pessoa no portal. |
| `business_name` | `text` | `NOT NULL DEFAULT '' CHECK (length(trim(business_name)) <= 160)` | Nome do negócio principal associado ao perfil. |
| `city` | `text` | `NOT NULL DEFAULT '' CHECK (length(trim(city)) <= 120)` | Cidade/UF do negócio. |
| `whatsapp` | `text` | `NOT NULL DEFAULT '' CHECK (whatsapp = '' OR whatsapp ~ '^[1-9][0-9]{7,14}$')` | Número comercial de WhatsApp em formato internacional de dígitos. |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Data de criação do registro de perfil. |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Atualizado automaticamente por trigger `BEFORE UPDATE`. |

- **RLS (`public.profiles`)**:
  - `profiles_owner_select`: `FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()))`
  - `profiles_owner_insert`: `FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()))`
  - `profiles_owner_update`: `FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))`
  - `REVOKE ALL ON public.profiles FROM public, anon;`

### 2.2. `public.profile_interests`

| Coluna | Tipo SQL | Restrições | Descrição |
|---|---|---|---|
| `user_id` | `uuid` | `NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` | Identificador `auth.uid()` do usuário. |
| `interest` | `text` | `NOT NULL CHECK (interest IN ('cardapio-digital', 'agendamento', 'orcamento-whatsapp', 'dominio-proprio', 'identidade-visual', 'fotografia-conteudo', 'automacao-atendimento', 'design-sob-medida'))` | Chip de interesse selecionado pelo usuário. |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Data de vínculo do interesse. |
| **PK** | `(user_id, interest)` | `PRIMARY KEY (user_id, interest)` | Garante ausência de duplicatas por usuário. |

- **RLS (`public.profile_interests`)**:
  - `profile_interests_owner_select`: `FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()))`
  - `profile_interests_owner_insert`: `FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()))`
  - `profile_interests_owner_delete`: `FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()))`
  - `REVOKE ALL ON public.profile_interests FROM public, anon;`

### 2.3. `public.customization_requests`

| Coluna | Tipo SQL | Restrições | Descrição |
|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único do pedido de customização. |
| `user_id` | `uuid` | `NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` | Proprietário do pedido (`auth.uid()`). |
| `site_id` | `uuid` | ` NULL REFERENCES public.sites(id) ON DELETE SET NULL` | Vitrine associada (opcional). |
| `storefront_type` | `text` | `NOT NULL CHECK (storefront_type IN ('food', 'art', 'photo', 'health', 'tech'))` | Área de atuação escolhida (Alimentação, Arte & design, Fotografia & mídia, Saúde, Tecnologia). |
| `template_interest` | `text` | `NOT NULL CHECK (length(trim(template_interest)) BETWEEN 1 AND 120)` | Modelo ou solução de interesse (ex.: `"portfolio-editorial"`, `"clinica-integrada"`, `"projeto-sob-medida"`). |
| `goal` | `text` | `NOT NULL CHECK (length(trim(goal)) BETWEEN 10 AND 2000)` | Objetivo detalhado da customização. |
| `reference_urls` | `jsonb` | `NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reference_urls) = 'array' AND jsonb_array_length(reference_urls) <= 10)` | Lista de links HTTPS de referência validados. |
| `desired_deadline` | `text` | `NOT NULL DEFAULT '' CHECK (length(trim(desired_deadline)) <= 120)` | Prazo desejado informado pelo usuário. |
| `status` | `text` | `NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_analise', 'respondido', 'encerrado'))` | Estado do pedido; criação pelo usuário sempre inicia em `'novo'`. |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Data de abertura do pedido. |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Data da última atualização. |

- **RLS (`public.customization_requests`)**:
  - `customization_requests_owner_select`: `FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()))`
  - `customization_requests_owner_insert`: `FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'novo')`
  - `REVOKE ALL ON public.customization_requests FROM public, anon;`
  - `GRANT SELECT, INSERT (user_id, site_id, storefront_type, template_interest, goal, reference_urls, desired_deadline) ON public.customization_requests TO authenticated;` (usuário não altera `status` arbitrariamente após criação).

### 2.4. Extensão de `public.sites`, `public.drafts`, `public.publications` e `public.publication_releases`

- `public.sites`:
  - Nova coluna `storefront_type text NOT NULL DEFAULT 'food' CHECK (storefront_type IN ('food', 'art', 'photo', 'health', 'tech'))`.
  - Atualização da constraint de `template` (`sites_template_check`) permitindo:
    - `'pizzeria-v1'` (legado compatível);
    - `'products-v1'` (Cardápio / Produtos por componentes);
    - `'booking-v1'` (Agendamento de serviços);
    - `'quote-v1'` (Lista de interesse / Orçamento).
  - `GRANT INSERT (owner_user_id, slug, name, template, storefront_type) ON public.sites TO authenticated;`
- `public.drafts`:
  - Atualização de `drafts_portal_content_check` para aceitar:
    - `template` em `('pizzeria-v1', 'products-v1', 'booking-v1', 'quote-v1')`;
    - `catalogType` opcional em `('products', 'booking', 'quote')`;
    - `storefrontType` opcional em `('food', 'art', 'photo', 'health', 'tech')`;
    - `components`, `orderFields` e `messages` como objetos JSON (`jsonb_typeof(...) = 'object'`);
    - limite inalterado de `octet_length(content::text) <= 262144` (256 KiB) e até 100 itens.
- `public.publications` e `public.publication_releases` (criadas em `202611120001_public_publications.sql` pela PR #19):
  - As constraints de `menu` / `template` nas tabelas `public.publications` e `public.publication_releases` (se houver check restrito a `'pizzeria-v1'`) são atualizadas de forma idempotente em `202611120002_portal_profiles.sql` para aceitar os novos templates (`'pizzeria-v1'`, `'products-v1'`, `'booking-v1'`, `'quote-v1'`) e os campos públicos projetados do catálogo por componentes (`catalogType`, `storefrontType`, `components`, `orderFields`, `messages`, `categories`, `items`), mantendo a leitura e gravação das publicações no Supabase (e o roteamento dinâmico `/<slug>` no Worker) em vez do antigo store apenas em memória.

### 2.5. Bucket `catalog-images` no Supabase Storage (Plano Gratuito — 1 GB)

- Bucket público para leitura (`id = 'catalog-images'`, `public = true`, `file_size_limit = 262144`, `allowed_mime_types = ARRAY['image/webp']`).
- Convenção de caminho do objeto: `<site_id>/<item_id>-<hash_curto>.webp`.
- Políticas RLS em `storage.objects` para `bucket_id = 'catalog-images'`:
  - Leitura pública (`SELECT`) para exibição nas vitrines publicadas;
  - `INSERT`, `UPDATE` e `DELETE` restritos a `authenticated` onde o primeiro segmento do caminho (`(storage.foldername(name))[1]::uuid`) pertence a `private.accessible_site_ids()`.

---

## 3. Estrutura JSON do Rascunho por Componentes (`ComponentDraftContent`)

```json
{
  "schemaVersion": 1,
  "template": "products-v1",
  "storefrontType": "food",
  "catalogType": "products",
  "slug": "pastus-demo",
  "businessName": "Pastus Fogo & Parrilla",
  "whatsapp": "5551999999999",
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
    "heroTitle": "Pastus Fogo & Parrilla",
    "welcomeText": "Escolha seus itens abaixo, revise os dados do pedido e envie pelo WhatsApp.",
    "ctaLabel": "Enviar pedido no WhatsApp",
    "whatsappTemplate": "Olá! Meu nome é {nome}. Gostaria de pedir:\n{itens}\nTotal: {total}\nEntrega/Retirada: {endereco}"
  },
  "categories": [
    {
      "id": "cortes-especiais",
      "name": "Cortes Especiais",
      "items": [
        {
          "id": "picanha-parrilla",
          "name": "Picanha na Parrilla",
          "description": "Corte nobre grelhado na lenha, acompanha farofa artesanal.",
          "imageUrl": "https://qawlpsrfewosxsfgmmpm.supabase.co/storage/v1/object/public/catalog-images/20000000-0000-0000-0000-000000000001/picanha-parrilla.webp",
          "priceCents": 8900,
          "minQuantity": 1,
          "durationMinutes": null,
          "active": true
        }
      ]
    }
  ]
}
```

### 3.1. Regras de Migração de `pizzeria-v1` (`migrateLegacyDraftContent`)

Quando um rascunho existente com `template === 'pizzeria-v1'` (e sem `catalogType` / `components` / `orderFields` / `messages`) é lido pelo editor ou compilado pela engine de publicação:
1. `catalogType` assume `'products'`.
2. `storefrontType` assume `site.storefrontType ?? 'food'`.
3. `components` assume `{ name: true, description: true, photo: false, price: true, minQuantity: false, quantitySelector: true, durationMinutes: false }`.
4. `orderFields` assume `{ date: false, timeSlots: [], deliveryOrPickup: true, customerName: true, notes: true }`.
5. `messages` assume defaults baseados em `businessName`, com `whatsappTemplate: "Olá! Tenho interesse nestes produtos:\n{itens}\nTotal estimado: {total}"`.
6. Todas as `categories` e `items` existentes (`id`, `name`, `description`, `priceCents`, `active`/`available`) são preservados integralmente.

---

## 4. Entidades de Métricas Agregadas — PR (e) (`202611120003_site_metrics_daily.sql`)

### 4.1. `public.site_metrics_daily`

| Coluna | Tipo SQL | Restrições | Descrição |
|---|---|---|---|
| `site_id` | `uuid` | `NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE` | Vitrine publicada à qual o contador pertence. |
| `metric_date` | `date` | `NOT NULL` | Data UTC do evento (`YYYY-MM-DD`). |
| `metric_hour` | `smallint` | `NOT NULL CHECK (metric_hour BETWEEN 0 AND 23)` | Hora do dia (0 a 23) para o gráfico de concentração por horário. |
| `item_key` | `text` | `NOT NULL DEFAULT '' CHECK (length(item_key) <= 64)` | `''` para métricas no nível da vitrine (`visit`, `whatsapp_order`) ou `item.id` para métricas de item (`item_view`, `item_select`). |
| `metric_name` | `text` | `NOT NULL CHECK (metric_name IN ('visit', 'item_view', 'item_select', 'whatsapp_order'))` | Tipo de métrica contabilizada. |
| `count_value` | `bigint` | `NOT NULL DEFAULT 0 CHECK (count_value >= 0)` | Contagem acumulada no bucket `(site_id, metric_date, metric_hour, item_key, metric_name)`. |
| `estimated_cents` | `bigint` | `NOT NULL DEFAULT 0 CHECK (estimated_cents >= 0)` | Soma do valor estimado em centavos (aplicável a `whatsapp_order`). |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Carimbo da última atualização do contador. |
| **PK** | `(site_id, metric_date, metric_hour, item_key, metric_name)` | `PRIMARY KEY` | Chave composta para `ON CONFLICT DO UPDATE`. |

- **Privacidade por Design (LGPD)**:
  - A tabela **não possui** colunas para endereço IP, `user_agent`, `session_id`, `cookie`, `fingerprint` ou qualquer dado pessoal.
- **Retenção de 13 meses e Upsert (`private.record_site_metric_batch`)**:
  - Função `private.record_site_metric_batch(target_slug text, events jsonb)` (ou recebendo `target_site_id uuid` resolvido a partir de `public.publications`) definida como `SECURITY DEFINER SET search_path = ''`:
    1. Verifica que a vitrine possui publicação ativa em `public.publications` e que qualquer `item_key` não vazio existe em `publications.menu->'items'`.
    2. Remove registros expirados daquela vitrine com `DELETE FROM public.site_metrics_daily WHERE site_id = target_site_id AND metric_date < (CURRENT_DATE - INTERVAL '13 months');`.
    3. Faz `INSERT INTO public.site_metrics_daily ... ON CONFLICT (site_id, metric_date, metric_hour, item_key, metric_name) DO UPDATE SET count_value = site_metrics_daily.count_value + EXCLUDED.count_value, estimated_cents = site_metrics_daily.estimated_cents + EXCLUDED.estimated_cents, updated_at = now();`.
- **RLS (`public.site_metrics_daily`)**:
  - `site_metrics_daily_member_select`: `FOR SELECT TO authenticated USING (site_id IN (SELECT private.accessible_site_ids()))`.
  - Nenhum `INSERT`/`UPDATE`/`DELETE` direto é concedido a `anon` ou `authenticated` na tabela; a escrita passa exclusivamente pela função controlada acionada pelo Worker após validar a publicação persistida em `public.publications` e os itens.
