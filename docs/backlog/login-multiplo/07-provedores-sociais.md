---
titulo: "[Login múltiplo] Provedores sociais configuráveis na fileira de botões"
rotulos: autenticacao, painel, enhancement, depois
depende: 01
---
## Contexto

A referência mostra Google, X, Apple e TikTok. No MVP a fileira tem Google e WhatsApp. Esta issue
deixa a fileira pronta para ligar outros provedores do Supabase sem mudar o HTML.

## Escopo

- `AUTH_SOCIAL_PROVIDERS` no Worker com lista permitida (`google`, `facebook`, `x`), refletida
  em `socialProviders` de `GET /api/auth/config`.
- Ícones SVG locais (sem host externo, CSP `img-src 'self'`) para cada provedor permitido.
- Generalizar `startGoogleLogin()` para `startOAuthLogin(provider)`, mantendo o nome antigo.
- Registrar em `docs/instagram/login-meta.md` e no ADR 0015: Facebook e X para depois; Apple
  fora (programa de desenvolvedor pago, ADR 0005); TikTok fora (sem provedor nativo no Supabase).

## Critérios de aceite

- [ ] Valor fora da lista permitida em `AUTH_SOCIAL_PROVIDERS` é ignorado (teste).
- [ ] Com só `google`, a tela é idêntica à da {{issue:01}}.
- [ ] O fluxo PKCE do Google não muda (`test/portal-api-contract.test.mjs`).

## Dependências

- {{issue:01}} `01-tela-de-entrada.md`. Ligar Facebook depende de um app Meta de consumidor
  separado (`docs/instagram/login-meta.md`).

## Referências

- `specs/017-login-multiplo/research.md` (R8); tasks T039 a T041.
