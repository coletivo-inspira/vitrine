# Jornada `#63` — Entrada, navegação e conta no painel

Seção da Auditoria UX ([matriz central](../matriz-central.md), contrato
[`ux-audit-matrix-contract.md`](../../../specs/010-ux-audit-meta-readiness/contracts/ux-audit-matrix-contract.md)).

- **Issue**: `#63` — entrar, navegar, editar perfil e sair em desktop e celular.
- **Coleta**: 2026-11-14, 17:20–18:10 UTC.
- **Código auditado**: `main` em `bbafd95c13ab5142aa642287f788632cdd0c55e3`; build com hash `0911af34bd42`.
- **Evidências**: pasta `media/auditoria-ux/63-entrada-conta/` do Context do projeto
  (imagens não versionadas). Capturas citadas pelo nome do arquivo.

## 1. Escopo

| Superfície | Seletor / hash | Coberto |
| --- | --- | --- |
| Tela de login | `#auth-section` | Sim |
| Retorno do Google (código PKCE, cancelamento) | `/portal/?code=…`, `/portal/?error=…` | Parcial (simulado) |
| Perfil obrigatório (primeiro acesso) | `#profile-gate` / `#profile-gate-section` | Sim |
| Cabeçalho | `.app-top-bar` (marca, tema, Sair) | Sim |
| Barra lateral (≥ 900 px) | `.app-sidebar .sidebar-nav` | Sim |
| Barra inferior (≤ 899 px) | `.app-bottom-nav` | Sim |
| Tema claro/escuro | `.theme-toggle`, `web/theme.js` | Sim |
| Perfil e interesses | `#perfil` / `#perfil-section`, `multi-select.mjs`, `phone-mask.mjs` | Sim |
| Sair | `#logout-button` | Sim |
| Sessão expirada | `/api/auth/session` e demais `/api/*` com `401` | Sim (simulado) |
| Modo local | `#local-demo-button` | `n/a`: removido da interface no PR #55 (ver `UX-63-020`) |

Fora do escopo: conteúdo de `#inicio` e `#vitrines` (`#64`), `#wizard` (`#65`),
`#editor` (`#66`, `#67`), `#insights` (`#71`), `#pedidos` (`#70`) e administração (`#72`).

## 2. Ambiente e mocks

- Preview local: `PORT=4183 npm run preview` (`http://127.0.0.1:4183/portal/`), Chrome headless 
  (`/usr/local/bin/google-chrome`), sem Worker nem Supabase.
- Harness: cópia estendida `internal/auditoria-ux/mock-63-64.mjs` do Context (o original
  `painel-mock-cdp.mjs` não foi alterado). Acrescenta roteiros JSON com cliques, toque,
  teclado (`Tab`, `Enter`, `Escape`), digitação, medições em JS, `prefers-reduced-motion`,
  `prefers-reduced-transparency` e emulação de toque.
- Respostas simuladas usadas nesta jornada:

| Rota | Cenários |
| --- | --- |
| `GET /api/auth/session` | `200` (usuária `auditoria@example.test`, `user_metadata.full_name`, avatar ausente, válido ou quebrado), `401`, `500`, falha de rede |
| `GET /api/auth/config` | `503` (sem chave publicável; nenhum redirecionamento real ao Google) |
| `GET /api/profile` | Perfil completo ou vazio |
| `PUT /api/profile` | `200` (eco do corpo), `422` (mensagem do servidor), `500` |
| Qualquer `/api/*` | `401` depois de "expirar" a sessão no meio do roteiro |
| `POST /api/auth/logout` | `200` |

- Dados de teste fictícios; nenhum token, chave ou número real. Nenhuma mensagem de WhatsApp foi enviada.
- Larguras: 360×740, 390×844, 768×1024, 1024×768, 1440×900; capturas também em 375×812 e
  1280×900; horizontal 844×390; zoom 200% emulado como 720×450 (1440 px a 200%).
- Tema escuro por preferência do sistema (`--force-dark-mode`) e pelo botão de tema.
- Contraste calculado no navegador com a fórmula WCAG sobre a cor de fundo composta.

