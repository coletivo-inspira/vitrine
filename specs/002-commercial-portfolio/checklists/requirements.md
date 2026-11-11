# Specification Quality & Requirements Checklist: Oferta comercial, portfólio e pedidos de orçamento

**Purpose**: Auditar a completude, clareza, rastreabilidade e conformidade constitucional da especificação `002-commercial-portfolio` frente aos ADRs 0005, 0006 e 0007.  
**Created**: 2026-11-11  
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [data-model.md](../data-model.md)

## Content & Governance Quality

- [x] CHK001 As quatro User Stories canônicas (`002-US1` a `002-US4`) possuem prioridades explícitas (`P1`/`P2`), justificativa de prioridade, critério de teste independente e cenários formais no formato Given-When-Then.
- [x] CHK002 O vocabulário utilizado segue estritamente as definições de `CONTEXT.md` (*Site de divulgação*, *Vitrine*, *Proprietário*, *Assinatura*, *Vínculo de domínio*, *Customização*, *Case*, *Operador Inspira*).
- [x] CHK003 Propostas comerciais (R$ 10/mês para subdomínio Inspira e R$ 15/mês para domínio próprio) estão claramente identificadas como valores propostos para o piloto, sem fingir checkout automático ativo (Princípio V da Constituição e ADR 0007).

## Offer & Commercial Boundaries (`002-US1` & `002-US4`)

- [x] CHK004 A especificação define com exatidão os limites da vitrine básica gratuita: 1 vitrine por proprietário, template `pizzeria-v1`, até 20 itens ativos na franquia comercial (teto técnico de 100 itens no ADR 0005), link WhatsApp e endereço `vitrine.inspira.dev.br/<slug>`.
- [x] CHK005 Fica explícito que o registro e a renovação anual de domínio próprio (ex.: `.com.br`) pertencem ao cliente e não estão incluídos na mensalidade de R$ 15/mês (`FR-002`).
- [x] CHK006 A política de vencimento define aviso prévio, período de tolerância de 7 dias corridos (`grace_period`) e suspensão reversível (`suspended`) que restaura o endereço gratuito `vitrine.inspira.dev.br/<slug>` sem apagar `sites`, `site_memberships` ou `drafts` (`FR-008`, `FR-009`).
- [x] CHK007 A regra de canonicalização reflete a atualização do ADR 0007 sobre o ADR 0006: enquanto o endereço personalizado estiver ativo e verificado, ele é canônico e o caminho básico redireciona para ele; quando suspenso, o caminho básico volta a ser canônico.

## Portfolio Projection & Quote Security (`002-US2` & `002-US3`)

- [x] CHK008 `publishedPortfolio()` exige `schemaVersion: 1`, filtra apenas `published === true` e exporta exclusivamente os campos públicos `id`, `title`, `url`, `summary`, `category`, `tags`, `order` e `featured`, descartando `internalNotes` e `published` (`FR-003`).
- [x] CHK009 `publishedPortfolio()` rejeita URLs com protocolo diferente de `https:` (`http:`, `javascript:`) ou contendo `username`/`password` com `TypeError('Use a public HTTPS URL without credentials')` (`FR-004`).
- [x] CHK010 `quoteContactLink()` retorna `null` quando `teamWhatsapp` é `null` (mantendo o botão de orçamento inativo/informativo, sem número inventado) e valida números configurados contra `^[1-9]\d{7,14}$` (`FR-005`, `FR-006`).
- [x] CHK011 O link de orçamento com referência codifica `title` e `id` do case via `encodeURIComponent` apontando exclusivamente para `https://wa.me/<teamWhatsapp>?text=...`, sem envio automático sem ação do visitante.
- [x] CHK012 O modelo proíbe busca de URLs arbitrárias no servidor para geração de previews (prevenção de SSRF) e impede autoaprovação comercial por proprietários ou membros comuns de vitrine (`FR-007`, `FR-010`).

## Notes

- Todos os itens de projeção e geração de links (`CHK008` a `CHK011`) possuem verificação automatizada ativa em `test/portfolio.test.mjs` e `test/marketing-build.test.mjs`.
