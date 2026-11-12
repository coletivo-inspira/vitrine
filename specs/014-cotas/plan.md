# Implementation Plan: Cotas de apoio sem sorteio

**Branch**: `cursor/cotas-de-apoio-c931` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/014-cotas/spec.md`

## Summary

Novo modo de item `priceMode: "quota"` ao lado de `fixed`, `offer`, `donation` e `trade`. O proprietário define valor por cota, total, confirmadas, benefício e condições; a vitrine pública mostra progresso e saldo, deixa o visitante escolher a quantidade e monta a reserva na mensagem do WhatsApp, separada do total de produtos. Uma lista compartilhada de termos proibidos impede rifa, sorteio, prêmio e retorno financeiro tanto no editor quanto na API. Sem pagamento, sem tabela nova, sem migração.

## Technical Context

**Language/Version**: JavaScript ES Modules (Node 24 no CI; navegador sem build)
**Primary Dependencies**: nenhuma nova
**Storage**: JSON do rascunho (`public.drafts.content`) e da publicação (`public.publications.menu`) no Supabase Free; nenhuma migração
**Testing**: `node --test` (`test/quota-items.test.mjs`), `npm run build`, `npx wrangler deploy --dry-run`; capturas Playwright em 1280/375, claro/escuro
**Target Platform**: Cloudflare Workers Free com Static Assets; navegador
**Project Type**: aplicação web (portal estático + Worker)
**Performance Goals**: nenhum custo adicional por requisição; regras rodam no salvamento e na renderização
**Constraints**: CSP `script-src 'self'` (barra de progresso com `<progress>`, sem estilo inline); vocabulário "vitrine"; custo zero
**Scale/Scope**: até 20 itens ativos por vitrine; até 1000 cotas por item

## Constitution Check

| Princípio | Verificação |
|---|---|
| I. Administração privada e publicação pública | Projeção explícita: só `quotaTotal`, `quotaFilled`, `quotaReward` entram em `ALLOWED_ITEM_KEYS`, e só para itens de cota. Teste confirma que itens de outro tipo não publicam campos de cota e que `assertNoPrivateLeakage` passa. |
| II. Isolamento entre vitrines | Sem rota nova; o salvamento continua passando pelas verificações de acesso existentes. |
| III. Credenciais apenas no servidor | Nenhuma credencial nova. |
| IV. Custo e condições verificáveis | Sem serviço externo, sem pagamento, sem API paga. A condição legal está registrada em `research.md`. |
| V. Entregas verificáveis | Testes de validação, publicação, renderização e mensagem; capturas nos quatro modos. Planejado e implementado ficam separados (pendências abaixo). |

## Project Structure

### Documentation (this feature)

```text
specs/014-cotas/
├── spec.md
├── research.md            # fundamentação legal e fontes
├── plan.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── contracts/item-cota-contract.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
web/assets/quota-rules.mjs          # novo: limites, avisos e termos proibidos (compartilhado)
web/assets/storefront-renderer.mjs  # cartão de cota, seleção, revisão e mensagem
web/vitrine/vitrine.css             # estilos públicos das cotas
web/portal/editor.js                # tipo "Cotas de apoio", campos, aviso e validação local
web/portal/index.html               # opção no menu "Adicionar item" e ícone
web/portal/portal.css               # estilos do editor e da prévia
src/portal-validation.mjs           # validação do servidor (modo, campos e termos)
src/publication-engine.mjs          # projeção pública dos campos de cota
test/quota-items.test.mjs           # novo: cobertura da funcionalidade
CONTEXT.md                          # vocabulário "Cota de apoio"
```

**Structure Decision**: as regras ficam em `web/assets/` porque o editor e a vitrine rodam no navegador sem build; `src/portal-validation.mjs` importa o mesmo arquivo (precedente: `src/storefront-renderer.mjs` reexporta de `web/assets/`).

## Pendências humanas

1. Revisão jurídica externa do texto do aviso e da lista de termos antes de divulgar a funcionalidade publicamente como "segura" para terceiros (recomendada, não bloqueante).
2. Nada a fazer no Supabase de produção nem no Cloudflare: não há migração, segredo ou rota nova.

## Complexity Tracking

Nenhuma violação da constituição.
