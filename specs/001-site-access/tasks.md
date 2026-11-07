# Tasks: Propriedade e acesso por vitrine

Input: spec.md, plan.md, research.md, data-model.md e contracts/access.md.
Autorizado pelo usuário: resolver recomendações com restrição de custo zero.

## Setup

- [x] T001 Preparar executor Postgres embarcado de testes em package.json e test/database/ para não depender de serviço pago ou Docker ativo.
- [x] T002 Registrar decisões de custo e templates centralizados em docs/adr/0005-zero-cost-mvp.md e docs/roadmap.md.

## Fundação

- [x] T003 Criar schema, constraints e índices em supabase/migrations/202611070001_site_access.sql.

## US1 — proprietário com várias vitrines

Aceite independente: dono acessa A/B; edição em A não altera B.

- [x] T004 [US1] Escrever testes de propriedade e conflito de revisão em test/database/site-access.test.mjs.
- [x] T005 [US1] Implementar grants e políticas de sites/drafts na migração supabase/migrations/202611070001_site_access.sql.

## US2 — equipe restrita à vitrine

Aceite independente: membro de A não consulta/edita B nem eleva acesso.

- [x] T006 [US2] Escrever testes de acesso cruzado, anônimo, escalada e revogação em test/database/site-access.test.mjs.
- [x] T007 [US2] Implementar função privada e políticas por site na migração supabase/migrations/202611070001_site_access.sql.

## Validação e documentação

- [x] T008 Executar npm test e atualizar specs/001-site-access/quickstart.md com evidências e limites do ambiente embarcado.
- [x] T009 Atualizar README.md e .github/workflows/ci.yml para executar os testes reproduzíveis sem segredos.

Dependências: T001 → T003 → T004/T006 → T005/T007 → T008 → T009.
T002 pode ser feito independentemente; execução aqui será sequencial.
Não há fase de deploy: nenhuma conta ou domínio está configurado.
