---
titulo: "[Login múltiplo] Tela de entrada minimalista com botões redondos"
rotulos: autenticacao, painel, enhancement
depende:
---
## Contexto

Hoje `/portal/` sem sessão mostra só o botão "Entrar com Google". O Lino gostou de uma referência
de layout curto: campo de identificação, senha, "Esqueceu sua senha?", botão "Entrar", divisor
"ou entrar com", botões redondos de login social e "Não tem uma conta? Cadastre-se". Esta issue
cria a tela e mantém o Google funcionando; os outros métodos chegam nas issues seguintes, cada um
desligado até ficar pronto.

## Escopo

- Reescrever `#auth-section` em `web/portal/index.html` na ordem da US1 da
  [especificação](../../../specs/017-login-multiplo/spec.md).
- Novo `web/portal/auth-form.mjs`: modos "Entrar" e "Criar conta", validação no navegador, foco
  no primeiro erro e região `aria-live`.
- Novo `web/portal/auth-identifier.mjs`: detectar e-mail (tem "@") ou telefone (10 ou mais
  dígitos), com a máscara de `phone-mask.mjs`; CPF não é aceito.
- Ampliar `GET /api/auth/config` com `authMethods`, `socialProviders`, `whatsappNumber` e
  `turnstileSiteKey` ([contrato](../../../specs/017-login-multiplo/contracts/auth-config.md)).
  Sem métodos ligados, a tela mostra só o botão redondo do Google.
- Estilos em `web/portal/portal.css` com os tokens do `DESIGN.md`
  ([pesquisa, R9](../../../specs/017-login-multiplo/research.md)):
  campos com fundo `offer-surface`, "Entrar" como `button-primary`, botões sociais circulares
  de 56 px; tema claro e escuro.
- Manter `id="google-login-button"` e `startGoogleLogin()`.

## Fora de escopo

- Chamadas de e-mail e senha ({{issue:02}}), código pelo WhatsApp ({{issue:04}}) e Turnstile
  ({{issue:06}}).

## Critérios de aceite

- [ ] Em 1280 × 900 e 375 × 812, sem rolagem horizontal; alvos de toque com pelo menos 44 px.
- [ ] Navegação só por teclado em ordem lógica; botões redondos com rótulo acessível.
- [ ] "Entrar" com campos vazios não chama a rede e leva o foco ao primeiro erro.
- [ ] "Cadastre-se" troca para "Criar conta" sem recarregar, com "Confirmar senha".
- [ ] Método desligado em `AUTH_METHODS` não aparece; o Google continua entrando como hoje
      (`test/portal-api-contract.test.mjs` passa sem mudança no PKCE).
- [ ] Teste de `GET /api/auth/config` confirma que nenhum segredo aparece na resposta.
- [ ] Capturas 1280 e 375 px, claro e escuro, no PR.

## Dependências

- Nenhuma. Pode começar junto com {{issue:03}}.

## Referências

- `specs/017-login-multiplo/` (spec, plan, tasks T015 a T021); ADR 0015 (proposta).
- `DESIGN.md` e `docs/marketing-design.md`.
