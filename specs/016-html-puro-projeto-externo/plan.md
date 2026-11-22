# Implementation Plan: HTML puro, projeto externo e administração por cliente

**Branch**: `cursor/plano-html-puro-9c08` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/016-html-puro-projeto-externo/spec.md`

## Summary

O proprietário (plano Essencial ou superior) envia um arquivo HTML único de até 512 KiB, recebe um
relatório automático, monta uma **página HTML emoldurada** com endereço próprio
(`/<endereço>/<página>`) ou um **bloco HTML** dentro de uma página nativa e manda cada versão nova
para revisão humana. Só versões aprovadas pelo SHA-256 chegam ao visitante, sempre num host
isolado (`sandbox.inspira.dev.br`) com origem opaca, CSP por versão e uma única mensagem aceita
(`vitrine:resize`). O Operador Inspira ganha a área **Clientes** (ficha por cliente) e a fila de
**Revisões**, registra customizações contratadas e configura o **projeto externo**: depois de
comprovar a posse do domínio por TXT ou arquivo, a vitrine (ou uma página) responde `302` na borda,
com verificação diária no Cron existente. Os Ajustes do proprietário viram grupos recolhíveis.

Abordagem técnica (detalhada em [research.md](./research.md)): conteúdo em
`private.html_package_contents` no Supabase Free com cotas (3 MiB por vitrine, 100 MiB no total),
entregue pelo mesmo Worker com `caches.default` revalidado a cada 300 s; estado do
redirecionamento lido junto do estado público que o Worker já consulta (sem subrequest a mais por
visita); quatro migrações; ADR 0014 proposta para emendar a ADR 0010.

## Technical Context

**Language/Version**: JavaScript ES Modules; Node 24 (`>=24.12.0 <25`) nos testes; navegador sem build; SQL Postgres 15 (Supabase)
**Primary Dependencies**: nenhuma nova. Web Crypto (`crypto.subtle.digest('SHA-256')`) para o hash; DoH JSON da Cloudflare já usado em `src/custom-domains.mjs`; `@electric-sql/pglite` (dev) para os testes de banco
**Storage**: Supabase Postgres Free (500 MB): tabelas novas em `public` com RLS e conteúdo em `private` (texto ≤ 524.288 bytes por versão); `caches.default` do Worker como cache de borda; rascunho e snapshot JSON existentes (`public.drafts`, `public.publications`) guardam só referências `versionId` + hash
**Testing**: `node --test` (unitários, `createApiHandler` + `createMemoryStore`, PGlite em `test/database/`), `npm run build`, `npx --yes wrangler@4.158.0 deploy --dry-run`; aceite manual em navegador real em 1280 × 900 e 375 × 812 ([quickstart.md](./quickstart.md))
**Target Platform**: Cloudflare Workers Free com Static Assets (um Worker para vitrine, painel, API e host isolado); navegadores atuais (Chrome, Safari iOS, Firefox, Edge)
**Project Type**: aplicação web (portal estático `web/` + Worker `workers/api.mjs` + módulos `src/` + migrações `supabase/`)
**Performance Goals**: página emoldurada sem subrequest extra além da leitura de estado público já existente; host isolado com acerto de cache servindo sem banco por até 300 s; "Verificar agora" responde em até 30 s (SC-013); validação de 512 KiB em varredura linear única dentro do limite de CPU do Workers Free (medir; plano B no tópico 6 de research)
**Constraints**: custo zero (ADR 0005: sem R2, sem e-mail, sem plano pago); 10 ms de CPU e 50 subrequests por execução (Cron incluído, orçamento de 30 para a verificação diária); CSP da vitrine continua `script-src 'self'`; nunca `allow-same-origin`, `allow-top-navigation*`, `allow-popups*`; efeito em até 5 minutos para retirada, volta de versão e redirecionamento (SC-006); nenhum dado pessoal em URL, log ou snapshot; autenticação na Cloudflare não configurada (nada é implantado nesta funcionalidade)
**Scale/Scope**: até 5 pacotes por vitrine (limite do plano 0/1/3/3), 5 versões aprovadas por pacote, até 3 blocos por página, 5 páginas por vitrine; dezenas de vitrines no piloto; 100 MiB de conteúdo HTML no total

Nenhum item ficou como NEEDS CLARIFICATION: os dez temas técnicos foram resolvidos em
[research.md](./research.md); o que depende de pessoas está em "Pendências humanas".

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Antes da pesquisa

| Princípio | Verificação | Situação |
| --- | --- | --- |
| I. Administração privada e publicação pública | O snapshot só pode carregar referências (`packageId`, `versionId`, hash, título, modo de altura), nunca o HTML, a declaração, o relatório ou a revisão. O redirecionamento não pode expor ao público motivo, autor nem comprovação. | Exige projeção explícita; resolvido no desenho |
| II. Isolamento entre vitrines | Pacotes, versões, revisões, vínculos e comprovações são por vitrine; operadores leem tudo só por RPC com `is_platform_admin`. Precisa de testes de RLS e de chamada direta. | Exige testes; planejados |
| III. Credenciais apenas no servidor | Token de prévia do host isolado não pode vazar segredo; nenhum segredo novo pode ir para `wrangler.jsonc`. | Atendido com `PREVIEW_HMAC_SECRET` existente |
| IV. Custo e condições verificáveis | Novo uso do banco gratuito, da Cache API, do DoH e do Cron precisa de cota, falha e alerta documentados; nenhum serviço pago. | Exige cotas; definidas em research |
| V. Entregas verificáveis | Sete histórias com cenários; risco alto (código de terceiros, redirecionamento de domínio) pede testes automatizados e aceite manual com pacote hostil. | Exige quickstart; escrito |

### Depois do desenho (Fase 1)

| Princípio | Como o desenho atende | Evidência planejada |
| --- | --- | --- |
| I | `sectionConfig` de `custom_sandbox` e `html` da página aceitam só chaves listadas ([data-model.md](./data-model.md) seção 8); o conteúdo fica em `private`, lido só por RPC que exige versão aprovada e hash igual; `public_showcase_overrides` devolve só `paused`, `htmlEnabled` e destino/alcance/abertura ([data-model.md](./data-model.md) seção 12); `302` sem página intermediária, sem canônico, `noindex` | `test/html-framed-page.test.mjs` (snapshot sem campos privados, `assertNoPrivateLeakage`), `test/database/external-project-links.test.mjs` (RPC anônima sem motivo nem prova) |
| II | RLS por `site_id` com `private.has_site_role`; escrita só por RPC/Worker com verificação de membro e papel; gatilhos de limite e cota no banco; RPCs de administração recusam quem não é `platform_admin`; host isolado sem cookie e com origem opaca; `frame-ancestors` restrito à vitrine dona | `test/database/html-packages.test.mjs`, `test/database/admin-clients.test.mjs`, `test/html-packages-api.test.mjs` (dono A × vitrine B por chamada direta), `test/html-sandbox-embed.test.mjs` |
| III | Nenhum segredo novo; `SANDBOX_ORIGIN` é variável pública; token de prévia HMAC de 10 minutos ligado a `versionId` + hash; `service_role` só no Worker; nenhum e-mail ou código de verificação em log | `test/security-rls-csp-audit.test.mjs` estendido; revisão de `wrangler.jsonc` no PR |
| IV | Cotas (3 MiB/vitrine, 100 MiB total, alerta em 80% do banco no painel do operador), orçamento do Cron (30 subrequests, fila por `next_check_at`), DoH sem SLA, hosts de terceiros da lista registrados na política de privacidade; falhas: cache servido se o banco falhar, "indisponível" se o hash divergir, verificação transitória não suspende | [research.md](./research.md) tópicos 1, 3, 7 e riscos; `docs/operations-guide.md` atualizado na entrega |
| V | Cenários A–H em [quickstart.md](./quickstart.md) cobrem as sete histórias e SC-001 a SC-013; pacote hostil executado em navegador real; tudo descrito como planejado | Testes listados em "Project Structure"; capturas 1280/375 no PR de entrega |

Resultado: **sem violações**. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/016-html-puro-projeto-externo/
├── spec.md                         # especificação (mesclada)
├── research-usabilidade.md         # auditoria e maquete (M-01 a M-09, U-01 a U-08)
├── research.md                     # Fase 0: decisões técnicas
├── plan.md                         # este arquivo
├── data-model.md                   # Fase 1: tabelas, estados, retenção, auditoria
├── quickstart.md                   # Fase 1: roteiro de validação
├── contracts/
│   ├── owner-html-packages-api.md      # API do proprietário (pacotes, versões, prévia, avisos)
│   ├── admin-html-reviews-api.md       # fila e decisões de revisão, retirada, envio pelo operador
│   ├── admin-clients-api.md            # Clientes, ficha, customizações contratadas
│   ├── external-project-api.md         # projeto externo (operador e proprietário)
│   ├── ownership-verification.md       # TXT, arquivo, repetição, Cron diário
│   ├── sandbox-embed-http.md           # host isolado: cabeçalhos, CSP, cache, prévia
│   ├── postmessage-schema.md           # vitrine:resize e estados de carregamento
│   ├── framed-page-route.md            # rota, documento e medidas da página emoldurada
│   └── redirect-behaviour.md           # 302 na borda, utm_*, laço, Insights
├── checklists/requirements.md
├── exemplos/orbit-prototipo.html   # fixture de aceite
└── tasks.md                        # Fase 2 (/speckit-tasks; não criado aqui)
```

