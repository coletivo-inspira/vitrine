# Tasks: Cotas de apoio sem sorteio (`014-cotas`)

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/item-cota-contract.md`

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Pesquisar a regulação vigente (LCP art. 51, DL 6.259/1944, Lei 5.768/1971, SPA/MF, CVM 88/2022) e registrar em `specs/014-cotas/research.md`
- [X] T002 Escolher o formato sem autorização (cotas de apoio sem sorteio, cobrindo compra coletiva) e listar o que fica fora por motivo legal em `specs/014-cotas/spec.md`

## Phase 2: Foundational

- [X] T003 Criar `web/assets/quota-rules.mjs` com limites, avisos fixos, `findProhibitedQuotaTerm()` e `getQuotaRemaining()`
- [X] T004 Adicionar `quota` a `ALLOWED_ITEM_PRICE_MODES` e criar `validateQuotaFields()` em `src/portal-validation.mjs`

## Phase 3: User Story 1 - Proprietário cria item de cota (P1)

- [X] T005 [US1] Validar valor por cota, total, confirmadas e benefício no servidor (`INVALID_QUOTA_*`) em `src/portal-validation.mjs`
- [X] T006 [US1] Projetar `quotaTotal`, `quotaFilled` e `quotaReward` apenas para itens de cota em `src/publication-engine.mjs`
- [X] T007 [P] [US1] Adicionar a opção "Cotas de apoio" e o ícone em `web/portal/index.html`
- [X] T008 [US1] Adicionar tipo, campos, valores padrão, aviso legal e validação local em `web/portal/editor.js`
- [X] T009 [P] [US1] Estilizar aviso e campos em `web/portal/portal.css`

## Phase 4: User Story 2 - Visitante reserva cotas (P1)

- [X] T010 [US2] Renderizar progresso, meta, saldo, benefício, condições e aviso fixo em `web/assets/storefront-renderer.mjs`
- [X] T011 [US2] Seleção por quantidade limitada ao saldo e a 99, e estado "Cotas esgotadas"
- [X] T012 [US2] Separar o total em cotas na barra, na revisão e na mensagem do WhatsApp
- [X] T013 [P] [US2] Estilizar cartão de cota em `web/vitrine/vitrine.css` e na prévia (`web/portal/portal.css`)

## Phase 5: User Story 3 - Bloqueio de rifa disfarçada (P1)

- [X] T014 [US3] Rejeitar termos de rifa/sorteio em qualquer item (`RAFFLE_NOT_ALLOWED`) e de prêmio/retorno financeiro em item de cota (`QUOTA_PROHIBITED_TERMS`)
- [X] T015 [US3] Mostrar aviso no cartão do editor enquanto o texto é digitado e bloquear o salvamento

## Phase 6: Polish & Verification

- [X] T016 Testes em `test/quota-items.test.mjs` (validação, termos, publicação, renderização, mensagem, agendamento, painel)
- [X] T017 Registrar "Cota de apoio" em `CONTEXT.md`
- [X] T018 `npm test`, `npm run build`, `npx wrangler deploy --dry-run`
- [X] T019 Capturas 1280/375, claro/escuro, em `media/cotas/` da store do projeto, inspecionadas sem cortes nem rolagem horizontal

## Dependencies

T003 → T004 → (T005, T014) → T006 → T010–T012. T007–T009 e T013 em paralelo após T003.
