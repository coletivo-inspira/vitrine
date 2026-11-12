# Implementation Plan: Programa de Auditoria UX de Ponta a Ponta e Prontidão de Conformidade Meta/Instagram (`010-ux-audit-meta-readiness`)

**Branch**: `cursor/plano-issues-abertas-6c44` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Especificação da feature em `/specs/010-ux-audit-meta-readiness/spec.md`, decisões técnicas em `/specs/010-ux-audit-meta-readiness/research.md`, modelo de dados/artefatos em `/specs/010-ux-audit-meta-readiness/data-model.md`, contratos em `/specs/010-ux-audit-meta-readiness/contracts/`, além do estado atual das especificações `/specs/008-portal-redesign/` e `/specs/009-modular-admin-platform/` e do roteiro `/docs/instagram-integration-roadmap.md`.

## Summary

Planejar e estruturar a execução completa do que falta nas issues abertas do repositório `coletivo-inspira/vitrine`:
1. **Reconciliação das Specs `008` (`#34`–`#38`) e `009` (`#39`–`#44`)**: registrar que `#34`–`#43` já foram entregues no código (PRs `#22`–`#28`, `#45`, `#54`–`#60`, `#74`, `#75`, `#83`, `#85` e `#86`), concluir a atualização documental de `supabase/README.md` referente à tarefa `T033` da issue `#44`, e isolar a validação externa de DNS/Cloudflare for SaaS como bloqueio humano (HITL);
2. **Prontidão Técnica para a Configuração Meta/Instagram (`#48`)**: consolidar as decisões arquiteturais em `docs/instagram/configuracao-meta.md` e planejar a entrega das páginas institucionais estáticas públicas `/privacidade` (`#exclusao-dados`) e `/termos` no pacote `web/` -> `dist/`, isolando as etapas humanas no console Meta e na conta `@ganjastudio.br` como bloqueios explícitos;
3. **Programa de Auditoria UX em Ondas (`#61` a `#73`)**: estruturar a abertura da matriz central (`#61` em `docs/auditoria-ux/matriz-central.md`), a execução da Primeira Onda de jornadas essenciais (`#62` descoberta institucional, `#63` entrada/navegação/conta, `#64` início/seleção de vitrines, `#65` criação de vitrine, `#66` edição manual, `#67` prévia/rascunho/publicação, `#68` vitrine pública), a Segunda Onda de fluxos complementares (`#69` importação CSV, `#70` pedidos de customização, `#71` Insights e `#72` administração da plataforma em modo híbrido AFK + HITL) em 5 larguras (`360`, `390`, `768`, `1024`, `1440 px`), orientação horizontal e zoom `200%`, e o relatório consolidado (`#73` em `docs/auditoria-ux/relatorio-consolidado.md`).

## Technical Context

**Language/Version**: JavaScript ES Modules (Node.js `>=24.12.0 <25` / compatível com runner Node 22 LTS e Browser ES2022); HTML5 semântico; CSS3 com Custom Properties, `@supports` e Media Queries de acessibilidade; SQL PostgreSQL / PGlite `0.5.15`; Markdown estruturado.

**Primary Dependencies**: Zero pacotes npm adicionais de runtime. Ferramental existente do repositório (`node --test`, `scripts/build.mjs`, `scripts/serve.mjs`, `@electric-sql/pglite` em `devDependencies` e `npx --yes wrangler@4.158.0 deploy --dry-run`).

**Storage**: Sem novas tabelas pagas; reutiliza a cadeia de migrações append-only existente (`202611070001_site_access.sql` até `202611120009_profile_custom_interests.sql`) no Supabase Postgres Free (500 MB) e artefatos documentais versionados em `docs/auditoria-ux/` e `specs/010-ux-audit-meta-readiness/`.

**Testing**: `node --test` (152 testes cobrindo PGlite RLS, projeção pública, contratos HTTP, parser CSV, fluxo público em 3 etapas, Open Graph, herança de modelos, prévia HMAC, sandbox opaco, domínios personalizados e contratos de CSS/terminologia), `npm run build` e `npx --yes wrangler@4.158.0 deploy --dry-run`.

