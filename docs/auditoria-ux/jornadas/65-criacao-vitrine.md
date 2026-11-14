# Jornada `#65` — Criação de vitrine (`#wizard`)

Seção da Auditoria UX para a issue `#65` ("Auditar criação de vitrine"), seguindo as
convenções da [matriz central](../matriz-central.md) (seção 4) e o
[contrato da auditoria](../../../specs/010-ux-audit-meta-readiness/contracts/ux-audit-matrix-contract.md).

- **Data da coleta**: 2026-11-14, 17:20–17:45 UTC.
- **Commit auditado**: `main` em `bbafd95c13ab5142aa642287f788632cdd0c55e3`; build com hash `0911af34bd42`.
- **Superfície**: `/portal/#wizard` (assistente em 3 passos: área, modelo, nome e endereço),
  com entradas por `#wizard-open-btn` ("+ Nova Vitrine" em Minhas Vitrines) e
  `#hub-create-site-btn` (Painel Inicial).
- **Evidências**: pasta `media/auditoria-ux/65-criacao/` do Context do projeto
  (as imagens não são versionadas). Nomes no formato `<tela>-<largura>-<tema>.png`.

## 1. Ambiente e simulação

- Preview local: `PORT=4184 npm run preview` (só `dist/` estático, sem Worker).
- Painel autenticado com `/api/*` simulado pelo Chrome DevTools Protocol, sem alterar
  o repositório. Script: `internal/auditoria-ux/mock-65-67.mjs` no Context do projeto
  (cópia estendida de `painel-mock-cdp.mjs`, da `#61`). Comando:
  `node mock-65-67.mjs 65 <pasta-media> http://127.0.0.1:4184` (e `extra65`).
- O que a simulação reproduz de `workers/api.mjs` para esta jornada:
  - `POST /api/sites` com `201` (cria a vitrine e passa a listá-la);
  - `409 SLUG_TAKEN` para endereço já usado;
  - `400 INVALID_SLUG` com a mesma regra e a mesma lista de reservados de
    `src/portal-validation.mjs:11-29`;
  - atraso configurável na resposta, usado para testar o clique duplo.
- Dados de teste: sessão `auditoria@example.test`, perfil completo ("Negócio de Teste",
  WhatsApp `5511999999999`), vitrine existente `vitrine-teste`.
- Comportamento do cliente (`web/portal/portal.js`) foi observado de fato; respostas do
  servidor são simuladas. Por isso, achados que dependem só da resposta real do Worker
  ficam como `risco_codigo` ou `nao_verificado`.

## 2. Cenários executados

### 2.1 Matriz da jornada

| Jornada | 360 | 390 | 768 | 1024 | 1440 | Horizontal | Zoom 200% | Claro | Escuro | Teclado | Movimento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#65` Criação | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado |

- Larguras: passos 1 e 3 capturados e medidos em 360, 390, 768, 1024, 1440, horizontal
  `844×390` e zoom 200% (`720×450` com escala 2). Nenhuma largura tem rolagem horizontal
  (`scrollWidth = innerWidth` em todas).
- Claro e escuro: passos 1, 2 e 3 em 1280 e 375 (`wizard-passo{1,2,3}-{1280,375}-{claro,escuro}.png`).
- Teclado: setas trocam a área selecionada com contorno visível no cartão
  (`wizard-foco-radio-1280-claro.png`); `Tab` passa por "Cancelar" e "Continuar →" com
  contorno de 3 px; `Enter` avança. Foco após avançar: ver `UX-65-006`.
- Movimento reduzido: com `prefers-reduced-motion: reduce`, a animação `fadeIn` do passo e
  as transições dos cartões são zeradas (`portal.css:2007-2011`).
- Toque: botões do assistente medem 48 px de altura; campos do passo 3 medem 30 px em
  360/390 (ver `UX-65-008`).

### 2.2 Estados e falhas cobertos

