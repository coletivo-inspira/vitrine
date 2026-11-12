# Implementation Plan: Plataforma SaaS Multi-Inquilino e Painel Administrativo Modular e Configurável (`009-modular-admin-platform`)

**Branch**: `009-modular-admin-platform` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Especificação da feature em `/specs/009-modular-admin-platform/spec.md`, estudo arquitetural completo em `/docs/modular-admin-architecture.md`, decisões em `/specs/009-modular-admin-platform/research.md`, modelo de dados em `/specs/009-modular-admin-platform/data-model.md`, contratos em `/specs/009-modular-admin-platform/contracts/` e ADRs `0008` a `0011` em `/docs/adr/`.

## Summary

Evoluir a **Vitrine Inspira** para uma plataforma SaaS multi-inquilino de vitrines digitais administrada por um painel centralizado, modular e configurável em tempo de execução (`/portal/`), construindo de forma incremental sobre a fundação existente (`specs/001` a `specs/008`). A solução introduz:
1. Hierarquia multi-inquilino (`tenants`, `sites`, `site_memberships` com papéis `owner`, `admin`, `editor`, `viewer`) separada da Administração da Plataforma (`platform_operators` / `platform_admin`) e protegida por RLS com funções `SECURITY DEFINER` / `STABLE` no schema `private` e trilha imutável em `audit_logs`;
2. Administração visual CRUD sem deploy com chaveamento rápido de disponibilidade (inspirado no Bar da Cássia), pré-visualização autenticada por token HMAC (`X-Robots-Tag: noindex, nofollow`), publicação imutável assinada por SHA-256 e reversão (*rollback*) entre as últimas 5 versões publicadas;
3. CMS institucional integrado (`public.platform_cms`) para a equipe Inspira gerenciar banners, textos, seções, modelos, cases em destaque, comunicados e rodapé da página principal sem novo deploy;
4. Sistema de modelos reutilizáveis (`templates`) e módulos de seção (`modules`, `pages`, `sections`, `navigation_menus`) com resolução em cascata (*Defaults do Modelo* → *Defaults da Vertical* → *Overrides da Vitrine*);
5. Gestão de ativos com compressão WebP no navegador ($\le 200\text{ KB}$) servidos com cache imutável na borda sobre o Supabase Storage Free (1 GB, padrão imediato sem cartão) e adaptador plugável para Cloudflare R2 Free (10 GB, zero egress), mais sandboxing em 4 camadas para componentes personalizados (`<iframe sandbox="allow-scripts">` em origem opaca `null` sob `sandbox.inspira.dev.br`);
6. Gerenciamento de domínios personalizados (`public.custom_domains`) com verificação DNS (`CNAME`/`TXT`), resolução por `Host` no Cloudflare Worker com `Cache API` (`stale-while-revalidate`, CPU $< 1,5\text{ ms}$) e trava rígida em 95 domínios ativos no Cloudflare for SaaS para garantir custo operacional fixo de R$ 0/mês.

## Technical Context

**Language/Version**: JavaScript ES Modules (Node.js `>=24.12.0 <25` e Browser ES2022); HTML5 semântico; CSS3 com Custom Properties, `@supports` e Media Queries de acessibilidade; SQL PostgreSQL / PGlite `0.5.15`.

**Primary Dependencies**: Zero pacotes npm adicionais de runtime. Runtime nativo Cloudflare Workers / Node.js 24 (`Request`, `Response`, `URL`, `crypto.subtle`, `caches.default`, `fetch`), `OffscreenCanvas` / Canvas API nativa do navegador para compressão WebP `<= 200 KB`, e PGlite embarcado em `devDependencies` para testes determinísticos de banco e RLS.

**Storage**: Supabase Postgres Free (500 MB) com migrações append-only (`202611120005_multi_tenant_rbac_audit.sql`, `202611120006_cms_pages_sections_releases.sql`, `202611120007_assets_sandbox_domains.sql`), Supabase Storage Free (1 GB, bucket `catalog-images` com cache imutável na borda como padrão sem cartão) e adaptador plugável para Cloudflare R2 Free (10 GB, zero egress).

