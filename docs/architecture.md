# Arquitetura proposta — 7 de novembro de 2026

Status: estudo e fundação. Cloudflare aprovada para hospedagem (ADR 0001) e Supabase Auth/Postgres para backend (ADR 0003), em 2026-11-07. Login Google via Supabase Auth aprovado (ADR 0004). Workers Free com Static Assets e templates centralizados adotados para o piloto (ADR 0005); a configuração real ainda está pendente; essas escolhas não aprovam o plano completo.

## Fronteiras

Portal autenticado → API autorizada → dados privados de vitrines e rascunhos.
Publicador no servidor → projeção pública validada → artefato imutável → hospedagem estática → visitante.
Provedor de identidade → sessão verificada no servidor; nunca identidade fornecida pelo formulário.

Backend aprovado: Supabase Auth/Postgres com RLS. Worker para orquestração permanece proposta; hospedagem Cloudflare escolhida, com configuração e volume a validar. Acesso público deve consumir apenas versões publicadas, sem consultar tabelas administrativas. Identidade, sessão, email, custos internos e credenciais não entram no artefato. O telefone comercial será público, com ciência do proprietário. `src/public-menu.mjs` implementa apenas essa projeção explícita; não implementa autorização.

## Modelo de persistência a validar

Limite de acesso aprovado (ADR 0002): equipe por vitrine, sem herança automática
para outras vitrines do mesmo proprietário. Um workspace organizacional, se existir,
não pode conceder acesso implícito a todos os seus sites a um funcionário.

Proposta revisada: `auth.users` gerenciado pelo provedor; `sites(owner_user_id,slug,template)`; `site_memberships(site_id,user_id,role)`; `drafts(site_id,revision,content)`; `publications(site_id,revision,status,artifact_hash)`; `domains(site_id,hostname,status)`; `jobs(publication_id,idempotency_key,attempt,status)`. Workspace passa a ser agrupamento opcional futuro, não fronteira global de acesso.

Cada consulta deve verificar propriedade ou associação à vitrine específica pelo usuário autenticado. RLS habilitada antes de expor tabelas; nenhuma escrita anônima; políticas USING e WITH CHECK e grants de coluna protegem o proprietário. Acesso a uma vitrine não autoriza outra. Campos de papel e associação não são editáveis pelo próprio usuário para obter privilégio. Slug já possui constraint única na migração; cadastro e reserva de hostname ainda não foram implementados. API pública não recebe service role.

## Autenticação e segurança

Usar provedor mantido; não armazenar senhas em Sheets ou repositórios. Login inicial aprovado: Google via Supabase Auth (ADR 0004). Validar assinatura, emissor, audiência e expiração do token; expirar/revogar sessões. Se usar cookies: HttpOnly, Secure, SameSite e proteção CSRF nas mutações. CORS com origem explícita não substitui autorização. Não compartilhar cookies com subdomínios de clientes; preferir domínio separado para conteúdo publicado. No MVP, sem HTML/JS customizado: texto renderizado com escape, CSP restritiva e links validados. Texto da projeção JSON não é HTML sanitizado.

Tokens GitHub e Cloudflare só no servidor/secret store; nenhum prefixo de variável pública, log, artefato, URL ou bundle. Preferir GitHub App com installation tokens temporários e permissões mínimas. Validar se a automação precisa criar repositórios e quais permissões organizacionais isso requer; GITHUB_TOKEN do workflow não é uma credencial geral da organização. Cloudflare API token restrito à zona e às operações necessárias; separar DNS e deploy. O servidor determina organização, repositório e zona por configuração; não aceita destinos arbitrários do navegador.

## Publicação e domínios

Proposta de job: autenticar → autorizar → reservar slug → capturar revisão → validar/projetar → gerar artefato sem executar conteúdo do usuário → publicar → configurar domínio → verificar DNS/TLS/HTTP → marcar ativo. Estados sugeridos: queued, building, deploying, verifying, active, failed. Persistir resultado de cada etapa e chave de idempotência por site/revisão; retries limitados com backoff para 429/5xx. Retry reutiliza repositório/projeto/registro existentes. Falha conserva a última versão ativa; rollback aponta para artefato anterior.

Templates ficam no repositório central; publicações serão artefatos separados, sem
criar repositório por cliente (ADR 0005). Dados privados não são versionados. Ocultar
um item não equivale a apagar cópias ou caches existentes. Produção planejada em
`vitrine.inspira.dev.br` para divulgação e `/loja1` para vitrines públicas;
`painel.inspira.dev.br` para administração. Ver ADR 0006: domínio informado,
mas controle da zona e configuração ainda não verificados. workers.dev fica como staging.


Domínio raiz precisa existir e ter zona sob controle autorizado; registro/renovação não são gratuitos por haver DNS grátis. Validar slug e propriedade do domínio; criar registro específico, verificar associação no provedor de hospedagem e TLS antes de liberar. DNS sozinho não configura hostname nem certificado da aplicação. Evitar wildcard inicialmente; remoção deve desfazer associação/registro de forma coordenada para evitar takeover. Reserva concorrente deve ter constraint única. Não assumir suporte a wildcard no Cloudflare Pages.

## Implementado e limites

Biblioteca de projeção, demonstração, migração SQL e testes locais implementados.
A migração contém RLS/grants por vitrine, proprietário protegido e revisão de drafts.
Testada em PostgreSQL embarcado com auth.uid() simulado; ainda não aplicada em
Supabase. Não há portal, sessão integrada, fila ou publicação real. Link wa.me abre
conversa e depende da ação do visitante; não envia mensagens automaticamente.
Cadastro/publicação ainda precisarão impor limites de custo do ADR 0005.
Catálogo e projeção de portfólio implementados, com exibição condicional na página
de divulgação; painel de edição ainda inexistente. Proposta
comercial e fluxo de orçamento em docs/commercial-offer.md; preços não publicados.

A página de divulgação foi implementada em web/; não é o portal autenticado.
Configuração estática Cloudflare validada sem deploy; ver docs/marketing-launch.md.
