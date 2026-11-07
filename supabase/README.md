# Camada de acesso Supabase

Migração: `migrations/202611070001_site_access.sql`. Não aplicada remotamente.
O administrador da migração deve poder criar funções e contornar RLS; em Supabase,
usar o fluxo de migração do projeto, nunca uma chamada pública de usuário.

Com Node 24 LTS atualizado, `npm ci` instala o lockfile e `npm test` executa a
migração em PostgreSQL embarcado PGlite 0.5.15,
com roles authenticated/anon e um auth.uid() de teste. Não executam Google OAuth,
gateway JWT, PostgREST ou serviços do Supabase. O shim existe só no teste e NÃO
deve ser aplicado no projeto real. A migração presume auth.users/auth.uid() reais.

Antes de produção: configurar Supabase local ou staging Free e executar a matriz
via sessões reais na Data API; conferir schemas expostos (private não exposto),
grants herdados, proprietário da função privada e permissões de tabelas.
Sem esse teste integrado, a camada não está liberada para usuários reais.

Cliente pode criar site com owner igual ao usuário autenticado e editar somente
seu nome. Slug, ID e proprietário são imutáveis nesta fatia. Dono pode criar/editar
rascunho; membro só lê. Gestão de membros é administrativa, sem endpoint público.
Não há RPC pública privilegiada ou uso de service role pelo cliente.

Para salvar rascunho, atualizar somente content filtrando por site_id E revisão
esperada. Trigger incrementa revision. Exigir exatamente uma linha retornada;
zero linhas significa conflito ou ausência de acesso, jamais sucesso.
O banco permite atualizações autorizadas sem esse filtro: o contrato de revisão
precisa ser aplicado pelo cliente/API ao implementar o editor.
