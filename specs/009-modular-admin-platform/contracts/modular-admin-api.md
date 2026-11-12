# Contrato da API: Painel Administrativo Modular, CMS Institucional, Prévia, Rollback, Ativos e Domínios (`009-modular-admin-platform`)

**Feature**: `009-modular-admin-platform`
**Date**: 2026-11-12
**Spec**: [../spec.md](../spec.md) | **Data Model**: [../data-model.md](../data-model.md)

---

## 1. Regras Globais de Autenticação, Autorização e CSRF (`workers/api.mjs`)

1. **Identidade Verificada no Servidor**: Toda rota administrativa exige JWT válido emitido pelo Supabase Auth (`ES256` / JWKS) via `Authorization: Bearer <jwt>` ou cookie `__Host-vitrine_session`. Ausência ou expiração retorna `401 Unauthorized` (`code: "UNAUTHORIZED"`).
2. **Proteção de Origem e Tipo de Conteúdo**: Todas as mutações (`POST`, `PUT`, `PATCH`, `DELETE`) exigem cabeçalho `Origin` idêntico a `new URL(request.url).origin` (`403 FORBIDDEN_ORIGIN`) e `Content-Type: application/json` (`415 UNSUPPORTED_MEDIA_TYPE`).
3. **Separação Estrita de Escopo**:
   - Rotas de **Administração da Vitrine** (`/api/sites/:siteId/*`) validam o papel do usuário naquela vitrine específica (`owner`, `admin`, `editor`, `viewer`) via RLS e `private.has_site_role`. Caso o usuário não pertença à vitrine, retornam `404 SITE_NOT_FOUND` (sem revelar existência).
   - Rotas de **Administração da Plataforma** (`/api/admin/*`) exigem `private.is_platform_admin() = true`; usuários comuns recebem `403 FORBIDDEN_PLATFORM_ADMIN`.

---

## 2. Gestão de Equipe, Páginas, Seções, Menus e Tema da Vitrine (`/api/sites/:siteId/*`)

### 2.1. `GET /api/sites/:siteId/members` & `POST /api/sites/:siteId/members` & `DELETE /api/sites/:siteId/members/:userId`
- **Papéis permitidos para mutação**: `owner` ou `admin`.
- **Body (`POST`)**:
  ```json
  {
    "userId": "20000000-0000-0000-0000-000000000002",
    "role": "editor"
  }
  ```
- **Regras**: `role` deve ser `'admin' | 'editor' | 'viewer'`. O papel `'owner'` é único e protegido contra remoção ou rebaixamento acidental. Toda alteração grava registro em `public.audit_logs`.

### 2.2. `PUT /api/sites/:siteId/structure` (Páginas, Seções, Menus e Overrides de Tema)
- **Papéis permitidos**: `owner`, `admin`, `editor`.
- **Body**:
  ```json
  {
    "expectedRevision": 3,
    "themeOverrides": {
      "accentColor": "#C74414",
      "fontPair": "editorial-syne",
      "buttonStyle": "pill"
    },
    "navigationMenus": {
      "header": [
        { "label": "Cardápio", "href": "#catalogo" },
        { "label": "Sobre", "href": "#sobre" },
        { "label": "Contato", "href": "#contato" }
      ],
      "footer": [
        { "label": "Horários", "href": "#horarios" }
      ]
    },
    "pages": [
      {
        "slug": "home",
        "title": "Início",
        "active": true,
        "sections": [
          { "id": "sec-hero", "moduleCode": "hero", "active": true, "config": { "headline": "Fornalha Artesanal" } },
          { "id": "sec-cat", "moduleCode": "catalog_grid", "active": true, "config": { "columns": 2 } },
          { "id": "sec-faq", "moduleCode": "faq", "active": true, "config": { "items": [] } }
        ]
      }
    ]
  }
  ```
- **Validações (`422`)**: contraste mínimo dos tokens de cor (`>= 4.5:1`), pares de fontes restritos à lista homologada, máximo de 5 páginas e 15 seções por página, URLs de links seguras (`#ancora`, `/caminho` ou `https://`) e tamanho total do rascunho `<= 256 KiB`.

### 2.3. `PATCH /api/sites/:siteId/quick-toggle` (Alternância Rápida estilo Bar da Cássia)
- **Papéis permitidos**: `owner`, `admin`, `editor`.
- Permite ligar/desligar rapidamente a disponibilidade de um item (`itemId`), categoria (`categoryId`) ou seção (`sectionId`) em uma única operação atômica.
- **Body**:
  ```json
  {
    "targetType": "item",
    "targetId": "item-margherita",
    "active": false
  }
  ```

---

## 3. Pré-Visualização Assinada, Publicação e Reversão (Rollback)

