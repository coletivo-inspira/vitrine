<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/020-portal-forms-ux/plan.md
<!-- SPECKIT END -->

Read `.specify/memory/constitution.md`, `docs/architecture.md` and
`docs/roadmap.md` before planning. Active specifications: `specs/008-portal-redesign/spec.md`, `specs/009-modular-admin-platform/spec.md`, `specs/010-ux-audit-meta-readiness/spec.md`, `specs/015-campanha-movimento/spec.md` (campanha Instagram e demonstrações de Possibilidades) and `specs/016-html-puro-projeto-externo/spec.md` (HTML puro em página emoldurada e bloco, projeto externo e administração por cliente; plano proposto, ADR 0014 proposta) and `specs/017-login-multiplo/spec.md` (login no painel por e-mail e senha, telefone e senha e código pelo WhatsApp iniciado pela pessoa; ADR 0015 e constituição 0.2.0 propostas) and `specs/018-convite-demonstracao/spec.md` (demonstração montada pela Inspira, convite por link com prévia `noindex`, cortesia de 3 meses do Profissional, papel `growth_operator` e equipe da vitrine por link; ADR 0016 proposta, só especificação; a parte de equipe é implementada pela 020) and `specs/019-autoresposta/spec.md` (AutoResposta: resposta automática do Instagram com o link público da vitrine pelo login unificado da Meta, `instagram_basic` + `instagram_manage_messages`, webhook `messages` assinado, frequência por consumidor e administração global; ADR 0017 proposta; código e testes com Meta simulada, sem configuração no console nem deploy; guias em `docs/integrations/auto-reply/`; plan: `specs/019-autoresposta/plan.md`) and `specs/020-portal-forms-ux/spec.md` (portal no modelo Google Forms: Início com modelos e vitrines recentes, vitrine em três abas Itens/Pedidos/Configurações, equipe por link alinhada à 018, perfil com foto e Estado/Cidade, paletas da vitrine); current plan: `specs/020-portal-forms-ux/plan.md`. Use Spec Kit for
new feature specs and plans. Keep research in `docs/` and domain vocabulary in
`CONTEXT.md`. Cloudflare hosting is approved (ADR 0001); Supabase Auth/Postgres is approved; Google sign-in via Supabase Auth is approved (other methods proposed in ADR 0015, not implemented); Workers Free with Static Assets selected; remote configuration remains open. No paid plans or automatic upgrades. Run `npm test` for this foundation.

Marketing UI implemented in web/. Read DESIGN.md and docs/marketing-design.md before
UI changes. npm run build creates public-only dist; npm run preview serves loopback.
Cloudflare auth is not configured; do not claim remote deployment.
