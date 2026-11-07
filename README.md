# Vitrine Inspira

Portal multiusuário e multivitrine para criar sites a partir de templates. Primeiro recorte: pizzaria, cardápio administrável e contato pelo WhatsApp.

## Estado atual

Fundação local com migração SQL e testes de acesso; sem login integrado, banco remoto, interface ou publicação real. O repositório original tinha somente este README. Nenhum serviço foi provisionado e nenhum segredo é necessário para executar esta entrega.

- `npm ci` e `npm test`: validam projeção pública, links e isolamento do banco em Postgres embarcado.
- `npm run demo`: imprime um cardápio público de exemplo e um link; não publica nem envia mensagens.
- Node.js 22 ou superior; PGlite é dependência apenas de desenvolvimento/testes.

Leia [arquitetura](docs/architecture.md), [comparação de backend e limites](docs/backend-research.md), [roadmap](docs/roadmap.md) e [vocabulário](CONTEXT.md).

O desenvolvimento usa [Spec Kit](docs/development.md), com integração Codex/PowerShell e princípios em `.specify/memory/constitution.md`.

Cloudflare foi escolhida para hospedagem em 2026-11-07. GitHub permanece para código e automações. Supabase Auth + Postgres foi escolhido para autenticação/persistência. Login inicial aprovado: Entrar com Google via Supabase Auth. Configuração e publicação ainda serão feitas. Não há workflow de deploy nesta branch.

Restrição de custo: planos Free, templates centralizados e nenhuma contratação automática. Ver [decisões do piloto](docs/adr/0005-zero-cost-mvp.md) e [camada de acesso](supabase/README.md).