**Testing**: `node --test` com PGlite executando toda a cadeia de migrações SQL, testes de isolamento multi-inquilino e RBAC (`owner`, `admin`, `editor`, `viewer`, `platform_admin`), testes de contrato HTTP no Worker, testes de herança de templates/módulos, testes de prévia HMAC e rollback, testes de sandboxing em origem opaca e validação de trava de 95 domínios gratuitos.

**Target Platform**: Cloudflare Workers Free com Static Assets (`wrangler.jsonc` e `npx --yes wrangler@4.158.0 deploy --dry-run`).

**Project Type**: Plataforma Web SaaS multi-superfície (Site institucional administrado por CMS + Painel Administrativo Modular SPA em Liquid Glass + Vitrines públicas multi-inquilino renderizadas na borda com SWR + Sandbox isolado de extensões + API Worker + Postgres RLS).

**Performance Goals**: Tempo de CPU no Cloudflare Worker `< 1,5 ms` para vitrines públicas (limite Free de `10 ms`), rascunhos e manifestos públicos `<= 256 KiB`, imagens convertidas no cliente para WebP `<= 200 KB` (0 ms de CPU no Worker), retenção máxima de 5 releases históricos por vitrine e contraste WCAG AAA (`11,2:1` claro / `9,4:1` escuro) no painel.

**Constraints**: Custo operacional zero estrito (ADR 0005, ADR 0008, ADR 0011); CSP `script-src 'self'` no portal e nas vitrines públicas; componentes personalizados restritos a `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer">` sem `allow-same-origin` (ADR 0010); trava máxima de 95 hostnames personalizados ativos no Cloudflare for SaaS; contenção estrita do *Liquid Glass* ao `/portal/` (site institucional e vitrines públicas permanecem 100% sólidos).

**Scale/Scope**: Plataforma multi-inquilino escalável dentro dos planos gratuitos (~5.000fotos WebP no Supabase Storage 1 GB ou ~50.000 fotos no Cloudflare R2 10 GB, até 95 domínios próprios gratuitos no Cloudflare for SaaS e subcaminhos `vitrine.inspira.dev.br/<slug>` ilimitados).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked and passed after Phase 1 design.*

- **I. Administração privada e publicação pública**: Atendido. Rascunhos (`drafts`), configurações organizacionais (`tenants`), logs (`audit_logs`), operadores (`platform_operators`) e tokens de prévia nunca entram nos artefatos publicados (`publications.menu` e `platform_cms.published_content`); `assertNoPrivateLeakage()` bloqueia qualquer chave privada antes da gravação.
- **II. Isolamento entre vitrines**: Atendido. Todas as tabelas de vitrine exigem verificação por `private.accessible_site_ids()` e `private.has_site_role(site_id, roles[])` no PostgreSQL e no Worker. Membros de uma vitrine (`editor`, `viewer`, `admin`) não herdam acesso às demais vitrines do mesmo proprietário ou inquilino (ADR 0002).
- **III. Credenciais apenas no servidor**: Atendido. Segredos do Supabase, chave HMAC de prévia e tokens da Cloudflare permanecem exclusivamente no servidor/Worker. Componentes customizados rodam em origem opaca (`null`) sem acesso a cookies ou storage.
- **IV. Custo e condições verificáveis**: Atendido. Todas as cotas gratuitas (Workers 10 ms CPU / 100k req/dia, Supabase 500 MB DB / 1 GB Storage / 2 GB egress, Cloudflare R2 10 GB, Cloudflare for SaaS 100 hostnames) estão documentadas com travas programáticas no banco e na API.
- **V. Entregas verificáveis**: Atendido. O plano divide a entrega nas 5 fases sequenciais do Roadmap (alinhadas e complementares às PRs da feature `008`), com critérios de aceite e testes automatizados independentes por fase.

## Project Structure

### Documentation (this feature)