### Source Code (repository root)

```text
supabase/migrations/
├── 20261121000100_client_customizations_notices.sql   # novo: client_customizations, panel_notices
├── 20261121000200_html_packages.sql                   # novo: pacotes, versões, conteúdo, revisões, controles, cotas, RPCs, cópia de custom_components, plans.max_html_packages, métrica
├── 20261121000300_external_project_links.sql          # novo: vínculos, configurações, provas, tentativas, public_showcase_overrides
└── 20261121000400_admin_clients.sql                   # novo: admin_list_clients, admin_read_client, alerta de uso do banco

src/
├── html-packages.mjs        # novo: estados, transições, limites, cotas, montagem de respostas do proprietário/operador
├── html-sandbox.mjs         # novo: CSP por versão, cabeçalhos, chave de cache, revalidação, token de prévia
├── external-project.mjs     # novo: validação de destino, encurtadores, laço, comprovação, Cron, utm_*
├── admin-clients.mjs        # novo: chave de cliente, filtros, cursor, projeção da ficha
├── showcase-structure.mjs   # página kind "html_frame", config de custom_sandbox, slugs reservados, pagina:<slug> no menu
├── publication-engine.mjs   # documento da página emoldurada, bloco HTML, frame-src, redirecionamento no menu
├── item-page.mjs            # links pagina:<slug> para páginas emolduradas e destino externo
├── site-lifecycle.mjs       # readPublicSiteState lê public_showcase_overrides
├── custom-domains.mjs       # DoH reaproveitado para TXT de posse; customDomainPublicPaths com páginas
├── plans.mjs, entitlements.mjs   # recurso html_packages, limite htmlPackagesPerVitrine
├── pricing-page.mjs         # rótulo do recurso (em preparação)
└── billing/lifecycle.mjs    # perda do plano: página emoldurada → 302 para a vitrine

workers/api.mjs              # host isolado (/embed), rotas do proprietário e do operador, 302, rota da página, Cron runExternalProjectChecks, 410 do endpoint antigo
wrangler.jsonc               # só a variável pública SANDBOX_ORIGIN (rota do host fica para BLK-CLOUD-01)

content/
├── plans.json               # htmlPackagesPerVitrine 0/1/3/3 e recurso html_packages
└── url-shorteners.json      # novo: lista de encurtadores recusados

web/assets/
├── html-package-rules.mjs   # novo: validação compartilhada (navegador e servidor)
└── html-frame.mjs           # novo: controlador da moldura (resize, carregamento, falha)

web/vitrine/vitrine.js, vitrine.css   # carrega html-frame.mjs; estilos da moldura em dvh
web/portal/
├── index.html               # aba Clientes primeiro + Revisões; título "Ajustes"; contêineres novos
├── portal.js, portal.css    # rotas #administracao/clientes, avisos no Início
├── settings-groups.mjs      # novo: grupos recolhíveis dos Ajustes com resumo e selo
├── html-packages-panel.mjs  # novo: Conteúdo HTML do proprietário (envio, relatório, versões, prévia)
├── admin-clients.mjs        # novo: lista e ficha de cliente
├── admin-html-reviews.mjs   # novo: fila e tela de revisão
├── admin-external-project.mjs   # novo: configuração, comprovação, ativação, histórico
├── external-project-owner.mjs   # novo: visão só leitura do proprietário
├── showcase-structure.js    # Nova página → Página HTML emoldurada; seção Bloco HTML
├── editor.js                # cartão do bloco HTML
├── platform-cms.js          # remove "Componentes" antigos; liga Revisões
└── plan-gate.mjs            # html_packages em PANEL_GATED_FEATURES
web/privacidade/, web/termos/    # conteúdo enviado pelo proprietário e hosts de terceiros

test/
├── html-package-rules.test.mjs, html-packages-api.test.mjs, html-sandbox-embed.test.mjs   # novos
├── html-framed-page.test.mjs, html-frame-controller.test.mjs                              # novos
├── external-project.test.mjs, admin-clients.test.mjs                                      # novos
├── database/html-packages.test.mjs, database/external-project-links.test.mjs, database/admin-clients.test.mjs   # novos
├── fixtures/html-packages/  # novo: hostil, altura variável, host proibido, senha, 524.289 bytes
├── plans.test.mjs, database/plans-subscriptions.test.mjs, security-rls-csp-audit.test.mjs   # estendidos
├── assets-opaque-sandbox.test.mjs   # reescrito para o novo host/CSP
└── migration-order.test.mjs         # novas migrações em ordem

docs/architecture.md, docs/operations-guide.md, CONTEXT.md, DESIGN.md   # entrega
docs/adr/0014-pacotes-html-do-proprietario.md                           # proposta (este plano)
```

