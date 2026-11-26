# Fluxo OAuth e ciclo do token da AutoResposta

Implementado em `src/auto-reply/routes.mjs` e `src/auto-reply/instagram-adapter.mjs`; contrato em [`panel-api.md`](../../../specs/019-autoresposta/contracts/panel-api.md). Diagrama em [`architecture.md`](architecture.md).

## Garantias

| Requisito | Como |
| --- | --- |
| Início por pessoa autenticada com permissão na vitrine | Sessão + `Origin` + papel `owner`/`admin` + vitrine liberada |
| `state` imprevisível, temporário, de uso único, vinculado | 32 bytes aleatórios (base64url) na URL; no banco só o SHA-256, com pessoa, vitrine, canal, finalidade e prazo de 10 min; `service_consume_channel_oauth_state` marca o uso de forma atômica |
| PKCE | Não documentado para o Facebook Login for Business no fluxo manual; a troca do código usa a chave secreta e acontece só no servidor |
| Callback registrado | `redirect_uri` fixa `PORTAL_ORIGIN/api/instagram/oauth/callback`; `site_id` vem só do `state` |
| Troca só no backend | `GET graph.facebook.com/<v>/oauth/access_token` com `client_secret`; a URL nunca vai para log |
| Conta profissional | `me/assigned_instagram_accounts`: exatamente uma conta (ou a mesma na reconexão) |
| Escopos concedidos | `debug_token`: `is_valid`, `app_id` e `scopes` com `instagram_basic` e `instagram_manage_messages` |
| Webhooks | `POST /<IG_ID>/subscribed_apps?subscribed_fields=messages`; falha → `connected_without_webhook` |
| Redirecionamento seguro | Sempre para `PORTAL_ORIGIN/`; nenhum destino vindo do pedido (sem open redirect) |
| Cancelamento, recusa, callback inválido, conexão duplicada, reuso | `cancelled`, `permission_missing`, `invalid_callback`, `account_in_use`/`account_mismatch`, `invalid_state` |
| Segredo no navegador | Nunca; o painel só recebe `authorizeUrl` e o estado |

## Ciclo de vida do token (login unificado)

| Tema | Comportamento |
| --- | --- |
| Tipo | Token de usuário do sistema do portfólio do cliente (*Business Integration System User Access Token*) |
| Validade | Definida na configuração; preferir "Nunca". Se houver data, o painel mostra "Vale até" |
| Renovação | Não há troca curta → longa nem renovação de 60 dias. Renovar por API exigiria `business_management` (não pedida); com validade, a renovação é reconectar |
| Revogação | Remover o app do portfólio ou mover a conta de portfólio invalida o token. Detectado no envio (erro 190) ou na verificação do Cron (`debug_token`) → `reconnect_required` |
| Troca de senha | Não afeta o token (é do portfólio, não da pessoa) |
| Mudança de permissões | Sem `instagram_manage_messages` → `reconnect_required` |
| "Permitir acesso às mensagens" desligado | Erro `#200` no envio → execução `failed`/`messaging_disabled`; a conexão continua |
| Verificação periódica | Cron horário verifica até 5 conexões com última verificação há mais de 24 h |
| Reconexão | Mesmo fluxo, mesma conta; troca a credencial e mantém a resposta desligada até nova ativação |
| Desconexão | Apaga a credencial; tenta cancelar a assinatura de webhooks; para cortar do lado da Meta, o dono remove o app em Configurações do negócio > Integrações |

Token de usuário do sistema do **app** (do portfólio Coletivo Inspira) não substitui a autorização do cliente e não é usado.
