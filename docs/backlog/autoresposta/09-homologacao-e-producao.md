---
titulo: "[AutoResposta 09] Homologação, piloto e liberação controlada"
rotulos: autoresposta, pendencia-externa
depende: 03, 05, 08
---
**Épico**: {{issue:00}} · **Prioridade**: P1 · **Complexidade**: M · **Tipo**: pendência externa + técnico

## Contexto

Nada foi testado com a Meta real: só mocks. Deploy remoto não está configurado.

## Objetivo

Dev → piloto interno → homologação → aprovação Meta → liberação controlada → produção.

## Escopo

- Deploy de staging autorizado; migração aplicada; segredos no cofre.
- Piloto com contas do Coletivo (testadores).
- Homologação: revogação, reconexão, desconexão, conta sem Página, identificador dos callbacks.
- Liberação por vitrine; monitoramento; exercício de contingência.

## Fora do escopo

Plano pago de qualquer serviço.

## Critérios de aceite

- [ ] Checklist de [`production-checklist.md`](../../integrations/auto-reply/production-checklist.md) completo, com evidências.
- [ ] Exercício de contingência (desligar global e por vitrine) registrado.

## Dependências

{{issue:03}}, {{issue:05}}, {{issue:08}}.

## Riscos

Limites do plano gratuito acima de ~300 vitrines (`cost-analysis.md`).

## Cenários de teste

Roteiro de homologação do checklist.

## Evidências para conclusão

Logs de staging, execuções `sent` com contas de teste, registro do exercício.

## Referências

`operational-runbook.md`.
