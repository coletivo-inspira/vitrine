---
titulo: "[Convite de demonstração] Aceite com 3 meses de Profissional e recusa"
rotulos: aquisicao, cobranca, painel, enhancement
depende: 03
---
## Contexto

Depois de ver a prévia, o dono decide: fica com a vitrine (e ganha 3 meses de Profissional) ou
recusa (e tudo é apagado). Esta issue fecha a conversão.

## Escopo

- Rotas `POST /api/invitations/lookup`, `POST /api/invitations/accept` (sessão obrigatória) e
  `POST /api/invitations/decline` (sem sessão, com confirmação)
  ([contrato](../../../specs/018-convite-demonstracao/contracts/invitation-flow.md)).
- `web/portal/invitation-accept.mjs`: login se preciso, "Ficar com a vitrine {nome}" com a
  cortesia (ou o aviso de cortesia já usada), aceite e editor com "Revise e publique quando
  quiser".
- Confirmação dupla de "Não tenho interesse" e "Pronto, apagamos a demonstração".
- Selo "Profissional (cortesia até dd/mm/aaaa)" em "Plano e cobrança".

## Fora de escopo

- Fim da cortesia ({{issue:05}}) e convite de equipe ({{issue:06}}).

## Critérios de aceite

- [ ] Aceite torna a pessoa proprietária, cria a organização e a cortesia de 90 dias numa única
      transação; publicar funciona logo depois.
- [ ] Aceite sem sessão `401`; corrida entre dois aceites tem um vencedor.
- [ ] Segunda demonstração aceita pela mesma conta fica no Gratuito, com o aviso.
- [ ] Recusa apaga vitrine, rascunho, fotos (inclusive no armazenamento) e convites; a auditoria
      não guarda dados de quem recusou.

## Dependências

- {{issue:03}}.

## Referências

- `specs/018-convite-demonstracao/` (spec US3, research R5 a R7, tasks T029 a T033); ADR 0016.
