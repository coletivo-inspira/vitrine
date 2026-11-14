# Jornada `#66` — Edição manual dos itens da vitrine (`#editor`, `#leiloes`)

Seção da Auditoria UX para a issue `#66` (título no GitHub: "Auditar edição manual do
catálogo"), seguindo as convenções da [matriz central](../matriz-central.md) (seção 4) e
o [contrato da auditoria](../../../specs/010-ux-audit-meta-readiness/contracts/ux-audit-matrix-contract.md).
Neste documento, o conteúdo editado é chamado de **itens da vitrine** e **categorias da
vitrine**.

- **Data da coleta**: 2026-11-14, 17:25–17:50 UTC.
- **Commit auditado**: `main` em `bbafd95c13ab5142aa642287f788632cdd0c55e3`; build com hash `0911af34bd42`.
- **Superfície**:
  - `/portal/#editor`: abas Itens, Categorias, Ajustes, Pedido e Prévia (móvel); itens em cartões; modalidades venda, lance, doação, troca e cotas de apoio; troca do tipo de vitrine.
  - `/portal/#leiloes`: acompanhamento de lances.
  - A importação por planilha fica com a `#69`. Rascunho, publicação e versões ficam com a `#67`.
- **Evidências**: pasta `media/auditoria-ux/66-edicao/` do Context do projeto (imagens
  não versionadas).

## 1. Ambiente e simulação

- Preview local `PORT=4184 npm run preview` e painel com `/api/*` simulado pelo Chrome
  DevTools Protocol: `internal/auditoria-ux/mock-65-67.mjs` (cenários `66` e `extra66`).
- Rascunho de teste: cópia de `/data/vitrines/loja1/menu.json` na vitrine
  `vitrine-teste` (3 categorias, 6 itens ativos).
- O mock reproduz estas regras de `workers/api.mjs`:
  - revisão otimista em `PUT /draft` (`409` com revisão divergente);
  - `PATCH /quick-toggle`;
  - papéis: `owner`, `admin` e `editor` salvam rascunho; só `owner` e `admin` publicam (`workers/api.mjs:68-69, 5276`);
  - `GET /auctions` com um leilão aberto e um encerrado.
- Upload real de foto (Supabase Storage) e a estrutura visual ("Identidade, menus e
  páginas") dependem do Worker e do Supabase: ficam como `nao_verificado`.

## 2. Cenários executados

### 2.1 Matriz da jornada

| Jornada | 360 | 390 | 768 | 1024 | 1440 | Horizontal | Zoom 200% | Claro | Escuro | Teclado | Movimento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#66` Edição manual | executado | executado | executado | executado | executado | executado | executado | executado | executado | executado | parcial |

- Larguras: aba Itens com cartão expandido medida em todas as larguras, sem rolagem
  horizontal (`editor-item-expandido-<largura>-claro.png`). Abas Categorias, Ajustes,
  Pedido e Prévia em 1280 e 375, claro e escuro (`editor-aba-*-{1280,375}-{claro,escuro}.png`).
- Teclado: ordem de tabulação dentro do cartão expandido (Tipo, Preço, Seção, Descrição,
  Foto, Duplicar, Excluir, Visível, Concluir) e menu da barra flutuante com setas e `Esc`
  (`editor.js:557-592`). Foco após reordenar, excluir e adicionar: ver `UX-66-004`.
- Movimento: `prefers-reduced-motion` zera animações (`portal.css:2007-2011`). A rolagem
  suave forçada pelos avisos está registrada em `UX-65-015`. A coluna fica `parcial`
  porque a transparência reduzida só foi conferida na barra de ações (fundo sólido).
- Papéis: `owner`, `editor` e `viewer` (`editor-papel-{editor,viewer}-1280-claro.png`).

### 2.2 Estados e falhas cobertos

| Cenário | Resultado observado | Evidência |
| --- | --- | --- |
| Incluir item pelas 5 modalidades da barra flutuante | Cartão novo já expandido com os campos da modalidade | `editor-modo-{offer,donation,trade,quota}-1280-claro.png`, `editor-modo-quota-375-claro.png` |
| Editar nome e preço | Prévia ao vivo atualiza; autosave em 1,2 s (`PUT` com revisão) | resultado `66.autosaveAoDigitar` |
| Trocar a modalidade de venda para doação e voltar | Preço `R$ 48,00` apagado | `UX-66-003` |
| Cotas com termo proibido ("Rifa do forno") | Aviso imediato com `role="status"` | `editor-cota-termo-proibido-1280-claro.png` |
| Reordenar item e categoria (Subir/Descer) | Ordem muda; foco vai ao `body` | `UX-66-004` |
| Excluir item sem nome / com nome | Sem nome: exclui sem confirmar. Com nome: `confirm()` nativo. Nenhum "Desfazer" | `UX-66-005` |
| Excluir categoria com itens (cancelado) | `confirm()` nativo com contagem de itens; nada excluído | resultado `66.categoriaExcluirCancelado` |
| Dois itens novos sem nome e sem preço, ao salvar | Só a última mensagem aparece ("O preço do item "Item 4"…"); nenhum campo marcado | `editor-obrigatorios-1280-claro.png` |
| Preço apagado (vazio) | Autosave grava o rascunho sem aviso; o erro só aparece ao clicar em Salvar | `editor-preco-vazio-salvar-1280-claro.png` |
| Disponibilidade pelo interruptor "Visível na vitrine" | Autosave grava; resumo do cartão passa a "Oculto" | resultado `66.disponibilidade` |
| Foto com o componente ligado | "Enviar foto" + "Sem foto"; aceita `image/*` e converte para WebP | `editor-item-foto-1280-claro.png` |
| Papel `editor` | Edita e salva; "Publicar vitrine" visível e falha com "Vitrine não encontrada." | `editor-papel-editor-1280-claro.png` |
| Papel `viewer` | Editor inteiro habilitado; autosave mostra "⚠️ Vitrine não encontrada." | `editor-papel-viewer-1280-claro.png` |
| `#leiloes` com lances | Cartões com lance atual, vencedor e "Chamar no WhatsApp"; diálogo "Desconsiderar" com foco no motivo e erro inline | `leiloes-{1280,375}-{claro,escuro}.png`, `leiloes-desconsiderar-375-escuro.png` |

## 3. Inventário de controles

| Controle / Seletor | Tipo | Estados Verificados | Larguras / Modos | Finalidade | Esperado | Observado | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `.tab-btn` (Itens, Categorias, Ajustes, Pedido, Prévia) | Aba | default, active, focus-visible | todas | Alternar seções do editor | Padrão de abas com setas | 63×48 px em 360; 58 px de altura a partir de 768; só `click` (sem setas); "Prévia" só no móvel | `role="tab"` e `aria-selected`; painéis sem `role="tabpanel"`/`aria-labelledby` |
| `#editor-catalog-type` + `#catalog-type-confirm-dialog` | Seletor + diálogo | default, open, cancel | 1280 | Trocar o tipo de vitrine | Confirmar antes de mudar | `dialog` nativo com Cancelar/Trocar tipo; `Esc` reverte (`editor.js:741-794`) | Título dinâmico "Trocar para …?" |
| `#editor-category-select` | Seletor | default | todas | Escolher a categoria cujos itens aparecem | Lista as categorias | Funciona; rótulo "Categoria:" | — |
| `#add-item-button` + `#add-item-menu` | Botão + menu | default, expanded | 1280, 375 | Adicionar item (foto, preço, só texto) | Menu acessível | Abre e fecha; sem navegação por setas; tipos diferentes dos da barra flutuante | `aria-expanded` (`UX-66-007`) |
| `#toolbar-add-item` + `#toolbar-add-item-menu` | Botão de ícone + menu | default, expanded, focus | todas | Adicionar item por modalidade (venda, lance, doação, troca, cotas) | Menu com setas e `Esc` | Setas e `Esc` funcionam; foco vai à 1ª opção; 34×34 px em ≤520 px | Dica visual no hover/foco (`UX-66-006`) |
| `#toolbar-add-section` "Adicionar seção" | Botão de ícone | default | todas | Cria uma categoria nova | Nome coerente com o resultado | Cria categoria, não seção | `UX-66-007` |
| `#toolbar-add-image` "Adicionar imagem" | Botão de ícone | default | todas | Cria item com foto | — | Cria item "Produto com foto" | — |
| Cartão compacto `.google-forms-card.is-preview` + "Editar" | Cartão + botão | default, hover | todas | Abrir o item para edição | Expandir e focar o nome | Expande; foco não vai ao nome | Resumo "R$ 52,00 · Visível" |
| `.icon-btn` Subir / Descer / Duplicar (cabeçalho) e Duplicar / Excluir (rodapé) | Botão de ícone | default, disabled, hover | todas | Ordenar, duplicar e excluir item | Rótulos com o nome do item; ≥44 px | 30×30 px em ≤520 px e 40×40 px acima; "Duplicar item" repetido; rótulos sem o nome do item | `aria-label` genérico (`UX-66-006`, `UX-66-009`) |
| `#item-name-<id>` "Nome do item" | Campo | default, empty, filled | todas | Nome exibido | Obrigatório com erro no campo | Sem marcação de obrigatório; erro só ao salvar, no aviso global | `UX-66-002` |
| `#item-mode-<id>` "Tipo do item" | Seletor | default, change | todas | Modalidade (venda, lance, doação, troca, cotas) | Trocar sem perder dados | Apaga preço, encerramento e incremento ao trocar | `UX-66-003` |
| `#item-price-<id>` "Preço (BRL)" / "Lance mínimo (opcional)" | Campo com máscara | default, empty, filled | todas | Valor em reais | Máscara e validação | Máscara `R$ 0,00`; vazio aceito pelo autosave | `UX-66-002` |
| `#item-auction-ends-<id>`, `#item-bid-increment-<id>` | Data/hora, campo | default | 1280 | Encerramento e incremento do lance | Ajuda clara | Ajuda ligada por `aria-describedby` (`editor.js:1870-1874`) | Texto de ajuda |
| `#item-conditions-<id>`, `#item-trade-for-<id>` | Campo | default | 1280 | Condições da doação / o que aceita em troca | Opcional | `maxlength=240` | — |
| Campos de cotas (`#item-quota-price-`, `-total-`, `-filled-`, `-reward-`, `-conditions-`) | Campos | default, limites | 1280, 375 | Meta dividida em cotas iguais | Limites 2–1000 e confirmadas ≤ total | Limites corrigidos no `change`; aviso legal visível; termo proibido detectado ao digitar | `role="status"` no aviso de termo |
| `#item-section-<id>` "Seção (opcional)" | Campo | default | todas | Agrupar itens dentro da categoria | Vocabulário distinto de categoria | Convive com "Adicionar seção", que cria categoria | `UX-66-007` |
| `#item-desc-<id>`, `#item-min-<id>`, `#item-dur-<id>` | Área de texto, números | default | 1280 | Descrição, quantidade mínima, duração | — | Limites aplicados em silêncio (1–99, 5–480) | — |
| Foto: "Enviar foto" / "Trocar" / "Remover" + `input[type=file]` | Botões + arquivo | default, loading, error | 1280 | Foto WebP até 200 KB | Progresso e erro claros | Status em texto ("Convertendo…", "Enviando…"); upload real não verificado | `UX-66-011` |
| Interruptor "Visível na vitrine" (`role="switch"`) | Interruptor | on, off | todas | Disponibilidade do item | Estado anunciado | `aria-checked` sincronizado; autosave | Resumo "Visível"/"Oculto" |
| "Concluir" | Botão | default | todas | Recolher o cartão | Recolher e devolver o foco | Recolhe; foco vai ao `body` | — |
| `#add-category-button` "+ Categoria" | Botão | default | 1280 | Criar categoria | Focar o nome novo | Cria categoria vazia | — |
| `#cat-input-<id>` "Nome da categoria N" | Campo | default, empty | 1280 | Nome da categoria | Obrigatório | Erro só ao salvar | `UX-66-002` |
| Categoria: "Ocultar no rascunho", "Ver itens (N)", "Subir", "Descer", "Excluir" | Botões | default, disabled | 1280, 375 | Disponibilidade, navegar, ordenar, excluir | Rótulos com nome | Todos com 44 px de altura; Subir/Descer/Excluir com `aria-label` incluindo o nome; excluir usa `confirm()` | `UX-66-012` |
| Ajustes: `#editor-business-name`, `#editor-whatsapp`, `#editor-mila-relay`, Página por cidade, componentes `#comp-*` | Campos, interruptor, caixas | default, error | 1280, 375 | Dados e componentes da vitrine | Erros no campo | WhatsApp com máscara e erro inline; cidade com erro `role="alert"` | Inline |
| `#showcase-structure` "Identidade, menus e páginas" | `details` | fechado | 1280 | Estrutura visual | — | Depende de `GET /structure` real; não verificado | `nao_verificado` |
| Pedido: campos do pedido, horários, textos, `#editor-whatsapp-template`, "Simular mensagem" | Caixas, campos, botão | default | 1280, 375 | Mensagem e campos do pedido | — | Inventariado visualmente; link "Abrir no meu WhatsApp" só inspecionado pelo `href` | — |
| `#auctions-site-select`, `#auctions-refresh` | Seletor, botão | default | 1280, 375 | Escolher vitrine e atualizar lances | — | Funciona; 44 px | `#auctions-status` com `role="status"` |
| "Chamar no WhatsApp" (vencedor) | Link | default | 1280, 375 | Contatar quem venceu | `href` `wa.me` codificado | `https://wa.me/5511988887777?text=Ol%C3%A1%2C%20Ana…` | Abre nova aba (não acionado) |
| "Ver todos os lances (N)", "Desconsiderar" + diálogo | `details`, botão, diálogo | default, open, error | 1280, 375 | Revisar e anular lance | Motivo obrigatório | Foco no motivo; erro inline com `role="alert"` | Inline |

## 4. Achados

| ID | Issue | Severidade | Natureza | Eixo | Descrição e Evidência | Critério de Aceite | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UX-66-001` | `#66` | `P1` | `problema_confirmado` | `feedback` | O editor não adapta os controles ao papel. `loadEditor` só esconde painéis avançados (`editor.js:340-362`). Para `viewer`, todos os campos ficam habilitados, e a primeira edição dispara um autosave que falha com "⚠️ Vitrine não encontrada.". Para `editor`, "Publicar vitrine" aparece e falha com a mesma mensagem genérica. O servidor só aceita rascunho de `owner/admin/editor` e publicação de `owner/admin` (`workers/api.mjs:68-69, 5276`), regra reproduzida no mock. Capturas: `editor-papel-viewer-1280-claro.png`, `editor-papel-editor-1280-claro.png`. | `viewer` vê o editor em modo leitura (campos desabilitados, sem Salvar/Publicar) com o aviso "Você pode ver esta vitrine, mas não editar". `editor` não vê "Publicar vitrine", ou vê um botão desabilitado com a explicação "Só proprietário ou administrador publica". | Aberto |
| `UX-66-002` | `#66` | `P1` | `problema_confirmado` | `formularios` | A validação de nome, preço, cotas e categoria (`editor.js:2821-2935`) só roda em Salvar/Publicar. Cada erro chama `showFeedback`, que sobrescreve o anterior, então só a última mensagem aparece. Nenhum campo recebe `aria-invalid`, marcação visual ou foco, e o aviso some em 6 s. O autosave grava rascunho com preço vazio sem avisar. Capturas: `editor-obrigatorios-1280-claro.png`, `editor-preco-vazio-salvar-1280-claro.png`; resultados `66.obrigatorios` e `66.precoVazioAutosave`. | Cada campo inválido mostra erro inline com `aria-invalid` ao sair do campo e ao salvar. Ao salvar com erros, aparece um resumo com todos os erros (links para os campos) e o foco vai ao primeiro. O indicador de autosave diz "Há campos a corrigir" quando o rascunho está inválido. | Aberto |
| `UX-66-003` | `#66` | `P2` | `problema_confirmado` | `formularios` | Trocar "Tipo do item" apaga dados sem aviso. Para doação ou troca, `priceCents` vai a 0 (de `R$ 48,00` para vazio ao voltar a venda). Sair de lance apaga encerramento e incremento (`editor.js:1799-1817`). Resultado `66.trocaModoPerdePreco`. | Os valores de cada modalidade são preservados no cartão até salvar e restaurados ao voltar, ou a troca pede confirmação dizendo o que será apagado. | Aberto |
| `UX-66-004` | `#66` | `P2` | `problema_confirmado` | `navegacao` | `renderItems()` e `renderCategories()` recriam a lista inteira (`editor.js:1509-1511, 1402-1404`). Depois de Subir/Descer item (`editor.js:2592-2603`), Descer categoria (`editor.js:2414-2425`), Excluir, Concluir ou adicionar pelo menu, o foco vai ao `body`. Quem usa teclado ou leitor de tela perde a posição. Resultados `66.reordenar`, `66.categoriaFocoAposDescer`, `66.modos`, `66.excluir`. | Após reordenar, o foco fica no mesmo botão do item movido. Após excluir, vai ao item seguinte (ou ao botão de adicionar). Após adicionar, vai ao campo "Nome do item" do novo cartão. A mudança é anunciada (por exemplo, "Item movido para a posição 1 de 3"). | Aberto |
| `UX-66-005` | `#66` | `P2` | `problema_confirmado` | `feedback` | Item sem nome é excluído sem confirmação. Item com nome e categoria com itens usam `confirm()` nativo. Não existe "Desfazer", e com o autosave a exclusão chega ao rascunho em 1,2 s (`editor.js:2195-2201, 1482-1493`). Resultado `66.excluir`. | A exclusão mostra um aviso com "Desfazer" por alguns segundos (ou um diálogo do painel com o nome do item), e a restauração devolve item e posição. | Aberto |
| `UX-66-006` | `#66` | `P2` | `problema_confirmado` | `formularios` | Alvos de toque abaixo de 44 px em até 520 px: botões de ícone do cartão com 30×30 px (`portal.css:4211-4214`), barra flutuante com 34×34 px (`portal.css:4159`) e campos com 30 px de altura (`portal.css:4231-4232`). Acima disso, os botões de ícone têm 40×40 px (`portal.css:3935-3937`). Resultado `66.grade`. | Botões de ícone, botões da barra flutuante e campos do cartão medem pelo menos 44×44 px em todas as larguras. | Aberto |
| `UX-66-007` | `#66` | `P2` | `critica_ux` | `navegacao` | Há dois caminhos para adicionar item, com tipos diferentes: "+ Adicionar item" oferece foto, preço e só texto (`index.html:953-969`), e a barra flutuante oferece venda, lance, doação, troca e cotas (`index.html:1027-1080`). Além disso, "Adicionar seção" cria uma categoria, enquanto o cartão tem o campo "Seção (opcional)" com outro significado (`editor.js:1959-1977`). | Um único ponto "Adicionar item" com a modalidade como primeira escolha. A barra usa "Adicionar categoria" quando cria categoria, e o campo do cartão ganha um nome que não colida (por exemplo, "Subgrupo"). | Aberto |
| `UX-66-008` | `#66` | `P2` | `problema_confirmado` | `navegacao` | A barra inferior móvel (`index.html:1404-1432`) tem Início, Vitrines, Insights, Perfil e Pedidos, mas não tem Leilões. Em telas estreitas, `#leiloes` só é alcançável pelo botão "Leilões" no cartão da vitrine. Captura: `leiloes-375-escuro.png`. | `#leiloes` é alcançável pela navegação principal no móvel (item na barra ou entrada em "Vitrines"), com o estado ativo correspondente. | Aberto |
| `UX-66-009` | `#66` | `P3` | `critica_ux` | `navegacao` | Os botões de ícone dos cartões têm `aria-label` genérico ("Subir item", "Excluir item"), sem o nome do item. "Duplicar item" aparece duas vezes no mesmo cartão (cabeçalho e rodapé) (`editor.js:1706-1742, 2176-2186`). | Os rótulos incluem o nome do item ("Subir Margherita Verace"). Há uma única ação de duplicar por cartão. | Aberto |
| `UX-66-010` | `#66` | `P3` | `critica_ux` | `formularios` | Textos inconsistentes: título "Novo Item" no cartão expandido e "Item sem nome" no compacto (`editor.js:1610, 1690`). A mensagem de vazio cita "+ Adicionar Item" e o botão diz "+ Adicionar item" (`editor.js:1516, 1529`). As mensagens de erro chamam itens sem nome de "Item 4", sem relação com o que aparece na tela. | Um único rótulo para item sem nome. Mensagens citam os botões exatamente como aparecem e identificam o item pela posição visível ("3º item de Pizzas"). | Aberto |
| `UX-66-011` | `#66` | `P3` | `nao_verificado` | `feedback` | O upload de foto (`editor.js:2095-2120`, `uploadImageToSupabaseStorage` em `editor.js:2336`) depende do Supabase Storage real. Não foi possível verificar progresso, falha de rede, cancelamento nem limite de 200 KB contra o serviço. | Com sessão real: enviar uma foto grande, perder a rede durante o envio e trocar a foto. O status descreve cada etapa, há como cancelar e a falha não apaga a foto anterior. | Bloqueado HITL |
| `UX-66-012` | `#66` | `P3` | `critica_ux` | `feedback` | Há dois mecanismos de disponibilidade com comportamentos diferentes. O interruptor "Visível na vitrine" do item entra no autosave. O botão "Ocultar no rascunho" da categoria faz `PATCH /quick-toggle` imediato (`editor.js:3093-3128`) e não existe no cartão do item. O texto "no rascunho" não deixa claro que a vitrine publicada só muda após publicar. | Item e categoria usam o mesmo controle (interruptor "Visível") e o mesmo texto de efeito: "Some da vitrine na próxima publicação". | Aberto |

**Resumo**: 12 achados — `P0` 0, `P1` 2 (`UX-66-001`, `UX-66-002`), `P2` 6, `P3` 4.
O temporizador do aviso global que esconde mensagens está registrado em `UX-65-015`.

Pontos positivos verificados:

- aviso legal e detecção imediata de termos proibidos nas cotas;
- diálogo de troca de tipo com `Esc` revertendo a escolha;
- menu da barra flutuante com setas e `Esc`;
- diálogo "Desconsiderar" em Leilões com foco no motivo e erro inline;
- links `wa.me` com `encodeURIComponent`.

## 5. Bloqueios e checklist de aceite

| Código | Bloqueio | Checklist de aceite |
| --- | --- | --- |
| `BLK-UX-61-AUTH` / `BLK-UX-61-PROD` | Sem sessão real nem Worker publicado: upload de foto, estrutura visual (`GET/PUT /structure`) e validação real do rascunho (`validateDraftContent`) não executáveis | [ ] Sessão real com papel `owner` · [ ] Enviar foto JPEG de 3 MB e conferir WebP ≤ 200 KB no armazenamento · [ ] Abrir "Identidade, menus e páginas" e salvar uma cor · [ ] Salvar item de venda sem preço e conferir a mensagem do Worker no indicador · [ ] Repetir com papéis `editor` e `viewer` (convite real) |

## 6. Recomendações

1. Tornar o editor ciente do papel: modo leitura para `viewer` e publicação oculta ou
   explicada para `editor` (`UX-66-001`).
2. Validar no campo e no momento certo, com resumo de erros ao salvar e indicador de
   autosave que distinga "salvo" de "salvo com campos a corrigir" (`UX-66-002`).
3. Preservar os dados entre modalidades e oferecer "Desfazer" para exclusões (`UX-66-003`,
   `UX-66-005`).
4. Gerenciar o foco depois de cada nova renderização da lista: o elemento movido ou criado
   continua focado (`UX-66-004`).
5. Unificar a adição de itens e o vocabulário categoria/seção. Garantir alvos de 44 px e
   rótulos com o nome do item (`UX-66-006`, `UX-66-007`, `UX-66-009`).
6. Incluir Leilões na navegação móvel (`UX-66-008`).

### Pista para outra jornada (não classificada aqui)

- `#69`: o nome do arquivo exportado pela planilha usa o termo antigo vetado pelos testes de
  vocabulário (`editor.js:979`). Sugestão de nome: `itens-da-vitrine-<endereço>.csv`.
