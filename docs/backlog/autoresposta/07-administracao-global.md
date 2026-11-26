---
titulo: "[AutoResposta 07] Administração global: interruptores, piloto, suspensão e métricas"
rotulos: autoresposta, enhancement, painel
depende: 03
---
**Épico**: {{issue:00}} · **Prioridade**: P1 · **Complexidade**: M · **Tipo**: técnico + produto

## Contexto

O Coletivo precisa ligar aos poucos e desligar em emergência, sem ver tokens nem conversas.

## Objetivo

Tela "Resposta automática" na Administração da plataforma, sobre as rotas já prontas.

## Escopo

- [x] Rotas `GET /api/admin/auto-reply`, `PUT .../controls`, `PUT .../sites/:id`, `POST .../connections/:id/suspend` (testadas).
- [ ] Tela no painel (aba da administração) com interruptores, vitrines liberadas, conexões e métricas de 7 dias.
- [ ] Alertas operacionais (volume de assinaturas inválidas, falhas de autorização, `uncertain`).

## Fora do escopo

Analytics detalhado; limites por plano (sem decisão comercial).

## Requisitos

US5; FR-016, FR-017; contrato `admin-api.md`.

## Critérios de aceite

- [ ] Tela com estados de carregando, vazio, erro e sucesso; 1280 e 375 px.
- [ ] Ações auditadas visíveis no log de auditoria existente.

## Dependências

{{issue:03}}.

## Riscos

Operar por console do navegador até a tela existir.

## Cenários de teste

Rotas cobertas em `test/auto-reply.test.mjs` (US5); tela a testar.

## Evidências para conclusão

Capturas e teste de módulo da tela.

## Referências

`operational-runbook.md`.
