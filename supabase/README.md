# Camada de acesso Supabase

Migrações:
- `migrations/202611070001_site_access.sql`: fundação multi-tenant (`public.sites`, `public.site_memberships`, `public.drafts`), RLS, grants de coluna, `private.accessible_site_ids()` e trigger `private.bump_draft_revision()`.
- `migrations/202611110001_portal_schema.sql`: constraints incrementais e idempotentes do portal administrativo (`sites_portal_slug_check` com comprimento de 3 a 40 caracteres e bloqueio adicional de `portal`, `assets`, `data`, `login`, `logout`; coluna `updated_at` e trigger `private.touch_site_updated_at()` em `public.sites`; `drafts_portal_content_check` reforçando limite `<= 262144` bytes, template `pizzeria-v1` e teto técnico de 100 itens; função `private.user_site_role(uuid)` respeitando `auth.uid()`).
- `migrations/202611120001_public_publications.sql`: persistência de publicações ativas (`public.publications`) e histórico imutável de releases por hash (`public.publication_releases`), trigger `private.archive_publication_release()` e projeção `private.project_public_menu()`.
- `migrations/202611120002_portal_profiles.sql`: perfis (`public.profiles`), interesses (`public.profile_interests`), pedidos de customização (`public.customization_requests`), `public.sites.storefront_type`, expansão de `template` (`pizzeria-v1`, `products-v1`, `booking-v1`, `quote-v1`) e catálogo por componentes (`catalogType`, `components`, `orderFields`, `messages`) com migração sem perda de rascunhos/publicações `pizzeria-v1`, e bucket `catalog-images` no Supabase Storage com RLS por membro da vitrine.
- `migrations/202611120003_site_metrics_daily.sql`: contadores diários/horários agregados sem dados pessoais (`public.site_metrics_daily`), política RLS de leitura exclusiva para membros da vitrine (`private.accessible_site_ids()`), e função `private.record_site_metric_batch` / `public.record_site_metric_batch` (`SECURITY DEFINER`) com validação contra a publicação ativa em `public.publications`, upsert atômico e retenção automática de 13 meses.
- `migrations/202611120004_fix_upsert_column_grants.sql`: concessão de `UPDATE` nas colunas de conflito para suportar `INSERT ... ON CONFLICT DO UPDATE` via PostgREST sob RLS em `public.profiles`, `public.publications` e `public.publication_releases`.
- `migrations/202611120005_multi_tenant_rbac_audit.sql`: fundação multi-inquilino (`public.tenants`), operadores da plataforma (`public.platform_operators`), trilha imutável de auditoria (`public.audit_logs`), papéis granulares por vitrine (`owner`, `admin`, `editor`, `viewer`) em `public.site_memberships`, e funções `private.is_platform_admin()`, `private.has_site_role(uuid, text[])` e `public.set_showcase_member()`.
- `migrations/202611120006_cms_pages_sections_releases.sql`: CMS institucional da plataforma (`public.platform_cms`, `public.publish_platform_cms()`, `public.read_platform_cms()`), modelos reutilizáveis (`public.templates`), módulos de seção (`public.modules`), páginas (`public.pages`), seções (`public.sections`), menus (`public.navigation_menus`), retenção das 5 últimas versões em `public.publication_releases` e restauração transacional (`public.rollback_showcase()`).
- `migrations/202611120007_assets_sandbox_domains.sql`: biblioteca de arquivos WebP (`public.assets` com limite de 100 arquivos e 20 MiB por vitrine), componentes personalizados em sandbox de origem opaca (`public.custom_components`) e domínios personalizados (`public.custom_domains`) com trava de cota gratuita em 95 domínios ativos (`private.enforce_free_custom_domain_quota()`).
- `migrations/202611120008_platform_operations.sql`: visão operacional consolidada da plataforma (`public.read_platform_overview()`) e transições auditadas de pedidos de customização para operadores.
- `migrations/20261112190500_mila_order_relay_lookup.sql`: consulta `public.lookup_mila_relay(text)` (`SECURITY DEFINER`, só `platform_admin`) que localiza, pelo código `#VI-XXXXXX-XXXX`, a vitrine publicada com pedidos pela Mila e devolve o WhatsApp do dono para o repasse, registrando `mila_relay_lookup` na auditoria (ADR 0012).
- `migrations/202611120009_profile_custom_interests.sql`: expansão da constraint de interesses em `public.profile_interests` permitindo áreas personalizadas com prefixo `outro:` e limite de até 8 interesses por perfil.
- `migrations/20261112192000_item_likes.sql`: curtidas por item da vitrine pública (Spec 011) em `public.item_likes`, uma linha por (vitrine, item, hash do visitante anônimo), sem acesso direto; funções `SECURITY DEFINER` `public.get_item_likes()` e `public.set_item_like()` (anônimas, com tetos de 30 curtidas novas por item e 150 por vitrine por hora) e `public.site_item_like_stats()` (somente equipe da vitrine via `private.accessible_site_ids()`).
- `migrations/20261112193000_city_listings.sql` (Spec 012): listagem pública por cidade (`public.city_listings`) derivada do manifesto ativo pelo trigger `private.refresh_city_listings()` em `public.publications` (só itens `offer`, `donation` e `trade` de vitrines com `locality` autorizada), view agregada `public.city_listing_cities`, leitura `anon` por coluna sem `site_id`, escrita apenas pelo trigger e reserva do endereço `por-cidade` em `public.sites` (`not valid`).
- `migrations/20261112194217_auction_bids.sql`: leilão de itens no modo lance (Spec 013) — `public.auction_lots`, `public.auction_bids`, `public.auction_blocks` com RLS de leitura só para `owner`/`admin` da vitrine (sem `visitor_key` nos grants e sem escrita direta), `private.auction_settings` com o SHA-256 do segredo do canal, `public.read_auction_board()` (quadro público sem dados pessoais), `public.place_auction_bid()` (exige o cabeçalho `x-vitrine-bid-key`; limites por visitante, prorrogação de 3 min até +60 min, termos congelados no primeiro lance e limpeza de dados pessoais 90 dias após o encerramento) e `public.void_auction_bid()` (desconsidera com motivo, bloqueia o contato e grava em `audit_logs`).