| Cenário | Resultado observado | Evidência |
| --- | --- | --- |
| Caminho feliz (Orçamento, nome digitado) | `POST /api/sites` com `template: quote-v1`; aviso "Vitrine "…" criada com sucesso!"; volta para `#vitrines`; foco no `body` | `wizard-sucesso-lista-375-claro.png` |
| Voltar e Continuar entre passos | Área, modelo, nome e endereço preservados | resultado `65.retorno` |
| Sair pelo menu (`#perfil`) e voltar | Reinicia no passo 1; nome volta ao do perfil; endereço é recalculado | `UX-65-005` |
| Endereço com maiúsculas e acentos (`Pizza Ç!`) | Limpo para `pizza` durante a digitação, sem aviso do que foi removido | resultado `65.validacaoEndereco` |
| Endereço curto (`ab`), hífen duplo (`a--b`), reservado (`admin`) | Mensagem inline correta | `wizard-endereco-invalido-{1280,375}-claro.png` |
| Endereço reservado só no servidor (`planos`, `termos`) | Sem erro inline; `400` no envio com "Identificador (slug) inválido…" | `UX-65-003` |
| Nome vazio | Aviso global "Digite o nome do negócio."; foco fica no endereço | `wizard-nome-vazio-1280-claro.png` |
| Conflito de endereço (`409`) | Aviso global no topo; nenhum erro no campo | `wizard-conflito-endereco-{1280,375}-{claro,escuro}.png` |
| Clique duplo com resposta lenta (1,2 s) | Dois `POST`: `201` e `409`; vitrine criada; mensagem final de erro | `wizard-clique-duplo-resultado-1280-claro.png` |
| Modelo sob medida | Mostra Customizações com o pedido preenchido; hash continua `#wizard` | `wizard-sob-medida-pedidos-1280-claro.png` |

## 3. Inventário de controles

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `#wizard-open-btn` "+ Nova Vitrine" | Botão | default, focus-visible | 375, 1280 | Abrir o assistente a partir de Minhas Vitrines | Ir para `#wizard` no passo 1 | Vai para `#wizard`; o assistente sempre reinicia | Mudança de hash; sem anúncio |
| `#hub-create-site-btn` | Botão | default | 1280 | Atalho do Painel Inicial | Igual ao anterior | Igual ao anterior | — |
| `.step-ind` (1 Área, 2 Modelo, 3 Endereço) | Indicador (não interativo) | ativo, inativo | todas | Mostrar progresso | Passo atual identificável visual e programaticamente | Só cor/opacidade; sem `aria-current`; inativos com contraste 2,15:1 (claro) e 3,4:1 (escuro) | Visual apenas (`UX-65-006`, `UX-65-009`) |
| `input[name=wizard-area]` (5 cartões) | Rádio em cartão | default, checked, focus-visible, hover | todas | Escolher a área do negócio | Seleção por clique, toque e setas | Funciona; contorno laranja de 3 px no foco; cartões de 180–194 px de altura | Borda e fundo laranja; rádio nativo oculto com `opacity: 0` |
| `.wizard-cancel-btn` "Cancelar" (só no passo 1) | Botão | default, focus-visible | todas | Desistir da criação | Voltar para Minhas Vitrines | Vai para `#vitrines`; passos 2 e 3 não têm Cancelar | — |
| `.wizard-next-btn` "Continuar →" (passos 1 e 2) | Botão | default, focus-visible, active | todas | Avançar | Mostrar o próximo passo e levar o foco ao título dele | Mostra o passo; foco vai para o `body` | Sem anúncio (`UX-65-006`) |
| `input[name=wizard-model]` (4 cartões) | Rádio em cartão | default, checked | todas | Escolher o modelo (Produtos, Agendamento, Orçamento, Sob Medida) | Modelos coerentes com a área | Mesmos 4 modelos para qualquer área; selo "Disponível"/"Sob Customização" | Selo de texto |
| `.wizard-prev-btn` "← Voltar" (passos 2 e 3) | Botão | default | todas | Voltar um passo | Voltar sem perder dados | Preserva área, modelo, nome e endereço | — |
| `#wizard-site-name` "Nome do seu Negócio" | Campo | default, empty, filled, error | todas | Nome da vitrine | Obrigatório com erro no campo | Preenchido com o nome do perfil; erro só no aviso global; 30 px de altura em ≤520 px | Sem `aria-invalid` (`UX-65-007`, `UX-65-008`) |
| `#wizard-site-slug` "Endereço Público (slug na url)" | Campo | default, error, filled | todas | Endereço público da vitrine | Validação ao vivo completa e erro de conflito no próprio campo | Limpa caracteres; valida formato, tamanho e 10 reservados; sobrescrito ao editar o nome; conflito só no aviso global | `#wizard-slug-validation-error` sem `aria-describedby`/`aria-live` (`UX-65-002`, `UX-65-003`, `UX-65-004`) |
| `#wizard-slug-preview` | Texto de ajuda | default | todas | Mostrar o endereço final | Atualizar ao digitar | Atualiza para `vitrine.inspira.dev.br/<endereço>` | Visual |
| `button[type=submit]` "Criar Vitrine 🎉" | Botão | default, loading, error | todas | Criar a vitrine | Desabilitar durante o envio e confirmar com o próximo passo | Não desabilita, não mostra carregamento; clique duplo cria e depois mostra erro | `UX-65-001`, `UX-65-010` |
| `#global-feedback` | Aviso global | success, error | todas | Mensagens do painel | Permanecer até ser lido; erros junto ao campo | `aria-live="polite"`; some em 6 s (ou antes, por temporizador antigo); rola a página ao topo | `UX-65-015` |