**Target Platform**: Cloudflare Workers Free com Static Assets (`wrangler.jsonc`) e pré-visualização local determinística em loopback (`http://127.0.0.1:4173`).

**Project Type**: Aplicação Web SaaS multi-superfície (Divulgação multipágina estática + Painel Administrativo SPA em Liquid Glass + Vitrine pública modular + Sandbox opaco + API Worker + Postgres RLS).

**Performance Goals**: Páginas públicas estáticas (`/`, `/como-funciona/`, `/possibilidades/`, `/planos/`, `/orcamento/`, `/privacidade/`, `/termos/` e `/loja1`) com zero chamadas ao Supabase, pacote da vitrine pública `< 100 KB`, tempo de CPU no Worker `< 1,5 ms` em cache hit/SWR e alvos interativos `>= 44×44 px` sem barra de rolagem horizontal acidental de `360 px` a `1440 px` e em zoom `200%`.

**Constraints**: Custo operacional zero estrito (ADR 0005); sem planos pagos nem upgrades automáticos; proibido afirmar deploy remoto não verificado; usar sempre **vitrine** (nunca "catálogo" ou "cardápio" em texto novo para usuário); CSP `script-src 'self'` sem scripts ou estilos inline; nenhum segredo em documentos ou código versionado; ações humanas externas registradas como bloqueios explícitos.

