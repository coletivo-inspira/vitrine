---
titulo: "[Convite de demonstração] Convite do dono e prévia sem login"
rotulos: aquisicao, painel, enhancement
depende: 02
---
## Contexto

O dono do negócio ainda não tem conta. Ele precisa ver a vitrine montada para ele antes de
decidir, sem que ela vá para buscadores ou para o endereço público.

## Escopo

- Rotas `POST /api/admin/demos/:id/invitations` (token de 256 bits mostrado uma vez, só o hash no
  banco) e `DELETE /api/admin/demos/:id/invitations/:invitationId`
  ([contrato](../../../specs/018-convite-demonstracao/contracts/demo-admin.md)).
- No painel: "Gerar convite", "Copiar link", número do negócio (não vai ao servidor), texto
  editável e "Abrir no WhatsApp" pelo `wa.me`; "Revogar".
- Página `GET /convite/:token` com a vitrine do rascunho atual, faixa "Demonstração preparada
  pela Vitrine Inspira para {negócio}" e os botões "Quero esta vitrine" e "Não tenho interesse"
  ([contrato](../../../specs/018-convite-demonstracao/contracts/invitation-flow.md)).
- Cabeçalhos `noindex, nofollow`, `private, no-store` e `no-referrer`; página única para convite
  indisponível; limitador por IP.
- `POST /portal/convite` guarda o token em `sessionStorage`, sem o token na URL do painel.

## Fora de escopo

- Aceite e recusa ({{issue:04}}).

## Critérios de aceite

- [ ] Gerar outro convite revoga o anterior.
- [ ] Os seis casos de convite indisponível têm resposta idêntica.
- [ ] A página não vaza campos privados (`assertNoPrivateLeakage`) e `/<endereço>` continua `404`.
- [ ] O token não aparece em logs nem na auditoria.
- [ ] O número do negócio não é enviado ao servidor.
- [ ] Capturas 1280 e 375 px da página do convite, claro e escuro, no PR.

## Dependências

- {{issue:02}}.

## Referências

- `specs/018-convite-demonstracao/` (spec US2 e US3, research R1 a R3 e R10, tasks T022 a T028).
