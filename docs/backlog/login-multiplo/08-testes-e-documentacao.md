---
titulo: "[Login múltiplo] Testes de ponta a ponta, isolamento e documentação de operação"
rotulos: autenticacao, documentation
depende: 05, 06, 07
---
## Contexto

Fechamento da especificação 017: provar que os métodos novos não quebram o isolamento entre
vitrines, documentar a operação e preparar a ratificação do ADR 0015 e da constituição 0.2.0.

## Escopo

- Teste de isolamento com contas criadas por métodos diferentes (Google, e-mail, telefone) em
  `test/e2e-full-journey.test.mjs`: uma não lê nem altera vitrines da outra.
- Atualizar `docs/operations-guide.md`, `docs/supabase-provisioning.md` e
  `docs/google-auth-setup.md` com os métodos, segredos e passos humanos.
- Rodar `specs/017-login-multiplo/quickstart.md` e registrar a evidência.
- Rodar `/speckit-converge` para a 017 e fechar as lacunas.

## Critérios de aceite

- [ ] `npm test` e `npm run build` passam.
- [ ] Teste de isolamento por método passa.
- [ ] Documentação lista cada segredo, onde é configurado e como revogar.
- [ ] Evidência do roteiro do quickstart anexada ao PR (com os passos humanos concluídos).
- [ ] Pedido de ratificação do ADR 0015 e da constituição 0.2.0 registrado para o Lino; os
      métodos só são ligados em `AUTH_METHODS` de produção depois disso.

## Dependências

- {{issue:05}}, {{issue:06}} e {{issue:07}}.

## Referências

- `specs/017-login-multiplo/tasks.md` (T042 a T045).