## 4. Achados

| ID | Issue | Severidade | Natureza | Eixo | Descrição e Evidência | Critério de Aceite | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UX-65-001` | `#65` | `P1` | `problema_confirmado` | `feedback` | O clique duplo em "Criar Vitrine" envia dois `POST /api/sites`. A primeira resposta (`201`) cria a vitrine e leva à lista. A segunda (`409`) substitui o aviso de sucesso por "Este endereço (slug) já está sendo utilizado por outra vitrine.". A pessoa vê erro, mas a vitrine foi criada. `portal.js:1614-1698` não tem trava de envio e o botão (`index.html:793`) nunca é desabilitado. Captura: `wizard-clique-duplo-resultado-1280-claro.png`. A resposta `409` vem do mock, igual à regra do Worker (`workers/api.mjs:1472-1478`). | Durante o envio, o botão fica `disabled`, com `aria-busy="true"` e texto de carregamento. Dois cliques geram um único `POST`. A mensagem final é a de sucesso. | Aberto |
| `UX-65-002` | `#65` | `P2` | `problema_confirmado` | `formularios` | O conflito de endereço (`409`) só aparece no aviso global do topo. O campo `#wizard-site-slug` não ganha erro inline, `aria-invalid` nem sugestão de alternativa. Em 375 px, o aviso fica no topo e o campo focado fica atrás da barra inferior. O aviso some em 6 s. `portal.js:1666-1674`. Capturas: `wizard-conflito-endereco-375-claro.png`, `wizard-conflito-endereco-1280-escuro.png`. | Com `409`: a mensagem aparece em `#wizard-slug-validation-error`, ligada por `aria-describedby`; o campo recebe `aria-invalid="true"`; o campo rola até ficar visível e recebe o foco; há pelo menos uma sugestão de endereço livre ou um texto orientando a troca. | Aberto |
| `UX-65-003` | `#65` | `P2` | `problema_confirmado` | `formularios` | A lista de reservados do cliente (`portal.js:120`, 10 nomes) é menor que a do servidor (`src/portal-validation.mjs:11-29`, 17 nomes). Ficam de fora `como-funciona`, `possibilidades`, `planos`, `orcamento`, `por-cidade`, `privacidade` e `termos`. Nesses casos não há erro ao vivo, e o envio falha com "Identificador (slug) inválido…" no aviso global. Resultado `65.reservadoServidor`. | A validação ao vivo usa a mesma lista do servidor (fonte única importada ou gerada no build). Digitar `planos` mostra "Este endereço é reservado pelo sistema." antes do envio. | Aberto |
| `UX-65-004` | `#65` | `P2` | `problema_confirmado` | `formularios` | Editar o nome depois de escolher um endereço próprio sobrescreve o endereço sem aviso: `meu-endereco-proprio` vira `atelie-sao-joao`. `portal.js:378-389`. Resultado `65.nomeSobrescreveEndereco`. | Depois que a pessoa edita o endereço, mudanças no nome não o alteram (ou há um controle explícito "usar o nome como endereço"). | Aberto |
| `UX-65-005` | `#65` | `P2` | `problema_confirmado` | `navegacao` | Sair do assistente pelo menu e voltar reinicia no passo 1. O nome volta ao do perfil e o endereço é recalculado, perdendo o que foi digitado. Só o passo 1 tem "Cancelar". `portal.js:176-178` chama `openWizard()` (`portal.js:411-422`) a cada mudança de hash. Resultado `65.retorno`. | Voltar a `#wizard` na mesma sessão retoma o passo e os valores digitados, ou pergunta antes de descartar. Os passos 2 e 3 também oferecem saída explícita. | Aberto |
| `UX-65-006` | `#65` | `P2` | `problema_confirmado` | `navegacao` | Em "Continuar" ou "Voltar", o botão acionado fica oculto e o foco cai no `body`. Leitor de tela e teclado perdem a posição. O indicador de passos não tem `aria-current` nem texto "Passo 2 de 3". `portal.js:424-436`; `index.html:656-662`. Resultado `65.teclado`. | Ao trocar de passo, o foco vai para o `h2` do novo passo (`tabindex="-1"`). O passo atual tem `aria-current="step"`. A troca é anunciada (por exemplo, "Passo 2 de 3: Modelo"). | Aberto |
| `UX-65-007` | `#65` | `P2` | `problema_confirmado` | `formularios` | Os erros dos campos não são programáticos. O nome vazio aparece só no aviso global, e o foco continua no endereço. O erro de formato do endereço não está ligado ao campo e não usa `aria-live`. `index.html:780-787`; `portal.js:1620-1628`. Captura: `wizard-nome-vazio-1280-claro.png`. | Nome vazio mostra erro inline sob o campo, com `aria-invalid` e foco no campo. As mensagens de erro ficam ligadas por `aria-describedby` e são anunciadas. | Aberto |
| `UX-65-008` | `#65` | `P2` | `problema_confirmado` | `formularios` | Em até 520 px, `.input-styled-height` cai para `min-height: 30px` (`portal.css:4231-4232`). Os campos do passo 3 medem 306×30 px em 360 e 336×30 px em 390, abaixo do alvo de 44 px do `DESIGN.md` (seção Portal, "Formas, Ergonomia e Segurança"). Resultado `65.grade`. | Os campos do assistente medem pelo menos 44 px de altura em todas as larguras. | Aberto |
| `UX-65-009` | `#65` | `P1` | `problema_confirmado` | `feedback` | Rótulos dos passos inativos ("Modelo", "Endereço") usam `opacity: .5` sobre `--ink-soft` (`portal.css:874-883`). Contraste estimado: 2,15:1 no claro e 3,4:1 no escuro, contra o fundo da página. Texto de 13 px exige 4,5:1 (WCAG 1.4.3). Resultado `65.contrastePassoInativo`. | Rótulos e números dos passos inativos têm contraste mínimo de 4,5:1 nos dois temas. O estado é diferenciado por peso, ícone ou borda, e não pela opacidade do texto. | Aberto |
| `UX-65-010` | `#65` | `P2` | `critica_ux` | `feedback` | Depois de criar, a pessoa vai para a lista com um aviso que some em 6 s. O foco fica no `body` e não há atalho para o próximo passo natural (adicionar itens). `portal.js:1659-1665`. Captura: `wizard-sucesso-lista-375-claro.png`. | Após `201`, a interface abre o editor da nova vitrine ou mostra uma confirmação persistente com a ação "Adicionar itens", com foco nessa ação. | Aberto |
| `UX-65-011` | `#65` | `P2` | `problema_confirmado` | `navegacao` | "Modelo Sob Medida" chama `showSection('pedidos')` sem trocar o hash (`portal.js:341-353`). A barra lateral marca Customizações, mas a URL continua `#wizard`. Recarregar a página volta ao assistente e perde o pedido preenchido. Resultados `65.sobMedida` e `65.sobMedidaRecarregar`. | O fluxo sob medida troca para `#pedidos`, e o pré-preenchimento sobrevive a recarregar ou é recriado a partir de parâmetros. | Aberto |
| `UX-65-012` | `#65` | `P2` | `risco_codigo` | `feedback` | Se a criação responder `404`, `501` ou `INVALID_TEMPLATE`, o cliente tenta de novo com `pizzeria-v1` e avisa "criada com sucesso (modelo padrão)!" (`portal.js:1676-1692`). Quem escolheu Agendamento ou Orçamento pode receber outro modelo sem perceber. Isso não foi reproduzido contra o Worker real. | A interface não troca o modelo escolhido sem consentimento: mostra o erro e oferece explicitamente "Criar com o modelo padrão". | Aberto |
| `UX-65-013` | `#65` | `P3` | `problema_confirmado` | `formularios` | Erro de digitação no cartão Tecnologia: "Vitrinas para consultorias…" (`index.html:712`). Captura: `wizard-passo1-1280-escuro.png`. | O texto diz "Vitrines para consultorias…". | Aberto |
| `UX-65-014` | `#65` | `P3` | `critica_ux` | `formularios` | Há jargão técnico no rótulo "Endereço Público (slug na url)" (`index.html:784`) e nas mensagens "Este endereço (slug)…" (`portal.js:1673`) e "Identificador (slug) inválido…" (`src/portal-validation.mjs:302-306`). | Rótulo e mensagens usam só "endereço da vitrine", por exemplo "Endereço da vitrine" e "Este endereço já está em uso por outra vitrine.". | Aberto |
| `UX-65-015` | `#65` | `P2` | `problema_confirmado` | `feedback` | `showFeedback` (`portal.js:901-918`) não cancela o temporizador anterior. Uma mensagem nova some antes dos 6 s: medido em ~2 s no resultado `67.temporizadorFeedback`. Erros também somem sozinhos, e cada aviso força `scrollTo({ behavior: 'smooth' })`, ignorando `prefers-reduced-motion` e tirando a pessoa do campo em edição. Afeta `#66` e `#67`. | Cada nova mensagem reinicia o temporizador. Erros ficam até serem dispensados ou corrigidos. A rolagem respeita movimento reduzido e não ocorre quando o erro tem lugar no próprio campo. | Aberto |
| `UX-65-016` | `#65` | `P3` | `critica_ux` | `navegacao` | A área escolhida no passo 1 não muda os modelos do passo 2: os mesmos 4 modelos aparecem para qualquer área. A escolha parece não ter efeito visível na jornada. | O passo 2 destaca ou ordena os modelos recomendados para a área escolhida, ou o passo 1 explica onde a área é usada. | Aberto |
| `UX-65-017` | `#65` | `P3` | `critica_ux` | `feedback` | O emoji em "Criar Vitrine 🎉" (`index.html:793`) é lido por leitores de tela ("fogos de artifício"). | O emoji fica em `aria-hidden="true"` ou sai do rótulo. | Aberto |

