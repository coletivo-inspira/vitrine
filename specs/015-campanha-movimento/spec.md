# Feature Specification: Campanha Vitrine Inspira — profundidade e movimento

**Feature Branch**: `cursor/campanha-profundidade-movimento-a72e`

**Created**: 2026-11-12

**Status**: Implementada localmente (sem publicação no Instagram e sem deploy remoto)

**Input**: Pedido do usuário "Vitrine Inspira — campanha com profundidade e movimento": apresentar a Vitrine a pequenos negócios e profissionais, mostrar quatro possibilidades de uso (cardápio, lanches, serviços e portfólio) e levar ao site `vitrine.inspira.dev.br`, com carrossel, vídeos, GIFs, modelos animados para o site e textos de apoio. Pesquisa e roteiro: [`docs/marketing/campanha-profundidade-movimento.md`](../../docs/marketing/campanha-profundidade-movimento.md).

Esta especificação é separada das especificações do portal (008–014): trata de comunicação e das demonstrações da página Possibilidades, sem alterar painel, vitrines publicadas ou dados.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dono de pequeno negócio entende a Vitrine pelo carrossel (Priority: P1)

Uma pessoa que tem um restaurante, uma lanchonete, um serviço ou um trabalho autoral vê o carrossel no feed, reconhece o próprio caso em uma das quatro lâminas de demonstração e encontra o endereço para criar a vitrine.

**Why this priority**: é a peça central da campanha e funciona sozinha, sem vídeo nem site.

**Independent Test**: abrir as sete lâminas em tela de celular e conferir sequência, leitura, marca e endereço.

**Acceptance Scenarios**:

1. **Given** a lâmina 1, **When** vista em celular, **Then** mostra a logo original com “coletivo inspira”, “Mostre o que você faz.” e “Facilite o próximo passo.” sobre uma composição em relevo, sem relevo na logo.
2. **Given** a lâmina 2, **When** vista, **Then** mostra o caminho conhecer → escolher → entrar em contato.
3. **Given** as lâminas 3 a 6, **When** vistas, **Then** cada uma traz um modelo (Cardápio, Lanches, Serviços, Portfólio), um único benefício no título e uma aproximação legível do detalhe importante.
4. **Given** a lâmina 7, **When** vista, **Then** pergunta “Qual combina com a sua ideia?”, mostra os quatro modelos, a marca, a chamada única e `vitrine.inspira.dev.br`.

---

### User Story 2 - Público do feed e dos Stories assiste a uma ação em cada cena (Priority: P1)

Quem rola o feed ou os Stories vê, logo na abertura, um toque que traz o total para a frente; depois, quatro demonstrações de 4 segundos e um encerramento com uma chamada.

**Why this priority**: o vídeo alcança quem não desliza o carrossel; a abertura define a retenção.

**Independent Test**: assistir aos dois vídeos integralmente, com e sem som, e conferir dimensões, duração, codecs e áudio.

**Acceptance Scenarios**:

1. **Given** o vídeo para feed, **When** reproduzido, **Then** tem 1080 × 1080, 20 s, 30 fps e segue abertura de 2 s, quatro demonstrações de 4 s e encerramento de 2 s.
2. **Given** o Story, **When** reproduzido, **Then** tem 1080 × 1920, 20 s, composição vertical própria e espaço livre para a interface do Instagram e para o sticker de link.
3. **Given** a versão com efeitos, **When** reproduzida, **Then** tem apenas cliques suaves, deslocamentos e uma assinatura curta, sem música nem locução; a versão sem áudio não tem faixa de som.
4. **Given** cada demonstração, **When** termina a ação, **Then** o resultado permanece visível até a troca de cena, feita em até 300 ms.

---

### User Story 3 - Visitante do site vê os modelos funcionando na página Possibilidades (Priority: P1)

Quem visita `/possibilidades/` vê quatro demonstrações em loop enquanto estão na tela, pode pausar e retomar cada uma, e recebe imagem estática quando prefere menos movimento ou navega sem JavaScript.

**Why this priority**: é o destino do link da campanha e precisa confirmar o que o post prometeu.

**Independent Test**: abrir a página em desktop e celular, nos temas claro e escuro, e exercitar pausa, retomada, rolagem, aba oculta, movimento reduzido e ausência de JavaScript.

**Acceptance Scenarios**:

1. **Given** JavaScript ativo e movimento permitido, **When** uma demonstração entra na tela, **Then** o PNG é substituído pelo SVG local inline e a animação se repete em ciclos de 4 s.
2. **Given** uma demonstração em reprodução, **When** a pessoa toca em Pausar, **Then** o quadro congela, o botão passa a Retomar e a escolha se mantém ao sair e voltar à tela durante a visita.
3. **Given** uma demonstração fora da tela ou a aba oculta, **When** isso ocorre, **Then** a animação fica suspensa.
4. **Given** `prefers-reduced-motion: reduce` ou JavaScript desativado, **When** a página abre, **Then** só aparecem os PNGs estáticos e o controle fica oculto.
5. **Given** os filtros de área existentes, **When** usados, **Then** continuam funcionando e a composição do restante da página não muda.

---

### User Story 4 - Equipe publica a campanha com o acervo organizado (Priority: P2)

A equipe recebe uma pasta versionada com arquivos editáveis, exportações, prévias, legendas, textos alternativos, índice e guia de postagem, além de um ZIP final.

**Why this priority**: viabiliza a publicação e a revisão pós-publicação, mas depende das peças.

