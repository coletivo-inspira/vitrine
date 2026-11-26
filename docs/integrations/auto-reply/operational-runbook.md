# Runbook operacional da AutoResposta

Para operadores Inspira com papel `platform_admin`. Nada aqui foi exercitado em ambiente real: não há deploy.

## Ligar e desligar

No painel, **Administração da plataforma > Resposta automática** (só `platform_admin`): interruptores, vitrines liberadas, conexões (com "Suspender"), métricas de 7 dias, alertas e chaves. Cada ação pede confirmação e fica na auditoria. As mesmas rotas podem ser chamadas pelo console do navegador logado no painel:

```js
await fetch('/api/admin/auto-reply').then((r) => r.json());
await fetch('/api/admin/auto-reply/controls', { method: 'PUT', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ enabled: true, instagramEnabled: true }) });
await fetch('/api/admin/auto-reply/sites/<siteId>', { method: 'PUT', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ allowed: true }) });
```

## Contingência

| Situação | Ação | Efeito |
| --- | --- | --- |
| Envios indevidos ou incidente | `PUT /api/admin/auto-reply/controls {"enabled": false}` | Novos envios param na hora; eventos em processamento são cancelados na releitura |
| Só o Instagram | `{"instagramEnabled": false}` | Idem, só o canal |
| Uma vitrine | `PUT /api/admin/auto-reply/sites/<siteId> {"allowed": false}` ou `POST .../connections/<id>/suspend` | Desliga aquela vitrine |
| Invalidar conexões | Suspender cada conexão; o dono precisa reconectar | Credencial continua cifrada até desconectar |
| Reverter versão | Remover o bloco de roteamento da AutoResposta em `workers/api.mjs` e publicar | As rotas somem; a vitrine pública não muda |
| Recuperar sem duplicar | Não reprocessar à mão: execuções `uncertain` ficam como estão; a próxima mensagem do consumidor segue a frequência | Sem reenvio às cegas |
| Banco fora do ar | Nada: o webhook responde `500` e a Meta reentrega por até 36 h | Eventos com mais de 23 h serão ignorados |
| Meta fora do ar | Nada: 3 tentativas e `failed`/`provider_unavailable`; a frequência é liberada | Próxima mensagem tenta de novo |

A vitrine pública não depende de nenhuma rota da AutoResposta.

## Alertas

A aba mostra os alertas calculados na hora (`src/auto-reply/alerts.mjs`). O Cron escreve `auto_reply_alert` no log para `stuck_processing`, `tokens_revoked` e `rotation_failed`, para uma regra de alerta por log no Cloudflare (a configurar).

| Alerta | Ação |
| --- | --- |
| `auth_failures`, `reconnect_required`, `token_expired` | O painel do dono já pede reconexão; avisar o dono se a vitrine estiver no piloto |
| `high_failure_rate` | Ver `auto_reply_processed` no log; se for a Meta, esperar; se for configuração, desligar o canal |
| `rotation_missing_previous_key`, `hash_key_unstable` | Corrigir os segredos antes de qualquer outra ação (ver Rotação) |
| `credentials_pending_rotation` | "Recifrar agora" ou esperar o Cron |
| `webhook_not_subscribed`, `no_events` | Pedir ao dono para reconectar; ver a limitação de contas sem Página |
| `uncertain_sends` | Acompanhar; nada é reenviado |
| `deletion_pending_review` | Procurar a conta pelos dados do pedido e apagar à mão o que houver |

## Rotação da chave de cifragem

1. Copiar o valor atual de `AUTO_REPLY_ENCRYPTION_KEY` para `AUTO_REPLY_HASH_KEY` (se ainda não existir) e publicar. A frequência por consumidor passa a usar essa chave fixa.
2. Copiar o valor atual para `AUTO_REPLY_ENCRYPTION_KEY_PREVIOUS`, gerar um valor novo para `AUTO_REPLY_ENCRYPTION_KEY` e somar 1 em `AUTO_REPLY_KEY_VERSION`. Publicar.
3. Na aba, "Recifrar agora" até "Credenciais na chave antiga" chegar a 0 (ou esperar o Cron, 5 por hora).
4. Remover `AUTO_REPLY_ENCRYPTION_KEY_PREVIOUS` e publicar. Nunca apagar a chave anterior antes do passo 3: credenciais antigas deixam de abrir e os envios falham com `credential_unreadable`.

Nenhum valor de chave aparece no painel, em log ou em documento.

## Pedidos de exclusão

A Meta mostra ao dono o link `https://vitrine.inspira.dev.br/privacidade/exclusao/?codigo=<código>`. Pedido com conexão encontrada fica "Exclusão concluída"; sem conexão, "Pedido recebido" e o alerta `deletion_pending_review` aparece na aba por 30 dias.

## Sinais a acompanhar (logs do Worker)

| Evento | O que indica | Ação |
| --- | --- | --- |
| `auto_reply_webhook_rejected` (`invalid_signature`) em volume | Tentativa de forjar ou segredo trocado | Conferir `META_APP_SECRET` |
| `auto_reply_webhook_store_failed` | Banco indisponível | Ver Supabase; a Meta reentrega |
| `auto_reply_processed` com `token_invalid`/`permission_missing` | Dono revogou | O painel pede reconexão |
| `auto_reply_processed` com `messaging_disabled` | "Permitir acesso às mensagens" desligado | Orientar o dono |
| `auto_reply_processed` com `uncertain` | Tempo esgotado no envio | Acompanhar volume |
| `auto_reply_webhook_received` com `unknownAccounts` | Conta assinada sem conexão (desconectou sem cancelar a assinatura) | Dono pode remover o app no portfólio |
| `auto_reply_maintenance` com `revoked` | Tokens invalidados | Nada; painel avisa |
| Nenhum evento de uma conta conectada | Limitação de webhooks sem Página vinculada | Ver `meta-setup.md` item 18 |

Métricas agregadas de 7 dias: `GET /api/admin/auto-reply` (`last7Days`).

## Suporte ao proprietário

| Sintoma | Causa provável | Resposta |
| --- | --- | --- |
| "A conta não aparece na tela da Meta" | Conta pessoal ou outro portfólio | Mudar para conta profissional; escolher o portfólio dono da conta |
| "Conectou, mas ninguém recebe resposta" | Interruptor desligado, vitrine não publicada, acesso às mensagens desligado, limitação de webhooks | Conferir a seção; ligar "Permitir acesso às mensagens" no app |
| "Respondeu duas vezes" | Outra automação na conta (Manychat, respostas instantâneas) | Usar só uma ferramenta |
| "Quero parar" | — | Desligar; ou desconectar e remover o app no portfólio |

Nunca pedir senha, token ou captura de tela com dados de consumidores.
