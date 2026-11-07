<!-- Sync Impact Report: template -> 0.1.0. Initial proposed principles.
Added: security boundaries, cost constraints and workflow.
plan-template.md and tasks-template.md updated; spec-template.md compatible.
No templates/commands directory installed. README and AGENTS updated.
Deferred: user ratification, Cloudflare product, identity provider and ownership model. -->
# Vitrine Inspira Constitution

Status: proposta baseada no escopo solicitado; não aprova fornecedores.

## Core Principles

### I. Administração privada e publicação pública
Publicações DEVEM usar projeção explícita de campos públicos. Login, sessões,
rascunhos e custos internos NÃO DEVEM entrar nos artefatos publicados.

### II. Isolamento entre vitrines
Operações administrativas DEVEM verificar identidade e acesso no servidor.
Antes de liberar persistência multiusuário, testes DEVEM demonstrar que um usuário
não lê nem altera dados de outro, inclusive por chamadas diretas.

### III. Credenciais apenas no servidor
Segredos NÃO DEVEM aparecer em código versionado, bundles, URLs ou logs.
Integrações DEVEM usar permissões mínimas e revogáveis.

### IV. Custo e condições verificáveis
Integrações DEVEM registrar cotas, condições de uso e tratamento de falhas.
Planos gratuitos NÃO DEVEM ser tratados como SLA ou custo zero permanente.
Decisões pendentes DEVEM continuar identificadas como propostas.

### V. Entregas verificáveis
Cada funcionalidade DEVE ter cenários de aceite e evidência proporcional ao risco.
Autorização, projeção pública e publicação DEVEM ter testes relevantes.
Funcionalidades planejadas NÃO DEVEM ser descritas como implementadas.

## Delivery Constraints
MVP: pizzaria, cardápio e contato WhatsApp. Link não equivale a envio automático
ou confirmação de pedido. Cloudflare foi escolhida para hospedagem. Backend, produto Cloudflare, propriedade
e política de repositórios continuam em discussão em docs/roadmap.md. Deploy permanece pendente.

## Development Workflow
Usar Spec Kit para especificar, esclarecer, planejar, decompor, analisar e executar
por funcionalidade. Reaproveitar docs/ como pesquisa; CONTEXT.md é vocabulário;
ADRs registram decisões com status. Trabalhar em branch e PR e executar os testes
aplicáveis. UI requer contexto de produto e validação desktop/mobile.

## Governance
Verificar estes princípios em cada plano e PR. Alterações DEVEM explicar motivo,
impacto e migração: major para quebra de princípio, minor para adição e patch
para esclarecimento. Instruções do usuário e ambiente prevalecem.
A versão 0.1.0 organiza restrições existentes sem ratificar arquitetura final.

**Version**: 0.1.0 | **Ratified**: TODO: confirmar com usuário | **Last Amended**: 2026-11-07
