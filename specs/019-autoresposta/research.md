# Research: AutoResposta

Data: 2026-11-26. Fontes: código e docs do repositório, issue [#48](https://github.com/coletivo-inspira/vitrine/issues/48) e documentação oficial da Meta consultada em 2026-11-26 (links no fim). Nada aqui foi validado no console da Meta: nenhuma configuração externa foi alterada.

## R0. Diagnóstico do repositório

| Tema | Estado encontrado | Consequência para a AutoResposta |
| --- | --- | --- |
| Stack | Worker único `workers/api.mjs` (Cloudflare Workers Free com Static Assets), módulos `src/*.mjs`, front-end estático em `web/` sem framework, Supabase Postgres/Auth pela API HTTP, `node --test` com PGlite. Uma única dependência de desenvolvimento. | Nenhuma dependência nova; WebCrypto para HMAC, AES-GCM e HKDF. |
| Autenticação | `resolveSessionUser` valida o JWT do Supabase (cookie `__Host-vitrine_session` ou `Bearer`); mutações exigem `Origin` do painel (`validateMutationOriginAndJson`). Login Google aprovado (ADR 0004). | O início do OAuth e todas as rotas do painel reutilizam isso. |
| Contas e vitrines | `sites(owner_user_id, slug, name, paused_at, archived_at, demo_expires_at)`, `site_memberships(role)`, `tenants`, `subscriptions`. Equipe por vitrine (ADR 0002). | Conexão por `site_id`; papéis `owner`/`admin` gerenciam. |
| Autorização | `private.has_site_role`, `private.is_platform_admin`; `platform_operators` com `platform_admin`, `support_operator`, `sponsor`. RLS em todas as tabelas; `private.*` sem grants. | Tabelas novas em `private`, acesso só por funções `security definer`. |
| Banco e migrações | `supabase/migrations/*.sql` em ordem (checada por `scripts/check-migration-order.mjs`). A spec 018 reserva `20261126000100`. | Migração nova `20261126001000_auto_reply.sql`. |
| APIs | Rotas registradas por regex em `workers/api.mjs`, delegando a módulos (`src/quote-webhook.mjs`, `src/linktree-import.mjs`). Erros por `PortalValidationError`. | Módulo `src/auto-reply/` com `matchAutoReplyRoute` e handlers. |
| Assíncrono | Não há fila. Há `ctx.waitUntil` (pré-orçamento) e o Cron `17 * * * *` (`scheduled()`: certificados, ciclo da assinatura, limpeza de demonstrações). | Webhook grava o evento e processa em `ctx.waitUntil`; o Cron recupera execuções presas. A Meta reentrega por até 36 h se o webhook não responder `200`. |
| Ambientes | `wrangler.jsonc` com `SUPABASE_URL`, `PUBLIC_SITE_ORIGIN`, `PORTAL_ORIGIN`; segredos por `wrangler secret`. Sem deploy remoto, sem autenticação Cloudflare. | Variáveis novas só documentadas; nada configurado. |
| Domínios | `vitrine.inspira.dev.br/<endereço>`; domínio próprio em `public.custom_domains` (status e SSL `active`) com o recurso `custom_domain`; `canonicalUrlFor` em `src/local-seo.mjs`. Subdomínio `inspira_subdomain` existe só como nome de recurso, sem implementação. | Resolvedor de endereço: domínio próprio válido → endereço padrão. |
| UI | Painel em `web/portal/` (Liquid Glass só no painel, DESIGN.md "Portal"), aba Canais (`channels-panel.mjs`, #125) com o cartão "Instagram conectado: Em breve". CSP `img-src 'self'`. | Seção nova "Resposta automática" na aba Canais; foto do perfil substituída pela inicial. |
| Feature flags | Não existem. | Interruptores no banco (`private.auto_reply_controls`) + lista de vitrines liberadas. |
| Planos | `content/plans.json` e `private.site_entitlements`; `requirePlanFeature`. | Sem recurso novo (não inventar cobrança); ponto de extensão documentado. |
| Integrações Meta | Só documentação: `docs/instagram/*.md` e o checklist de #48. Nenhuma rota `/api/instagram/*`. | Primeiras rotas Meta do Worker. |
| Variáveis de ambiente (nomes) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `PREVIEW_HMAC_SECRET`, `QUOTE_WEBHOOK_ENCRYPTION_KEY`, `CF_SAAS_*`, `ASAAS_*`, `STRIPE_*`, `R2_*`. Planejadas em #48: `META_APP_ID`, `META_APP_SECRET`, `META_IG_CONFIG_ID`, `META_GRAPH_VERSION`. | Novas: `META_IG_AUTOREPLY_CONFIG_ID`, `META_WEBHOOK_VERIFY_TOKEN`, `AUTO_REPLY_ENCRYPTION_KEY`. |
| Testes e observabilidade | Testes de módulo com `fetch` simulado; PGlite para RLS; logs `console.error(JSON.stringify({event,...}))` com `sanitizeDiagnosticText`. Sem APM. | Mesmo padrão; métricas agregadas a partir da tabela de execuções. |
| Issues e PRs | #48 a #52 (Instagram) fechadas como documentação; backlog em `docs/backlog/<tema>/` criado por `scripts/criar-issues-estudo-mercado.sh`. Rótulos existentes; sem milestones. | Épico e issues em `docs/backlog/autoresposta/`. |

## R1. Configuração Meta: qual setup usar

A Meta oferece hoje três setups ([visão geral](https://developers.facebook.com/docs/instagram-platform/overview)):

| | Login unificado | Login do Instagram | Login do Facebook |
| --- | --- | --- | --- |
| Uso recomendado pela Meta | **Integrações novas** | Integrações existentes de login do Instagram | Integrações existentes com Página |
| Entrada do dono | Instagram ou Facebook | Instagram | Facebook |
| Página do Facebook | Não exige | Não exige | Exige |
| Portfólio empresarial | Exige | Não exige | Depende |
| Token | Token de usuário do sistema do portfólio do cliente (SUAT) | Token de usuário do Instagram (1 h → 60 dias, renovável) | Usuário ou Página |
| Host | `graph.facebook.com` | `graph.instagram.com` | `graph.facebook.com` |
| Permissões de mensagens | `instagram_basic` + `instagram_manage_messages` | `instagram_business_basic` + `instagram_business_manage_messages` | `instagram_basic` + `instagram_manage_messages` + Página |

**Decisão (D1, ADR 0017):** login unificado. O briefing pede priorizar o login do Instagram "se compatível"; a documentação oficial atual o reserva para integrações já existentes, o console do app mostra a configuração com login do Instagram como obsoleta (checkpoint de #48) e o repositório já decidiu pelo login unificado (decisão 1 de `configuracao-meta.md`). Pedir `instagram_business_*` agora criaria uma conexão que a própria Meta manda migrar, e a migração exige que cada cliente reconecte. A diferença de host e token fica isolada no adaptador `src/auto-reply/instagram-adapter.mjs`.

**`instagram_business_basic` + `instagram_business_manage_messages` bastariam?** Sim, no login do Instagram: são as permissões listadas no guia de mensagens desse setup. No login unificado, os equivalentes oficiais (tabela de migração) são `instagram_basic` + `instagram_manage_messages`. Os dois pares não se misturam: tokens e hosts são incompatíveis ("Instagram User access tokens and `graph.instagram.com` don't work with the Instagram API with Unified Login").

## R2. Permissões e configuração

- A configuração padrão do login unificado inclui `instagram_basic` e `instagram_manage_messages` ("always included"), mais comentários, publicação e anúncios ([permissões](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/permissions.md), [migração](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/migration-guide.md)).
- Para a AutoResposta, a configuração deve ficar **só** com `instagram_basic` + `instagram_manage_messages` e ativo "conta do Instagram". Remover comentários, publicação, anúncios e insights.
- Isso reconcilia a decisão 3 de #48: a leitura do feed segue com uma configuração sem mensagens (se a Meta permitir) e a AutoResposta usa a sua, pedida só quando o dono liga a resposta automática (separação de consentimento pedida em `docs/instagram/mensagens-futuro.md`). Se a Meta não permitir uma configuração sem mensagens para o feed, as duas finalidades podem usar a mesma configuração; a decisão continua no ADR 0017 (D1).
- Acesso padrão vale para quem tem papel no app; clientes externos exigem **Acesso avançado** para cada permissão (Revisão do app), app **Live** e **Verificação da empresa**.
- Recurso *Human Agent* (janela de 7 dias): **não** pedir; a AutoResposta só responde dentro da janela padrão.

## R3. Autorização (OAuth) e ciclo do token

- Login: `https://www.facebook.com/<versão>/dialog/oauth?client_id=<META_APP_ID>&config_id=<config>&redirect_uri=<fixa>&response_type=code&state=<state>&prompt=login`, sem `scope` (as permissões vêm da configuração). `prompt=login` mostra as opções Instagram e Facebook ([solução de problemas](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/eligibility-and-troubleshooting.md)).
- Troca: `GET https://graph.facebook.com/<versão>/oauth/access_token` com `client_id`, `client_secret` (chave do **app Meta**), `redirect_uri` e `code`, só no servidor ([autenticação](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication.md)).
- **PKCE**: não documentado para o Facebook Login for Business no fluxo manual. Proteção: `state` de uso único no banco, cookie não é necessário, troca servidor-a-servidor com a chave secreta (mesma conclusão de `conectar-por-vitrine.md`).
- Token: SUAT do portfólio do cliente; não pertence à pessoa que entrou; continua válido se ela sair do negócio. A validade é escolhida na configuração ("Nunca" preferido, decisão 4 de #48). Para de funcionar se o cliente remover o app do portfólio ou mover a conta para outro portfólio: "stop retrying and ask your client to connect again".
- Não há troca curta → longa nem renovação de 60 dias. Renovar por API exige `business_management` (Business Integration System User Access Token Management API), que a Vitrine **não** pede; se a configuração tiver validade, o painel avisa antes do vencimento e pede reconexão.
- Permissões concedidas: conferidas com `GET /debug_token?input_token=<token>&access_token=<app_id>|<app_secret>` (campos `is_valid`, `scopes`, `expires_at`). Sem `instagram_manage_messages` em `scopes`, nada é gravado.
- Conta: `GET /me/assigned_instagram_accounts?fields=id,username` (`/me` é o usuário do sistema). Regra de #49: exatamente uma conta; na reconexão, a mesma conta.
- Troca de senha do Instagram não invalida o SUAT (o token é do portfólio); revogar o app ou mudar a conta de portfólio, sim. A verificação periódica é feita pelo próprio envio (erro de token → "Reconexão necessária") e por `debug_token` no Cron em lotes pequenos.
- "Permitir acesso às mensagens" desligado no Instagram: chamadas de mensagens falham com `(#200)`; quem entra pelo Facebook não vê o pedido no login e liga no app do Instagram.

## R4. Webhooks

- Verificação: `GET` com `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`; responder o `hub.challenge` se o token bater ([setup](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup.md)).
- Assinatura: `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256 do corpo bruto com a chave secreta do app; comparar em tempo constante.
- Resposta: `200` rápido; a Meta reentrega imediatamente e depois com frequência decrescente por 36 h; lotes de até 1000 atualizações; deduplicar.
- Assinatura por conta: `POST https://graph.facebook.com/<versão>/<IG_ID>/subscribed_apps?subscribed_fields=messages` com o SUAT; `DELETE` remove. Campos não podem ser escolhidos por conta: a conta recebe todos os campos marcados no app.
- **Requisito**: o app precisa estar publicado/Live para receber notificações de usuários do app. Em modo desenvolvimento, o teste real de webhooks fica bloqueado; a Vitrine usa fixtures.
- **Limitação temporária oficial**: no login unificado, se o cliente compartilhar a conta do Instagram mas não a Página vinculada, `messages` pode não chegar mesmo com assinatura bem-sucedida. Contorno oficial: configuração separada que pede a Página e `pages_show_list` (login só pelo Facebook). A Vitrine **não** adota o contorno no MVP (pediria mais uma permissão); registra o risco e mostra "Aguardando a primeira mensagem" até o primeiro evento real.
- Campos: assinar só `messages` (permissão `instagram_manage_messages`). Não assinar `message_reactions`, `messaging_seen`, `messaging_postbacks`, `messaging_referral`.
- Payload (login unificado segue o formato do Facebook Login for Business; mensagens com `object: "instagram"`, `entry[].id` = conta do negócio, `entry[].messaging[]` com `sender.id`, `recipient.id`, `timestamp`, `message.mid`, `message.text`) ([exemplos](https://developers.facebook.com/documentation/instagram-platform/webhooks/examples.md)). Marcadores que tornam o evento inelegível: `is_echo`, `is_self`, `is_deleted`, `is_unsupported`, `reaction`, `read`, `message_edit`, `postback`, `referral` sem mensagem, `quick_reply` (resposta a botão, não primeira mensagem), handoff sem `mid`. `sender.id` igual à conta do negócio também é eco.
- mTLS dos webhooks: opcional; não é possível no Workers Free sem configuração de zona. Fica fora do MVP; a assinatura HMAC é obrigatória.

## R5. Envio

- `POST https://graph.facebook.com/<versão>/<IG_ID>/messages` com `Authorization: Bearer <SUAT>` e corpo `{"recipient":{"id":"<IGSID>"},"message":{"text":"..."}}` (tabela de migração; no login do Instagram o host é `graph.instagram.com`) ([mensagens](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api)).
- Texto UTF-8 de até **1000 bytes**; links precisam ser URLs válidas.
- Janela padrão de 24 h a partir da mensagem do consumidor (até 7 dias para anúncios Click-to-Direct). A AutoResposta descarta eventos com mais de 23 h.
- Limites: Send API 100 chamadas/s por conta para texto; Conversations API 2/s. Outras chamadas contam em `4800 × impressões` por 24 h.
- Responder pela API move a conversa para a pasta "Geral" e a marca como lida no app do Instagram; isso entra no aviso do painel ("o atendimento continua no app; conversas respondidas pela Vitrine vão para Geral").
- Aviso de automação: a Meta recomenda (e em alguns mercados a lei exige) informar que a resposta é automática. A mensagem padrão não diz "robô"; o painel sugere incluir "Resposta automática" e o ADR registra a recomendação (RN-017). Revisar com jurídico antes da liberação.

## R6. Roteamento com outras ferramentas (RN-008)

- A Meta oferece Handover Protocol para passar a conversa entre apps; com dois apps assinando `messages`, ambos recebem o webhook. A Vitrine não pede controle da conversa nem usa `standby`.
- Risco: Manychat ou "respostas instantâneas" nativas do Instagram na mesma conta podem responder junto. Mitigação: aviso no painel e no guia; nenhuma tentativa de detectar ou bloquear outras ferramentas.
- Se a conta usar Handover com outro app como dono da conversa, o envio pode falhar; a Vitrine registra a falha como definitiva e não insiste.

## R7. Exclusão de dados e desautorização

- Callbacks do Facebook Login for Business com `signed_request` (`<assinatura base64url>.<payload base64url>`, HMAC-SHA256 com a chave do app, `algorithm: HMAC-SHA256`). A exclusão responde `{ "url": "<acompanhamento>", "confirmation_code": "<código>" }`.
- Com SUAT, o identificador que chega (`user_id`) pode não ser a conta do Instagram (item 16 de #48, ainda pendente). A Vitrine tenta casar com a conta e o portfólio guardados; sem casar, responde com o código e registra o pedido para tratamento manual, sem dados pessoais além do identificador.

## R8. Custos e limites (resumo; detalhe em `docs/integrations/auto-reply/cost-analysis.md`)

- API de mensagens do Instagram: sem cobrança por mensagem.
- Workers Free: 100 mil requisições/dia, 10 ms de CPU por requisição, 50 subrequisições por invocação; Cron conta como invocação.
- Supabase Free: 500 MB de banco; cada execução ocupa ~300 bytes; retenção de 90 dias.
- Cada mensagem recebida gera 1 requisição ao Worker; mensagens elegíveis geram ~6 subrequisições (banco e Meta). Eventos recebidos ≠ mensagens enviadas: a frequência corta a maioria.

## R9. WhatsApp

Fora deste worker. Viabilidade em [`docs/integrations/auto-reply/whatsapp-discovery.md`](../../docs/integrations/auto-reply/whatsapp-discovery.md) (PR #182; recomenda, no MVP, a saudação nativa do WhatsApp Business assistida pelo painel, e a Cloud API só depois). A arquitetura reserva `provider = 'whatsapp'` no domínio de canal (sem habilitar na restrição do banco) e mantém as regras centrais independentes do provedor.

## Referências oficiais (consultadas em 2026-11-26)

- [Instagram Platform overview](https://developers.facebook.com/docs/instagram-platform/overview)
- [Send Messages (Instagram Login)](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api)
- [Unified Login: Permissions](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/permissions.md)
- [Unified Login: Authentication and access tokens](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication.md)
- [Unified Login: Eligibility and troubleshooting](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/eligibility-and-troubleshooting.md)
- [Migration guide (Instagram Login → Unified Login)](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/migration-guide.md)
- [Set up Webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup.md)
- [Webhook fields](https://developers.facebook.com/documentation/instagram-platform/webhooks/fields.md)
- [Webhook examples](https://developers.facebook.com/documentation/instagram-platform/webhooks/examples.md)
- [Instagram Platform docs index](https://developers.facebook.com/documentation/instagram-platform/llms.txt)
- Manychat Help Center (só experiência de conexão): https://help.manychat.com/
