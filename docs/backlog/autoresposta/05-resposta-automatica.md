---
titulo: "[AutoResposta 05] Resposta automática: regras, frequência, endereço, envio e registro"
rotulos: autoresposta, enhancement
depende: 02, 03, 04
---
**Épico**: {{issue:00}} · **Prioridade**: P0 · **Complexidade**: L · **Tipo**: técnico + produto

## Contexto

O núcleo da funcionalidade: decidir se responde, montar a mensagem com o endereço atual e enviar uma vez.

## Objetivo

Processador com regras centrais independentes do provedor.

## Escopo

`rules.mjs`, `public-url.mjs`, `processor.mjs`, `web/assets/auto-reply-message.mjs`; releitura antes do envio; 3 tentativas; `uncertain` sem reenvio; conexão em `reconnect_required` em erro de token.

## Fora do escopo

Palavras-chave, respostas condicionais, mídia na resposta.

## Requisitos

FR-005 a FR-015; RN-001 a RN-017.

## Critérios de aceite

- [x] CT-006 a CT-030 cobertos com Meta simulada.
- [ ] Primeira resposta real a uma conta testadora em staging.
- [ ] Decisão de produto sobre o aviso "resposta automática" na mensagem padrão (jurídico).

## Dependências

{{issue:02}}, {{issue:03}}, {{issue:04}}.

## Riscos

Outra automação na mesma conta responde junto; conversa vai para "Geral".

## Cenários de teste

`test/auto-reply.test.mjs`.

## Evidências para conclusão

Execução `sent` em staging com conta testadora; nenhuma mensagem a consumidor real.

## Referências

ADR 0017 D2, D6, D8.
