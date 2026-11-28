# Implementation Plan: Hierarquia da administração, licenças, cupons e limites

**Branch**: `cursor/admin-hierarquia-licencas-3200` | **Date**: 2026-11-28 | **Spec**: [spec.md](spec.md)

## Summary

Três níveis na administração (Dono, Administrador, Gestor de licenças) com uma matriz de capacidades usada pelo banco, pelo Worker e pelo painel; licenças de plano separadas da assinatura; cupons que geram licenças; limites por vitrine por cima do plano; lista de usuários e aba de processos.

## Technical Context

- **Linguagem**: JavaScript ES Modules (Node 24 nos testes, Workers na borda), SQL Postgres (Supabase).
- **Dependências**: nenhuma nova. Testes com `node --test` e PGlite (`@electric-sql/pglite`).
- **Armazenamento**: Supabase Postgres Free. Quatro tabelas pequenas (licenças, cupons, resgates, limites) e uma privada de tentativas, limpa a cada tentativa.
- **Restrições**: custo zero (ADR 0005); nenhuma chave de serviço no navegador; o Worker chama funções do banco com o token da sessão; as verificações de papel valem no banco (RLS e `security definer`), não só no Worker.

## Constitution Check

- **I. Administração privada e publicação pública**: plano, licença, cupom e limites não entram no artefato; a projeção pública não muda.
- **II. Isolamento entre vitrines**: licenças são lidas só pela dona da organização ou por quem tem `licenses.manage`; o resgate exige ser a proprietária da vitrine.
- **III. Credenciais apenas no servidor**: nenhuma credencial nova. O Dono é definido no SQL Editor, sem e-mail no repositório.
- **IV. Custo e condições verificáveis**: sem serviço novo; tentativas de resgate limitadas e limpas.
- **V. Entregas verificáveis**: testes de banco, rotas e telas; `npm test`.

## Estrutura

```text
supabase/migrations/20261128001000_platform_hierarchy_licenses.sql
src/admin/platform-roles.mjs     # matriz de capacidades (Worker e painel)
src/admin/routes.mjs             # rotas /api/admin/{me,users,operators,licenses,coupons,sites/:id/limits} e resgate
workers/api.mjs                  # roteamento, isPlatformAdmin inclui o Dono, rota de resgate
web/portal/platform-access.mjs   # GET /api/admin/me e abas por capacidade
web/portal/platform-users.mjs    # aba Usuários (detalhe, licença, limites)
web/portal/platform-team.mjs     # aba Equipe da plataforma
web/portal/platform-licenses.mjs # aba Licenças e cupons
web/portal/billing-panel.mjs     # "Tenho um cupom"
test/database/platform-hierarchy.test.mjs
test/admin-hierarchy-routes.test.mjs
```

## Decisões

1. **Papéis na tabela existente** em vez de uma tabela nova: `platform_operators` já é a fonte da verdade e as políticas atuais dependem dela. O Dono é um papel com índice único.
2. **Licença separada da assinatura** (mesma razão da opção B da ADR 0016): não interfere em `billing_attach_checkout` nem no ciclo de cobrança. A cortesia da 018 passa a ser uma licença com origem `courtesy`.
3. **Maior plano vale**: entre assinatura válida e licenças vigentes, vale o plano de maior preço mensal.
4. **Resgate devolve estado em vez de exceção** para que a tentativa fique gravada mesmo quando o código é inválido (uma exceção desfaria o registro).
5. **Valor do cupom** guardado no resgate (`monthly_price_cents × meses` do momento) para o relatório não mudar se o preço mudar.
6. **Rotas antigas** continuam com `isPlatformAdmin` (que passa a aceitar o Dono); as novas usam a capacidade.
