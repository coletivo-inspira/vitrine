# Camada de acesso Supabase

Migrações:
- `migrations/202611070001_site_access.sql`: fundação multi-tenant (`public.sites`, `public.site_memberships`, `public.drafts`), RLS, grants de coluna, `private.accessible_site_ids()` e trigger `private.bump_draft_revision()`.
- `migrations/202611110001_portal_schema.sql`: constraints incrementais e idempotentes do portal administrativo (`sites_portal_slug_check` com comprimento de 3 a 40 caracteres e bloqueio adicional de `portal`, `assets`, `data`, `login`, `logout`; coluna `updated_at` e trigger `private.touch_site_updated_at()` em `public.sites`; `drafts_portal_content_check` reforçando limite `<= 262144` bytes, template `pizzeria-v1` e teto técnico de 100 itens; função `private.user_site_role(uuid)` respeitando `auth.uid()`).
- `migrations/202611120001_public_publications.sql`: persistência de publicações ativas (`public.publications`) e histórico imutável de releases por hash (`public.publication_releases`), trigger `private.archive_publication_release()` e projeção `private.project_public_menu()`.
- `migrations/202611120002_portal_profiles.sql`: perfis (`public.profiles`), interesses (`public.profile_interests`), pedidos de customização (`public.customization_requests`), `public.sites.storefront_type`, expansão de `template` (`pizzeria-v1`, `products-v1`, `booking-v1`, `quote-v1`) e catálogo por componentes (`catalogType`, `components`, `orderFields`, `messages`) com migração sem perda de rascunhos/publicações `pizzeria-v1`, e bucket `catalog-images` no Supabase Storage com RLS por membro da vitrine.

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
