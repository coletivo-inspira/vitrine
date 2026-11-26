# Runbook operacional da AutoResposta

Para operadores Inspira com papel `platform_admin`. Nada aqui foi exercitado em ambiente real: não há deploy.

## Ligar e desligar

As rotas exigem a sessão de um `platform_admin` e `Origin` do painel. Até existir a tela de administração (issue 07), usar o navegador logado no painel (console do DevTools) com `fetch`:

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
