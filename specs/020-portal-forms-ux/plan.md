# Implementation Plan: Portal da Vitrine no modelo Google Forms

**Branch**: `port/portal-forms-ux` | **Date**: 2026-11-26 | **Spec**: [spec.md](spec.md)

## Summary

Reorganizar o portal em Início (modelos + vitrines recentes) e vitrine em três abas (Itens, Pedidos, Configurações), sem perder nenhum painel da `main`. Alinhar o convite de colaboradores à parte de equipe da spec 018 (link de uso único). Portar perfil com foto e Estado/Cidade (IBGE) e as 8 paletas, encaixando-as na estrutura da spec 009 (`structure.theme`).

## Technical Context

- **Front-end**: HTML/CSS/JS sem build nem dependências (`web/portal/`), CSP sem estilos ou scripts inline e sem `.style.`; tokens de `web/portal/portal.css` (claro/escuro).
- **Worker**: `workers/api.mjs` (rotas novas de equipe, convite, renomear e `publishedAt`), loja em memória para o modo local.
- **Banco**: Supabase Postgres; uma migração nova, append-only, depois de `20261116001800_template_servicos_produtos.sql`.
- **Testes**: `node --test` (PGlite para o banco), sem dependência nova.
- **Custo**: zero; nenhum envio de mensagem; listas do IBGE geradas uma vez por `scripts/generate-ibge-municipios.mjs` e servidas como arquivos estáticos.

## Constitution Check

- **I. Administração privada e publicação pública**: a paleta só entra na projeção pública com valor válido e diferente do padrão; convites e equipe nunca vão para artefatos publicados. OK.
- **II. Isolamento entre vitrines**: convite e equipe verificados no banco (`security definer`, papel do chamador) e no Worker; testes PGlite e de contrato cobrem `editor`, `viewer` e terceiros. OK.
- **III. Credenciais apenas no servidor**: o token do convite é gerado no Worker e mostrado uma vez; o banco guarda só o hash; nada de token em logs. OK.
- **IV. Custo e condições**: nada pago; a foto do Google é carregada direto de `lh3.googleusercontent.com` só no portal. OK.
- **V. Entregas verificáveis**: cenários de aceite por história; testes novos listados em [tasks.md](tasks.md). OK.

## Project Structure

```text
web/portal/index.html            # Início, vitrine em 3 abas, diálogos (nova vitrine, Personalizar, Visualizar, Publicar)
web/portal/portal.js             # rotas por hash, menus/diálogos, Início, perfil, aba Pedidos, convite
web/portal/editor.js             # abas, seções de categoria, salvamento automático, renomear, publicar, equipe
web/portal/portal.css            # barra superior, grade, cabeçalho, abas, seções recolhíveis, diálogos
web/portal/site-lifecycle.js     # ações de ciclo de vida como itens de menu
web/portal/auctions-panel.js     # leilões da vitrine aberta (sem seletor)
web/portal/br-locations.js       # Estado/Cidade (IBGE)  + web/portal/data/municipios/{UF}.json
web/portal/team-panel.mjs|.css   # aba Equipe (018 US5)
web/portal/invite-accept.mjs     # captura do token e confirmação do convite
web/portal/palette-picker.mjs|.css
web/assets/storefront-palettes.mjs|.css
src/showcase-structure.mjs, src/publication-engine.mjs, web/vitrine/*  # paleta na estrutura e na vitrine
src/team-invitations.mjs, workers/api.mjs                              # convite de equipe, renomear, publishedAt
supabase/migrations/20261126003000_site_team_invitations.sql
scripts/generate-ibge-municipios.mjs
```

## Verificação

`npm test`, `npm run build`, `node scripts/check-migration-order.mjs origin/main` e conferência visual em 1440 px e 390 px, nos temas claro e escuro, via `npm run preview`. Não há deploy remoto nesta entrega.