**Structure Decision**: segue o padrão do repositório: regras compartilhadas entre navegador e
servidor em `web/assets/*.mjs` (precedente `quota-rules.mjs`, `auction-rules.mjs`), lógica de
servidor em módulos `src/*.mjs` importados por `workers/api.mjs`, painel em módulos `web/portal/*.mjs`
carregados sem build, uma migração por grupo de tabelas. Nenhum Worker, bucket ou serviço novo.

## Frentes de trabalho em paralelo

| Frente | Escopo | Depende de | Pode andar junto com |
| --- | --- | --- | --- |
| A. Banco | as 4 migrações, RLS, gatilhos, RPCs, cópia de `custom_components`, testes PGlite; cada migração recebe a versão no PR que a introduz, sempre maior que a última do `main` naquele momento (`scripts/check-migration-order.mjs`), e a ordem dos arquivos segue a ordem real de entrega | — | E (regras), I |
| B. Host isolado | `src/html-sandbox.mjs`, rota `/embed`, CSP, cache/revalidação, token de prévia, `SANDBOX_ORIGIN` | contratos de RPC de A (pode usar a loja em memória antes) | C, D, E |
| C. APIs de pacotes e revisão | `src/html-packages.mjs`, rotas do proprietário e do operador, plano/limite, 410 do endpoint antigo, avisos | A (assinaturas), regras de E | B, D |
| D. Projeto externo | `src/external-project.mjs`, validação, comprovação, Cron, `public_showcase_overrides` em `readPublicSiteState`, `302`, métrica | A (tabelas 9–12) | B, C |
| E. Publicação e vitrine | `web/assets/html-package-rules.mjs`, `showcase-structure.mjs`, `publication-engine.mjs`, rota da página, bloco, `html-frame.mjs`, CSS | — para as regras; B para a URL da moldura | A, C, D |
| F. Painel do proprietário | Conteúdo HTML, Nova página emoldurada, bloco no editor, Ajustes em grupos, avisos, visão do projeto externo | C e E (contratos); pode começar com a loja em memória | G |
| G. Painel do operador | Clientes, ficha, Revisões, customizações, projeto externo, alerta de uso do banco | A (RPCs), C, D | F |
| H. Testes de ponta a ponta e aceite | fixtures, pacote hostil, capturas 1280/375, tempos da US5 | B–G | — |
| I. Documentação e textos legais | ADR 0014, arquitetura, operações, `CONTEXT.md`, `DESIGN.md`, privacidade e termos | — | todas |

