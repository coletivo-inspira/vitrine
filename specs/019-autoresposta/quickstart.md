# Quickstart: AutoResposta

Tudo roda localmente, com a Meta simulada. Nenhum passo envia mensagem a uma pessoa real.

## Testes

```bash
npm ci
npm test                                     # suíte completa
node --test test/auto-reply.test.mjs         # rotas, regras, adaptador e fluxos CT-001 a CT-030
node --test test/database/auto-reply.test.mjs  # migração e permissões em PGlite
node --test test/auto-reply-panel.test.mjs   # painel
npm run build
```

## O que os testes cobrem

- Conexão com estado de uso único, cancelamento, permissão negada, conta em outra vitrine e reconexão.
- Webhook assinado, eventos ignorados (eco, leitura, reação, edição, apagada, não suportada, postback, referência), idempotência, simultâneas, lote grande.
- Frequência, endereço resolvido no envio (domínio próprio, SSL, despublicada), mensagem sem variável, versão antiga.
- Token inválido, limite de requisições, Meta fora do ar, envio incerto, desligar no meio do processamento, desconectar, suspender, interruptor global.
- Desautorização e exclusão de dados com `signed_request`; manutenção do Cron; logs sem segredos.

## Variáveis (só nomes; valores no cofre do Worker)

| Variável | Uso |
| --- | --- |
| `META_APP_ID` | ID do app Meta (público, mas lido do ambiente) |
| `META_APP_SECRET` | Chave secreta do app Meta: troca do código, `debug_token`, assinatura dos webhooks e `signed_request` |
| `META_IG_AUTOREPLY_CONFIG_ID` | Configuração do login unificado da AutoResposta |
| `META_GRAPH_VERSION` | Opcional; padrão `v27.0` |
| `META_WEBHOOK_VERIFY_TOKEN` | Token de verificação do webhook (texto aleatório escolhido pela equipe) |
| `AUTO_REPLY_ENCRYPTION_KEY` | Chave de cifragem do token e do hash do consumidor (32+ caracteres) |
| `SUPABASE_SERVICE_ROLE_KEY` | Já existente; funções `service_*` |
| `PORTAL_ORIGIN`, `PUBLIC_SITE_ORIGIN` | Já existentes em `wrangler.jsonc` |

Sem essas variáveis, o painel mostra "Ainda não disponível neste ambiente" e o webhook responde `200` sem gravar.

## Piloto (depois da autorização)

Passo a passo em [`docs/integrations/auto-reply/meta-setup.md`](../../docs/integrations/auto-reply/meta-setup.md) e [`operational-runbook.md`](../../docs/integrations/auto-reply/operational-runbook.md).
