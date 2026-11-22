# Implementation Plan: Login múltiplo no painel

**Branch**: `cursor/login-multiplo-whatsapp-564b` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md)

**Input**: Especificação em `specs/017-login-multiplo/spec.md`. Decisão proposta em [ADR 0015](../../docs/adr/0015-login-multiplo-whatsapp.md).

## Summary

Trocar o botão único "Entrar com Google" por uma tela de entrada minimalista com quatro métodos: Google, e-mail e senha, telefone e senha e código pelo WhatsApp. Todos usam o Supabase Auth e terminam no `POST /api/auth/session` atual, então a autorização e o isolamento entre vitrines não mudam. O código por telefone é gerado pelo Supabase, chega ao Worker pelo Send SMS Hook, fica cifrado por até 10 minutos e é entregue como resposta gratuita quando a pessoa manda uma mensagem pronta ao número da Vitrine no WhatsApp.

```mermaid
sequenceDiagram
  participant P as Pessoa
  participant Portal as Portal_web
  participant SB as Supabase_Auth
  participant W as Worker_api
  participant WA as WhatsApp_Cloud_API
  P->>Portal: informa telefone
  Portal->>SB: POST /auth/v1/otp phone
  SB->>W: Send SMS Hook assinado com OTP
  W->>W: guarda OTP cifrado por 10 min
  Portal->>P: botão Abrir WhatsApp com mensagem pronta
  P->>WA: envia a mensagem ao número da Vitrine
  WA->>W: webhook messages com X-Hub-Signature-256
  W->>WA: resposta de serviço com o código
  P->>Portal: digita o código
  Portal->>SB: POST /auth/v1/verify type sms
  Portal->>W: POST /api/auth/session
```

## Technical Context

**Language/Version**: JavaScript ES2022 (módulos `.mjs`), HTML e CSS sem framework; SQL do Postgres 15 (Supabase).

**Primary Dependencies**: Supabase Auth (GoTrue) pela API HTTP, Cloudflare Workers (WebCrypto para HMAC e AES-GCM), WhatsApp Cloud API (Graph API), Cloudflare Turnstile. Nenhuma dependência npm nova.

**Storage**: Supabase Postgres, tabelas novas em `private` (ver [data-model.md](data-model.md)); usuários e identidades no esquema `auth`, administrados pelo Supabase.

**Testing**: `node --test` (`npm test`), PGlite para migrações e permissões, `fetch` simulado para Supabase e Graph API, capturas 1280 e 375 px para a tela.

**Target Platform**: Cloudflare Workers Free com Static Assets; navegadores atuais em computador e celular.

**Project Type**: aplicação web (Worker único `workers/api.mjs` + front-end estático em `web/`).

**Performance Goals**: hook e webhook respondem em menos de 5 s; código entregue em até 10 s após a mensagem da pessoa.

**Constraints**: custo zero (ADR 0005); limite de CPU do Workers Free por requisição; CSP restrita do `/portal/`; nenhum dado pessoal em log.

**Scale/Scope**: piloto de até 10 vitrines; dezenas de pessoas no painel.

## Constitution Check

| Princípio | Situação |
|---|---|
| I. Administração privada e publicação pública | Passa. Nada muda nos artefatos publicados; telas e tabelas novas são só do painel. |
| II. Isolamento entre vitrines | Passa. A sessão continua validada no servidor e a propriedade segue pelo `user.id`; testes de isolamento existentes continuam obrigatórios para cada método. |
| III. Credenciais apenas no servidor | Passa com cuidado. Seis segredos novos só por `wrangler secret put`; `GET /api/auth/config` testado contra vazamento; hook e webhook assinados. |
| IV. Custo e condições verificáveis | Passa com pendências. Preços da Meta, cotas do SMTP e disponibilidade de hooks no Free documentados em [research.md](research.md) como "a reconferir"; métodos ficam desligados até os passos humanos. |
| V. Entregas verificáveis | Passa. Cada história tem teste independente; segurança do hook e do webhook com testes de contrato. |
| Restrição "Login inicial será Google" | **Exige emenda** 0.2.0 da constituição (proposta nesta entrega) e o ADR 0015. |

## Project Structure

### Documentation (this feature)

```text
specs/017-login-multiplo/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── auth-config.md
│   ├── portal-auth-flows.md
│   ├── send-sms-hook.md
│   └── whatsapp-webhook.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
web/portal/
├── index.html            # nova #auth-section (US1)
├── portal.css            # estilos da tela de entrada (US1)
├── portal.js             # integra auth-form.mjs, PKCE para e-mail (US1, US2)
├── auth-form.mjs         # novo: modos, validação, chamadas ao Supabase (US1-US4)
├── auth-identifier.mjs   # novo: detectar e normalizar e-mail ou telefone (US1, US3)
└── phone-mask.mjs        # reaproveitado

src/auth/
├── phone.mjs             # novo: forma canônica BR com nono dígito (R4)
├── standard-webhooks.mjs # novo: verificação do Send SMS Hook
├── otp-outbox.mjs        # novo: cifra AES-GCM e chamadas às funções private.*
└── whatsapp.mjs          # novo: verificação do webhook e envio pela Graph API

workers/api.mjs           # rotas /api/auth/hooks/send-sms e /api/whatsapp/webhook; /api/auth/config ampliado; limpeza no scheduled()
wrangler.jsonc            # variáveis não secretas novas
web/_headers              # CSP do /portal/ com Turnstile (US5)
supabase/migrations/20261122000100_auth_otp_outbox.sql

test/
├── auth-form.test.mjs
├── auth-phone.test.mjs
├── auth-send-sms-hook.test.mjs
├── whatsapp-webhook.test.mjs
├── auth-otp-outbox-db.test.mjs
└── auth-config.test.mjs
```

**Structure Decision**: o projeto já é um Worker único com módulos em `src/` e front-end em `web/`; os módulos novos de autenticação ficam em `src/auth/` para não crescer ainda mais `workers/api.mjs`, que só registra as rotas.

## Entrega em PRs

Cada PR corresponde a uma issue de `docs/backlog/login-multiplo/` e pode ir para `main` com o método desligado em `AUTH_METHODS`:

1. Tela de entrada (US1) com Google na fileira nova e `authMethods` lido do servidor.
2. E-mail e senha (US2).
3. Ponte WhatsApp no Worker (base da US3 e US4): migração, hook e webhook.
4. Entrar com código pelo WhatsApp (US3, tela).
5. Telefone e senha (US4).
6. Proteção contra abuso (US5).
7. Provedores sociais configuráveis.
8. Testes de ponta a ponta e documentação de operação.

## Complexity Tracking

| Ponto | Por que é necessário | Alternativa mais simples recusada |
|---|---|---|
| Duas tabelas privadas e um hook só para entregar o código | Entregar sem custo exige esperar a mensagem da pessoa; o código precisa ficar guardado até lá | Enviar modelo de autenticação na hora: cobrado por mensagem |
| Emenda da constituição | O texto atual fixa o Google como login inicial | Manter só o Google: é o problema que motivou o pedido |
