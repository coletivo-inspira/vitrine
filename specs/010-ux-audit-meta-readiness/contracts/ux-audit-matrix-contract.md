# Contrato da Matriz e Execução da Auditoria UX (`010-ux-audit-meta-readiness`)

**Feature**: `010-ux-audit-meta-readiness`
**Date**: 2026-11-12
**Spec**: [../spec.md](../spec.md) | **Data Model**: [../data-model.md](../data-model.md)

---

## 1. Escopo e Rastreabilidade por Issue (`#61` a `#73`)

Todo artefato gerado na execução das issues `#61` a `#73` DEVE seguir a estrutura de seções e colunas definida neste contrato para garantir consistência entre a **Primeira Onda (`#62`–`#68`)**, a **Segunda Onda (`#69`–`#72`)** e a **Consolidação (`#73`)**.

| Issue | Onda | Tipo | Superfícies / Rotas Auditadas | Entregável no Repositório |
| :--- | :--- | :--- | :--- | :--- |
| `#61` | Preparação | AFK | Produção planejada vs. `http://127.0.0.1:4173` (`/`, `/portal/`, `/loja1`, `/404.html`) | Seção 1 e 2 de `docs/auditoria-ux/matriz-central.md` |
| `#62` | 1ª Onda | AFK | `web/index.html`, `/como-funciona/`, `/possibilidades/`, `/planos/`, `/orcamento/`, `inspira-orb.js` | Seção 3.1 de `docs/auditoria-ux/matriz-central.md` |
| `#63` | 1ª Onda | AFK | `/portal/` (Login Google/Local, Cabeçalho, Sidebar/Bottom Nav, Tema, Perfil e Interesses, Conta) | Seção 3.2 de `docs/auditoria-ux/matriz-central.md` |
| `#64` | 1ª Onda | AFK | `/portal/#inicio`, `/portal/#vitrines`, Seletor rápido no topo, Cards de vitrines e permissões | Seção 3.3 de `docs/auditoria-ux/matriz-central.md` |
| `#65` | 1ª Onda | AFK | `/portal/#nova-vitrine` (Assistente em 3 passos: Área, Modelo, Nome/Slug e conflitos) | Seção 3.4 de `docs/auditoria-ux/matriz-central.md` |
| `#66` | 1ª Onda | AFK | `/portal/#editor` (Abas Configurações, Categorias, Itens em cartões Forms, Estrutura e 4 modalidades) | Seção 3.5 de `docs/auditoria-ux/matriz-central.md` |
| `#67` | 1ª Onda | AFK | `/portal/#editor` (Salvar rascunho, conflito 409, `/__preview/:siteId`, Publicar, Versões e Rollback) | Seção 3.6 de `docs/auditoria-ux/matriz-central.md` |
| `#68` | 1ª Onda | AFK | `/loja1`, `/<slug>`, `/404.html` (3 etapas do pedido, 4 modalidades, `wa.me`, Open Graph e erros) | Seção 3.7 de `docs/auditoria-ux/matriz-central.md` |
| `#69` | 2ª Onda | AFK | `/portal/#editor` (`csv-catalog.js`, `modelo-produtos.csv`, `modelo-servicos.csv`, prévia de erros, upsert/replace) | Seção 4.1 de `docs/auditoria-ux/matriz-central.md` |
| `#70` | 2ª Onda | AFK | `/portal/#customizacoes` (Formulário, validação, preservação pós-erro, lista de status e link WhatsApp) | Seção 4.2 de `docs/auditoria-ux/matriz-central.md` |
| `#71` | 2ª Onda | AFK | `/portal/#insights` (Seleção de vitrine, filtros `7d`/`30d`/`90d`, gráficos SVG/CSS, zero vs. sem dados) | Seção 4.3 de `docs/auditoria-ux/matriz-central.md` |
| `#72` | 2ª Onda | HITL / AFK | `/portal/` (`#platform-cms-section`, `#platform-operations`, `#platform-templates`, RBAC por papel) | Seção 4.4 de `docs/auditoria-ux/matriz-central.md` + Checklist HITL |
| `#73` | Fechamento | AFK | Consolidação de `#61`–`#72`, cobertura por dispositivo, P0/P1 e backlog nos 5 eixos | `docs/auditoria-ux/relatorio-consolidado.md` |

---

## 2. Formato Obrigatório de Inventário de Controles (Issues `#62` a `#72`)

Cada seção de jornada em `docs/auditoria-ux/matriz-central.md` DEVE conter a tabela de controles abaixo:

```markdown
| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `#id-ou-seletor` | Botão / Link / Campo / Aba | default, hover, focus, disabled, loading, error | 360, 390, 768, 1024, 1440px, horiz, 200% | Para que serve | O que deve acontecer | O que foi observado | Visual / ARIA |
```

---

## 3. Formato Obrigatório da Matriz de Achados e Classificação (`P0`–`P3`)

```markdown
| ID | Issue | Severidade | Natureza | Eixo | Descrição e Evidência | Critério de Aceite | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UX-001` | `#62` | `P0` \| `P1` \| `P2` \| `P3` | `problema_confirmado` \| `risco_codigo` \| `critica_ux` \| `nao_verificado` | `navegacao` \| `conta_tema` \| `formularios` \| `feedback` \| `movimento` | Arquivo/linha + comportamento | Condição verificável | Aberto / Resolvido / Bloqueado HITL |
```

---

## 4. Regras de Conformidade e Segurança da Auditoria

1. **Zero Envio Real de Mensagens**: Na verificação de links `https://wa.me/<telefone>?text=...` (`#62`, `#68`, `#70`), a auditoria inspeciona e valida o atributo `href` / URL gerada e o `encodeURIComponent`, sem disparar mensagens reais para terceiros.
2. **Terminologia Canônica**: Nenhum documento ou recomendação voltada ao texto de interface pode sugerir os termos proibidos pelos testes automatizados; usar sempre **vitrine**.
3. **Sem Segredos**: Nenhuma captura, log ou tabela de auditoria pode registrar tokens JWT reais de produção, chaves privadas ou senhas.
