# Vitrine Inspira

Portal multiusuário e multivitrine para criar sites a partir de templates. Primeiro recorte: pizzaria, cardápio administrável e contato pelo WhatsApp.

## Estado atual

Fundação local, sem login, banco, interface ou publicação real. O repositório original tinha somente este README. Nenhum serviço foi provisionado e nenhum segredo é necessário para executar esta entrega.

- `npm test`: valida a fronteira de publicação e os links.
- `npm run demo`: imprime um cardápio público de exemplo e um link; não publica nem envia mensagens.
- Node.js 22 ou superior, sem dependências externas.

Leia [arquitetura](docs/architecture.md), [comparação de backend e limites](docs/backend-research.md), [roadmap](docs/roadmap.md) e [vocabulário](CONTEXT.md).

O desenvolvimento usa [Spec Kit](docs/development.md), com integração Codex/PowerShell e princípios em `.specify/memory/constitution.md`.

A hospedagem está em discussão: GitHub Pages tem restrições para negócios, transações comerciais e SaaS. Cloudflare é uma alternativa proposta, ainda não aprovada. Não há workflow de deploy nesta branch.
