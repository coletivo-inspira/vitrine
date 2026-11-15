# Arquitetura proposta — 7 de novembro de 2026

Status: estudo e fundação. Cloudflare aprovada para hospedagem (ADR 0001) e Supabase Auth/Postgres para backend (ADR 0003), em 2026-11-07. Login Google via Supabase Auth aprovado (ADR 0004). Workers Free com Static Assets e templates centralizados adotados para o piloto (ADR 0005); a configuração real ainda está pendente; essas escolhas não aprovam o plano completo.

## Fronteiras

Portal autenticado → API autorizada → dados privados de vitrines e rascunhos.
Publicador no servidor → projeção pública validada → artefato imutável → hospedagem estática → visitante.
Provedor de identidade → sessão verificada no servidor; nunca identidade fornecida pelo formulário.

Backend aprovado: Supabase Auth/Postgres com RLS. Worker para orquestração permanece proposta; hospedagem Cloudflare escolhida, com configuração e volume a validar. Acesso público deve consumir apenas versões publicadas, sem consultar tabelas administrativas. Identidade, sessão, email, custos internos e credenciais não entram no artefato. O telefone comercial será público, com ciência do proprietário, exceto quando ele liga "Receber pedidos pela Mila" (ADR 0012): aí o artefato leva o WhatsApp da Mila e um código da vitrine, e o telefone do dono fica só no rascunho, consultado por operadores via `lookup_mila_relay`, com auditoria. `src/public-menu.mjs` implementa apenas essa projeção explícita; não implementa autorização.

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

## Direitos por plano (ADR 0013)

Implementado na migração `20261115000100_plans_subscriptions.sql` e em
`src/entitlements.mjs`. `public.plans` é semeada a partir de `content/plans.json`;
`public.subscriptions` guarda uma assinatura por tenant. `private.site_entitlements(site_id)`
devolve plano, limites e recursos; vitrine sem tenant ou sem assinatura que valha
(`active`, ou `past_due`/`grace` dentro da tolerância) recebe `free`. O Worker lê pela
RPC `read_site_entitlements` (equipe da vitrine, com o token do usuário) ou
`service_site_entitlements` (só `service_role`, para rotas sem sessão). Só o
`platform_admin` (RPC `set_tenant_subscription`) e o `service_role` escrevem; toda
mudança vai para `audit_logs`. A publicação também é barrada no banco acima dos itens
ativos do plano.

Checagens reutilizáveis em `src/entitlements.mjs`:

- `loadSiteEntitlements(store, siteId, { token, env })`: sem `token`, usa o
  `SUPABASE_SERVICE_ROLE_KEY`; qualquer falta de dado vale `free`.
- `requirePlanFeature(entitlements, feature)`: lança `403 PLAN_FEATURE_REQUIRED` com
  `feature` e `requiredPlan` (`{ code, name }` do plano mais barato que libera). O
  tratamento de erros do Worker já responde o JSON.
- `assertItemBlocksAllowed` e `draftLimits` cobrem blocos de itens e itens ativos.

