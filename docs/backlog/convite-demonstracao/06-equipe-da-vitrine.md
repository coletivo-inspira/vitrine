---
titulo: "[Convite de demonstração] Equipe da vitrine por link (administrador, funcionário, somente leitura)"
rotulos: painel, enhancement
depende: 01, 04
---
## Contexto

Os papéis `admin`, `editor` e `viewer` já existem no banco, mas a equipe só aceita o
identificador interno da pessoa e o painel não tem aba de equipe. O Lino quer que o dono chame
funcionários e administradores para a vitrine.

## Escopo

- Rotas `GET /api/sites/:id/team`, `POST` e `DELETE /api/sites/:id/invitations`
  ([contrato](../../../specs/018-convite-demonstracao/contracts/team-invitations.md)); aceite pelo
  mesmo `POST /api/invitations/accept` de {{issue:04}}.
- Aba "Equipe" (`web/portal/team-panel.mjs`): membros pelo nome de exibição, papéis em português
  ("Administrador", "Funcionário", "Somente leitura"), convites pendentes, convidar, mudar papel e
  remover.
- Esconder no painel o que o papel não pode fazer e trocar o selo "Colaborador" pelo nome do
  papel.

## Fora de escopo

- Permissões novas, como "responder pedidos e lances" para funcionário.
- Transferir a propriedade.

## Critérios de aceite

- [ ] `admin` da vitrine não convida `admin`; `editor` e `viewer` recebem `403`.
- [ ] Funcionário edita itens e não publica, inclusive por chamada direta.
- [ ] A aba não mostra UUID, e-mail nem telefone.
- [ ] Cada linha da tabela de permissões do contrato conferida por teste.
- [ ] Capturas 1280 e 375 px da aba, claro e escuro, no PR.

## Dependências

- {{issue:01}} e {{issue:04}}.

## Referências

- `specs/018-convite-demonstracao/` (spec US5, research R11, tasks T038 a T043); ADR 0002 e 0016.
