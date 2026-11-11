# Implementation Plan: Motor de Publicação Determinístico e Imutável (`005-publication-engine`)

**Branch**: `005-publication-engine` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-publication-engine/spec.md`.

## Summary

Implementar o motor de publicação determinístico e imutável em `src/publication-engine.mjs`, a rota autenticada `POST /api/sites/:siteId/publish` e as rotas públicas de leitura de artefatos publicados em `workers/api.mjs`, o botão "Publicar Vitrine" no Portal Administrativo (`web/portal/`) e a pré-compilação estática da vitrine piloto `loja1` em `scripts/build.mjs`. Toda publicação valida o rascunho via `validateDraftContent()` e executa obrigatoriamente `publicMenu()` de `src/public-menu.mjs`, gera hash SHA-256 canônico e atualiza atomicamente o ponteiro público sem afetar a versão anterior em caso de erro.

## Technical Context

**Language/Version**: JavaScript ES Modules (Node.js `>=24.12.0 <25`).

**Primary Dependencies**: APIs Web nativas (`crypto.subtle`, `TextEncoder`, `Request`, `Response`, `URL`), `src/public-menu.mjs` e `src/portal-validation.mjs`. Zero pacotes npm adicionais.

**Storage**: Publicações emitidas armazenadas de forma atômica no store de publicações do Worker (memória / cache de borda) e pré-compiladas como Static Assets em `dist/data/vitrines/<slug>/menu.json` durante o build.

**Testing**: `node --test` (`test/publication-and-storefront.test.mjs` e suíte completa).

**Target Platform**: Cloudflare Workers Free com Static Assets (`wrangler.jsonc`).

**Project Type**: Módulo de domínio isomórfico + Cloudflare Worker + pipeline de build estático + integração UI no Portal.

**Performance Goals**: Compilação e hash SHA-256 de um cardápio de até 20 itens ativos em < 5 ms; entrega de JSON público em < 2 ms sem tocar no Supabase.

**Constraints**: Custo zero (ADR 0005); zero consultas ao Supabase em rotas públicas; projeção explícita obrigatória via `publicMenu()`; zero pacotes npm novos.

**Scale/Scope**: Piloto de até 10 vitrines com até 20 itens ativos por vitrine publicada.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Administração privada e publicação pública**: Atendido. `compilePublicStorefront()` usa `publicMenu()` e lista branca estrita de campos públicos; nenhum metadado privado ou item oculto entra no artefato publicado.
- **II. Isolamento entre vitrines**: Atendido. `POST /api/sites/:siteId/publish` exige sessão válida (`401`) e verifica vínculo do usuário à vitrine (`404 SITE_NOT_FOUND` para terceiros).
- **III. Credenciais apenas no servidor**: Atendido. Rotas públicas servem apenas JSON pré-compilado estático ou em cache público, sem chaves `service_role` nem tokens em URLs ou artefatos.
- **IV. Custo e condições verificáveis**: Atendido. Cabeçalhos `Cache-Control: public, max-age=31536000, immutable` para releases versionadas por hash e Static Assets para `/loja1` eliminam leitura no banco em acessos públicos.
- **V. Entregas verificáveis**: Atendido. Cenários Given-When-Then verificados por testes automatizados em `test/publication-and-storefront.test.mjs`.

## Project Structure

### Documentation (this feature)

```text
specs/005-publication-engine/
├── spec.md                  # Especificação da feature (005-US1 a 005-US4)
├── plan.md                  # Plano técnico de implementação
├── data-model.md            # Modelo de dados do artefato publicado e metadados de release
├── tasks.md                 # Lista de tarefas ordenadas por dependência
└── checklists/
    └── requirements.md      # Checklist de qualidade e requisitos
```

### Source Code (repository root)

```text
src/
├── public-menu.mjs          # Projeção pública canônica e whatsappLink()
├── portal-validation.mjs    # Validação de rascunho e limites do plano gratuito
└── publication-engine.mjs   # Compilador determinístico, projeção de categorias e SHA-256

content/
└── vitrines/
    └── loja1.json           # Dados públicos da vitrine piloto pré-compilada no build

workers/
└── api.mjs                  # POST /api/sites/:siteId/publish e entrega de /data/vitrines/:slug/*

web/portal/
├── index.html               # Botão "Publicar Vitrine" e status de publicação no editor
├── portal.css               # Estilos do status/link de publicação
└── editor.js                # Integração com POST /api/sites/:siteId/publish e modo local

scripts/
└── build.mjs                # Pré-compilação de content/vitrines/loja1.json para dist/
```

**Structure Decision**: Isolar a lógica pura de compilação, sanitização de categorias e cálculo de hash SHA-256 em `src/publication-engine.mjs`, permitindo que tanto o Cloudflare Worker (`workers/api.mjs`) quanto o script de build (`scripts/build.mjs`) utilizem exatamente o mesmo pipeline determinístico.

## Complexity Tracking

Sem desvios da Constituição.
