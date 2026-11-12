# Implementation Plan: Repaginação do Portal em Liquid Glass, Catálogo por Componentes, Planilha CSV, Fluxo Público em Etapas e Painel de Insights

**Branch**: `008-portal-redesign` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-portal-redesign/spec.md`, audit findings in `/docs/portal-redesign-audit.md`, data model in `/specs/008-portal-redesign/data-model.md` and contracts in `/specs/008-portal-redesign/contracts/`.

## Summary

Repaginar integralmente o portal administrativo da Vitrine Inspira (`/portal/`) com arquitetura de aplicativo (barra lateral em Liquid Glass no desktop, barra inferior com ícones no celular), painel inicial inspirado no hub `inspira.dev.br`, gestão de perfil e interesses (`profiles`, `profile_interests`), assistente de nova vitrine em 3 passos, pedidos de customização (`customization_requests`) com link opcional para WhatsApp, reorganização do editor com barra de ações fixa e abas, modelo de catálogo por componentes (`products`, `booking`, `quote`) com fotos WebP no Supabase Storage, importação e exportação de cardápio por planilha CSV no cliente, fluxo público em etapas compartilhando o renderizador com a prévia do editor sobre o modelo de publicações persistidas no Supabase (`publications` e `publication_releases` com roteamento dinâmico `/<slug>` no Worker da PR #19), e coleta de métricas agregadas sem dados pessoais (`POST /api/events` + `site_metrics_daily`) com aba **Insights** no portal (`GET /api/sites/:id/insights`).

## Technical Context

**Language/Version**: JavaScript ES Modules (Node.js `>=24.12.0 <25` e Browser ES2022); HTML5 semântico; CSS3 com Custom Properties, `@supports` e Media Queries de acessibilidade; SQL PostgreSQL / PGlite `0.5.15`.

**Primary Dependencies**: Zero pacotes npm adicionais de runtime. Runtime nativo Cloudflare Workers / Node.js 24 (`Request`, `Response`, `URL`, `crypto.subtle`, `fetch`), Canvas API / `OffscreenCanvas` nativa do navegador para conversão WebP `<= 200 KB`, `navigator.sendBeacon` para lote de métricas e gráficos em SVG/CSS próprios.

**Storage**: Supabase Postgres Free (500 MB) com RLS em `public.sites`, `public.site_memberships`, `public.drafts`, `public.publications`, `public.publication_releases` (PR #19), mais as novas tabelas `public.profiles`, `public.profile_interests`, `public.customization_requests` (`202611120002_portal_profiles.sql`) e `public.site_metrics_daily` (`202611120003_site_metrics_daily.sql`), além do bucket `catalog-images` no Supabase Storage Free (1 GB).

**Testing**: `node --test`, suíte PGlite embarcada executando toda a cadeia de migrações append-only (`202611070001` -> `202611110001` -> `202611120001` -> `202611120002` -> `202611120003`), testes de contrato HTTP no Worker, testes de fixtures do parser CSV e verificação visual headless desktop/mobile claro/escuro.

**Target Platform**: Cloudflare Workers Free com Static Assets (`wrangler.jsonc` e `npx --yes wrangler@4.158.0 deploy --dry-run`).

**Project Type**: Aplicação Web multi-superfície (Divulgação estática + Portal SPA modular + Vitrine pública renderizada no Worker/estática + API Worker + Postgres RLS).

**Performance Goals**: Renderização inicial sem bloqueio de fontes (`font-display: swap`), rascunho JSON `<= 256 KiB`, imagens de catálogo convertidas no navegador para WebP `<= 200 KB` e no máximo 1 envio em lote (`sendBeacon`) por visita na vitrine pública.

**Constraints**: Custo zero estrito (ADR 0005); CSP `script-src 'self'` sem scripts inline; `auth.uid()` opaco como única chave de identidade (ADR 0004); cookie `__Host-vitrine_session` (ADR 0006); verificação de `Origin` e `Content-Type: application/json` em todas as mutações; Liquid Glass restrito ao `/portal/` (site de divulgação mantém "no glass"); migrações estritamente append-only; nenhum IP, cookie ou dado pessoal nas métricas.

**Scale/Scope**: Piloto comercial e expansão multi-área (Alimentação, Arte & design, Fotografia & mídia, Saúde e Tecnologia), até 20 itens ativos e 100 totais no plano básico gratuito, retenção de 13 meses em métricas diárias agregadas.

## Constitution Check

*GATE: Must pass before implementation and after each sequential PR.*

- **I. Administração privada e publicação pública**: Atendido. Dados de perfil, interesses, pedidos de customização, itens ocultos e métricas brutas jamais entram no artefato público `publications.menu`; `assertNoPrivateLeakage` valida a projeção explícita.
- **II. Isolamento entre vitrines**: Atendido. `profiles`, `profile_interests` e `customization_requests` exigem `user_id = (select auth.uid())`; `sites`, `drafts` e `site_metrics_daily` (leitura) exigem vínculo em `private.accessible_site_ids()`. Testes PGlite e de API verificam isolamento cruzado entre usuários.
- **III. Credenciais apenas no servidor**: Atendido. Nenhuma chave privada (`service_role`) vai ao cliente; o Worker encaminha o JWT do usuário para leituras/mutações autenticadas e usa funções `SECURITY DEFINER` de escopo mínimo com `search_path = ''` onde aplicável.
- **IV. Custo e condições verificáveis**: Atendido. Imagens WebP `<= 200 KB` no Supabase Storage Free (1 GB), contadores agregados em `site_metrics_daily` no Supabase Postgres Free (500 MB) e eventos em lote via `sendBeacon` dentro de 100k req/dia do Cloudflare Workers Free.
- **V. Entregas verificáveis**: Atendido. Trabalho decomposto em 5 PRs sequenciais (`a`, `b`, `c`, `e`, `d`) após esta PR de auditoria e especificação (`audit-spec`), com propriedade de arquivos explícita e testes automatizados em cada etapa.

## Project Structure

### Documentation (this feature)

```text
docs/
└── portal-redesign-audit.md                     # Auditoria completa de design/usabilidade com severidade e PR dona

