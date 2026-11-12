# Guia Rápido de Validação (Quickstart): Programa de Auditoria UX e Prontidão Meta/Instagram (`010-ux-audit-meta-readiness`)

**Feature**: `010-ux-audit-meta-readiness`
**Date**: 2026-11-12
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Contracts**: [contracts/ux-audit-matrix-contract.md](contracts/ux-audit-matrix-contract.md), [contracts/meta-compliance-routes-contract.md](contracts/meta-compliance-routes-contract.md)

---

## 1. Pré-Requisitos

- Node.js LTS (`npm ci --engine-strict=false` caso o ambiente local execute Node 22, ou `npm ci` em Node 24)
- Nenhum segredo remoto ou conta paga é necessário para executar a validação local e as ondas AFK da auditoria.

---

## 2. Comandos de Validação e Execução

```bash
# 1. Executar toda a suíte de testes automatizados (152+ testes: PGlite RLS, API, CSV, fluxo em etapas, QA e segurança)
npm test

# 2. Compilar o pacote estático público em dist/
npm run build

# 3. Validar o empacotamento do Cloudflare Worker + Static Assets em modo dry-run (sem deploy remoto)
npx --yes wrangler@4.158.0 deploy --dry-run

# 4. Iniciar o servidor local em loopback para inspeção das jornadas (#61 a #72)
npm run preview
```

---

## 3. Roteiro de Verificação Ponta a Ponta por Onda

1. **Onda 0 — Preparação e Conformidade (`#61` e `#48`)**:
   - Confirmar a abertura de `docs/auditoria-ux/matriz-central.md` com o comparativo de ambientes, versões e papéis.
   - Após implementar `web/privacidade/index.html` e `web/termos/index.html`, verificar que `dist/privacidade/index.html` (incluindo `#exclusao-dados`) e `dist/termos/index.html` passam em `test/marketing-build.test.mjs` e `test/security-rls-csp-audit.test.mjs`.
2. **Onda 1 — Jornadas Essenciais (`#62` a `#68`)**:
   - Auditar cada jornada nas 5 larguras (`360`, `390`, `768`, `1024`, `1440 px`), orientação horizontal (`844×390`), zoom `200%`, temas claro e escuro, teclado/foco e movimento reduzido, preenchendo as seções 3.1 a 3.7 de `docs/auditoria-ux/matriz-central.md`.
3. **Onda 2 — Fluxos Complementares e Administração (`#69` a `#72`)**:
   - Auditar importação CSV (`#69`), pedidos de customização (`#70`), leitura dos Insights (`#71`) e administração da plataforma (`#72` em modo AFK local + checklist HITL para conta de teste do Lino), preenchendo as seções 4.1 a 4.4 de `docs/auditoria-ux/matriz-central.md`.
4. **Onda 3 — Consolidação e Priorização (`#73`)**:
   - Gerar `docs/auditoria-ux/relatorio-consolidado.md` consolidando cenários executados/aplicáveis por dispositivo, achados `P0`/`P1` e recomendações nos 5 eixos (navegação, conta/tema, formulários, feedback e movimento).
