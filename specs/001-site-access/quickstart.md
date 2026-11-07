# Validação da camada de acesso

Executado em 2026-11-07: Node 24 local e PGlite 0.5.15, sem Docker ativo.

1. `npm ci`
2. `npm test`

Resultado local: 16 testes passaram (agrupador, 10 cenários de banco e 5 de projeção).
A suíte executa a migração real `supabase/migrations/202611070001_site_access.sql`
em Postgres embarcado, com roles authenticated/anon e auth.uid() simulado apenas
no teste. Cobre leitura/edição isolada, revisão esperada, owner imutável, inserção
inválida, autoassociação negada, falta de identidade e revogação de vínculo.

PGlite tem conexão exclusiva: o teste de revisão verifica segunda escrita obsoleta,
não corrida real com duas conexões. JWT expirado, Google OAuth, gateway e PostgREST
não são simulados por esta suíte. Aplicar em Supabase local/staging Free e testar
sessões reais antes de liberar a interface. Conferir schema private não exposto,
proprietário da função e grants herdados. Não usar service role nas chamadas de usuário.

Consultar `supabase/README.md`, [contrato](contracts/access.md) e [modelo](data-model.md).
Backup e restauração, cadastro, convites e publicação continuam como etapas futuras.