Interfaces que destravam o paralelismo: as assinaturas das RPCs em [data-model.md](./data-model.md),
os contratos HTTP em [contracts/](./contracts/) e a loja em memória de `createMemoryStore`, que
recebe as mesmas operações antes da migração existir.

## Ordem de entrega por fases

1. **Fundação** (bloqueia tudo): migrações `…0100` (customizações contratadas e avisos no painel,
   usadas pelos avisos da US1 e por `site_html_enabled`) e `…0200` mínima (pacotes, versões, conteúdo,
   revisões, controles, plano), `html-package-rules.mjs`, recurso `html_packages` nos planos,
   `SANDBOX_ORIGIN`.
2. **MVP — US1 (P1)**: envio com relatório, página HTML emoldurada com rota própria, prévia com
   token, envio para revisão, aprovar/recusar/pedir ajustes mínimos na aba Revisões, host isolado com
   CSP e cache, publicação recusando versão não aprovada, bloqueio por plano. Valida com o cenário A
   e B do quickstart usando o Orbit. Entregável sozinho.
3. **US7 + US2 (P2)**: estados de carregamento e falha, `vitrine:resize`, medidas finais em dvh,
   bloco HTML com os dois modos de altura, limite de 3 por página.
4. **US3 (P3)**: fila completa com filtros e espera, lista de verificação, comparação com a versão
   anterior, retirada com motivo, avisos no painel, envio pelo operador com customização (registrada
   pela API de Clientes, ainda sem tela; a tela chega na fase 6).
