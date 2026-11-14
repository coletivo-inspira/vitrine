# Matriz central da Auditoria UX (`#61`)

Documento central do programa de Auditoria UX (issues `#61` a `#73`, especificação
[`010-ux-audit-meta-readiness`](../../specs/010-ux-audit-meta-readiness/spec.md)).
Esta versão abre a matriz: identifica ambientes e versões, inventaria telas e
bloqueios, indexa as jornadas e fixa as convenções que todas as seções seguem.

- **Coleta**: 2026-11-14, 17:00–17:20 UTC.
- **Contrato**: [`ux-audit-matrix-contract.md`](../../specs/010-ux-audit-meta-readiness/contracts/ux-audit-matrix-contract.md).
- **Evidências**: pasta `media/auditoria-ux/61-matriz/` do Context do projeto
  (as imagens não são versionadas no repositório).

## Estrutura dos documentos

Para permitir PRs paralelos sem conflito, cada jornada tem seu próprio arquivo de
seção em `docs/auditoria-ux/jornadas/`, criado pelo PR da respectiva issue. Este
arquivo (`matriz-central.md`) só é editado pela `#61` e pela consolidação `#73`.
Isso substitui, sem mudar colunas nem classificações, a orientação do contrato de
acrescentar as seções 3.x e 4.x dentro deste arquivo.

| Documento | Responsável | Conteúdo |
| --- | --- | --- |
| `docs/auditoria-ux/matriz-central.md` | `#61` (abertura), `#73` (atualização final) | Ambientes, inventário de telas, índice das jornadas, convenções e matriz de cenários |
| `docs/auditoria-ux/jornadas/<issue>-<tema>.md` | Uma issue de `#62` a `#72` | Inventário de controles, cenários executados e achados da jornada |
| `docs/auditoria-ux/relatorio-consolidado.md` | `#73` | Cobertura, P0/P1 pendentes, backlog nos 5 eixos e bloqueios |

---

## 1. Ambientes e versões

### 1.1 Comparativo produção × desenvolvimento