**Resumo**: 17 achados — `P0` 0, `P1` 2 (`UX-65-001`, `UX-65-009`), `P2` 11, `P3` 4.

## 5. Bloqueios e checklist de aceite

| Código | Bloqueio | Checklist de aceite |
| --- | --- | --- |
| `BLK-UX-61-AUTH` | Sem sessão Google real na auditoria (a produção é `bbafd95`, o mesmo build; clientes automatizados recebem o desafio de bots da Cloudflare, então o teste exige navegador real) | [ ] Entrar num navegador real · [ ] Criar uma vitrine de teste real (`auditoria-65-<data>`) do passo 1 ao 3 · [ ] Repetir com endereço já usado e confirmar `409 SLUG_TAKEN` · [ ] Excluir a vitrine de teste |
| `BLK-UX-61-AUTH` | Login Google real indisponível localmente | [ ] Sessão real criada · [ ] `POST /api/sites` real com perfil completo responde `201` e com perfil incompleto responde `409 PROFILE_INCOMPLETE` levando ao formulário de perfil |

## 6. Recomendações

1. Travar o envio do assistente (botão desabilitado, `aria-busy`, texto "Criando…") e
   tratar `409` depois de um `201` da mesma sessão como sucesso (`UX-65-001`).
2. Levar os erros para dentro dos campos: endereço em uso, reservado, inválido e nome
   vazio, com foco e rolagem até o campo (`UX-65-002`, `UX-65-007`).
3. Usar uma fonte única para os endereços reservados no cliente e no servidor (`UX-65-003`).
4. Guardar o estado do assistente enquanto a sessão durar, preservar o endereço editado à
   mão e mover o foco para o título de cada passo (`UX-65-004`, `UX-65-005`, `UX-65-006`).
5. Ao criar, abrir o editor da nova vitrine com a orientação "Adicione os primeiros itens
   da vitrine" (`UX-65-010`).
6. Revisar o contraste do indicador de passos, a altura dos campos em telas estreitas e o
   temporizador do aviso global (`UX-65-008`, `UX-65-009`, `UX-65-015`).
7. Trocar "slug" por "endereço da vitrine" em rótulos e mensagens (`UX-65-014`).
