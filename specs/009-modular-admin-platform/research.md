# Pesquisa e Decisões Técnicas (Phase 0): Painel Administrativo Modular e Plataforma Multi-Inquilino (`009-modular-admin-platform`)

**Feature**: `009-modular-admin-platform`
**Date**: 2026-11-12
**Spec**: [spec.md](spec.md) | **Architecture Blueprint**: [../../docs/modular-admin-architecture.md](../../docs/modular-admin-architecture.md)

---

## 1. Resumo das Decisões Consolidadas

Todas as dúvidas arquiteturais e operacionais levantadas durante o diagnóstico do repositório `d:\IA\vitrine`, a análise da referência funcional do Bar da Cássia (`coletivo-inspira/bardacassia`), o Brandbook Inspira (`https://brandbook.inspira.dev.br/`) e a exploração visual Liquid Glass (`https://liquidglassdesign.com`) foram resolvidas seguindo as opções mais seguras e alinhadas ao **Mandato de Custo Zero**.

---

## 2. Decisões por Tópico (`Decision / Rationale / Alternatives Considered`)

### 2.1. Armazenamento e Entrega de Mídia sob Planos Gratuitos (ADR 0011)
- **Decision**: Adotar como padrão imediato (sem exigir cartão de crédito) o **Supabase Storage Free (1 GB)** combinado com **compressão obrigatória no navegador para WebP ($\le 200\text{ KB}$, máx. 1600px via `OffscreenCanvas`)** e **Cache Imutável na Borda da Cloudflare (`caches.default`, `max-age=31536000, immutable`)**, mantendo na camada de serviço um **adaptador plugável para Cloudflare R2 Free (10 GB, zero taxa de saída/egress)** ativável por configuração quando a conta Cloudflare tiver o R2 habilitado.
- **Rationale**: Respeita simultaneamente o ADR 0005 (que veta exigência obrigatória de cartão no estágio inicial) e resolve o gargalo de 2 GB/mês de egress do Supabase Storage ao servir os ativos cacheados na borda da Cloudflare e limitar cada imagem a $\le 200\text{ KB}$ (0 ms de CPU de conversão no Worker). Quando a operação escalar, basta apontar o adaptador para `env.R2_BUCKET` sem refatorar o código da aplicação.
- **Alternatives considered**:
  - *Upload de imagens brutas (JPEG/PNG) com conversão no Cloudflare Worker*: rejeitada por exceder o limite de 10 ms de CPU do plano Workers Free.
  - *Servir imagens diretamente do Supabase Storage sem cache na borda*: rejeitada por esgotar os 2 GB/mês de egress gratuito rapidamente.
  - *Armazenar imagens de clientes no repositório GitHub*: rejeitada pelo ADR 0005 (polui histórico git e expõe ativos de clientes no repositório de código).

### 2.2. Roteamento Multi-Inquilino, Domínios Personalizados e Custo Zero (ADR 0008)
- **Decision**: Compilar no ato da publicação um manifesto público imutável assinado com SHA-256 (`public.publications` e `public.publication_releases`) e resolvê-lo no Cloudflare Worker tanto por caminho (`vitrine.inspira.dev.br/<slug>`) quanto por cabeçalho `Host` (`public.custom_domains`), usando `caches.default` com `Cache-Control: public, max-age=300, stale-while-revalidate=86400`. Para domínios próprios via *Cloudflare for SaaS*, impor trava rígida no servidor em **95 domínios ativos** (abaixo dos 100 gratuitos por zona) e orientar subdomínio (`cardapio.cliente.com.br`) ou DNS Cloudflare Free (*CNAME Flattening*) para domínios raiz (`cliente.com.br`).
- **Rationale**: Garante tempo de CPU $< 1,5\text{ ms}$ na borda, absorve picos de acesso no cache da CDN sem consumir a cota diária de 100.000 requisições do Worker Free e impede cobrança de excedente ($0,10/domínio acima de 100).
- **Alternatives considered**:
  - *SSR consultando múltiplas tabelas do Postgres a cada visita*: rejeitada por latência, consumo de CPU ($> 10\text{ ms}$) e risco de falha se o banco oscilar.
  - *Rebuild estático completo a cada publicação*: rejeitada por impedir alterações instantâneas em tempo de execução sem deploy.