| Campo | Produção planejada — vitrine | Produção planejada — painel | Desenvolvimento local |
| --- | --- | --- | --- |
| `environment_id` | `prod_vitrine` | `prod_painel` | `local_preview` |
| URL base | `https://vitrine.inspira.dev.br` | `https://painel.inspira.dev.br` | `http://127.0.0.1:4173` (padrão de `npm run preview`; esta coleta usou `PORT=4181`) |
| DNS | Resolve para IPs da Cloudflare; zona `inspira.dev.br` com NS `lars`/`rosalyn.ns.cloudflare.com` | Igual ao da vitrine | Loopback |
| Resposta HTTP a clientes automatizados | `403` com `cf-mitigated: challenge` ("Just a moment...") para o IP de nuvem da auditoria: é o desafio de bots da Cloudflare, comportamento esperado, não falha | Igual | `200` nas rotas estáticas (ver seção 2) |
| Versão publicada | `main` em `bbafd95c13ab5142aa642287f788632cdd0c55e3`, segundo o workflow "Deploy Cloudflare Worker" (`deploy.yml`), [execução 43614967851](https://github.com/coletivo-inspira/vitrine/actions/runs/43614967851), concluída com sucesso em 14/11/2026 às 16:20Z: "Uploaded vitrine-inspira", "Deployed vitrine-inspira triggers", Current Version ID `54e83cab-2f95-4d10-a51f-2a69ed14e9b2` | Igual (mesmo Worker `vitrine-inspira`) | `main` em `bbafd95c13ab5142aa642287f788632cdd0c55e3`; build com hash `0911af34bd42` (`/loja1`, 6 itens ativos, 0 casos publicados, contato configurado) |
| Migrações | Mesma execução, job `migrate`: "Remote database is up to date" (as 15 migrações de `main` aplicadas) | Igual | 15 arquivos, de `202611070001_site_access.sql` a `20261112194217_auction_bids.sql`, aplicados em PGlite pela suíte `npm test` |
| Worker | Worker `vitrine-inspira` com Static Assets publicado pelo CI; `wrangler.jsonc` aponta `PUBLIC_SITE_ORIGIN` e `PORTAL_ORIGIN` para estes domínios | Igual | `npm run preview` serve só o `dist/` estático (`scripts/serve.mjs`); não executa `workers/api.mjs` |
| `availability_status` | `equivalente_local` (evidências pelo preview do mesmo commit) | `equivalente_local` | `verificado_local` |

**Equivalência de evidências.** Produção e preview local saem do mesmo commit
`bbafd95` e do mesmo `npm run build`. Por isso as capturas e verificações das
jornadas usam o preview local como evidência equivalente da versão publicada.
As diferenças que restam vêm só do ambiente: rotas servidas pelo Worker
(`/api/*`, `/por-cidade/`, `/__preview/:siteId`), sessão Google real e dados do
Supabase remoto. Essas diferenças estão nos bloqueios da seção 1.4.

Outros endereços consultados: `https://inspira.dev.br` também responde `403` com
o mesmo desafio de bots. `https://sandbox.inspira.dev.br` não tem registro DNS
(o `curl` termina com código 6; ver `BLK-CLOUD-01`). Esta auditoria não fez
deploy.

### 1.2 Papéis

| Papel | Origem | Como testar localmente | Como testar em produção |
| --- | --- | --- | --- |
| `visitante` | Sem sessão | Rotas públicas do preview | Navegador real (opcional, `CHK-UX-61-PROD`); clientes automatizados recebem o desafio de bots |
| `owner` | `site_members.role` (dono da vitrine) | Painel com `/api/*` simulado (seção 1.3), `role: owner` | Login Google real num navegador (passo humano) |
| `admin`, `editor`, `viewer` | `site_members.role` (`collaborator` também existe na restrição) | Harness com `role` trocado; a interface só mostra os selos "Proprietário" e "Colaborador" | Convite real num navegador (passo humano) |
| `platform_admin` | `public.platform_operators.role` (`support_operator` também existe) | Harness responde `403` em `/api/admin/*` por padrão; para ver a visão de operador é preciso estender o harness | `BLK-HITL-72` |

### 1.3 Modo local do painel

- O painel (`/portal/`) chama `/api/auth/session`. No preview estático essa rota
  responde `404`, então o painel fica na tela "Entrar no Painel". O botão
  "Entrar com Google" falha porque `/api/auth/config` também responde `404`.
- O antigo botão de modo local (`#local-demo-button`) saiu do HTML no PR #55.
  `web/portal/portal.js` ainda mantém o código do modo local (`loadLocalSites`,
  vitrine `demo-site-pastus` / `pastus-demo`, rascunhos em `localStorage`), mas
  nenhum controle da interface leva até ele. Por isso **não há modo local
  acessível pela interface**.
- **Caminho adotado para as jornadas autenticadas (`#63`–`#72`)**: abrir o
  preview no Chrome headless e simular `/api/*` pelo Chrome DevTools Protocol,
  sem alterar o código. O script fica no Context do projeto, em
  `internal/auditoria-ux/painel-mock-cdp.mjs`. Ele simula uma sessão
  (`auditoria@example.test`), perfil completo, uma vitrine de teste
  (`site-teste-auditoria`, endereço `vitrine-teste`, modelo `pizzeria-v1`, com o
  rascunho copiado de `/data/vitrines/loja1/menu.json`), `403` em `/api/admin/*`
  e `404` no restante:

  ```bash
  node painel-mock-cdp.mjs "http://127.0.0.1:4181/portal/#inicio" /tmp/inicio.png 1280 900 claro owner
  ```

  Cada jornada estende os mocks de que precisa (rascunho, publicação, Insights,
  CSV, customizações, administração) e registra na sua seção o que foi simulado.
  Achados que dependem da resposta real do Worker/Supabase são classificados
  como `nao_verificado` ou `risco_codigo`, nunca como `problema_confirmado`.
- Para fluxos com banco, a referência de dados e regras é a suíte
  `test/e2e-full-journey.test.mjs`, que roda `workers/api.mjs` sobre PGlite com
  JWT HS256 de teste.

### 1.4 Bloqueios externos

| Código | Issue | Bloqueio | Checklist de aceite (ação humana) |
| --- | --- | --- | --- |
| `CHK-UX-61-PROD` (opcional, não bloqueia) | `#61` | O desafio de bots da Cloudflare impede capturas automatizadas a partir de IPs de nuvem; a versão publicada já está identificada pelo workflow de deploy (`bbafd95`) | [ ] Opcional: Lino abre `https://vitrine.inspira.dev.br/`, `/loja1` e `https://painel.inspira.dev.br/` num navegador real, em 1280 e 375 px, e confirma que a aparência coincide com as capturas locais |
| `BLK-CLOUD-01` | `#44` | `sandbox.inspira.dev.br` sem DNS; Cloudflare for SaaS e segredos `CF_SAAS_*` / `PREVIEW_HMAC_SECRET` ausentes | Conforme `data-model.md` §3.5 |
| `BLK-HITL-72` | `#72` | Sem conta de teste em `public.platform_operators` | Conforme `data-model.md` §3.5 |
| `BLK-UX-61-AUTH` | `#63` | Login Google real indisponível localmente (sem `SUPABASE_ANON_KEY` no preview) | [ ] Login, cancelamento e sessão expirada validados contra o Worker remoto, num navegador real |

---

## 2. Inventário de telas e rotas

Status HTTP medido no preview local (`PORT=4181`), que é o mesmo build de
`bbafd95` publicado em produção (seção 1.1). Clientes automatizados recebem
o desafio de bots da Cloudflare em produção.

### 2.1 Rotas públicas

| Rota | Local | Disponível | Observação / bloqueio | Jornada |
| --- | --- | --- | --- | --- |
| `/` | `200` | Sim | Home com carrossel de casos, Mila e bolinha fixa | `#62` |
| `/como-funciona/` | `200` | Sim | — | `#62` |
| `/possibilidades/` | `200` | Sim | Inclui "Modelos em ação" (`model-demos.js`) | `#62` |
| `/planos/` | `200` | Sim | Planos e dúvidas | `#62` |
| `/orcamento/` | `200` | Sim | Orçamento com a Mila | `#62` |
| `/privacidade/` e `/privacidade` | `200` | Sim | CSP de conformidade própria | `#62` |
| `/termos/` | `200` | Sim | — | `#62` |
| `/loja1` e `/loja1/` | `200` | Sim | Vitrine piloto estática "Forno & Praça Pizzaria Artesanal" | `#68` |
| `/data/vitrines/loja1/menu.json` | `200` | Sim | Dados públicos da vitrine piloto | `#68` |
| `/vitrine/` | `200` | Parcial | Casca genérica da vitrine, sem endereço | `#68` |
| `/<slug>` sem publicação (ex.: `/pastus-demo`) | `404` | Não | Preview não consulta publicações dinâmicas | `#68` |
| `/rota-que-nao-existe` | `404` | Parcial | Preview responde texto puro "Página não encontrada."; o Worker usa `404.html` (`not_found_handling: 404-page`). Divergência entre ambientes | `#68` |
| `/404.html` | `200` | Sim | Página de erro estilizada | `#68` |
| `/por-cidade/` e `/por-cidade/<cidade>` | `404` | Não | Gerado só pelo Worker a partir de `city_listings`; sem equivalente estático | `#68` |
| `/__preview/:siteId` | `404` | Não | Prévia assinada exige Worker e `PREVIEW_HMAC_SECRET` | `#67` |

### 2.2 Painel (`/portal/`)

| Tela / hash | Seção HTML | Disponível localmente | Bloqueio / observação | Jornada |
| --- | --- | --- | --- | --- |
| Login | `#auth-section` | Sim | Botão Google falha sem `/api/auth/config` | `#63` |
| Completar perfil | `#profile-gate-section` | Com harness | Exibida com perfil incompleto | `#63` |
| `#inicio` | `#inicio-section` | Com harness | Jornada de lançamento, cartões e destaques | `#64` |
| `#vitrines` | `#vitrines-section` | Com harness | Lista e ações "Editar vitrine" / "Leilões" | `#64` |
| `#wizard` | `#wizard-section` | Com harness | O contrato cita `#nova-vitrine`; o hash real é `#wizard` | `#65` |
| `#editor` | `#editor-section` | Com harness + clique em "Editar vitrine" | Sem vitrine selecionada, o hash cai em "Minhas Vitrines" | `#66`, `#67`, `#69` |
| `#leiloes` | `#leiloes-section` | Com harness | Fora do escopo explícito das issues; incluído em `#66` (modalidade lance mínimo) | `#66` |
| `#perfil` | `#perfil-section` | Com harness | Máscara de WhatsApp, interesses (até 8, `outro:`) | `#63` |
| `#pedidos` | `#pedidos-section` | Com harness | O contrato cita `#customizacoes`; o hash real é `#pedidos` | `#70` |
| `#insights` | `#insights-section` | Com harness | Sem mock, os destaques mostram "Ainda sem visitas registradas" com "0 acessos" | `#71` |
| Administração da plataforma | `#platform-cms-section` (`#platform-operations`, `#platform-mila`, `#platform-templates`) | Só com harness estendido | `BLK-HITL-72` para sessão real | `#72` |

### 2.3 Capturas desta abertura

Pasta `media/auditoria-ux/61-matriz/` do Context do projeto:

| Arquivo | Tela | Largura | Tema |
| --- | --- | --- | --- |
| `home-1280-claro.png`, `home-1280-escuro.png` | `/` | 1280 | claro / escuro |
| `home-375-claro.png`, `home-375-escuro.png` | `/` | 375 | claro / escuro |
| `painel-login-1280-claro.png`, `painel-login-1280-escuro.png` | `/portal/` login | 1280 | claro / escuro |
| `painel-login-375-claro.png`, `painel-login-375-escuro.png` | `/portal/` login | 375 | claro / escuro |
| `loja1-1280-claro.png`, `loja1-375-claro.png`, `loja1-375-escuro.png` | `/loja1` | 1280 / 375 | claro / escuro |
| `404-rota-inexistente-1280-claro.png`, `404-pagina-1280-claro.png` | rota inexistente e `/404.html` | 1280 | claro |
| `painel-inicio-mock-1280-claro.png` | `/portal/#inicio` com harness | 1280 | claro |
| `painel-vitrines-mock-375-escuro.png` | `/portal/#vitrines` com harness | 375 | escuro |
| `painel-hash-editor-sem-selecao-mock-1280-claro.png` | `/portal/#editor` sem vitrine selecionada | 1280 | claro |

O tema escuro foi forçado com `--force-dark-mode --blink-settings=preferredColorScheme=0`;
`web/theme.js` segue `prefers-color-scheme` até haver escolha salva em
`localStorage['vitrine-theme']`.

### 2.4 Pistas para as jornadas (não classificadas)

Observações feitas durante a coleta. Cada jornada confirma ou descarta e, se
confirmar, registra o achado com ID próprio.

- `#63`: em 375 px, o cartão de login encosta nas bordas laterais da tela (`painel-login-375-claro.png`).
- `#64`: em 375 px, o botão "Editar vitrine" ultrapassa a borda do cartão da vitrine (`painel-vitrines-mock-375-escuro.png`).
- `#64`/`#66`: o selo de papel só distingue "Proprietário" e "Colaborador", embora existam `admin`, `editor` e `viewer`.
- `#62`: o mockup do carrossel da home é uma captura de site real cujo texto interno usa termo proibido; avaliar se a imagem conta como texto voltado ao usuário.
- `#68`: rota inexistente no preview responde texto puro, enquanto o Worker serve `404.html`.
- `#71`: sem dados de Insights, a home mostra "0 acessos" junto de "Ainda sem visitas registradas" (zero e ausência de dados se confundem).

---

## 3. Índice das jornadas

| Issue | Onda | Tipo | Superfícies | Arquivo de seção (criado pela issue) | Status |
| --- | --- | --- | --- | --- | --- |
| `#61` | Preparação | AFK | Ambientes, rotas, papéis | Este arquivo | Aberto neste PR |
| `#62` | 1ª | AFK | `/`, `/como-funciona/`, `/possibilidades/`, `/planos/`, `/orcamento/`, `/privacidade/`, `/termos/`, bolinha fixa (`inspira-orb`) | `docs/auditoria-ux/jornadas/62-descoberta-site.md` | A executar |
| `#63` | 1ª | AFK | Login, cabeçalho, barra lateral e inferior, tema, `#perfil`, perfil obrigatório, sair | `docs/auditoria-ux/jornadas/63-entrada-conta.md` | A executar |
| `#64` | 1ª | AFK | `#inicio`, `#vitrines`, cartões e permissões | `docs/auditoria-ux/jornadas/64-inicio-selecao-vitrines.md` | A executar |
| `#65` | 1ª | AFK | `#wizard` (área, modelo, nome e endereço, conflito) | `docs/auditoria-ux/jornadas/65-criacao-vitrine.md` | A executar |
| `#66` | 1ª | AFK | `#editor` (configurações, categorias, itens, estrutura, modalidades), `#leiloes` | `docs/auditoria-ux/jornadas/66-edicao-manual.md` | A executar |
| `#67` | 1ª | AFK | `#editor` (rascunho, conflito 409, prévia, publicar, versões), `/__preview/:siteId` | `docs/auditoria-ux/jornadas/67-previa-publicacao.md` | A executar |
| `#68` | 1ª | AFK | `/loja1`, `/<slug>`, `/404.html`, `/por-cidade/`, link `wa.me` | `docs/auditoria-ux/jornadas/68-vitrine-publica.md` | A executar |
| `#69` | 2ª | AFK | `#editor` com CSV (`csv-catalog.js`, modelos CSV) | `docs/auditoria-ux/jornadas/69-importacao-csv.md` | A executar |
| `#70` | 2ª | AFK | `#pedidos` (customizações) | `docs/auditoria-ux/jornadas/70-customizacoes.md` | A executar |
| `#71` | 2ª | AFK | `#insights` (7d/30d/90d) | `docs/auditoria-ux/jornadas/71-insights.md` | A executar |
| `#72` | 2ª | HITL/AFK | `#platform-cms-section`, `#platform-operations`, `#platform-mila`, `#platform-templates` | `docs/auditoria-ux/jornadas/72-administracao-plataforma.md` | A executar (sessão real em `BLK-HITL-72`) |
| `#73` | Fechamento | AFK | Consolidação de `#61`–`#72` | `docs/auditoria-ux/relatorio-consolidado.md` | Aguarda `#62`–`#72` |

---

## 4. Convenções comuns

### 4.1 Estrutura de cada arquivo de jornada

1. Cabeçalho com issue, data, commit de `main` e hash de build auditados.
2. Ambiente e mocks usados (preview, harness, dados de teste).
3. Inventário de controles (4.2).
4. Matriz de cenários da jornada (dispositivo × modo, ver seção 5).
5. Achados (4.3).
6. Bloqueios e checklist de aceite para telas indisponíveis.

### 4.2 Tabela de controles

```markdown
| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `#id-ou-seletor` | Botão / Link / Campo / Aba / Menu / Ícone | default, hover, focus-visible, active, disabled, loading, error, empty | 360, 390, 768, 1024, 1440, horizontal, 200% | Para que serve | O que deve acontecer | O que foi observado | Visual / ARIA |
```

### 4.3 Tabela de achados

```markdown
| ID | Issue | Severidade | Natureza | Eixo | Descrição e Evidência | Critério de Aceite | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UX-62-001` | `#62` | `P2` | `critica_ux` | `navegacao` | `web/index.html:NN` + captura `home-390-claro.png` | Condição verificável | Aberto |
```

- **IDs**: `UX-<issue>-<NNN>`, numerados por issue a partir de `001`
  (ex.: `UX-62-001`, `UX-72-014`). Substituem o formato `UX-NNN` do contrato para
  evitar colisão entre PRs paralelos.
- **Severidade**: `P0` bloqueia a jornada ou expõe dados; `P1` alto impacto
  funcional ou falha WCAG AA; `P2` médio ou inconsistência; `P3` cosmético ou
  oportunidade.
- **Natureza**: `problema_confirmado` (reproduzido no preview, com evidência);
  `risco_codigo` (visto no código, não reproduzido); `critica_ux` (funciona, mas
  a experiência pode melhorar); `nao_verificado` (depende de ambiente bloqueado
  ou de mock).
- **Eixo**: `navegacao`, `conta_tema`, `formularios`, `feedback`, `movimento`.
- **Status**: `Aberto`, `Resolvido` ou `Bloqueado HITL`.

### 4.4 Grade de verificação

- Larguras: `360`, `390`, `768`, `1024` e `1440 px`; horizontal `844×390`; zoom `200%`
  (equivalente a 720 px de largura útil em 1440).
- Temas claro e escuro (preferência do sistema e alternância pelo botão de tema).
- Teclado (ordem de tabulação, `Esc`, `Enter`/`Espaço`), foco visível, alvos de
  toque `>= 44×44 px`, contraste WCAG AA, `prefers-reduced-motion: reduce` e
  `prefers-reduced-transparency: reduce`.
- Links `wa.me`: validar só o `href` e o `encodeURIComponent`, sem abrir conversas reais.
- Texto voltado ao usuário: sempre "vitrine"; recomendações não podem sugerir os
  termos proibidos pelos testes.
- Sem tokens, chaves ou senhas em capturas, logs ou tabelas.

### 4.5 Evidências

- Capturas em `media/auditoria-ux/<issue>-<tema>/` no Context do projeto
  (ex.: `media/auditoria-ux/62-descoberta-site/`), nomeadas
  `<tela>-<largura>-<tema>.png`; nos documentos, citar pelo nome do arquivo.
- Não versionar imagens no repositório.
- Para evidência de código, citar `arquivo:linha`.

---

## 5. Matriz de cenários (alto nível)

Cada célula é preenchida pela jornada com `executado`, `parcial`, `bloqueado` ou
`n/a`. "Teclado" inclui foco e contraste; "Movimento" inclui movimento e
transparência reduzidos.

| Jornada | 360 | 390 | 768 | 1024 | 1440 | Horizontal | Zoom 200% | Claro | Escuro | Teclado | Movimento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#62` Descoberta | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar |
| `#63` Entrada e conta | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar |
| `#64` Início e vitrines | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar |
| `#65` Criação | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar |
| `#66` Edição manual | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar |
| `#67` Prévia e publicação | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar |
| `#68` Vitrine pública | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar |
| `#69` Importação CSV | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar |
| `#70` Customizações | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar |
| `#71` Insights | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar |
| `#72` Administração | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar | a executar |

Total aplicável inicial: 11 jornadas × 11 colunas = 121 cenários; `#73` recalcula
o total descontando as células `n/a`.

---

## 6. Como reproduzir

```bash
npm ci --engine-strict=false   # Node 22; em Node 24 basta npm ci
npm test
npm run build                  # imprime o hash do build
npx --yes wrangler@4.158.0 deploy --dry-run
PORT=4181 npm run preview      # http://127.0.0.1:4181
curl -sI https://vitrine.inspira.dev.br/ | grep -iE '^(HTTP|cf-mitigated)'
```

Na coleta de 2026-11-14: `npm test` passou 240 de 240 testes; `npm run build`
gerou o hash `0911af34bd42`; o dry-run leu 108 arquivos de `dist/` (381,37 KiB) e
encerrou sem erro.
