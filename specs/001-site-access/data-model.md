# Modelo de dados proposto

- `auth.users`: identidade gerenciada pelo Supabase, sem cópia de senhas.
- `sites`: id UUID, owner_user_id obrigatório referenciando auth.users, slug único,
  name, template e created_at. Um proprietário tem várias vitrines. Nesta fatia,
  exclusão e transferência não são expostas; owner e id não são editáveis.
- `site_memberships`: site_id + user_id como chave composta; referências para site
  e usuário. Sem papel granular nesta fatia: vínculo autoriza leitura administrativa;
  edição por membro e gestão de equipe serão especificadas separadamente.
- `drafts`: site_id único referenciando site, content JSON e revision inteiro positivo.
  Proprietário lê/escreve; membro lê somente na primeira fatia. Revision é usada
  para impedir sobrescrita silenciosa por alterações simultâneas.

Validações: slug normalizado e único, modelo suportado, conteúdo validado pela
aplicação e integridade por constraints. A biblioteca atual de projeção permanece
separada; tabelas privadas não são fonte anônima do site publicado.

RLS: owner vê seus sites e drafts; membro vê apenas sites/drafts associados.
Sem políticas de escrita de memberships para authenticated/anon. Escrita de drafts
exige owner e site acessível. Grants de colunas e políticas bloqueiam alteração de
owner, id e site_id. Não usar metadados editáveis do usuário para determinar papéis.

Assunção técnica conservadora: leitura para membros até decisão sobre permissões
de edição. Não tratar esta limitação como aprovação do desenho completo de equipe.

## Implementação local

Migração em supabase/migrations/202611070001_site_access.sql e testes em
test/database/site-access.test.mjs. Slug/template ficam imutáveis após criar;
name é a única coluna editável de sites. Drafts têm limite de 256 KiB e trigger
de revisão. Estes limites não substituem o futuro teto de itens e vitrines do piloto.
