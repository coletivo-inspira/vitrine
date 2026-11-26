---
description: "Tarefas da AutoResposta (resposta automática do Instagram com o link da vitrine)"
---

# Tasks: AutoResposta

**Input**: `specs/019-autoresposta/` (spec, plan, research, data-model, contracts)

**Tests**: obrigatórios para permissões no banco, rotas, webhook (assinatura, idempotência, eventos ignorados), frequência, endereço, erros da Meta, desconexão, administração e ausência de segredos e conteúdo em logs (Princípios II, III e V). Painel com testes de módulo e capturas 1280 e 375 px. Toda evidência desta entrega usa Meta simulada.

**Issues**: cada fase aponta para um arquivo de `docs/backlog/autoresposta/` (entre colchetes).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo.
- **[Story]**: história da `spec.md` (US1 a US6).

---

## Phase 1: Setup e discovery [01-discovery-e-arquitetura]

- [x] T001 Criar `specs/019-autoresposta/` (spec, research, plan, data-model, contracts, quickstart, checklist, tasks) e apontar `.specify/feature.json`.
- [x] T002 Propor `docs/adr/0017-autoresposta-canais-sociais.md`.
- [x] T003 Guias em `docs/integrations/auto-reply/` (README, architecture, meta-setup, oauth-flow, webhook-events, security-privacy, app-review, cost-analysis, production-checklist, operational-runbook).
- [x] T004 Backlog `docs/backlog/autoresposta/00..10-*.md` e rótulos novos no script de criação de issues.
- [x] T005 Atualizar `AGENTS.md`, `docs/roadmap.md`, `docs/architecture.md`, `CONTEXT.md`, `supabase/README.md` e as referências em `docs/instagram/`.

## Phase 2: Foundational [03-banco-e-seguranca]

- [x] T006 Migração `supabase/migrations/20261126001000_auto_reply.sql` (tabelas, funções, grants).
- [x] T007 `test/database/auto-reply.test.mjs` (9 cenários em PGlite).
- [x] T008 [P] `src/auto-reply/crypto.mjs` (AES-GCM/HKDF, hash do consumidor, HMAC, comparação constante).
- [x] T009 [P] `src/auto-reply/store.mjs` (PostgREST e memória) e registro em `workers/api.mjs`.

## Phase 3: US1 - Conectar o Instagram (P1) [02-autorizacao-instagram]

- [x] T010 [US1] `src/auto-reply/instagram-adapter.mjs` (login, troca, `debug_token`, contas, assinatura, envio, classificação de erros).
- [x] T011 [US1] Rotas `connect`, `oauth/callback` e `connection` em `src/auto-reply/routes.mjs`.
- [x] T012 [US1] Testes CT-001 a CT-005, CT-019, CT-025.

## Phase 4: US2 - Mensagem, prévia e ativação (P1) [05-resposta-automatica, 06-interface-do-proprietario]

- [x] T013 [P] [US2] `web/assets/auto-reply-message.mjs` (variáveis, URL anexada, 1000 bytes, frequências).
- [x] T014 [P] [US2] `src/auto-reply/public-url.mjs`.
- [x] T015 [US2] `GET/PUT /api/sites/:id/auto-reply` com versão e erros mapeados.
- [x] T016 [US2] Testes CT-027, CT-028, versão antiga, mensagem e frequência inválidas.

## Phase 5: US3 - Responder uma vez (P1) [04-webhooks, 05-resposta-automatica]

- [x] T017 [US3] `src/auto-reply/instagram-webhook.mjs` (challenge, assinatura, normalização).
- [x] T018 [US3] `src/auto-reply/rules.mjs` e `src/auto-reply/processor.mjs`.
- [x] T019 [US3] Rota do webhook com teto por requisição, `500`/`503` e `ctx.waitUntil`.
- [x] T020 [US3] Fixtures `test/fixtures/meta-instagram-webhooks.mjs` e testes CT-006 a CT-010, CT-014 a CT-018, CT-020, CT-021, CT-024, CT-026, lote grande, logs.

## Phase 6: US4 - Desligar, reconectar, desconectar (P1) [02, 05]

- [x] T021 [US4] Releitura antes do envio; `reconnect_required` em erro de token; desconexão completa.
- [x] T022 [US4] Callbacks `/api/instagram/deauthorize` e `/api/instagram/data-deletion` com `signed_request`.
- [x] T023 [US4] Testes CT-011, CT-012, CT-013, CT-022, CT-023, CT-029 e callbacks.

## Phase 7: Interface do proprietário [06-interface-do-proprietario]

- [x] T024 `web/portal/auto-reply-panel.mjs` e `.css`; seção na aba Canais (`index.html`) e montagem em `editor.js`.
- [x] T025 `test/auto-reply-panel.test.mjs` e capturas locais 1280/375 px (claro e escuro).
- [ ] T026 Teste com pessoa proprietária real (SC-001) e revisão com leitor de tela.

## Phase 8: US5 - Administração global (P2) [07-administracao-global]

- [x] T027 [US5] Rotas `/api/admin/auto-reply*` e funções `admin_*`; testes US5 e CT-030.
- [x] T028 [US5] Manutenção no Cron (`runAutoReplyMaintenance`) e teste.
- [ ] T029 [US5] Tela de administração no painel.
- [ ] T030 [US5] Alertas operacionais.

## Phase 9: US6 - Preparar o WhatsApp (P3) [10-discovery-whatsapp]

- [x] T031 [US6] Regras centrais sem dependência do Instagram; `provider` nas tabelas (só `instagram` habilitado).
- [x] T032 [US6] Ligar `docs/integrations/auto-reply/whatsapp-discovery.md` (PR #182) a este épico.
- [ ] T039 [US6] Decisão de produto sobre o WhatsApp (recomendação do discovery: saudação nativa assistida pelo painel no MVP).

## Phase 10: Conformidade, homologação e produção [08, 09] — pendências externas

- [ ] T033 Ratificar o ADR 0017 e revisão jurídica (base legal, aviso de automação, privacidade, termos).
- [ ] T034 Configuração no console Meta (`meta-setup.md`, itens 3 a 14).
- [ ] T035 Deploy de staging, migração aplicada, segredos no cofre e teste de RLS pela Data API.
- [ ] T036 Piloto interno com testadores; primeiro evento e primeira resposta reais.
- [ ] T037 Verificação da empresa e Revisão do app (Acesso avançado) e modo Live.
- [ ] T038 Liberação controlada e exercício de contingência.

## Dependencies & Execution Order

Fase 2 antes de tudo; Fases 3 a 6 dependem da 2; Fase 7 depende de 3 e 4; Fase 8 depende da 2; Fase 10 depende de autorizações externas.
