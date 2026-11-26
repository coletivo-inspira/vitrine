---
titulo: "[Convite de demonstração] Épico: demonstração montada pela Inspira, convite por link, cortesia e equipe"
rotulos: aquisicao, painel, enhancement
depende:
---
## Contexto

Para trazer negócios, o Lino quer montar uma vitrine para um negócio (por exemplo, um salão com
os serviços no catálogo do WhatsApp), mandar um convite ao dono e dar 3 meses do plano
Profissional. Quem aceitar fica com a vitrine e chama a equipe (administrador, funcionário ou
somente leitura). Só o administrador do sistema, ou operadores de captação autorizados por ele,
cria demonstrações e convites de dono.

- Especificação: [`specs/018-convite-demonstracao/spec.md`](../../../specs/018-convite-demonstracao/spec.md)
- Plano: [`specs/018-convite-demonstracao/plan.md`](../../../specs/018-convite-demonstracao/plan.md)
- Tarefas: [`specs/018-convite-demonstracao/tasks.md`](../../../specs/018-convite-demonstracao/tasks.md)
- Decisão: [ADR 0016](../../adr/0016-convite-demonstracao-e-cortesia.md) (proposta).

## Issues (uma por PR)

- [ ] {{issue:01}} Banco: convites, cortesia e papel de captação
- [ ] {{issue:02}} Papel de captação e área "Demonstrações" (depende de 01)
- [ ] {{issue:03}} Convite do dono e prévia sem login (depende de 02)
- [ ] {{issue:04}} Aceite com cortesia e recusa (depende de 03)
- [ ] {{issue:05}} Fim da cortesia e escolha dos itens ao publicar (depende de 04)
- [ ] {{issue:06}} Equipe da vitrine por link (depende de 01 e 04)
- [ ] {{issue:07}} Testes de ponta a ponta e guia de operação (fecha o épico)

## Passos humanos

- [ ] Ratificar o ADR 0016.
- [ ] Reconferir com o jurídico a base legal (legítimo interesse) para montar demonstrações com
      dados públicos de negócios ([research R5](../../../specs/018-convite-demonstracao/research.md)).

## Critérios de aceite do épico

- [ ] Um operador monta uma demonstração de 20 itens por planilha e gera o convite em até 15 minutos.
- [ ] O dono vai do link à vitrine publicada em até 5 minutos, com 3 meses de Profissional.
- [ ] Nenhuma demonstração ou prévia aparece em buscadores; nenhuma mensagem sai da plataforma.
- [ ] Isolamento entre vitrines comprovado para operador de captação, funcionário e somente leitura.
