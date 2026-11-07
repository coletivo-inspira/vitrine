# Pesquisa: acesso por vitrine

Data: 2026-11-07. Decisão confirmada: Supabase Auth + Postgres (ADR 0003).

- Identidade: usar `auth.users` e o identificador validado da sessão. Não confiar
  em owner/user_id enviado pelo formulário como prova de identidade.
- Autorização: RLS para cada tabela exposta e grants mínimos; sem acesso anônimo
  administrativo. Chave publicável não substitui token de usuário.
- Propriedade: owner imutável nas operações comuns; atualização restrita a colunas
  de conteúdo. Vínculos de membros não têm escrita direta pelo cliente nesta fatia.
- Consulta de equipe: evitar ciclos entre políticas de sites e memberships.
  Usar função privada estreita de verificação, com identidade extraída da sessão,
  search_path fixo, referências qualificadas e grants mínimos; testar recursão e
  acesso direto. Funções privilegiadas não devem aceitar identidade arbitrária.
- Alternativas avaliadas: Apps Script/Sheets e Workers/D1, com mais trabalho próprio
  de identidade e isolamento; avaliação detalhada em docs/backend-research.md.

Fontes oficiais: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[JWT](https://supabase.com/docs/guides/auth/jwts),
[desenvolvimento local](https://supabase.com/docs/guides/local-development).

Método de login e UX de convites não são necessários para desenhar esta camada:
o teste usará identidades e vínculos de preparação. Serão definidos antes de
liberar cadastro e equipe no portal. Não há evidência de RLS executada ainda.
