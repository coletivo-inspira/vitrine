---
titulo: "[AutoResposta 02] Autorização do Instagram (login unificado, estado de uso único, reconexão)"
rotulos: autoresposta, enhancement, painel
depende: 03
---
**Épico**: {{issue:00}} · **Prioridade**: P0 · **Complexidade**: L · **Tipo**: técnico (+ pendência externa no console)

## Contexto

O proprietário precisa conectar a conta profissional sem criar app, copiar token ou configurar webhook.

## Objetivo

Fluxo OAuth seguro do painel até a conexão gravada, com reconexão e desconexão.

## Escopo

- `POST /api/sites/:id/auto-reply/instagram/connect`, `GET /api/instagram/oauth/callback`, `DELETE .../instagram/connection`.
- `state` de uso único no banco; troca do código, `debug_token`, contas compartilhadas, assinatura de `messages`, token cifrado.
- Resultados `connected`, `cancelled`, `permission_missing`, `no_account`, `multiple_accounts`, `account_in_use`, `account_mismatch`, `invalid_state`, `meta_error`.

## Fora do escopo

Leitura do feed (#49/#50); seletor de conta quando há várias.

## Requisitos funcionais e técnicos

FR-001 a FR-004, FR-012, FR-013; `oauth-flow.md`; contrato `panel-api.md`.

## Critérios de aceite

- [x] Implementado e testado com Meta simulada (CT-001 a CT-005, CT-012, CT-013, CT-019, CT-023, CT-025).
- [ ] Configuração "Vitrine — resposta automática" criada no console (pendência externa).
- [ ] Primeira conexão real de uma conta testadora em staging.

## Dependências

{{issue:03}}; console Meta ({{issue:08}}); deploy de staging.

## Riscos

Conta sem portfólio empresarial não aparece; contas no mesmo portfólio do app podem não aparecer (#48).

## Cenários de teste

Ver `test/auto-reply.test.mjs` (blocos CT-001 a CT-005, CT-012/013, CT-023, CT-025).

## Evidências para conclusão

Gravação da conexão em staging e linha em `channel_connections` sem token em claro.

## Referências

`src/auto-reply/routes.mjs`, `src/auto-reply/instagram-adapter.mjs`, ADR 0017 D1 e D9.
