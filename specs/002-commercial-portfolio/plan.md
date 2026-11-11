# Implementation Plan: Oferta comercial, portfólio e pedidos de orçamento

**Branch**: `002-commercial-portfolio` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-commercial-portfolio/spec.md`

## Summary

Estruturar e validar a camada de oferta comercial, catálogo público de portfólio (`content/portfolio.json`), canal de pedido de orçamento via WhatsApp (`content/contact.json`) e o modelo de dados/governança para assinaturas opcionais de endereço personalizado e vínculos de domínio (ADRs 0005, 0006 e 0007). No piloto de custo zero, a projeção pública do portfólio e dos links de orçamento é executada estaticamente em tempo de build por `src/portfolio.mjs` e `scripts/build.mjs` (sem consultas anônimas ao banco e sem SSRF), enquanto o modelo relacional define as fronteiras de autorização para que apenas Operadores Inspira administrem vigências comerciais e vínculos de domínio com reversão segura ao endereço gratuito `vitrine.inspira.dev.br/<slug>`.

## Technical Context

**Language/Version**: JavaScript ES Modules (Node.js `>=24.12.0 <25` conforme `package.json` e `.node-version`); SQL compatível com PostgreSQL / Supabase (PGlite `0.5.15` para validação embarcada).

**Primary Dependencies**: Runtime nativo do Node.js (`node:test`, `node:assert/strict`, `node:fs/promises`, `URL`) sem dependências de produção npm; `@electric-sql/pglite` `0.5.15` apenas em `devDependencies`.

**Storage**: Catálogo público e contato comercial em arquivos JSON versionados (`content/portfolio.json`, `content/contact.json`) compilados para `dist/data/portfolio.json` e `dist/data/contact.json`; persistência administrativa planejada em Supabase Postgres (`public.sites` existente e tabelas administrativas de assinaturas/domínios documentadas em `data-model.md`).

**Testing**: `node --test` (`test/portfolio.test.mjs` e `test/marketing-build.test.mjs`).

**Target Platform**: Cloudflare Workers Free com Static Assets (`wrangler.jsonc` servindo `./dist`) para os artefatos públicos; Node.js 24 LTS para build e verificação CI.

**Project Type**: Biblioteca de projeção pública + pipeline de build estático + especificação de modelo de dados comercial multi-tenant.

**Performance Goals**: Projeção determinística em tempo de build (< 50 ms para catálogos do piloto); zero chamadas de rede ou consultas de banco em tempo de leitura pública do portfólio e da oferta.

**Constraints**: Custo zero de infraestrutura (ADR 0005); proibido usar `http:` ou credenciais em URLs de cases; proibido buscar URLs remotas no servidor para gerar preview (anti-SSRF); proibido expor número fictício quando `teamWhatsapp` for `null`; alterações de plano e domínio vedadas ao próprio proprietário da vitrine (ADR 0007).

**Scale/Scope**: Piloto controlado de até 10 vitrines, franquia comercial gratuita de 20 itens ativos por vitrine (teto técnico de 100 itens), catálogo inicial de cases revisado por Pull Request e conciliação manual de assinaturas com 7 dias de tolerância no vencimento.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Explicit public-data projection; private fields excluded from artifacts**: Atendido. `publishedPortfolio()` em `src/portfolio.mjs` filtra `published === true` e projeta explicitamente apenas `id`, `title`, `url`, `summary`, `category`, `tags`, `order` e `featured`, descartando `internalNotes`, `published` e quaisquer metadados privados antes de gravar `dist/data/portfolio.json`.
- **Server-side tenant authorization and isolation tests for persistence changes**: Atendido. O modelo de dados separa estritamente `owner_user_id` / `site_memberships` do papel `InspiraOperator`; proprietários de vitrine têm apenas leitura sobre seu próprio status de endereço e zero permissão de escrita em tabelas comerciais (`subscriptions`, `domain_bindings`).
- **Server-only credentials with minimum permissions**: Atendido. `content/contact.json` armazena apenas dígitos públicos do WhatsApp comercial (ou `null`), sem tokens de API, chaves Cloudflare ou segredos no bundle.
- **Provider quotas, commercial-use terms and failure behavior documented**: Atendido. Limites do piloto (10 vitrines, 20 itens na franquia básica, 100 de teto técnico), ausência de gateway pago e reversão ao endereço básico após 7 dias de tolerância estão documentados em `docs/commercial-offer.md` e ADRs 0005–0007.
- **Testable acceptance criteria; pending choices remain proposed**: Atendido. Cenários Given-When-Then formalizados para `002-US1` a `002-US4` em `spec.md`; preços R$ 10/mês e R$ 15/mês e painel futuro de operadores permanecem claramente identificados como propostas operacionais do piloto.

## Project Structure

### Documentation (this feature)

```text
specs/002-commercial-portfolio/
├── spec.md              # Especificação da feature com User Stories 002-US1 a 002-US4
├── plan.md              # Este plano de implementação
├── data-model.md        # Modelo de dados do catálogo, contato, assinaturas e vínculos de endereço
├── checklists/
│   └── requirements.md  # Checklist de qualidade e conformidade dos requisitos
└── tasks.md             # Lista de tarefas ordenada por dependências e histórias de usuário
```

### Source Code (repository root)

```text
content/
├── portfolio.json       # Catálogo editável de cases revisado por PR (schemaVersion: 1)
└── contact.json         # Configuração do WhatsApp comercial da equipe Inspira (teamWhatsapp)

src/
├── portfolio.mjs        # Projeção explícita publishedPortfolio() e gerador quoteContactLink()
└── public-menu.mjs      # Projeção pública de cardápio (feature 001/004/005)

scripts/
└── build.mjs            # Compila content/*.json via src/portfolio.mjs para dist/data/*.json

web/
├── index.html           # Seções públicas de oferta, customização e portfólio ("Feito com a Inspira")
├── styles.css           # Estilos da tabela comparativa de oferta e cards de portfólio
└── app.js               # Hidratação progressiva de dist/data/portfolio.json e dist/data/contact.json

test/
├── portfolio.test.mjs   # 6 testes unitários cobrindo projeção, validação HTTPS e link WhatsApp
└── marketing-build.test.mjs # Teste integrado do pacote dist/ e exclusão de campos privados
```

**Structure Decision**: Projeto único em JavaScript ES Modules na raiz do repositório, mantendo a separação estrita de camadas: dados fonte editáveis por PR em `content/`, lógica pura de validação e projeção em `src/portfolio.mjs`, empacotamento estático em `scripts/build.mjs`, apresentação pública em `web/` e testes automatizados em `test/`.

## Complexity Tracking

Sem violações da Constituição. A adoção de catálogo versionado em `content/portfolio.json` revisado por PR no piloto evita construir prematuramente um banco/painel administrativo de operadores antes que o fluxo principal de autenticação do portal esteja em produção (ADR 0007).
