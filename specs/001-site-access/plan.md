# Implementation Plan: Propriedade e acesso por vitrine

**Branch**: `feat/vitrine-foundation` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

## Summary

Implementar isolamento por vitrine no Supabase Auth/Postgres. Dono acessa suas
vitrines; membro tem acesso somente às associações específicas. A primeira fatia
valida banco e contratos, sem UI, convites ou deploy. Cloudflare hospeda o futuro
portal; não precisa ser provisionada para testar RLS.

## Technical Context

**Language/Version**: PostgreSQL compatível com o ambiente Supabase escolhido;
Node 24 LTS (mínimo 24.22.2) para biblioteca/testes. PGlite 0.5.15 no lockfile;
fixar versão do ambiente Supabase antes do aceite integrado.
**Primary Dependencies**: Supabase Auth/Postgres alvo; PGlite 0.5.15 para testes locais sem Docker.
**Storage**: sites, site_memberships e drafts; auth.users gerenciado.
**Testing**: testes de banco/RLS e requisições com identidades distintas; node --test existente.
**Target Platform**: Postgres embarcado para SQL; Supabase local/staging para aceite integrado futuro.
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
quickstart.md e tasks.md nesta pasta. A primeira execução está documentada;
o próximo passo é o aceite integrado no Supabase antes da interface.

Arquivos implementados: supabase/migrations/ e test/database/.
supabase/config.toml será necessário apenas quando inicializar o stack local.
Reaproveitar src/public-menu.mjs e test/.
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

## Login aprovado para integração posterior

Google via Supabase Auth (ADR 0004). Preparação e critérios de callback em
`docs/google-auth-setup.md`. Esta fatia ainda valida autorização com identidades
de teste e não implementa a interface de login.

## Execução inicial

Migração e testes em `supabase/migrations/` e `test/database/` implementados.
Não foi criado config.toml: nenhum stack Supabase local foi inicializado.
Ver quickstart.md para resultados e diferenças do ambiente alvo.
