---
titulo: "[Convite de demonstração] Fim da cortesia e escolha dos itens ao publicar"
rotulos: cobranca, painel, enhancement
depende: 04
---
## Contexto

No fim dos 3 meses, se a pessoa não assinou, a vitrine volta ao Gratuito sem perder nada
(decisão do Lino em 2026-11-26). Hoje, publicar com mais itens ativos que o plano só mostra o
erro `ACTIVE_ITEMS_LIMIT_EXCEEDED`.

## Escopo

- `scheduled()` passa a chamar `purge_expired_demos` (todas as origens, convites vencidos e
  registro de `courtesy.ended`) no lugar de `purgeExpiredLinktreeDemos`.
- Avisos de 15 e 3 dias na faixa de `web/portal/billing-notice.mjs`, a partir de
  `read_courtesy_notices`.
- Em `web/portal/editor.js`, ao publicar acima do limite de itens ativos, abrir a escolha dos
  itens que ficam (os primeiros já marcados); os demais ficam ocultos, não apagados. O servidor
  continua recusando acima do limite.

## Fora de escopo

- Cobrança automática ao fim da cortesia.

## Critérios de aceite

- [ ] Com o relógio simulado: avisos em 15 e 3 dias; Gratuito no dia seguinte ao fim.
- [ ] A versão publicada continua no ar; nenhum item, bloco ou membro é apagado.
- [ ] Contratar durante a cortesia mantém o Profissional enquanto a assinatura está pendente.
- [ ] `courtesy.ended` aparece uma única vez na auditoria.
- [ ] Blocos que já existiam continuam; novos acima do limite são recusados (regra atual).

## Dependências

- {{issue:04}}.

## Referências

- `specs/018-convite-demonstracao/` (spec US4, research R6 e R9, tasks T034 a T037); ADR 0013.
