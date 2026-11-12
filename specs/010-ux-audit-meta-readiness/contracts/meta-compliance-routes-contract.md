# Contrato de Rotas Públicas e Conformidade Meta/Instagram (`010-ux-audit-meta-readiness`)

**Feature**: `010-ux-audit-meta-readiness`
**Date**: 2026-11-12
**Spec**: [../spec.md](../spec.md) | **Reference**: [../../../docs/instagram/configuracao-meta.md](../../../docs/instagram/configuracao-meta.md)

---

## 1. Páginas Públicas Estáticas de Conformidade (Issue `#48`)

Para permitir o preenchimento e validação das URLs obrigatórias no console Meta for Developers (item 9 do checklist de `docs/instagram/configuracao-meta.md`), o pacote público `web/` -> `dist/` expõe duas rotas institucionais estáticas:

### 1.1. `GET /privacidade` (`web/privacidade/index.html` -> `dist/privacidade/index.html`)
- **Status HTTP**: `200 OK`
- **Content-Type**: `text/html; charset=utf-8`
- **Content-Security-Policy**: `STRICT_CSP_HEADER` (`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`)
- **Requisitos de Conteúdo e Estrutura**:
  - Usa o cabeçalho `.site-header` e rodapé institucional idênticos às páginas `/como-funciona/`, `/possibilidades/`, `/planos/` e `/orcamento/`, carregando `theme.js`, `styles.css` e `app.js` (zero scripts ou estilos inline).
  - Contém obrigatoriamente a seção com `id="exclusao-dados"` (`/privacidade#exclusao-dados`) detalhando:
    1. Como o proprietário da vitrine desconecta sua conta do Instagram diretamente no painel administrativo (`painel.inspira.dev.br`);
    2. O efeito imediato da desconexão (revogação e remoção dos tokens de acesso e exclusão das mídias sincronizadas daquela vitrine);
    3. O processamento automático dos callbacks de desautorização (`/api/instagram/deauthorize`) e exclusão de dados (`/api/instagram/data-deletion`) enviados pela Meta.
  - Respeita a restrição terminológica ("vitrine", nunca os termos proibidos em `test/marketing-build.test.mjs`).

### 1.2. `GET /termos` (`web/termos/index.html` -> `dist/termos/index.html`)
- **Status HTTP**: `200 OK`
- **Content-Type**: `text/html; charset=utf-8`
- **Content-Security-Policy**: `STRICT_CSP_HEADER`
- **Requisitos de Conteúdo e Estrutura**:
  - Descreve as condições de uso da plataforma Vitrine Inspira, a responsabilidade do proprietário sobre o conteúdo publicado na sua vitrine, os limites do plano básico gratuito (ADR 0005) e as regras de conexão opcional de conta profissional do Instagram (leitura restrita ao escopo `instagram_business_basic`).
  - Respeita integralmente `test/marketing-build.test.mjs` e `test/security-rls-csp-audit.test.mjs`.

---

## 2. Endpoints de Integração Meta Reservados para a Fase Pós-Desbloqueio HITL (Issues `#48`–`#51`)

*(Definidos em `docs/instagram/configuracao-meta.md`, `docs/instagram/conectar-por-vitrine.md` e `docs/instagram/interface-publica-feed.md`; permanecem documentados como contrato futuro até que o Lino conclua a criação do aplicativo no console Meta — bloqueio `BLK-META-02`):*

| Rota | Método | Escopo | Descrição resumida do contrato |
| :--- | :--- | :--- | :--- |
| `/api/sites/:siteId/instagram/connect` | `POST` | Autenticado (`owner`/`admin`) | Valida permissão na vitrine, gera `state` assinado via HMAC (vinculado a `siteId`, `userId`, `nonce` e expiração de 10 min) e retorna a URL de autorização oficial da Meta (`instagram_business_basic`). |
| `/api/instagram/oauth/callback` | `GET` | Callback OAuth no Painel | Valida `state` e sessão do proprietário, troca `code` por token de curta duração e depois por token de longa duração (60 dias) no servidor, persiste criptografado por vitrine e dispara sincronização inicial. |
| `/api/instagram/deauthorize` | `POST` | Webhook Meta (`signed_request`) | Verifica assinatura HMAC-SHA256 com `INSTAGRAM_APP_SECRET` e marca a conexão da vitrine como revogada, limpando o token. |
| `/api/instagram/data-deletion` | `POST` | Webhook Meta (`signed_request`) | Verifica `signed_request`, apaga tokens e mídias sincronizadas da vitrine e retorna `{ url, confirmation_code }` conforme especificação da Meta. |
| `/data/vitrines/:slug/instagram.json` | `GET` | Público (Projeção Imutável) | Retorna exclusivamente a projeção pública validada (perfil público e mídias paginadas sem tokens ou IDs internos) servida com cache SWR na borda. |