### 2.3. CMS Institucional e Configuração em Tempo de Execução sem Deploy (ADR 0009)
- **Decision**: Gerenciar tanto a página principal da Vitrine Inspira (`public.platform_cms`) quanto as vitrines dos clientes (`public.drafts` $\rightarrow$ `public.publications`) no próprio painel `/portal/`, separando configurações em 4 escopos (Global da Plataforma, Organização/Inquilino, Vitrine e Preferências do Usuário) com pré-visualização autenticada por token HMAC (`X-Robots-Tag: noindex, nofollow`) e histórico de reversão (*rollback*) limitado às últimas 5 versões por vitrine.
- **Rationale**: Elimina a necessidade de deploys para alterar textos institucionais, banners, cases, menus, seções ou itens de cardápio, mantendo os 500 MB do Supabase Postgres protegidos pelo teto de 256 KiB por manifesto e pela retenção máxima de 5 releases históricos.
- **Alternatives considered**:
  - *Headless CMS externo (Strapi/Sanity)*: rejeitada por adicionar outra conta, outra superfície de autenticação e novos limites de plano gratuito.

### 2.4. Extensibilidade e Sandboxing de HTML/CSS/JS e Repositórios Externos (ADR 0010)
- **Decision**: Manter as customizações padrão 100% declarativas (JSON validado + CSS Custom Properties) e confinar qualquer componente personalizado em HTML/CSS/JS ou módulo importado de repositório GitHub externo a um `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer">` servido em hostname isolado (`sandbox.inspira.dev.br`) **sem** `allow-same-origin` (origem criptográfica opaca `null`), comunicando-se com a vitrine hospedeira apenas via `window.postMessage` validado por schema.
- **Rationale**: Impede matematicamente que códigos customizados leiam o cookie `__Host-vitrine_session`, acessem `localStorage`/`IndexedDB`, chamem `/api/*` com credenciais do usuário ou manipulem o DOM de outras vitrines.
- **Alternatives considered**:
  - *Shadow DOM na mesma origem*: rejeitada porque o Shadow DOM não isola o contexto de execução JavaScript nem protege cookies ou `window.parent`.
  - *Sanitização simples de `<script>` no documento principal*: rejeitada por violar a CSP `script-src 'self'` e abrir risco de XSS.

### 2.5. Alinhamento Visual: Liquid Glass vs. Brandbook Inspira
- **Decision**: Aplicar a **Regra de Contenção de Superfície**: o material *Liquid Glass* (com opacidade base de 85% para contraste WCAG 2.2 AAA — 11,2:1 no claro e 9,4:1 no escuro — e fallbacks sólidos automáticos via `@supports` e `prefers-reduced-transparency: reduce`) é exclusivo do App Shell do painel administrativo (`/portal/`). A página institucional (`/`) e todas as vitrines públicas (`/<slug>`) permanecem 100% sólidas (Papel Inspira `#F7F7F4`, Tinta `#27322E`, Laranja Pontual `#C74414`), sem `backdrop-filter` fora do cabeçalho fixo `.site-header`.
- **Rationale**: Preserva a identidade editorial do Coletivo Inspira e garante carregamento instantâneo e rolagem a 60 FPS mesmo em celulares de entrada em redes 3G/4G.
- **Alternatives considered**:
  - *Aplicar Liquid Glass nas vitrines públicas dos clientes*: rejeitada por degradar a performance de GPU em celulares básicos e reduzir o contraste sobre fotos de produtos.

### 2.6. Reconciliação das Migrações e Suíte PGlite das Issues #39–#44
- **Decision**: Consolidar as migrações da Spec 009 nos arquivos append-only `202611120005_multi_tenant_rbac_audit.sql`, `202611120006_cms_pages_sections_releases.sql`, `202611120007_assets_sandbox_domains.sql` e `202611120008_platform_operations.sql` (preservando `202611120004_fix_upsert_column_grants.sql` da PR #33), manter os testes PGlite de RBAC/auditoria/CMS/releases/domínios unificados em `test/portal-redesign-backend.test.mjs` (complementados pelas suítes modulares `test/cms-preview-rollback.test.mjs`, `test/template-inheritance-modules.test.mjs`, `test/assets-opaque-sandbox.test.mjs` e `test/custom-domains-edge-cache.test.mjs`), e separar a validação externa real de DNS/SSL (`CF_SAAS_*`) como bloqueio operacional HITL dependente do Lino.
- **Rationale**: Respeita a imutabilidade estrita de migrações já mergeadas na `main`, evita duplicar a inicialização pesada do PGlite em múltiplos arquivos redundantes e cumpre o Princípio V da Constituição (não afirmar configuração remota não verificada).
- **Alternatives considered**:
  - *Renomear migrações existentes para coincidir com o texto original das issues #39–#44*: rejeitada porque viola a regra append-only de `supabase/migrations/`.
