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
Specs devem referenciar esses documentos e registrar divergências. Cloudflare foi escolhida para hospedagem e Supabase Auth/Postgres para backend; login Google via Supabase Auth foi aprovado; Workers Free com Static Assets adotado; configuração segue pendente. A constituição
0.1.0 é proposta, sem ratificação. Spec Kit não concede autorização para deploy.

Configuração original: `specify init --here --integration codex --script ps --force`.
Esse comando pode sobrescrever arquivos de suporte: usar só com árvore limpa e
revisar o diff. Não é necessário executá-lo ao clonar este repositório.

Referência: [GitHub Spec Kit](https://github.com/github/spec-kit).

## Orçamento da vitrine pública

`test/storefront-budget.test.mjs` roda em `npm test`. Ele publica as vitrines de
exemplo (todo arquivo de `content/vitrines/`, hoje `pizzeria-v1`; uma `quote-v1`
simples e outra com seções) e confere o HTML estático do build, o HTML do Worker,
a prévia sem JS e as três etapas desenhadas por `StorefrontRenderer`.
`servicos-produtos-v1` entra sozinho quando houver exemplo em `content/vitrines/`
ou o modelo estiver em `ALLOWED_TEMPLATES`. A página do item entra quando o motor
exportar `renderStorefrontItemHtml(menu, itemId)`.

| Regra | Limite |
| --- | --- |
| `<script>`, `<link>` e `<iframe>` | só a própria origem e `sandbox.inspira.dev.br`; nenhum script inline (exceto `application/ld+json`) |
| Entradas | 1 módulo JS, 1 script clássico (`theme.js`) e 1 folha de estilo |
| JS + CSS próprios (grafo de imports, gzip nível 9) | ≤ 120 KB; medido em 2026-11-14: 31,6 KB (brotli 27,1 KB) |
| `h1` | exatamente um por página |
| `<img>` | `alt`, `width` e `height` |
| Links e botões | nome acessível (texto, `aria-label`, `aria-labelledby`, `alt` ou `title`) |
| Termos em inglês na interface | nenhum de Cart, Checkout, Close, Search, Shop |

O valor medido aparece na saída do teste (`Orçamento da vitrine ...`). Fontes e
imagens ficam fora do limite de bytes; as duas fontes TTF pré-carregadas somam
cerca de 380 KB e são o maior peso da página.

LCP: alvo ≤ 2,5 s a 390 px, perfil Slow 4G do DevTools (562,5 ms, 1,44 Mbps) e
CPU 4×. Sem navegador no CI, a medição é local e anotada no PR. Em 2026-11-14,
`/loja1` no `npm run preview` (sem compressão), Chrome 157: mediana 1,71 s em 5
rodadas, elemento `h1#storefront-name`. Com foto no hero (issue #131, exemplo
`test/fixtures/hero-photo-storefront.mjs`, foto WebP de 97,5 KB): mediana 2,37 s
em 5 rodadas, elemento a foto. Com foto no hero, a página não pré-carrega as
fontes (elas chegam pelo `@font-face` com `font-display: swap`) e o painel
comprime a foto do hero para até 100 KB; com as fontes pré-carregadas a mesma
página ficava em 3,6 s, e com a foto de 197 KB em 5,2 s.