Não aplicadas remotamente. O administrador da migração deve poder criar funções
e contornar RLS; em Supabase, usar o fluxo de migração do projeto, nunca uma
chamada pública de usuário.

Com Node 24 LTS atualizado, `npm ci` instala o lockfile e `npm test` executa as
migrações em PostgreSQL embarcado PGlite 0.5.15,
com roles authenticated/anon e um auth.uid() de teste. Não executam Google OAuth,
gateway JWT, PostgREST ou serviços do Supabase. O shim existe só no teste e NÃO
deve ser aplicado no projeto real. As migrações presumem auth.users/auth.uid() reais.

Antes de produção: configurar Supabase local ou staging Free e executar a matriz
via sessões reais na Data API; conferir schemas expostos (private não exposto),
grants herdados, proprietário das funções privadas e permissões de tabelas.
Sem esse teste integrado, a camada não está liberada para usuários reais.

Cliente pode criar site com owner igual ao usuário autenticado e editar somente
seu nome. Slug, ID e proprietário são imutáveis nesta fatia. Dono pode criar/editar
rascunho; membro só lê. Gestão de membros é administrativa, sem endpoint público.
Não há RPC pública privilegiada ou uso de service role pelo cliente.

Para salvar rascunho (`PUT /api/sites/:siteId/draft` em `workers/api.mjs`), atualizar
somente `content` filtrando por `site_id` E revisão esperada (`revision`). O trigger
incrementa `revision` e atualiza `updated_at`. Exigir exatamente uma linha retornada;
revisão divergente retorna `409 Conflict` (`REVISION_CONFLICT`) com `currentRevision`,
e ausência de vínculo retorna `404 Not Found` (`SITE_NOT_FOUND`).
