# Implementation Plan: Propriedade e acesso por vitrine

**Branch**: `feat/vitrine-foundation` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

## Summary

Implementar isolamento por vitrine no Supabase Auth/Postgres. Dono acessa suas
vitrines; membro tem acesso somente às associações específicas. A primeira fatia
valida banco e contratos, sem UI, convites ou deploy. Cloudflare hospeda o futuro
portal; não precisa ser provisionada para testar RLS.

## Technical Context

**Language/Version**: PostgreSQL compatível com o ambiente Supabase escolhido;
Node 22+ para a biblioteca existente. Fixar versões CLI/banco antes das migrações.
**Primary Dependencies**: Supabase Auth, Postgres, Data API e CLI local.
**Storage**: sites, site_memberships e drafts; auth.users gerenciado.
**Testing**: testes de banco/RLS e requisições com identidades distintas; node --test existente.
**Target Platform**: Supabase local para aceite; remoto somente após configuração.
**Project Type**: camada de persistência e autorização, sem nova UI.
**Performance Goals**: índices para owner e memberships; sem alegar SLA ainda.
**Constraints**: sem segredo no cliente, sem escrita pública de vínculos ou owner,
sem leitura anônima de rascunhos; manter projeção pública independente.
**Scale/Scope**: matriz de dono com duas vitrines, membro de uma, externo e visitante.

## Constitution Check

- Projeção explícita preservada; esta camada não publica artefatos.
- RLS e grants mínimos; testes negativos obrigatórios antes de liberar banco.
- Nenhum uso de service role nos caminhos comuns de usuário.
- Cotas e condições documentadas em docs/backend-research.md; serviços não provisionados.
- Aceite rastreável FR-001 a FR-007; membro somente leitura é assunção conservadora.

Revisão pré e pós desenho: sem violação identificada; resultado é documental,
não evidência de controles executados. Provedor e isolamento aprovados; login,
convites e publicação seguem fora da fatia.

## Project Structure

Documentação: spec.md, plan.md, research.md, data-model.md, contracts/access.md e
quickstart.md nesta pasta. Próximo passo do Spec Kit: gerar tasks.md e analisar
coerência antes de executar.

Arquivos previstos na implementação: supabase/config.toml,
supabase/migrations/ e supabase/tests/. Reaproveitar src/public-menu.mjs e test/.
Não criar abstração de workspace que dê acesso global aos sites do dono.

## Sequência técnica

1. Fixar ambiente local e criar schema/constraints/índices.
2. Aplicar grants e RLS por site; função privada evita ciclos entre políticas.
3. Preparar identidades/vínculos de teste e matriz negativa/positiva.
4. Verificar conflito de revisão e alteração indevida de owner/site_id.
5. Registrar execução real e só então planejar interface de login/editor.

## Complexity Tracking

Função privilegiada privada justificada pela prevenção de recursão de RLS;
escopo restrito, identidade da sessão e teste de grants são obrigatórios.