5. **US6 (P6, adiantada por ser pequena e depender só de 2–4)**: substituir, voltar versão, excluir
   com impedimentos, retenção de 30 dias.
6. **US4 (P4)**: migração `…0300`, comprovação, Cron, ativação, `302`, métrica e a ficha mínima do
   cliente (grupos "Customizações contratadas" e "Projeto externo", abertos por
   `#administracao/clientes/<chave>`), onde o operador registra a customização e configura o vínculo.
7. **US5 (P5)**: migração `…0400`, lista "Clientes" com busca e filtros, demais grupos da ficha,
   Ajustes em grupos, medição de SC-005/SC-008.
8. **Acabamento**: textos legais, documentação, aceite completo do quickstart, remoção da tela
   antiga de componentes.

A fase 6 pode correr em paralelo às fases 3–5 (frente D e a ficha mínima da frente G), porque não
toca as mesmas tabelas. A fase 7 depende da ficha mínima da fase 6, que ela completa, e só mostra
dados de pacotes na ficha quando a fase 2 já existir.

## Pendências humanas

1. Rota, DNS e certificado de `sandbox.inspira.dev.br` e autenticação na Cloudflare
   (`BLK-CLOUD-01`). Sem isso, o recurso fica testado só localmente; nada é implantado.
2. Duas contas de Operador Inspira com `platform_admin` para o aceite (`BLK-HITL-72`).
3. Revisão humana do texto de privacidade e termos sobre conteúdo enviado e hosts de terceiros
   antes de liberar o recurso.
4. Lino confirma os números de pacotes por plano (0/1/3/3, teto 5) antes de tirar "em preparação" da
   página de preços.
5. Ratificar ou ajustar a [ADR 0014](../../docs/adr/0014-pacotes-html-do-proprietario.md)
   (proposta).

## Complexity Tracking

Nenhuma violação da constituição.
