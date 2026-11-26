---
titulo: "[EPIC] AutoResposta — Integração de canais sociais com vitrines públicas"
rotulos: autoresposta, enhancement
depende:
---
## Contexto

O proprietário conecta a conta profissional do Instagram (no futuro, o WhatsApp Business) pela autorização oficial da Meta, escreve uma mensagem com o endereço da vitrine e, quando um consumidor manda mensagem, a Vitrine responde uma vez. O atendimento continua no app original. Simplicidade é requisito: nada de chatbot, inbox ou CRM.

- Especificação: [`specs/019-autoresposta/spec.md`](../../../specs/019-autoresposta/spec.md)
- Plano e contratos: [`plan.md`](../../../specs/019-autoresposta/plan.md), [`contracts/`](../../../specs/019-autoresposta/contracts/)
- Tarefas: [`tasks.md`](../../../specs/019-autoresposta/tasks.md)
- Decisão: [ADR 0017](../../adr/0017-autoresposta-canais-sociais.md) (proposta)
- Guias: [`docs/integrations/auto-reply/`](../../integrations/auto-reply/README.md)

## Épicos (uma issue por épico; tarefas dentro de cada uma)

- [ ] {{issue:01}} 01 Discovery e arquitetura — concluído em documento neste PR
- [ ] {{issue:02}} 02 Autorização Instagram (depende de 03 e do console Meta)
- [ ] {{issue:03}} 03 Banco e segurança
- [ ] {{issue:04}} 04 Webhooks (depende de 03)
- [ ] {{issue:05}} 05 Resposta automática (depende de 02, 03 e 04)
- [ ] {{issue:06}} 06 Interface administrativa do proprietário (depende de 02 e 05)
- [ ] {{issue:07}} 07 Administração global (depende de 03)
- [ ] {{issue:08}} 08 App Review e conformidade (pendência externa)
- [ ] {{issue:09}} 09 Homologação e produção (pendência externa)
- [ ] {{issue:10}} 10 Discovery WhatsApp (documento no PR #182; falta a decisão)

## Caminho crítico

Ratificar ADR 0017 → deploy de staging autorizado → migração aplicada → configuração Meta (08) → piloto interno (09) → Revisão do app e Verificação da empresa (08) → liberação controlada (09). O código de 02 a 06 está no PR inicial com Meta simulada; a tela de administração (07) falta.

## Passos humanos

- [ ] Ratificar o ADR 0017 (Lino).
- [ ] Revisão jurídica: base legal, aviso de automação, política de privacidade e termos.
- [ ] Console Meta: configuração, URL de retorno, webhook, testadores (`meta-setup.md`).
- [ ] Autenticação Cloudflare e deploy de staging.

## Critérios de aceite do épico

Os 26 critérios de [`production-checklist.md`](../../integrations/auto-reply/production-checklist.md), cada um com evidência real (não só mocks).
