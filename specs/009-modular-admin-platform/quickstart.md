# Guia Rápido de Validação (Quickstart): Painel Administrativo Modular e Plataforma Multi-Inquilino (`009-modular-admin-platform`)

**Feature**: `009-modular-admin-platform`
**Date**: 2026-11-12
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Contracts**: [contracts/modular-admin-api.md](contracts/modular-admin-api.md)

---

## 1. Pré-Requisitos

- Node.js `>=24.12.0 <25`
- Dependências locais instaladas (`npm ci` — utiliza `@electric-sql/pglite` para banco PostgreSQL embarcado em testes, sem exigir credenciais remotas para validação local)

---

## 2. Comandos de Validação Automatizada

```powershell
# 1. Executar toda a suíte de testes automatizados (PGlite RLS, projeção pública, contratos de API e empacotamento)
npm test

# 2. Gerar o pacote estático público em dist/
npm run build

# 3. Validar o empacotamento do Cloudflare Worker + Static Assets sem publicar remotamente
npx --yes wrangler@4.158.0 deploy --dry-run

# 4. Iniciar o servidor local de pré-visualização em loopback (127.0.0.1:4173)
npm run preview
```

---

## 3. Cenários de Verificação Ponta a Ponta

1. **Isolamento Multi-Inquilino e Papéis (`009-US1`)**:
   - Verificar nos testes PGlite que `User A` (`owner` da vitrine 1 e vitrine 2), `User B` (`editor` apenas da vitrine 1), `User C` (`viewer` da vitrine 1) e `User D` (outro cliente) respeitam estritamente os limites de leitura e escrita definidos em [data-model.md](data-model.md), e que apenas registros em `public.platform_operators` acessam `/api/admin/*`.
2. **Edição sem Deploy, Prévia Assinada e Rollback (`009-US2`)**:
   - No painel `/portal/`, usar o alternador rápido de disponibilidade de itens/seções (`PATCH /api/sites/:siteId/quick-toggle`), abrir a pré-visualização `/__preview/:siteId?token=<hmac>` (confirmando cabeçalho `X-Robots-Tag: noindex, nofollow`), publicar uma nova revisão e acionar `POST /api/sites/:siteId/rollback` para restaurar a revisão anterior.
3. **CMS Institucional da Plataforma (`009-US3`)**:
   - Autenticado como `platform_admin`, atualizar uma seção em `PUT /api/admin/cms/:sectionKey`, publicar via `POST /api/admin/cms/publish` e confirmar que a página inicial (`/`) reflete a mudança sem novo build.
4. **Módulos por Vertical, Ativos WebP e Sandbox Opaco (`009-US4` e `009-US5`)**:
   - Configurar páginas/seções e enviar imagem verificando conversão no navegador para `image/webp` ($\le 200\text{ KB}$); inspecionar um bloco `custom_sandbox` confirmando renderização em `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer">` sem `allow-same-origin`.
5. **Domínios Personalizados e Trava de Custo Zero (`009-US6`)**:
   - Cadastrar domínio em `POST /api/sites/:siteId/domains`, verificar instruções `CNAME`/`TXT`, testar resolução pelo cabeçalho `Host` no Worker e confirmar que a trava de 95 domínios ativos impede exceder a franquia gratuita de 100 hostnames do Cloudflare for SaaS.
