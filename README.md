# Vitrine Inspira

Portal multiusuário e multivitrine para criar sites a partir de templates. Primeiro recorte: pizzaria, cardápio administrável e contato pelo WhatsApp.

## Estado atual

Fundação local com migração SQL e testes de acesso; sem login integrado, banco remoto, interface ou publicação real. O repositório original tinha somente este README. Nenhum serviço foi provisionado e nenhum segredo é necessário para executar esta entrega.

- `npm ci`: instala exatamente as dependências do lockfile.
- `npm test`: valida projeção pública, portfólio, links e isolamento do banco em Postgres embarcado.
- `npm audit`: consulta vulnerabilidades conhecidas das dependências npm.
- `npm run demo`: imprime um cardápio público de exemplo e um link; não publica nem envia mensagens.
- Node.js **24 LTS**, no mínimo **24.22.2**, usando as correções mais recentes da linha 24. A instalação recusa outras linhas e versões abaixo do mínimo; PGlite é dependência apenas de desenvolvimento/testes.

Consulte a [revisão de Node, dependências e segurança](docs/runtime-security.md) para resultados, manutenção e limitações dos testes. Node é usado no desenvolvimento e CI; Cloudflare Workers usa seu próprio runtime.

Leia [arquitetura](docs/architecture.md), [comparação de backend e limites](docs/backend-research.md), [roadmap](docs/roadmap.md) e [vocabulário](CONTEXT.md).

O desenvolvimento usa [Spec Kit](docs/development.md), com integração Codex/PowerShell e princípios em `.specify/memory/constitution.md`.

Cloudflare foi escolhida para hospedagem em 2026-11-07. GitHub permanece para código e automações. Supabase Auth + Postgres foi escolhido para autenticação/persistência. Login inicial aprovado: Entrar com Google via Supabase Auth. Configuração e publicação ainda serão feitas. Não há workflow de deploy nesta branch.

Restrição de custo: planos Free, templates centralizados e nenhuma contratação automática. Ver [decisões do piloto](docs/adr/0005-zero-cost-mvp.md) e [camada de acesso](supabase/README.md).

Endereços planejados: `vitrine.inspira.dev.br` para divulgação, `/loja1` nesse domínio para vitrines públicas e `painel.inspira.dev.br` para administração. Ver [decisão de endereços](docs/adr/0006-public-addresses.md). DNS e publicação ainda não configurados.

Oferta gratuita, assinaturas opcionais e customizações: [proposta comercial](docs/commercial-offer.md). Análise do export fornecido: [DNS](docs/dns-review.md). Cadastro inicial de exemplos em [content/portfolio.json](content/portfolio.json), com instruções em [content/README.md](content/README.md); ainda sem painel de portfólio.

Design: [contexto de produto](PRODUCT.md) e [modelagem do site de divulgação](docs/marketing-design.md), com prioridade ao brandbook do Coletivo Inspira e Liquid Glass como detalhe complementar. Esta proposta visual abrange somente a divulgação; implementação e publicação seguem pendentes.