## 3. Inventário de controles

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `.skip-link` | Link | default, focus-visible, active | 1280, 375 | Pular para o conteúdo | Mover o foco para `#conteudo-portal` sem trocar de tela | Visível no 1º `Tab` (contorno 3 px laranja). `Enter` grava `#conteudo-portal` no hash e o roteador abre **Início**, mesmo partindo de `#perfil`; foco vai para `body` (`UX-63-005`) | Visual ok; quebra a navegação |
| `#google-login-button` | Botão | default, focus-visible, active, loading, disabled, error | 360–1440, horizontal, 200%, claro/escuro | Entrar com Google (PKCE) | Redirecionar ao Google ou mostrar erro e liberar o botão | Com `/api/auth/config` indisponível, fica `disabled` com "Redirecionando..." para sempre; o ícone do Google some; a mensagem de erro não aparece (`UX-63-001`, `UX-63-002`) | Nenhum feedback visível |
| `.coletivo-logo-link`, link "Coletivo Inspira" (rodapé do login) | Link | default, focus-visible | todas | Abrir `inspira.dev.br` em nova aba | Indicar nova aba | Abre em nova aba sem aviso; link de texto com 21 px de altura (inline) | Sem aviso de nova aba |
| `.theme-toggle` | Botão | default, hover, focus-visible, active | 375, 1280, claro/escuro, movimento reduzido | Alternar tema | Alternar, persistir e atualizar rótulo | Alterna `data-theme`, salva `localStorage['vitrine-theme']` e troca `aria-label`/`title` ("Ativar modo claro/escuro"). 44×44 px. Inexistente na tela de login (`UX-63-014`) | `aria-label` dinâmico |
| `#logout-button` | Botão | default, focus-visible, active | todas | Encerrar a sessão | Sair, limpar dados locais e confirmar | Sai e volta ao login; a confirmação "Sessão encerrada com sucesso." fica invisível; perfil continua no `localStorage` (`UX-63-002`, `UX-63-004`) | Nenhum feedback visível |
| `.mobile-brand .brand` / `.sidebar-brand .brand` | Link | default, focus-visible | ≤ 899 / ≥ 900 | Voltar ao início do painel | Ir para `#inicio` | `href="./"` recarrega o painel; 120×37 px no celular | `aria-label` "Vitrine Inspira — início" |
| `.sidebar-nav .nav-link` (6 itens) | Link / Menu | default, hover, focus-visible, active | 1024, 1280, 1440 | Trocar de seção | Destacar a seção atual e anunciá-la | Destaque por classe `active` (pílula laranja, contraste 4,92:1 claro / 9,61:1 escuro); sem `aria-current` (`UX-63-011`) | Só visual |
| `.app-bottom-nav .nav-link` (5 itens) | Link / Menu | default, active, toque | 360, 390, 768, horizontal, 200% | Trocar de seção no celular | Mesmo conjunto da barra lateral | Sem "Leilões"; "Pedidos" no lugar de "Customizações"; em `#leiloes` nenhum item fica ativo (`UX-63-012`). Alvos 48 px de altura; ativo 4,77:1 | Só visual |
| `#profile-gate-form` campos `#gate-display-name`, `#gate-business-name`, `#gate-city`, `#gate-whatsapp` | Campo | default, focus-visible, error, preenchido | 375, 1280, claro/escuro | Completar o perfil obrigatório | Erro por campo, foco no primeiro inválido | Nome pré-preenchido com o nome do Google. Envio vazio mostra só "Por favor, preencha todos os campos obrigatórios." no topo; sem `aria-invalid`/`aria-describedby` (`UX-63-008`). Em ≤ 520 px os campos têm 30 px de altura e fonte de 12 px (`UX-63-009`) | Banner genérico |
| `#gate-whatsapp` / `#profile-whatsapp` | Campo | default, error, máscara | 375, 1280 | WhatsApp do negócio | Máscara e validação | Máscara funciona (`5581999998888` → `+55 (81) 99999-8888`); "123" vira `+1 23` e mostra o erro abaixo do campo, sem associação ARIA | Texto de erro visível |
| `#gate-interests-combobox` / `#profile-interests-combobox` | Campo (combobox) / Menu | default, aberto, focus-visible, preenchido, limite | 375, 1280, toque | Escolher até 8 interesses ou criar "outro" | Abrir lista, `Enter` adiciona, `Esc` fecha | Abre com 7 opções, `Enter` cria "Doces finos", `Esc` fecha (`aria-expanded` atualizado). Caixa com 32 px de altura; a `ul` da lista recebe foco no `Tab` | `aria-live` no aviso de limite |
| `.multi-select-tag-remove` | Ícone / Botão | default, hover, focus-visible | 375, 1280 | Remover interesse | Alvo ≥ 44 px | 20×20 px (`UX-63-010`); `aria-label` "Remover …" | ARIA ok |
| `#profile-gate-form [type=submit]` "Criar minha conta" | Botão | default, loading, error, sucesso | 375, 1280 | Salvar o perfil obrigatório | Salvar e ir para Início | Sucesso vai para `#inicio` com "Perfil criado com sucesso na nuvem!". Com `500`, mostra erro, mas o perfil já foi gravado localmente e a navegação para outras seções é liberada (`UX-63-006`). Sem estado de carregamento | Banner |
| `#profile-form` campos | Campo | default, focus-visible, vazio, error | 375, 1280, horizontal, 200% | Editar perfil | Manter os obrigatórios | Campos sem `required`; é possível apagar negócio e cidade e salvar "com sucesso" (`UX-63-007`) | Banner |
| `#profile-form [type=submit]` "Salvar Perfil" | Botão | default, sucesso, error (`422`, `500`, `401`) | 375, 1280 | Salvar perfil | Confirmar e manter a URL coerente | Sucesso troca para Início mas o hash continua `#perfil` (`UX-63-013`). `422` mostra a mensagem do servidor; `401` mostra "Sessão inválida ou expirada." e mantém a pessoa no painel (`UX-63-003`) | Banner (6 s) |
| `#profile-avatar` / `#profile-avatar-placeholder` | Ícone / Imagem | com foto, sem foto, foto quebrada | 375, 1280 | Mostrar a conta Google | Foto ou inicial | Sem foto mostra a inicial "P"; foto quebrada cai para a inicial. `alt="Avatar"` genérico (`UX-63-017`) | — |
| `#profile-email` | Texto | com nome e e-mail | 375, 1280 | Identificar a conta | Nome e e-mail | "Conectado como **Pessoa Auditora** · auditoria@example.test" | — |
| `#global-feedback` | Banner | hidden, success, error | todas | Mensagens globais | Visível em qualquer tela; erro anunciado | Fica dentro de `#authenticated-app`; no login nunca aparece. `aria-live="polite"` também para erros; some após 6 s | Ver `UX-63-002`, `UX-63-016` |