Já aplicados: itens ativos (rascunho, prévia e publicação), blocos de itens e domínio
próprio (`custom_domain`) e `vitrine.json` (`public_json`, issue #120): o direito é
gravado no snapshot como `features.publicJson` na publicação e a suspensão é conferida
pela RPC anônima `public_json_enabled(slug)`, só em falta no cache da borda (contrato em
[`docs/vitrine-json.md`](vitrine-json.md)). Pronto para a rota que ainda não existe: o
webhook de pré-orçamento chama `requirePlanFeature(entitlements, 'quote_webhook')` com
`loadSiteEntitlements` sem sessão.

Selo de apoio do plano Gratuito (issue #135): `src/storefront-footer.mjs` traduz o
recurso `support_badge_optional` em `supportBadge: false` no snapshot, decidido na
publicação como o SEO local. Snapshot sem o campo mostra o selo. O rodapé lê
`instagramUrl` e `publicEmail`, projetados desde a central de canais (#125); o
cabeçalho lê `instagramUrl`. Contrato em [`docs/central-de-canais.md`](central-de-canais.md).

## Cobrança pelo Asaas (ADR 0013, issue #113)

`src/billing/provider.mjs` define a interface de provedor (a mesma que o Stripe usará);
`src/billing/asaas.mjs` implementa o Asaas, em sandbox salvo `ASAAS_ENV=production`;
`src/billing/routes.mjs` atende `POST /api/billing/checkout` (dono do tenant) e
`POST /api/billing/asaas/webhook` (token `asaas-access-token` em tempo constante). A
migração `20261115000200_billing_events.sql` cria `private.billing_events` (ids de
evento, sem dados pessoais) e as RPCs `billing_attach_checkout` e `billing_apply_event`,
só para `service_role`; o webhook grava o id e muda `public.subscriptions` na mesma
transação. Configuração, eventos, cotas e testes em `docs/billing/asaas.md`.

## Ciclo da assinatura (ADR 0013, issue #114)

`src/billing/lifecycle.mjs` e a migração `20261116000100_subscription_lifecycle.sql`.
O Cron existente chama `billing_lifecycle_tick` uma vez por execução (`active`/`past_due`
vencida → `grace` até vencimento + 7 dias → `suspended`); o webhook reativa. Os direitos
seguem as datas em `private.site_entitlements`, que agora também mantém o plano de uma
assinatura `canceled` até `current_period_end`. Domínio próprio é canônico só com o
recurso `custom_domain` (`resolve_showcase_host`); sem ele, `302` para
`vitrine.inspira.dev.br/<endereço>`. A faixa do Início lê `GET /api/billing/notice`.
Nada em `sites`, `drafts`, `publications` ou `site_memberships` é apagado. Operação na
seção 3 de `docs/operations-guide.md`.

O painel tem a tela "Plano e cobrança" (`#plano`, `web/portal/billing-panel.mjs`), que lê
`GET /api/billing/overview` (faturas direto do Asaas, sem gravar nada), e mostra o plano
que libera cada recurso travado com `GET /api/sites/:id/entitlements`
(`web/portal/plan-gate.mjs`). `/planos/` é gerada de `content/plans.json` no build.
Detalhes na seção 9 de `docs/billing/asaas.md`.

## Insights por origem (issue #119)

`public.site_metrics_daily` ganhou `source` e `campaign` (migração
`20261116000200_metrics_source.sql`) e as métricas `route_click` e `qr_visit`. A lista
de métricas está em `ALLOWED_METRIC_EVENT_TYPES` (`src/portal-validation.mjs`) e, no
banco, em `private.site_metric_names()`, usada pelo `check` e pela RPC; um nome novo
entra recriando essa função numa migração nova. A vitrine lê `utm_source` e
`utm_campaign` só na carga (`web/assets/metrics-source.mjs`), sem cookie nem
armazenamento; Worker e banco normalizam de novo (lista fechada, até 32 caracteres,
desconhecido vira `outro`, campanha com e-mail ou seis dígitos seguidos é descartada).
Rota e QR aparecem em todos os planos; visitas e funil por origem só saem do Worker com
`conversion_reports` (`src/insights-by-origin.mjs`).

## Pré-orçamento com webhook assinado (issue #121)

`src/quote-webhook.mjs`, `web/assets/quote-lead.mjs`, `web/portal/quote-webhook.mjs` e a
migração `20261116001600_quote_webhooks.sql`. O rascunho guarda `quoteLead.fields`
(categoria, data, bairro); o snapshot só recebe `quoteLead` com o recurso
`quote_webhook` e a integração pronta, decidido na publicação. `POST
/api/sites/:endereço/leads` (público, mesma origem, consentimento obrigatório, limite
por IP em memória sem gravar o IP) responde `202` e entrega em `ctx.waitUntil`, com
`X-Vitrine-Signature: sha256=<hex>` sobre `timestamp.corpo` e até 3 tentativas para
`5xx` e erro de rede; sem o recurso, `404` (`paidFeatureGoneResponse`). O segredo é
gerado no Worker, mostrado uma vez e guardado cifrado (AES-GCM, chave
`QUOTE_WEBHOOK_ENCRYPTION_KEY`, id da vitrine como dado associado) em
`private.quote_webhooks`, que só tem endereço, último status e contadores. Leitura
reutilizável do status em `readQuoteWebhookStatus`. Contrato e receitas em
`docs/pre-orcamento-webhook.md`.

## Patrocinador e tela Impacto (issue #127)

Migração `20261116001500_sponsor_role.sql`, `src/sponsor-impact.mjs` e, no painel,
`web/portal/sponsor-impact.mjs` (tela "Impacto") e `web/portal/sponsor-admin.mjs` (aba
"Patrocinadores" da administração). `public.platform_operators` aceita o papel `sponsor`;
só o `platform_admin` o atribui ou retira (`grant_sponsor_role`, `revoke_sponsor_role`,
`list_sponsors`), com registro em `audit_logs`. O patrocinador não ganha política de leitura
nenhuma: `sites`, `drafts`, `profiles` e `site_metrics_daily` continuam vazios para ele, e
`private.is_platform_admin()` segue exigindo `platform_admin`, então nenhuma rota
`/api/admin/*` abre. A única leitura é `public.read_sponsor_impact()` (security definer,
`GET /api/sponsor/impact`): vitrines com plano `free` em `private.site_entitlements` e
`archived_at is null`, `visit` e `whatsapp_order` somados por mês (12 meses) e por cidade. A
cidade vem do endereço público ou da localidade da publicação e, sem elas, da cidade do perfil
do dono. Cidade com menos de 5 vitrines, ou vitrine sem cidade, entra em "Outras cidades"; se
esse grupo ficaria com 1 a 4 vitrines, a menor cidade visível entra junto até chegar a 5, para
que total menos cidades não revele um grupo pequeno. Com menos de 5 vitrines no total, a
resposta vem suprimida. O Worker ainda projeta só os campos agregados e descarta grupos < 5.
O plano considerado é o de hoje, não o de cada mês passado.

## Item "Em breve" (issue #133)

Estado público `availability: "soon"` (com `availabilityLabel` opcional, até 24
caracteres) em `web/assets/item-availability.mjs`, usado pela publicação, pela vitrine e
pelo editor. "Disponível" é o padrão e não vai ao snapshot; "Oculto" continua sendo
`active: false` e `available` segue bloqueado em `assertNoPrivateLeakage`. O item
"Em breve" aparece com selo e "Avise-me pelo WhatsApp" (`wa.me`, número e código da Mila
no modo Mila) e fica fora da seleção, do total e da mensagem, inclusive ao restaurar a
seleção salva. Os cliques contam na métrica agregada `notify_click` (migração
`20261116001200_metric_notify_click.sql`); nenhum contato é guardado.

## Evolução para plataforma modular e multi-inquilino (Spec 008 e Spec 009)

Estudo arquitetural completo em `docs/modular-admin-architecture.md` e especificações em `specs/008-portal-redesign/` e `specs/009-modular-admin-platform/`:

- **ADR 0008 (Roteamento e cache na borda)**: vitrines públicas servidas a partir de manifestos imutáveis (`public.publications`) via Cloudflare Worker + `Cache API` (`stale-while-revalidate`, CPU `< 1,5 ms`), com resolução por caminho (`vitrine.inspira.dev.br/<slug>`) e por cabeçalho `Host` (`public.custom_domains`). Trava rígida em 95 domínios ativos no Cloudflare for SaaS para manter custo operacional zero.
- **ADR 0009 (CMS institucional e publicação sem deploy)**: gestão em tempo de execução tanto da página principal (`public.platform_cms`, exclusiva para Operadores Inspira) quanto das vitrines dos clientes, com prévia assinada por HMAC (`X-Robots-Tag: noindex, nofollow`) e reversão (*rollback*) entre as últimas 5 versões publicadas.
- **ADR 0010 (Sandboxing em origem opaca)**: componentes personalizados (HTML/CSS/JS ou de repositórios GitHub externos aprovados) executam exclusivamente em `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer">` sem `allow-same-origin` (origem `null`) sob `sandbox.inspira.dev.br`.
- **ADR 0011 (Armazenamento WebP client-side a custo zero)**: conversão de imagens no navegador para WebP (`<= 200 KB`) antes do upload, servidas com cache imutável na borda sobre o Supabase Storage Free (1 GB, padrão sem cartão) e adaptador plugável para Cloudflare R2 Free (10 GB, zero egress).
- **Contenção visual (Liquid Glass vs. Brandbook)**: *Liquid Glass* restrito ao App Shell do painel (`/portal/`) com opacidade base de 85% (WCAG AAA) e fallback sólido automático; vitrines públicas e site institucional permanecem 100% sólidos.
