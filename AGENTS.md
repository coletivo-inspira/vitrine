<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/008-portal-redesign/plan.md
<!-- SPECKIT END -->

Read `.specify/memory/constitution.md`, `docs/architecture.md` and
`docs/roadmap.md` before planning. Active specification: `specs/008-portal-redesign/spec.md`; plan: `specs/008-portal-redesign/plan.md`. Use Spec Kit for
new feature specs and plans. Keep research in `docs/` and domain vocabulary in
`CONTEXT.md`. Cloudflare hosting is approved (ADR 0001); Supabase Auth/Postgres is approved; Google sign-in via Supabase Auth is approved; Workers Free with Static Assets selected; remote configuration remains open. No paid plans or automatic upgrades. Run `npm test` for this foundation.

Marketing UI implemented in web/. Read DESIGN.md and docs/marketing-design.md before
UI changes. npm run build creates public-only dist; npm run preview serves loopback.
Cloudflare auth is not configured; do not claim remote deployment.