## 4. Matriz de cenários

| Cenário | 360 | 390 | 768 | 1024 | 1440 | Horizontal | Zoom 200% | Claro | Escuro | Teclado | Movimento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Login (layout, rolagem horizontal, alvos) | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |
| Login com configuração ausente / cancelamento / PKCE sem verificador | executado (375) | n/a | n/a | n/a | executado (1280) | n/a | n/a | executado | n/a | executado | n/a |
| Sessão `401` / `500` / rede no carregamento | executado (375) | n/a | n/a | n/a | n/a | n/a | n/a | executado | n/a | n/a | n/a |
| Login Google real, consentimento e cancelamento reais | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado |
| Cabeçalho, barra lateral e inferior | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |
| Tema (alternância e persistência) | n/a | n/a | n/a | n/a | executado (1280) | n/a | n/a | executado | executado | executado | executado |
| Perfil obrigatório (vazio, WhatsApp inválido, `500`, sucesso) | executado (375) | n/a | n/a | n/a | executado (1280) | n/a | n/a | executado | executado | parcial | n/a |
| `#perfil` (avatar, interesses, salvar, `422`, `401`, campos vazios) | executado (375) | n/a | n/a | n/a | executado (1280) | executado | executado | executado | executado | executado | executado |
| Sair | executado (375) | n/a | n/a | n/a | executado (1280) | n/a | n/a | executado | executado | executado | n/a |

Resumo para a matriz central (linha `#63`): 360 executado · 390 executado · 768 executado ·
1024 executado · 1440 executado · horizontal executado · zoom 200% executado · claro
executado · escuro executado · teclado executado · movimento executado. O login real com
Google continua bloqueado (`BLK-UX-61-AUTH`).

Medições que passaram e não geram achado:

- Nenhuma rolagem horizontal no login, no perfil obrigatório e em `#perfil`, em nenhuma largura, na horizontal ou no zoom 200%.
- Contraste de textos medidos ≥ 4,5:1 em ambos os temas (menor valor: item ativo da barra inferior, 4,77:1 no claro).
- Foco visível (contorno sólido de 3 px laranja) em todos os controles percorridos, exceto o campo do combobox, cujo destaque vem do contêiner (`:focus-within`, `web/portal/portal.css:1726`).
- `prefers-reduced-motion: reduce` zera animações e transições (`web/portal/portal.css:2007`); a marca animada respeita a preferência (`@media (prefers-reduced-motion: no-preference)` no SVG).
- `prefers-reduced-transparency: reduce` troca o vidro por superfície sólida nos dois temas (`web/portal/portal.css:204`).
- Tema: alternância salva a escolha e mantém `aria-label`/`title` coerentes (`web/theme.js:10-29`).
- Barra inferior: alvos de 48 px de altura, `aria-label="Navegação móvel"`.

## 5. Achados

| ID | Issue | Severidade | Natureza | Eixo | Descrição e Evidência | Critério de Aceite | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UX-63-001` | `#63` | `P1` | `problema_confirmado` | `feedback` | Quando `startGoogleLogin` não obtém a configuração, ele chama `showFeedback` e retorna `null` sem lançar erro (`web/portal/portal.js:797-804`). O manipulador do clique só restaura o botão no `catch` (`web/portal/portal.js:275-285`). Resultado: o botão fica desativado com "Redirecionando..." e sem o ícone do Google até a página ser recarregada. Capturas `login-google-sem-config-375-claro.png` e `login-google-sem-config-1280-claro.png` | Com `/api/auth/config` indisponível, o botão volta a "Entrar com Google" com ícone e habilitado em até 1 s, e uma mensagem visível explica que o login está indisponível | Aberto |
| `UX-63-002` | `#63` | `P1` | `problema_confirmado` | `feedback` | O único banner (`#global-feedback`, `web/portal/index.html:204`) fica dentro de `#authenticated-app` (`web/portal/index.html:122`), que está oculto na tela de login. Todas as mensagens da tela de login são gravadas e nunca aparecem: falha de configuração, PKCE ausente ou expirado (`web/portal/portal.js:564`, `:573-575`), falha ao validar a sessão e "Sessão encerrada com sucesso." (`web/portal/portal.js:861`). Medição: `feedback.hidden=false`, `visivel=false`. Capturas `sair-375-claro.png` e `login-pkce-sem-verificador-375-claro.png` | Uma região de mensagens existe também em `#auth-section`; nos cenários de configuração ausente, PKCE sem verificador e Sair, a mensagem fica visível e é anunciada (erros com `role="alert"`) | Aberto |
| `UX-63-003` | `#63` | `P1` | `problema_confirmado` | `conta_tema` | Sessão expirada no meio do uso: depois de `401` em todas as rotas, "Salvar Perfil" mostra só "Sessão inválida ou expirada." e a pessoa continua no painel, navegando com dados antigos. Não há tratamento de `401` fora de `checkSession` (`web/portal/portal.js:699`; nenhuma outra checagem de `401` em `web/portal/`). Risco no código: o cookie vale até o `exp` do token do Supabase (`workers/api.mjs:371-388`) e não há renovação, então a expiração acontece em uso normal. Captura `perfil-sessao-expirada-375-claro.png` | Qualquer `401` de `/api/*` leva à tela de login com a mensagem "Sua sessão terminou. Entre novamente." visível. Depois de entrar de novo, a pessoa volta ao hash em que estava. Alterações não salvas são preservadas ou avisadas | Aberto |
| `UX-63-004` | `#63` | `P1` | `problema_confirmado` | `conta_tema` | "Sair" não apaga `vitrine_profile` (nome, negócio, cidade e WhatsApp) nem `vitrine_customization_requests` do `localStorage` (`web/portal/portal.js:830-863`; medição após Sair: as duas chaves continuam). Risco no código: se `/api/profile` falhar para a próxima conta no mesmo navegador, `loadLocalProfile` carrega os dados da conta anterior (`web/portal/portal.js:921-951`). Captura `sair-375-claro.png` | Depois de Sair, nenhuma chave `vitrine_*` com dados pessoais fica no `localStorage`. Uma nova sessão nunca exibe dados de outra conta | Aberto |
| `UX-63-005` | `#63` | `P1` | `problema_confirmado` | `navegacao` | O link "Pular para o conteúdo" (`web/portal/index.html:16`) grava `#conteudo-portal` no hash. `getSectionFromHash` trata hashes desconhecidos como `inicio` (`web/portal/portal.js:123-137`), então, a partir de `#perfil`, o atalho abre Início e o foco vai para `body`. O mecanismo de bypass (WCAG 2.4.1) existe, mas tira a pessoa da tela em que estava | Em `#perfil`, `#vitrines` e `#inicio`, `Tab` + `Enter` no atalho mantém a seção e move o foco para o `main` (ou para o título da seção) sem alterar o hash da rota | Aberto |
| `UX-63-006` | `#63` | `P2` | `problema_confirmado` | `formularios` | No perfil obrigatório, os dados são gravados em memória e no `localStorage` antes da resposta do servidor (`web/portal/portal.js:1079-1080`). Com `PUT /api/profile` → `500`, aparece o erro, mas `isProfileComplete()` já é verdadeiro e a navegação para `#vitrines` é liberada sem perfil no servidor. Captura `perfil-obrigatorio-falha-500-depois-navega-1280-claro.png` | Com falha no `PUT`, o perfil obrigatório continua bloqueando as demais seções e os campos preservam o que foi digitado | Aberto |
| `UX-63-007` | `#63` | `P2` | `problema_confirmado` | `formularios` | `#perfil` não marca campos como obrigatórios (`web/portal/index.html:556-571`) e `handleSaveProfile` só valida o WhatsApp (`web/portal/portal.js:1127`). O servidor aceita texto vazio (`src/portal-validation.mjs:1052-1071`). Apagar negócio e cidade mostra "salvos com sucesso" e, na navegação seguinte, a pessoa cai em "Antes de criar sua vitrine, conte quem você é". Captura `perfil-campos-vazios-salvo-1280-claro.png` | Em `#perfil`, salvar com nome, negócio, cidade ou WhatsApp vazio mostra erro no próprio campo e não grava nada | Aberto |
| `UX-63-008` | `#63` | `P1` | `problema_confirmado` | `formularios` | Erros do perfil obrigatório não identificam o campo: envio vazio mostra só "Por favor, preencha todos os campos obrigatórios." no topo (WCAG 3.3.1). Nenhum campo recebe `aria-invalid` ou `aria-describedby`; o erro do WhatsApp (`#gate-whatsapp-error`) não está associado ao campo; o foco não vai para o primeiro inválido. Captura `perfil-obrigatorio-vazio-375-claro.png` | Cada campo inválido mostra mensagem própria ligada por `aria-describedby`, com `aria-invalid="true"`, e o foco vai para o primeiro campo inválido | Aberto |
| `UX-63-009` | `#63` | `P2` | `problema_confirmado` | `formularios` | Em ≤ 520 px, uma regra do editor (`web/portal/portal.css:4112`, `:4228-4235`) reduz `.item-input` e `.input-styled-height` para 30 px de altura e fonte de 12 px, e isso atinge também os campos do perfil obrigatório. Alvo abaixo de 44 px, e fonte < 16 px faz o iOS ampliar a tela ao focar (o iOS não foi testado). Captura `perfil-obrigatorio-375-claro.png` | Em 360–520 px, os campos do perfil obrigatório e de `#perfil` medem ≥ 44 px de altura com fonte ≥ 16 px | Aberto |
| `UX-63-010` | `#63` | `P2` | `problema_confirmado` | `formularios` | O botão de remover interesse (`.multi-select-tag-remove`) mede 20×20 px (`web/portal/portal.css:1757-1772`), abaixo da meta de 44 px do `DESIGN.md` e no limite do WCAG 2.5.8 (24 px, que depende do espaçamento). Captura `perfil-interesses-aberto-375-claro.png` | Área de toque do botão de remover ≥ 44×44 px (pode ser só a área clicável, sem aumentar o ícone) | Aberto |
| `UX-63-011` | `#63` | `P2` | `problema_confirmado` | `navegacao` | Barra lateral e inferior marcam a seção atual só com a classe `active` (`web/portal/portal.js:885-888`); nenhum link recebe `aria-current="page"`. Leitor de tela não anuncia onde a pessoa está | O link da seção atual tem `aria-current="page"` nas duas barras, e o atributo é retirado dos demais | Aberto |
| `UX-63-012` | `#63` | `P2` | `problema_confirmado` | `navegacao` | A barra inferior tem 5 itens e omite "Leilões" (`web/portal/index.html:1401-1434`), que existe na lateral (`:152`). Em `#leiloes` no celular, nenhum item fica ativo. O rótulo "Pedidos" diverge de "Customizações" na lateral e no título da seção. Captura `leiloes-sem-aba-inferior-375-claro.png` | No celular, todas as seções da lateral são alcançáveis pela navegação (aba ou menu "Mais"), com o mesmo rótulo e item ativo correto | Aberto |
| `UX-63-013` | `#63` | `P2` | `problema_confirmado` | `navegacao` | Depois de "Salvar Perfil", `showSection('inicio')` troca a tela sem mudar o hash (`web/portal/portal.js:1160`): a tela mostra Início, o hash continua `#perfil` e recarregar volta para Perfil. Captura `perfil-salvo-1280-claro.png` | Depois de salvar, a pessoa fica em `#perfil` com a confirmação, ou o hash passa a `#inicio`. Tela e URL sempre coincidem | Aberto |
| `UX-63-014` | `#63` | `P3` | `problema_confirmado` | `conta_tema` | O botão de tema só existe no cabeçalho do painel autenticado (`web/portal/index.html:193`); na tela de login e no retorno após Sair não há como alternar o tema (o `DESIGN.md` prevê o controle no cabeçalho). Captura `login-375-claro.png` | A tela de login tem o mesmo botão de tema de 44 px | Aberto |
| `UX-63-015` | `#63` | `P2` | `critica_ux` | `feedback` | Se `/api/auth/session` responde `500` ou falha por rede, o painel mostra a tela de login normal, sem aviso (`web/portal/portal.js:704-714`); a pessoa tenta o Google mesmo com o servidor fora. O cancelamento no Google (simulado com `?error=access_denied&error_description=…`) também volta em silêncio e deixa os parâmetros na URL (`extractAuthCodeFromUrl` só lê `code`, `web/portal/portal.js:469-499`). Capturas `login-sessao-500-375-claro.png` e `login-cancelado-375-claro.png` | Erro de servidor ou rede mostra "Não foi possível verificar sua sessão. Tente novamente." com botão de tentar de novo. Retorno com `error` mostra "Login cancelado" e limpa a URL | Aberto |
| `UX-63-016` | `#63` | `P2` | `risco_codigo` | `feedback` | `showFeedback` usa a mesma região `aria-live="polite"` para erros e sucessos, troca o texto enquanto a região ainda está oculta e esconde a mensagem após 6 s (`web/portal/portal.js:901-918`). Erros podem não ser anunciados ou sumir antes da leitura. A leitura com leitor de tela real não foi feita | Erros usam `role="alert"`, ficam visíveis até a pessoa agir ou fechar, e o texto é inserido depois de a região estar visível | Aberto |
| `UX-63-017` | `#63` | `P3` | `critica_ux` | `conta_tema` | O avatar usa `alt="Avatar"` (`web/portal/index.html:215`, `:545`) e o cabeçalho não mostra conta, foto nem e-mail: a pessoa só confirma com que conta entrou dentro de Perfil. Captura `perfil-1280-claro.png` | O cabeçalho mostra a inicial ou foto com nome/e-mail acessível ("Conta: …") e o avatar decorativo usa `alt=""` | Aberto |
| `UX-63-018` | `#63` | `P3` | `problema_confirmado` | `navegacao` | Em 360–390 px, o cartão de login ocupa 100% da largura (bordas em 0 e 375 px) e os cantos arredondados encostam nas laterais (`#auth-section`, `web/portal/portal.css:629-634`). Captura `login-375-claro.png` (confirma a pista da `#61`) | Em 360 px, o cartão tem margem lateral ≥ 16 px | Aberto |
| `UX-63-019` | `#63` | `P2` | `critica_ux` | `navegacao` | A tela de login não tem link para a vitrine pública, para Privacidade nem para Termos; a marca não é link (`web/portal/index.html:93-119`). Para quem chega pelo Google, faltam contexto e acesso às políticas, o que também importa para a revisão da Meta (`#44`/`010`) | A tela de login tem links para `/`, `/privacidade/` e `/termos/` | Aberto |
| `UX-63-020` | `#63` | `P3` | `risco_codigo` | `conta_tema` | O modo local foi removido da interface (PR #55), mas `portal.js` mantém o código (`loadLocalSites`, `loadLocalProfile`, ramos `!isOnline`, selo `#demo-mode-badge`), acionado quando `/api/auth/session` falha (`isOnline=false`, `web/portal/portal.js:705`, `:711`). Caminho morto que ainda decide mensagens (ex.: "criada com sucesso no modo local") | Ou o modo local volta com controle explícito, ou o código e o selo são removidos e `isOnline=false` só mostra o aviso de `UX-63-015` | Aberto |
| `UX-63-021` | `#63` | `P3` | `critica_ux` | `navegacao` | Durante o perfil obrigatório, barra lateral e inferior continuam visíveis e clicáveis, mas todo clique devolve a pessoa a `#profile-gate` (`web/portal/portal.js:153-158`), sem explicação. O botão "Criar minha conta" sugere criar uma conta que já existe (Google). Captura `perfil-obrigatorio-1280-claro.png` | No perfil obrigatório, a navegação fica oculta ou desativada com aviso, e o botão diz "Salvar e continuar" | Aberto |

Contagem: `P0` 0 · `P1` 6 (`UX-63-001`, `002`, `003`, `004`, `005`, `008`) · `P2` 10 · `P3` 5.

## 6. Bloqueios e checklist de aceite

| Código | Bloqueio | Checklist de aceite (ação humana) |
| --- | --- | --- |
| `BLK-UX-61-AUTH` | Login Google real indisponível localmente (sem chave publicável do Supabase no preview; em produção, versão `bbafd95`, o login exige navegador real porque clientes automatizados recebem o desafio de bots da Cloudflare) | [ ] Entrar com Google em `painel.inspira.dev.br` com conta de teste e voltar ao painel · [ ] Cancelar o consentimento no Google e registrar URL de retorno e mensagem (valida `UX-63-015`) · [ ] Deixar a sessão expirar (≥ 1 h) e tentar salvar o perfil (valida `UX-63-003`) · [ ] Repetir Sair e entrar com outra conta no mesmo navegador (valida `UX-63-004`) |
| `BLK-UX-63-AT` | Sem leitor de tela nem dispositivo iOS no ambiente da auditoria | [ ] Com VoiceOver (iOS) ou NVDA, confirmar o anúncio de erros e sucessos (`UX-63-016`) e da seção atual (`UX-63-011`) · [ ] Em iPhone, confirmar a ampliação ao focar campos de 12 px (`UX-63-009`) |

## 7. Recomendações

1. **Feedback fora do painel** (`UX-63-001`, `002`, `015`, `016`): criar uma região de mensagens em
   `#auth-section` (ou mover `#global-feedback` para fora de `#authenticated-app`), restaurar o botão
   do Google quando `startGoogleLogin` retorna sem redirecionar e tratar `?error=` no retorno.
2. **Sessão** (`UX-63-003`, `004`): interceptar `401` num único `fetch` do painel e levar ao login com
   aviso; limpar todas as chaves `vitrine_*` pessoais ao sair; avaliar renovação de sessão pelo
   Supabase para evitar quedas em ~1 h.
3. **Formulários de perfil** (`UX-63-006` a `010`, `013`): validar por campo com `aria-invalid` e
   `aria-describedby`, só gravar localmente depois do `200`, manter os obrigatórios em `#perfil`,
   isolar a regra compacta do editor (`portal.css:4228`) dentro de `#editor-section` e ampliar o
   alvo do botão de remover interesse.
4. **Navegação** (`UX-63-005`, `011`, `012`, `021`): o atalho de conteúdo deve mover o foco sem mexer no
   hash; adicionar `aria-current`; alinhar as barras lateral e inferior (incluir Leilões ou um menu
   "Mais"; usar "Customizações" nas duas).
5. **Login e conta** (`UX-63-014`, `017`, `018`, `019`): botão de tema, links para a vitrine pública e
   para as políticas, margem lateral no celular e identificação da conta no cabeçalho.
