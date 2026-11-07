# Desenvolvimento com Spec Kit

Inicializado com Specify CLI 0.11.3, integração Codex e scripts PowerShell em
2026-11-07. Templates e scripts vieram do pacote instalado.

## Fluxo por funcionalidade

1. `speckit-constitution`: revisar princípios de `.specify/memory/constitution.md`.
2. `speckit-specify`: descrever uma fatia pequena do ponto de vista do usuário.
3. `speckit-clarify`: resolver ambiguidades de propriedade e segurança.
4. `speckit-plan`: definir implementação com decisões e fontes identificadas.
5. `speckit-tasks` e `speckit-analyze`: decompor e conferir coerência.
6. `speckit-implement`: executar tarefas, testar e atualizar o PR.

Integrações em `.agents/skills/`; a descoberta pode exigir reabrir o projeto no
agente. Especificação e plano inicial em `specs/001-site-access/`. O setup não
implementa o produto.

`docs/architecture.md` é a proposta transversal; `docs/backend-research.md` guarda
fontes; `docs/roadmap.md` lista decisões; `CONTEXT.md` contém só vocabulário.
Specs devem referenciar esses documentos e registrar divergências. Cloudflare foi escolhida para hospedagem e Supabase Auth/Postgres para backend; login Google via Supabase Auth foi aprovado; configuração e produto Cloudflare seguem pendentes. A constituição
0.1.0 é proposta, sem ratificação. Spec Kit não concede autorização para deploy.

Configuração original: `specify init --here --integration codex --script ps --force`.
Esse comando pode sobrescrever arquivos de suporte: usar só com árvore limpa e
revisar o diff. Não é necessário executá-lo ao clonar este repositório.

Referência: [GitHub Spec Kit](https://github.com/github/spec-kit).
