---
status: proposed
---
# AutoResposta: resposta automática do Instagram com o link da vitrine

Relaciona-se com as ADRs [0002](0002-site-access-boundary.md) (acesso por vitrine), [0005](0005-zero-cost-mvp.md) (custo zero) e [0013](0013-plans-and-recurring-billing.md) (planos), e revisa a decisão 2 de [`docs/instagram/configuracao-meta.md`](../instagram/configuracao-meta.md) ("mensagens continuam fora"). Origem: [`specs/019-autoresposta`](../../specs/019-autoresposta/plan.md); pesquisa em [`research.md`](../../specs/019-autoresposta/research.md).

## Contexto e Problema

O Lino quer que o proprietário conecte o Instagram da vitrine e que a Vitrine responda uma vez, sozinha, a quem manda mensagem, com o endereço público da vitrine. Hoje o app Meta está em desenvolvimento, sem configuração de login, testadores, webhooks, Revisão do app nem Verificação da empresa; a decisão de #48 deixou mensagens fora e pediu só leitura (`instagram_basic`). O projeto não tem fila nem feature flags e roda no Workers Free.

## Opções Consideradas

Setup da Meta:

1. **Login do Instagram** (`instagram_business_basic` + `instagram_business_manage_messages`, `graph.instagram.com`, token de 60 dias renovável): o briefing pedia priorizar se compatível, mas a documentação oficial atual o reserva para integrações existentes e o console o marca como obsoleto; clientes teriam de reconectar na migração.
2. **Login unificado** (`instagram_basic` + `instagram_manage_messages`, `graph.facebook.com`, token de usuário do sistema do portfólio do cliente): recomendado pela Meta para integrações novas e já escolhido no repositório.
3. **Login do Facebook com Página**: exige Página vinculada e permissões de Página.

Processamento:

- A. **Fila dedicada** (Cloudflare Queues ou serviço externo): dependência nova e possível custo.
- B. **`ctx.waitUntil` + Cron existente + reentrega da Meta**: sem dependência nova.

## Decisão

- **D1. Login unificado com uma configuração própria da AutoResposta**, só com `instagram_basic` e `instagram_manage_messages` e ativo "conta do Instagram". O consentimento de mensagens é pedido só quando o dono conecta a AutoResposta, separado da leitura do feed (#49/#50). Se a Meta não permitir uma configuração de feed sem mensagens, as duas finalidades podem compartilhar a configuração da AutoResposta. Variável nova: `META_IG_AUTOREPLY_CONFIG_ID`. Não pedir Human Agent, comentários, publicação, insights, anúncios nem `business_management`. A diferença de host e token fica no adaptador do Instagram.
- **D2. Frequência padrão "no máximo uma vez a cada 24 horas"** por consumidor e conexão, com as opções "uma vez por contato" e "a cada 7 dias". É intervalo mínimo; só uma mensagem nova do consumidor dispara envio. (Padrão sugerido no briefing; seguido sem consulta, como pedido.)
- **D3. Elegibilidade conservadora**: interruptores global e do canal desligados de fábrica; liberação por vitrine pelo `platform_admin`; nenhum recurso novo em `content/plans.json` e nenhuma cobrança. Quando houver decisão comercial, a checagem entra com `requirePlanFeature`.
- **D4. Uma conta social por vitrine e uma vitrine por conta** (restrições únicas), logo uma única resposta ativa por conta (RN-009).
- **D5. Processamento B**: o webhook valida a assinatura, grava o evento com restrição única (idempotência), responde `200` e processa em `ctx.waitUntil`; se o banco falhar, responde `500` e a Meta reentrega por até 36 h. No máximo 5 reclamações novas por requisição (orçamento de 50 subrequisições); sobrando eventos, responde `503` para a Meta reentregar.
- **D6. Envio**: até 3 tentativas para limite de requisições e erros `5xx`; resultado incerto (erro de rede ou tempo esgotado depois do pedido) vira "inconclusivo" sem reenvio; erro de token ou permissão leva a conexão a "Reconexão necessária" e desliga a resposta.
- **D7. Dados mínimos**: nenhum texto, anexo ou identificador do consumidor em claro; o consumidor vira HMAC da conexão; token cifrado com AES-GCM (dados associados: vitrine, canal e conta); execuções por 90 dias.
- **D8. Sem roteamento de conversa**: a Vitrine não usa Handover Protocol nem pede controle da conversa; se outra automação responder junto, o painel orienta a usar só uma.
- **D9. Callbacks da Meta**: retorno OAuth em `/api/instagram/oauth/callback` (o mesmo planejado em #49, com a finalidade no `state`), desautorização em `/api/instagram/deauthorize` e exclusão em `/api/instagram/data-deletion`, validando `signed_request`. Cadastro no console só depois do teste em modo desenvolvimento.
- **D10. WhatsApp**: só arquitetura. As regras centrais (`rules.mjs`, `public-url.mjs`, `auto-reply-message.mjs`) não conhecem o Instagram; um canal novo traz seu adaptador (autorização, credencial, validação de webhook, destinatário, limites, envio) e entra na restrição `provider` por migração. Viabilidade em [`docs/integrations/auto-reply/whatsapp-discovery.md`](../integrations/auto-reply/whatsapp-discovery.md).

## Consequências

- Exige **Acesso avançado** a `instagram_manage_messages` e `instagram_basic` (Revisão do app), **Verificação da empresa** do portfólio Coletivo Inspira e app **Live** para receber webhooks de quem não tem papel no app. Até lá, só testadores; e o próprio teste real de webhooks exige o app publicado.
- **Limitação temporária oficial** do login unificado: contas compartilhadas sem a Página vinculada podem não receber o webhook `messages`. A Vitrine não adota o contorno (configuração com Página e `pages_show_list`) no MVP; o risco fica no painel ("Aguardando a primeira mensagem") e no runbook.
- A decisão 2 de `configuracao-meta.md` passa a valer só para a leitura do feed; a AutoResposta pede mensagens numa configuração própria.
- Responder pela API move a conversa para "Geral" no Instagram e a marca como lida; o painel avisa.
- A política de privacidade e os termos precisam mencionar a AutoResposta antes da liberação (proposta de texto em `docs/integrations/auto-reply/security-privacy.md`).
- A Meta recomenda informar que a resposta é automática; a mensagem padrão não diz isso e o painel sugere incluir. Revisar com o jurídico (RN-017).

## Pendências para ratificar

- [ ] Lino ratifica D1 a D10.
- [ ] Jurídico revisa base legal (execução de contrato com o proprietário; legítimo interesse para o hash do consumidor), aviso de automação e textos de privacidade e termos.
- [ ] Console Meta: configuração da AutoResposta, testadores, webhook e URLs (`docs/integrations/auto-reply/meta-setup.md`).
