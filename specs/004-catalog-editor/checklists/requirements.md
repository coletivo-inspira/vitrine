# Specification Quality & Requirements Checklist: Editor de Cardápio (`004-catalog-editor`)

**Purpose**: Auditar a completude, clareza e conformidade constitucional da especificação `004-catalog-editor` frente aos ADRs 0002, 0003, 0005 e 0007.  
**Created**: 2026-11-11  
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [data-model.md](../data-model.md) | [portal-api.md](../contracts/portal-api.md)

## Content & Governance Quality

- [x] CHK001 As User Stories canônicas (`004-US1` a `004-US4`) estão redigidas em português no formato `Como..., quero..., para que...`, com prioridades explícitas (`P1`/`P2`) e cenários Given-When-Then.
- [x] CHK002 O vocabulário respeita `CONTEXT.md` (*Portal*, *Painel*, *Vitrine*, *Proprietário*, *Membro*, *Modelo*, *Rascunho*, *Item ativo*, *Publicação*).
- [x] CHK003 O rascunho de cardápio é mantido compatível com `publicMenu()` de `src/public-menu.mjs` sem alterar contratos existentes.

## Catalog Rules & Quota Enforcement (`004-US1` & `004-US2`)

- [x] CHK004 Preços de itens são validados exclusivamente como inteiros seguros estritamente positivos em centavos (`Number.isSafeInteger(priceCents) && priceCents > 0`), retornando `422 INVALID_PRICE_CENTS` quando inválidos (`FR-002`).
- [x] CHK005 O limite comercial do plano básico gratuito de 20 itens ativos (`active !== false && available !== false`) é validado no servidor com `422 ACTIVE_ITEMS_LIMIT_EXCEEDED` (`FR-003`).
- [x] CHK006 O teto técnico de 100 itens totais (ativos + ocultos) é validado no servidor com `422 TOTAL_ITEMS_LIMIT_EXCEEDED` (`FR-004`).
- [x] CHK007 O tamanho máximo de `262144` bytes UTF-8 (256 KiB) é imposto no Worker (`413 DRAFT_TOO_LARGE`) e no PostgreSQL (`octet_length(content::text) <= 262144`) (`FR-005`).
- [x] CHK008 O telefone de WhatsApp é validado contra `^[1-9]\d{7,14}$`, retornando `422 INVALID_WHATSAPP` quando inválido (`FR-006`).

## Concurrency & Multi-Tenant Isolation (`004-US3` & `004-US4`)

- [x] CHK009 `PUT /api/sites/:siteId/draft` valida `revision` inteiro positivo (`400 INVALID_REVISION`) e retorna `409 Conflict` (`code: "REVISION_CONFLICT"`, `currentRevision`) quando a revisão enviada diverge da atual (`FR-007`).
- [x] CHK010 Acessos de usuários autenticados a vitrines sem vínculo retornam `404 Not Found` (`code: "SITE_NOT_FOUND"`), sem vazar a existência do registro (`FR-008`).
