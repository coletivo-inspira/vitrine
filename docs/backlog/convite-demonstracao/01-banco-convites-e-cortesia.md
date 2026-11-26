---
titulo: "[Convite de demonstração] Banco: convites, cortesia e papel de captação"
rotulos: aquisicao, cobranca, enhancement
depende:
---
## Contexto

A demonstração do Linktree já existe no banco (vitrine sem dono, só rascunho, 30 dias), mas o
convite pede o UUID de uma conta e não há como dar meses grátis do Profissional sem mexer na
assinatura. Esta issue cria a base de dados de todo o épico, sem rota nem tela.

## Escopo

- Migração `supabase/migrations/20261126000100_site_invitations_courtesy.sql`
  ([modelo de dados](../../../specs/018-convite-demonstracao/data-model.md)):
  - papel `growth_operator` em `platform_operators` e `private.can_manage_demos()`;
  - `sites.demo_source` com `manual` e `csv`, `demo_created_by` e `demo_created_at`;
  - `private.site_invitations` (token só como SHA-256, tipo, papel, prazo, estado, primeira
    abertura) e `private.courtesy_grants` (uma por conta);
  - políticas de `sites`, `drafts` e `assets` para o operador só em demonstração sem dono;
  - funções de demonstração, convite, aceite, recusa, equipe, cortesia, avisos, limpeza e
    operadores, todas auditadas;
  - `private.site_entitlements`: assinatura paga que vale, senão cortesia, senão Gratuito.
- Teste `test/database/site-invitations.test.mjs` em PGlite.

## Fora de escopo

- Rotas do Worker e telas ({{issue:02}} em diante).

## Critérios de aceite

- [ ] `anon` e `authenticated` sem acesso direto às duas tabelas novas.
- [ ] Usuário comum, `support_operator` e `sponsor` recebem `42501` nas funções de demonstração.
- [ ] `growth_operator` não lê nem altera vitrine com dono.
- [ ] Dois aceites simultâneos do mesmo convite: um vence, o outro recebe `INVITATION_UNAVAILABLE`.
- [ ] Segunda cortesia para a mesma conta não é criada.
- [ ] `site_entitlements` correto com cortesia vigente, vencida, com assinatura pendente e paga.
- [ ] `test/database/linktree-demo.test.mjs` e `test/database/plans-subscriptions.test.mjs`
      continuam passando.

## Dependências

- Nenhuma.

## Referências

- `specs/018-convite-demonstracao/` (data-model, research R1, R6 a R8, tasks T005 a T011); ADR 0016.
