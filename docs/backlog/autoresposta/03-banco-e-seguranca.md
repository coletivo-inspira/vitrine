---
titulo: "[AutoResposta 03] Banco e segurança: conexões, credenciais cifradas, execuções e frequência"
rotulos: autoresposta, enhancement
depende:
---
**Épico**: {{issue:00}} · **Prioridade**: P0 · **Complexidade**: M · **Tipo**: técnico

## Contexto

A AutoResposta precisa guardar conexão, token e execuções sem conteúdo de conversa, com isolamento por vitrine.

## Objetivo

Migração com RLS, funções e testes de permissão.

## Escopo

`supabase/migrations/20261126001000_auto_reply.sql` e `test/database/auto-reply.test.mjs` ([modelo](../../../specs/019-autoresposta/data-model.md)).

## Fora do escopo

Aplicar no Supabase remoto (issue 09).

## Requisitos

Tabelas em `private` sem grants; `service_*` só para `service_role`; auditoria; retenção de 90 dias; hash HMAC do consumidor; AES-GCM no Worker.

## Critérios de aceite

- [x] 9 testes de PGlite passando (isolamento, ativação, conta única, `state`, idempotência, frequência, desconexão, administração, manutenção).
- [ ] Teste integrado de RLS pela Data API em staging.
- [ ] Procedimento de rotação de chave com recifragem.

## Dependências

Nenhuma.

## Riscos

Volume de linhas acima de ~300 vitrines (ver `cost-analysis.md`).

## Cenários de teste

`test/database/auto-reply.test.mjs`.

## Evidências para conclusão

Migração aplicada em staging e matriz de RLS pela Data API.

## Referências

ADR 0017 D4, D7; `security-privacy.md`.