**Scale/Scope**: Cobertura das 25 issues abertas (`#34`–`#38`, `#39`–`#44`, `#48` e `#61`–`#73`), 11 jornadas auditadas em 5 larguras + orientação horizontal + zoom `200%` + 2 temas (`light`/`dark`), e 2 novas páginas institucionais de conformidade (`/privacidade` e `/termos`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked and passed after Phase 1 design.*

- **I. Administração privada e publicação pública**: Atendido. As páginas `/privacidade` e `/termos` e a auditoria da vitrine pública (`#68`) preservam a projeção pública estrita (`assertNoPrivateLeakage`), sem expor sessões, rascunhos ou tokens.
- **II. Isolamento entre vitrines**: Atendido. As jornadas `#63`, `#64`, `#67` e `#72` validam explicitamente o isolamento por vitrine e por papel (`owner`, `admin`, `editor`, `viewer`, `platform_admin`) tanto na UI quanto na API/RLS.
- **III. Credenciais apenas no servidor**: Atendido. Nenhum segredo entra nos documentos de auditoria ou de configuração Meta (`#48`); o escopo planejado para Instagram restringe-se à leitura mínima `instagram_business_basic` com tokens guardados apenas no servidor.
- **IV. Custo e condições verificáveis**: Atendido. Toda a execução da auditoria e as páginas estáticas de conformidade operam em custo zero dentro dos limites do Cloudflare Workers Free e Supabase Free, respeitando as travas de 20 itens ativos / 100 totais / 256 KiB / 200 KB WebP / 95 domínios.
- **V. Entregas verificáveis**: Atendido. Cada issue aberta foi auditada contra o código e PRs mergeados (`#18` a `#86`), distinguindo o que já está entregue do que falta e do que depende de ação humana (Lino).

## Project Structure

### Documentation (this feature)

```text
specs/010-ux-audit-meta-readiness/
├── spec.md                                        # Especificação funcional cobrindo #61–#73 e #48
├── plan.md                                        # Este plano de implementação (/speckit-plan)
├── research.md                                    # Phase 0: todas as decisões tomadas sem perguntas abertas
├── data-model.md                                  # Phase 1: esquema da matriz UX, achados, páginas de conformidade e bloqueios HITL
├── quickstart.md                                  # Phase 1: guia rápido de execução e validação por onda
├── checklists/
│   └── requirements.md                            # Checklist de qualidade da especificação
└── contracts/
    ├── ux-audit-matrix-contract.md                # Contrato da matriz central (#61–#72) e consolidação (#73)
    └── meta-compliance-routes-contract.md         # Contrato das rotas públicas /privacidade, /termos e endpoints Meta (#48)
```

### Source Code & Deliverables Planned (repository root)

```text
docs/
├── instagram/
│   └── configuracao-meta.md                       # [Existente - PR #77] Checklist Meta (#48) e bloqueios humanos
└── auditoria-ux/
    ├── matriz-central.md                          # [Onda 0/1/2 - Issues #61 a #72] Inventário de ambientes, telas, controles e achados
    └── relatorio-consolidado.md                   # [Onda 3 - Issue #73] Consolidação por dispositivo, P0/P1 e backlog nos 5 eixos

web/
├── privacidade/
│   └── index.html                                 # [Pré-requisito técnico #48] Política de Privacidade e #exclusao-dados
└── termos/
    └── index.html                                 # [Pré-requisito técnico #48] Termos de Uso da Vitrine Inspira

supabase/
└── README.md                                      # [Concluído nesta branch - Issue #44 T033] Documentação das migrações 0004 a 0009

test/
├── marketing-build.test.mjs                       # Validação de links, assets e terminologia ("vitrine") nas páginas públicas
└── portal-redesign-qa.test.mjs                    # Validação de contratos CSS Liquid Glass, acessibilidade e ausência de scripts inline
```

**Structure Decision**: A especificação `010-ux-audit-meta-readiness` organiza os entregáveis do ciclo atual sem alterar a arquitetura aprovada nas specs `008` e `009`: concentra os relatórios de auditoria das issues `#61` a `#73` em `docs/auditoria-ux/` e adiciona as páginas públicas estáticas `/privacidade` e `/termos` em `web/` seguindo exatamente a estrutura multipágina introduzida na PR `#47` (`web/como-funciona/`, `web/possibilidades/`, `web/planos/`, `web/orcamento/`).

## Execution Waves & Suggested Order

1. **Passo 1 — Fechamento documental da Spec 008 (`#34`–`#38`) e Spec 009 (`#39`–`#44`)**:
   - Sincronizar `specs/008-portal-redesign/tasks.md`, `specs/009-modular-admin-platform/tasks.md` e `supabase/README.md` *(já realizado nesta branch)*.
2. **Passo 2 — Páginas públicas de conformidade `/privacidade` e `/termos` (pré-requisito de código da `#48`)**:
   - Criar `web/privacidade/index.html` (com `#exclusao-dados`) e `web/termos/index.html` e validar no build estático.
3. **Passo 3 — Abertura da Matriz Central (`#61`)**:
   - Criar `docs/auditoria-ux/matriz-central.md` registrando URLs, versões, papéis, telas disponíveis e bloqueios.
4. **Passo 4 — Primeira Onda de Auditoria UX (`#62` a `#68`, paralelizável por superfície)**:
   - Executar `#62` (site institucional), `#63` (login/navegação/conta), `#64` (início/seleção de vitrines), `#65` (criação de vitrine), `#66` (edição manual), `#67` (prévia/rascunho/publicação) e `#68` (vitrine pública) nas 5 larguras + horizontal + zoom 200% + claro/escuro.
5. **Passo 5 — Segunda Onda de Auditoria UX (`#69` a `#72`)**:
   - Executar `#69` (importação CSV), `#70` (pedidos de customização), `#71` (leitura dos Insights) e `#72` (administração da plataforma em modo AFK local + roteiro HITL para conta de teste do Lino).
6. **Passo 6 — Consolidação e Priorização (`#73`)**:
   - Gerar `docs/auditoria-ux/relatorio-consolidado.md` consolidando cobertura, achados `P0`/`P1` e oportunidades de simplificação nos 5 eixos.
7. **Passo 7 — Ações Humanas (HITL) pelo Lino**:
   - Executar os desbloqueios externos listados em `data-model.md` (`BLK-META-01`, `BLK-META-02` para `#48`; `BLK-CLOUD-01` para `#44`; `BLK-HITL-72` para `#72`) e fechar as issues já entregues (`#34`–`#43`).

## Complexity Tracking

Sem violações da Constituição.
