---
titulo: "[AutoResposta 10] Discovery WhatsApp (viabilidade, sem implementação)"
rotulos: autoresposta, documentation, depois
depende: 01
---
**Épico**: {{issue:00}} · **Prioridade**: P2 · **Complexidade**: M · **Tipo**: produto + técnico

## Contexto

O WhatsApp Business é o próximo canal desejado. A investigação foi feita por outro worker do Project e entrou na `main` pelo PR #182.

## Objetivo

Viabilidade documentada em [`docs/integrations/auto-reply/whatsapp-discovery.md`](../../integrations/auto-reply/whatsapp-discovery.md).

## Escopo

Cloud API, Embedded Signup, Tech Provider, WABA, Phone Number ID, coexistência App Business + Cloud API, permissões, janela de 24 h, consentimento, custos e limites; alternativa de saudação nativa do WhatsApp Business.

## Fora do escopo

Implementação; migração de números sem autorização expressa.

## Arquitetura já preparada

`provider` nas tabelas e no adaptador; regras centrais independentes (ADR 0017 D10). Um canal novo precisa de migração ampliando `provider`, adaptador e rota de webhook próprios e testes.

## Critérios de aceite

- [x] Documento de viabilidade publicado (PR #182) e ligado a este épico.
- [ ] Revisar a recomendação: saudação nativa assistida pelo painel no MVP; Cloud API só com decisão sobre custo e coexistência.
- [ ] Decisão de produto sobre seguir ou não.

## Dependências

{{issue:01}}.

## Referências

`docs/integrations/auto-reply/architecture.md` (Preparação para outros canais).
