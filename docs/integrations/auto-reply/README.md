# AutoResposta: índice e estado real

Resposta automática do Instagram com o link público da vitrine. Data desta revisão: 2026-11-26. Decisão: [ADR 0017](../../adr/0017-autoresposta-canais-sociais.md) (**proposta**). Especificação Spec Kit: [`specs/019-autoresposta/`](../../../specs/019-autoresposta/spec.md).

## Onde está cada documento

| Documento pedido | Onde fica |
| --- | --- |
| Especificação de produto, regras de negócio | [`specs/019-autoresposta/spec.md`](../../../specs/019-autoresposta/spec.md) (FR-001 a FR-020, histórias, casos de borda) |
| Especificação técnica | [`plan.md`](../../../specs/019-autoresposta/plan.md) e contratos em [`contracts/`](../../../specs/019-autoresposta/contracts/) |
| Modelo de dados | [`data-model.md`](../../../specs/019-autoresposta/data-model.md) |
| Discovery (repositório, #48 e Meta) | [`research.md`](../../../specs/019-autoresposta/research.md) |
| Estratégia de testes | [`quickstart.md`](../../../specs/019-autoresposta/quickstart.md) e [`tasks.md`](../../../specs/019-autoresposta/tasks.md) |
| Arquitetura e diagramas | [`architecture.md`](architecture.md) |
| Configuração Meta | [`meta-setup.md`](meta-setup.md) |
| Fluxo OAuth e ciclo do token | [`oauth-flow.md`](oauth-flow.md) |
| Eventos de webhook | [`webhook-events.md`](webhook-events.md) |
| Segurança e LGPD | [`security-privacy.md`](security-privacy.md) |
| Revisão do app (App Review) | [`app-review.md`](app-review.md) |
| Custos | [`cost-analysis.md`](cost-analysis.md) |
| Checklist de produção | [`production-checklist.md`](production-checklist.md) |
| Runbook operacional e contingência | [`operational-runbook.md`](operational-runbook.md) |
| Roadmap, épico e issues | [`docs/backlog/autoresposta/`](../../backlog/autoresposta/00-epico-autoresposta.md) |
| Viabilidade do WhatsApp | [`whatsapp-discovery.md`](whatsapp-discovery.md) (PR #182, outro worker do Project) |

## Estado de cada parte

| Parte | Estado |
| --- | --- |
| ADR 0017 | Proposta, não ratificada |
| Migrações `20261126001000_auto_reply.sql` e `20261126002000_auto_reply_rotation_deletion.sql` | Implementadas e testadas em PGlite; **não aplicadas** no Supabase |
| Rotas do Worker (painel, OAuth, webhook, callbacks da Meta, administração, Cron) | Implementadas e testadas com a Meta simulada; **sem deploy** |
| Seção "Resposta automática" no painel | Implementada; testada por módulo e capturas 1280/375 px locais com dados simulados |
| Tela de administração no painel | Implementada (aba "Resposta automática"), com alertas e rotação de chave; testada por módulo e capturas locais |
| Página de acompanhamento da exclusão | Implementada em `/privacidade/exclusao/`; sem deploy |
| Configuração no console Meta | **Não feita** (nenhuma alteração externa nesta entrega) |
| Revisão do app, Verificação da empresa, modo Live | **Pendentes** (dependências externas) |
| Piloto, homologação e produção | **Não iniciados** |
| Política de privacidade e termos | Texto proposto em `security-privacy.md`; páginas **não alteradas** |

Mocks e fixtures provam o comportamento do código, não o funcionamento com a Meta real.