specs/008-portal-redesign/
├── spec.md                                      # Especificação da feature (008-US1 a 008-US7, FR-001 a FR-015)
├── plan.md                                      # Este plano técnico
├── data-model.md                                # Modelo relacional (202611120002 e 202611120003) e JSON por componentes
├── tasks.md                                     # Tarefas ordenadas e divididas nas PRs sequenciais (a), (b), (c), (e), (d)
├── contracts/
│   ├── portal-redesign-api.md                   # Contratos HTTP de /api/profile, /api/customization-requests, /api/sites, /api/events, /api/sites/:id/insights
│   └── catalog-csv-contract.md                  # Contrato das planilhas CSV (UTF-8 BOM, ;, vírgula decimal, upsert)
└── checklists/
    └── requirements.md                          # Checklist de qualidade da especificação
```

### Source Code & Sequential PR Ownership (repository root)

```text
supabase/
└── migrations/
    ├── 202611120001_public_publications.sql     # (PR #19 pré-requisito) Tabelas publications e publication_releases
    ├── 202611120002_portal_profiles.sql         # [PR (a)] Perfis, interesses, pedidos, storefront_type, templates e Storage RLS
    └── 202611120003_site_metrics_daily.sql      # [PR (e)] Contadores agregados site_metrics_daily e função security definer

src/
├── portal-validation.mjs                        # [PR (a), PR (e)] Validação de perfil, pedidos, catálogo por componentes, migração pizzeria-v1 e lote de eventos
├── publication-engine.mjs                       # [PR (a), PR (c)] Projeção pública do catálogo por componentes e HTML com aviso de privacidade
└── storefront-renderer.mjs                      # [PR (c)] Renderizador compartilhado do fluxo em etapas (prévia do editor + vitrine pública)

workers/
└── api.mjs                                      # [PR (a), PR (e)] Rotas /api/profile, /api/customization-requests, /api/sites, /api/events e /api/sites/:id/insights sobre publications/publication_releases

web/
├── 404.html                                     # [PR (b)] Correção de marca oficial e suporte a theme.js
├── portal/
│   ├── index.html                               # [PR (b), PR (c), PR (e)] Shell Liquid Glass, painel, perfil, wizard, pedidos, editor em abas e aba Insights
│   ├── portal.css                               # [PR (b), PR (c), PR (e)] Tokens Liquid Glass, fallbacks, responsividade e gráficos SVG/CSS
│   ├── portal.js                                # [PR (b), PR (e)] Navegação do shell, painel inicial, perfil/interesses, wizard 3 passos, pedidos e Insights
│   ├── editor.js                                # [PR (c)] Editor por componentes, barra fixa, abas, fotos WebP e integração com CSV e prévia
│   ├── csv-catalog.js                           # [PR (c)] Parser/serializador CSV cliente sem dependências e motor de prévia/upsert
│   ├── modelo-produtos.csv                      # [PR (c)] Modelo estático de produtos (UTF-8 BOM, ;)
│   └── modelo-servicos.csv                      # [PR (c)] Modelo estático de serviços (UTF-8 BOM, ;)
└── vitrine/
    ├── index.html                               # [PR (c), PR (e)] Estrutura do fluxo público em etapas e aviso de privacidade no rodapé
    ├── vitrine.css                              # [PR (c)] Estilos do fluxo em etapas com tokens da Vitrine
    └── vitrine.js                               # [PR (c), PR (e)] Inicialização do renderizador compartilhado e envio sendBeacon para /api/events

test/
├── portal-redesign-backend.test.mjs             # [PR (a)] Testes PGlite e de contrato para perfil, interesses, pedidos, storefront_type e catálogo
├── csv-catalog.test.mjs                         # [PR (c)] Testes de fixtures do parser/exportador CSV
├── storefront-staged-flow.test.mjs              # [PR (c)] Testes do renderizador compartilhado e migração pizzeria-v1
├── site-metrics-insights.test.mjs               # [PR (e)] Testes de coleta /api/events, filtro de bots, retenção e /api/sites/:id/insights
└── portal-redesign-qa.test.mjs                  # [PR (d)] Suite integrada de QA, acessibilidade, CSS/CSP e não-regressão
```

**Structure Decision**: A implementação começa após o merge da PR #19 (que introduz `202611120001_public_publications.sql` e o roteamento dinâmico `/<slug>` no Worker) e segue a sequência estrita de PRs:
1. **PR (a)**: Backend (`202611120002_portal_profiles.sql` + `src/portal-validation.mjs` + `workers/api.mjs` + testes).
2. **PR (b)**: Shell Liquid Glass, Painel Inicial, Perfil & Interesses, Assistente 3 Passos, Pedidos de Customização e correção da logo duplicada e `404.html`.
3. **PR (c)**: Editor por Componentes, Upload WebP, Importação/Exportação por Planilha CSV, Fluxo Público em Etapas com renderizador compartilhado e migração de `pizzeria-v1`.
4. **PR (e)**: Métricas agregadas sem dados pessoais (`202611120003_site_metrics_daily.sql`, `POST /api/events`, `GET /api/sites/:id/insights`, aba **Insights** no portal, card de destaque no painel inicial e aviso de privacidade na vitrine).
5. **PR (d)**: QA visual completo desktop/celular claro/escuro, acessibilidade, testes de regressão e `wrangler deploy --dry-run`.

## Complexity Tracking

Sem violações da Constituição.
