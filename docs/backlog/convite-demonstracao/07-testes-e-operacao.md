---
titulo: "[Convite de demonstração] Testes de ponta a ponta e guia de operação"
rotulos: aquisicao, documentation
depende: 05, 06
---
## Contexto

Fecha o épico: prova o isolamento de ponta a ponta e deixa um guia para quem vai prospectar.

## Escopo

- `test/e2e-full-journey.test.mjs`: operador cria e convida, dono aceita e publica, convida
  funcionário, funcionário edita e não publica; outra conta não vê nada.
- Guia `docs/aquisicao/convite-demonstracao.md`: montar pela planilha, texto do convite, o que
  fazer quando o dono responde "NÃO", prazos, LGPD e fotos
  ([research R4 e R5](../../../specs/018-convite-demonstracao/research.md)).
- Rodar o [quickstart](../../../specs/018-convite-demonstracao/quickstart.md) no Supabase de teste
  e anexar a evidência.

## Critérios de aceite

- [ ] Teste de ponta a ponta passa em `npm test`.
- [ ] Guia revisado pelo Lino.
- [ ] ADR 0016 ratificado antes de aplicar a migração em produção.

## Dependências

- {{issue:05}} e {{issue:06}}.

## Referências

- `specs/018-convite-demonstracao/` (tasks T044 a T047).
