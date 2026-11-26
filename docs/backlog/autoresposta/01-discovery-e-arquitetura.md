---
titulo: "[AutoResposta 01] Discovery e arquitetura"
rotulos: autoresposta, documentation
depende:
---
**Épico**: {{issue:00}} · **Prioridade**: P0 · **Complexidade**: M · **Tipo**: técnico + produto

## Contexto

Antes de implementar, era preciso entender o repositório, a issue #48 e as regras oficiais da Meta para mensagens.

## Objetivo

Discovery registrado, arquitetura e decisões propostas.

## Escopo

- Diagnóstico do repositório (stack, autenticação, RBAC, banco, assíncrono, domínios, planos, integrações Meta, variáveis).
- Reconciliação com #48 (login unificado, `instagram_basic`, mensagens fora) e conflito com a nova necessidade.
- Comparação de setups da Meta; permissões; tokens; webhooks; envio; limites; roteamento; exclusão de dados.
- ADR 0017 (proposta), spec, plano, modelo de dados, contratos e guias.

## Fora do escopo

Discovery do WhatsApp (issue 10).

## Requisitos

Fontes oficiais citadas; nada de engenharia reversa; estado real separado de proposta.

## Critérios de aceite

- [x] `specs/019-autoresposta/research.md` com R0 a R9 e referências oficiais.
- [x] ADR 0017 proposto com D1 a D10.
- [x] Diagramas Mermaid em `docs/integrations/auto-reply/architecture.md`.
- [ ] ADR ratificado pelo Lino.

## Dependências

Nenhuma.

## Riscos

Documentação da Meta muda com frequência (limitação temporária de webhooks sem Página); revisar antes da homologação.

## Cenários de teste

Não se aplica (documento).

## Evidências para conclusão

PR inicial com os documentos e ratificação do ADR registrada.

## Referências

`specs/019-autoresposta/`, `docs/integrations/auto-reply/`, #48.