**Independent Test**: abrir o ZIP em outra máquina, localizar cada peça pelo índice e seguir o guia sem consultar o código.

**Acceptance Scenarios**:

1. **Given** o índice do acervo, **When** consultado, **Then** lista peça, finalidade, formato, duração e arquivo de cada entrega.
2. **Given** o guia de postagem, **When** seguido, **Then** orienta ordem, capas, legendas, sticker de link e a revisão de retenção e acessos ao link.

### Edge Cases

- Totais e quantidades: todo valor exibido é derivado do preço do item; mudar um preço em um único lugar atualiza SVG, PNG, GIF, MP4 e site.
- Reinício do ciclo: o último quadro de cada modelo é idêntico ao primeiro; nenhuma transição é instantânea.
- Quatro SVGs inline na mesma página: identificadores, estilos e animações não colidem entre si nem com o site.
- Estilos globais do site (por exemplo, contorno em `svg`) não alteram o desenho inline.
- Terminologia do site: páginas de divulgação não mostram “cardápio” nem “catálogo” (CONTEXT.md); o modelo aparece como “Pratos” no site e como “Cardápio” apenas nas peças do Instagram, conforme o roteiro pedido.
- Fotos de apoio indisponíveis no site: o SVG continua legível (fundo e interface vetoriais) e a política `img-src 'self'` é preservada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A campanha DEVE usar floresta `#133824`, lima `#BAFF29`, menta `#A3E5C2`, branco quebrado `#F7F7F4` e mostarda `#E5A93C` apenas pontual; Syne nos títulos e DM Sans nos textos.
- **FR-002**: A logo DEVE ser o arquivo vetorial original com “coletivo inspira”, sem deformação, sombra ou relevo; o relevo fica nas superfícies ao redor.
- **FR-003**: As composições DEVEM ter janelas sobrepostas, perspectiva leve, sombras macias, iluminação de borda e elementos que avançam durante a seleção.
- **FR-004**: O carrossel DEVE ter 7 PNGs 1080 × 1080 na sequência e com os textos do roteiro.
- **FR-005**: Os vídeos DEVEM ter 20 s a 30 fps em H.264 `yuv420p`, versões com efeitos (AAC) e sem áudio, para feed (1080 × 1080) e Story (1080 × 1920).
- **FR-006**: A capa do carrossel DEVE ser entregue como capa de cada vídeo, adaptada ao formato.
- **FR-007**: Cada modelo DEVE ter ciclo de 4 s, transições de 180–300 ms, tempo para reconhecer o resultado e retorno suave; entregue como GIF 600 × 450, SVG animado autocontido (sem scripts nem recursos externos) e PNG 1200 × 900.
- **FR-008**: Cardápio: selecionar prato, destacar, atualizar total e apresentar a continuação pelo WhatsApp. Lanches: selecionar combo, alterar quantidade, recalcular e destacar o resumo. Serviços: escolher serviço e formar o resumo do orçamento. Portfólio: alternar projeto, currículo e diploma, aproximando o conteúdo.
- **FR-009**: Toda cena DEVE se identificar como demonstração ilustrativa; preços e totais DEVEM corresponder aos itens.
- **FR-010**: A página Possibilidades DEVE exibir as quatro demonstrações (1200 × 900) com SVG local inline, pausa real, suspensão fora da tela e com aba oculta, controle Pausar/Retomar e PNG estático sem JavaScript ou com movimento reduzido, limitando a mudança visual às demonstrações e seus controles.
- **FR-011**: A pasta da campanha DEVE ficar em `carrossel-instagram/` com arquivos editáveis, exportações, prévias, ZIP, legenda principal, legenda curta, textos alternativos, índice do acervo e guia de postagem.
- **FR-012**: As peças DEVEM ser geradas a partir de uma fonte única de conteúdo, cores e tempos, com fontes e imagens carregadas antes da captura e sem barras de rolagem.

### Key Entities

- **Modelo demonstrativo**: negócio fictício, itens com preço em centavos, seleção, momentos do ciclo, pose estática e texto alternativo.
- **Peça**: arquivo entregue (lâmina, vídeo, GIF, SVG, PNG) com finalidade, formato e duração.
- **Sinal sonoro**: instante e tipo de efeito derivados das animações.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das peças com as dimensões, durações e formatos da tabela de entregas.
- **SC-002**: Três ciclos consecutivos de cada modelo produzem quadros idênticos, e o quadro final do ciclo é igual ao inicial.
- **SC-003**: Em 375 px de largura, título, benefício e valor em destaque de cada lâmina permanecem legíveis, sem cortes.
- **SC-004**: Na página Possibilidades, pausa, retomada, saída da tela, aba oculta, movimento reduzido e ausência de JavaScript se comportam como descrito em 100% das verificações, sem erros de script ou de política de segurança.
- **SC-005**: Após a publicação, a equipe consegue comparar retenção dos primeiros segundos e acessos ao link usando o guia.

## Assumptions

- “Demonstrações existentes” da página Possibilidades e geradores anteriores não estão neste repositório; as quatro demonstrações foram criadas com os nomes do roteiro (Pratos/Cardápio, Lanches, Serviços, Portfólio) e 1200 × 900.
- A pasta `carrossel-instagram/` e materiais anteriores locais não versionados não foram vistos; a nova campanha fica em subpasta própria, sem tocar em outros arquivos.
- Negócios, pessoas, valores e documentos são fictícios e identificados como ilustrativos.
- Criação de banco no Notion, publicação no Instagram e deploy remoto estão fora do escopo.