```text
docs/
├── modular-admin-architecture.md                # Estudo arquitetural completo (D1 a D8)
└── adr/
    ├── 0008-multi-tenant-edge-routing.md        # Roteamento e cache SWR no Workers Free + trava 95 domínios
    ├── 0009-dynamic-cms-immutable-snapshots.md  # CMS institucional e publicação sem deploy com rollback
    ├── 0010-opaque-sandbox-custom-components.md # Sandboxing em origem opaca para HTML/JS e GitHub externo
    └── 0011-zero-cost-media-storage.md          # WebP client-side + cache de borda sobre Supabase/R2

specs/009-modular-admin-platform/
├── spec.md                                      # Especificação funcional e histórias de usuário (009-US1 a 009-US6)
├── plan.md                                      # Este plano de implementação
├── research.md                                  # Decisões consolidadas (Phase 0)
├── data-model.md                                # Modelo relacional multi-inquilino, RBAC, CMS e domínios (Phase 1)
├── quickstart.md                                # Guia rápido de validação e cenários E2E (Phase 1)
├── tasks.md                                     # Tarefas ordenadas por fase e história de usuário (Phase 2)
├── checklists/
│   └── requirements.md                          # Checklist de qualidade da especificação
└── contracts/
    ├── modular-admin-api.md                     # Contratos HTTP de RBAC, estrutura, prévia, rollback, CMS e domínios
    └── module-manifest-schema.md                # Contrato de herança de templates, manifesto público e sandbox
```

### Source Code (repository root)

```text
supabase/
└── migrations/
    ├── 202611120005_multi_tenant_rbac_audit.sql       # [Fase 1] tenants, platform_operators, papéis expandidos e audit_logs
    ├── 202611120006_cms_pages_sections_releases.sql   # [Fase 2 & 3] platform_cms, templates, modules, pages, sections, menus e retenção de 5 releases
    └── 202611120007_assets_sandbox_domains.sql        # [Fase 4 & 5] assets, custom_components e custom_domains (trava de 95 domínios)

src/
├── portal-validation.mjs                        # Validações de papéis, páginas/seções/menus, CMS, ativos e domínios
├── publication-engine.mjs                       # Compilação em cascata (Template -> Vertical -> Overrides), SHA-256 e assertNoPrivateLeakage
├── storefront-renderer.mjs                      # Renderizador modular de seções e contêineres de sandbox opaco
├── preview-token.mjs                            # Assinatura e verificação HMAC-SHA256 para links de prévia (/ __preview/:siteId)
└── storage-adapter.mjs                          # Abstração de armazenamento (Supabase Storage padrão sem cartão + Cloudflare R2 plugável)

workers/
└── api.mjs                                      # Rotas multi-inquilino, CMS institucional, prévia HMAC, rollback, domínios por Host e Cache API SWR

web/
├── index.html, styles.css, app.js               # Página institucional alimentada por public.platform_cms com fallback estático
├── portal/
│   ├── index.html, portal.css, portal.js        # App Shell Liquid Glass, seletor de vitrines, gestão de equipe, domínios e Administração da Plataforma
│   └── editor.js                                # Editor modular de páginas/seções/menus, quick-toggle, prévia e histórico de rollback
└── vitrine/
    └── index.html, vitrine.css, vitrine.js      # Vitrine pública modular com suporte a páginas, seções e sandbox seguro

test/
├── multi-tenant-rbac-audit.test.mjs             # [Fase 1] Testes PGlite e API para tenants, papéis por vitrine, platform_admin e audit_logs
├── cms-preview-rollback.test.mjs                # [Fase 2] Testes de CMS institucional, quick-toggle, token HMAC de prévia e rollback de 5 versões
├── template-inheritance-modules.test.mjs        # [Fase 3] Testes de herança em cascata, reordenação de seções e compatibilidade retroativa
├── assets-opaque-sandbox.test.mjs               # [Fase 4] Testes de cota WebP, adaptador de storage e isolamento de iframe em origem opaca
└── custom-domains-edge-cache.test.mjs           # [Fase 5] Testes de resolução por Host, verificação DNS, trava de 95 domínios e SWR na borda
```

**Structure Decision**: A arquitetura mantém o monorepo enxuto em ES Modules sem dependências externas de runtime, evoluindo sobre a estrutura de `specs/008-portal-redesign` em 5 fases incrementais (`Fase 1` a `Fase 5`), garantindo que cada fase seja testável independentemente com `npm test` (PGlite) e `npx wrangler deploy --dry-run`.

## Complexity Tracking

Sem violações da Constituição.