### 3.1. `POST /api/sites/:siteId/preview-token` & `GET /__preview/:siteId?token=<hmac>`
- **Papéis permitidos**: `owner`, `admin`, `editor`, `viewer`.
- Gera um token HMAC-SHA256 efêmero (expiração de 30 minutos) vinculado a `(siteId, userId, draftRevision, exp)`. A abertura exige sessão do mesmo usuário e acesso atual à vitrine. Salvar outra revisão invalida o link anterior.
- A rota `GET /__preview/:siteId?token=<hmac>` valida a assinatura, renderiza o rascunho usando o mesmo motor da vitrine pública e inclui obrigatoriamente os cabeçalhos:
  - `Cache-Control: no-store`
  - `X-Robots-Tag: noindex, nofollow`

### 3.2. `GET /api/sites/:siteId/releases` & `POST /api/sites/:siteId/rollback`
- **Papéis permitidos para `rollback`**: `owner`, `admin`.
- `GET /api/sites/:siteId/releases` lista até as últimas 5 versões publicadas em `public.publication_releases` (`revision`, `artifactHash`, `publishedBy`, `publishedAt`).
- `POST /api/sites/:siteId/rollback` recebe `{ "targetRevision": 2 }`, restaura o manifesto verificado daquela revisão como publicação ativa em `public.publications`, invalida o cache da borda (`caches.default`) e registra a operação em `public.audit_logs`.

---

## 4. Gestão de Ativos WebP e Domínios Personalizados

### 4.1. `GET /api/sites/:siteId/assets`, `POST /api/sites/:siteId/assets` & `DELETE /api/sites/:siteId/assets/:assetId`
- **Validações**: aceita metadados e upload de arquivo WebP já comprimido no cliente (`mime_type = 'image/webp'`, `byte_size <= 204800` para fotos de itens ou `<= 262144` teto rígido), verificando o limite de até 100 ativos / 20 MB por vitrine antes de persistir no provedor configurado (`supabase` por padrão sem cartão, ou `r2` quando habilitado).

### 4.2. `GET /api/sites/:siteId/domains`, `POST /api/sites/:siteId/domains`, `POST /api/sites/:siteId/domains/:domainId/verify` & `DELETE /api/sites/:siteId/domains/:domainId`
- **Papéis permitidos**: `owner`, `admin` (ou `platform_admin`).
- **Regras**:
  - `POST /api/sites/:siteId/domains` recebe `{ "hostname": "cardapio.cliente.com.br" }`.
  - Verifica se a cota global de domínios personalizados ativos é `< 95` (trava defensiva de custo zero para o limite de 100 do Cloudflare for SaaS). Se `>= 95`, retorna `403 DOMAIN_QUOTA_REACHED`.
  - Gera desafio TXT (`_vitrine-verify.<hostname>`) e alvo CNAME (`vitrine.inspira.dev.br`), retornando instruções passo a passo e aviso específico se for domínio ápice (`isApex: true`).

---

## 5. Administração da Plataforma e CMS Institucional (`/api/admin/*`)

*(Exclusivo para `private.is_platform_admin() = true`)*

### 5.1. `GET /api/admin/cms`, `PUT /api/admin/cms/:sectionKey` & `POST /api/admin/cms/publish`
- Permite editar e publicar em tempo de execução as seções da página principal (`hero`, `value_props`, `areas_showcase`, `templates_catalog`, `featured_cases`, `commercial_offer`, `faq`, `announcements`, `header_nav`, `footer`).
- A rota pública `GET /api/public/platform-cms` (ou injeção na borda em `/`) serve apenas `published_content` validado por `assertNoPrivateLeakage()`, com cache SWR na borda e fallback automático para `content/portfolio.json`.

### 5.2. `GET /api/admin/overview`, `PATCH /api/admin/customization-requests/:id`, `POST /api/admin/templates` & `POST /api/admin/custom-components`
- Permite aos Operadores Inspira:
  - Visualizar indicadores globais de cotas (uso do banco de 500 MB, total de ativos, total de domínios ativos sobre o teto de 95, total de vitrines).
  - Atualizar o `status` de pedidos de customização (`novo` $\rightarrow$ `em_analise` $\rightarrow$ `respondido` $\rightarrow$ `encerrado`).
  - Cadastrar/atualizar modelos (`public.templates`) e aprovar componentes personalizados em sandbox (`public.custom_components` com `bundle_hash_sha256` e origem `sandbox.inspira.dev.br`).
  - Consultar a trilha de auditoria (`GET /api/admin/audit-logs`).


### Modelos visuais

`GET /api/admin/templates` lista os modelos para operadores. `POST /api/admin/templates` recebe `code`, `name`, `defaultTokens` e `defaultSections`. Para cadastrar uma variante, envie também `baseCode` com o código de um modelo-base suportado. A variante recebe o tipo de catálogo do modelo-base.

`GET /api/sites/:siteId/structure` inclui os modelos ativos compatíveis com o catálogo. Envie `templateCode` no `PUT` para trocar o modelo visual ou `null` para voltar ao modelo original. A operação usa `expectedRevision` e preserva o conteúdo do catálogo.
