---
titulo: "[Convite de demonstração] Papel de captação e área \"Demonstrações\""
rotulos: aquisicao, painel, enhancement
depende: 01
---
## Contexto

Só o `platform_admin` cria demonstrações, e só do Linktree. O Lino quer montar demonstrações à
mão ou por planilha e, no futuro, delegar isso a outras pessoas sem abrir cobrança, CMS e
vitrines dos clientes.

## Escopo

- Rotas `GET`/`POST /api/admin/demos`, `POST /api/admin/demos/:id/extend`,
  `DELETE /api/admin/demos/:id` e `GET`/`POST`/`DELETE /api/admin/operators`
  ([contrato](../../../specs/018-convite-demonstracao/contracts/demo-admin.md)).
- Rotas `draft`, `structure` e `assets` abertas ao operador só em demonstração sem dono;
  `publish` continua recusando.
- Importação do Linktree também para o `growth_operator`.
- Tela "Demonstrações" (`web/portal/demo-admin.mjs`): lista com situação e prazo, criar,
  prorrogar (até 90 dias), apagar e abrir no editor com a faixa "Demonstração: não publicada".
- Tela "Operadores" só para `platform_admin`.
- Rótulos de auditoria em `web/portal/platform-cms.js`.

## Fora de escopo

- Convite ({{issue:03}}).

## Critérios de aceite

- [ ] `403` para sessão comum, `support_operator` e `sponsor` em todas as rotas novas.
- [ ] Operador de captação vê só "Demonstrações"; vitrine com dono responde `404` para ele.
- [ ] Demonstração criada responde `404` no endereço público e não mostra "Publicar".
- [ ] Prorrogação para no limite de 90 dias desde a criação.
- [ ] Capturas 1280 e 375 px, claro e escuro, no PR.

## Dependências

- {{issue:01}}.

## Referências

- `specs/018-convite-demonstracao/` (spec US1 e US6, tasks T012 a T021); ADR 0016.
