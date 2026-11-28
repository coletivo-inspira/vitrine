# Feature Specification: Delivery para pizzarias (tamanhos, meio a meio, entrega, pagamento, iFood/99Food e motoboy)

**Feature Branch**: `cursor/pizzaria-delivery-0896`

**Created**: 2026-11-28

**Status**: Approved for Implementation (plano aprovado pelo Lino em 2026-11-28, a partir da venda para a Pizzaria Forno de Minas)

**Input**: A pizzaria quer montar o cardápio do jeito dela, receber o pedido padronizado no WhatsApp sem taxa por pedido, apontar para as lojas dela no iFood e no 99Food (só link, sem integração) e mandar a entrega para o motoboy escolhido. O cliente escolhe tamanho, meio a meio e borda, diz como quer receber (retirada, motoboy da casa ou pelo app) e como vai pagar.

## Relação com outras especificações

| Spec | Situação nesta spec |
|---|---|
| **004** (editor do catálogo) | O item ganha tamanhos, meio a meio e um grupo de adicionais (**FR-001** a **FR-004**). Itens sem essas opções não mudam. |
| **005** e **006** (publicação e vitrine pública) | As chaves novas entram nas listas de campos permitidos e na projeção pública; a lista de entregadores nunca é publicada (**FR-012**). |
| **011** (central de canais) | Os links do iFood e do 99Food ficam numa seção própria de Configurações, **Delivery**, junto com taxa, pagamento e entregadores (**FR-005**). |
| **020** (portal em três abas) | A aba **Pedidos** ganha "Despachar entrega" (**FR-011**); Configurações ganha a seção **Delivery**. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Montar a pizza (`021-US1`) (Priority: P1)

Como cliente, quero escolher o tamanho, pedir meio a meio com outro sabor e escolher a borda no próprio cartão da pizza, vendo o preço certo, para não depender de escrever tudo nas observações.

**Independent Test**: na vitrine `/forno-de-minas`, escolher Calabresa, tamanho Gigante, meio a meio com Portuguesa e borda Catupiry; conferir o preço no cartão, no total e na linha da mensagem.

**Acceptance Scenarios**:

1. **Given** um item com tamanhos, **When** a vitrine abre, **Then** o cartão mostra os tamanhos com preço e já marca o tamanho cujo preço é o do item (ou o primeiro).
2. **Given** dois itens que aceitam meio a meio e têm o tamanho escolhido, **When** a pessoa escolhe "meio a meio com" o outro sabor, **Then** o preço da unidade é o maior dos dois naquele tamanho.
3. **Given** um grupo de adicionais com preço por tamanho, **When** a pessoa escolhe a borda, **Then** o preço da borda no tamanho escolhido soma na unidade.
4. **Given** a escolha feita, **When** a mensagem é montada, **Then** a linha do item diz tamanho, meio a meio e adicional, por exemplo `- 1x 04. Calabresa (Gigante, meio a meio com 12. Portuguesa, Borda: Catupiry) — R$ 69,80`.

### User Story 2 - Escolher entrega e pagamento (`021-US2`) (Priority: P1)

Como cliente, quero escolher entre retirada e entrega pelo motoboy da casa, ver a taxa de entrega no total e dizer como vou pagar (Pix, cartão na entrega ou dinheiro com troco), e, se preferir, abrir a loja da pizzaria no iFood ou no 99Food.

**Acceptance Scenarios**:

1. **Given** taxa de entrega configurada, **When** a pessoa escolhe entrega, **Then** a taxa aparece como linha da mensagem e entra no `{total}`; na retirada, não.
2. **Given** pagamento ligado, **When** a pessoa escolhe dinheiro, **Then** pode informar "troco para", e a mensagem traz `Pagamento: Dinheiro (troco para R$ 100,00)`, pela variável `{pagamento}` ou, sem ela no modelo, numa linha no fim.
3. **Given** links do iFood e do 99Food cadastrados, **When** a pessoa está no passo dos dados, **Then** vê "Prefere pedir pelo app?" com os dois links, que abrem a loja em nova aba; a vitrine também mostra "Também estamos no iFood / 99Food".

### User Story 3 - Configurar o delivery (`021-US3`) (Priority: P2)

Como dona da vitrine, quero cadastrar em Configurações > Delivery os links das minhas lojas no iFood e no 99Food, a taxa de entrega, se peço a forma de pagamento e a lista de entregadores (nome e WhatsApp), e no item os tamanhos, o meio a meio e a borda.

**Acceptance Scenarios**:

1. **Given** um link fora dos domínios `ifood.com.br` e `99app.com` (ou sem HTTPS), **When** salvo, **Then** o campo mostra o erro e o servidor recusa com 422.
2. **Given** entregadores cadastrados, **When** a vitrine é publicada, **Then** nomes e telefones não aparecem no JSON público nem no HTML.

### User Story 4 - Despachar para o motoboy (`021-US4`) (Priority: P2)

Como pizzaria, quero colar na aba Pedidos a mensagem do pedido que chegou no WhatsApp, escolher o motoboy e abrir a conversa dele com endereço, link do mapa, valor a cobrar, forma de pagamento e o pedido, sem salvar pedido em servidor nenhum.

**Acceptance Scenarios**:

1. **Given** uma mensagem no formato da vitrine, **When** colada, **Then** o painel mostra endereço, total e pagamento extraídos e a mensagem pronta.
2. **Given** um entregador escolhido, **When** a pessoa toca em "Abrir no WhatsApp do entregador", **Then** abre `wa.me/<número>` com o texto; nada é enviado ao servidor.

### User Story 5 - Endereço com mapa (`021-US5`) (Priority: P2)

Como cliente, quero digitar o endereço e escolher numa lista, ou usar a localização do aparelho, e conferir o ponto num mapa, arrastando até o pino ficar no lugar exato, para o motoboy chegar sem ligar.

**Acceptance Scenarios**:

1. **Given** a vitrine com "Endereço com mapa" ligado, **When** a pessoa digita 3 ou mais letras do endereço, **Then** aparecem até 5 endereços do Brasil para escolher.
2. **Given** um endereço escolhido ou a localização do aparelho, **When** o mapa aparece, **Then** o pino fica no centro e a pessoa arrasta o mapa (ou usa as setas e o zoom) para ajustar o ponto.
3. **Given** um ponto marcado e entrega escolhida, **When** a mensagem é montada, **Then** ela traz `Localização: https://maps.google.com/?q=<lat>,<lon>` logo abaixo do endereço, e o despacho usa esse link como mapa do motoboy.
4. **Given** a busca fora do ar, **When** a pessoa digita, **Then** o campo continua aceitando o endereço escrito à mão.

### Edge Cases

- Item com meio a meio sem outro sabor compatível no tamanho escolhido: a opção fica sem alternativas e o preço é o do próprio sabor.
- Seleção salva no aparelho de antes das opções: volta com as opções padrão.
- Mesmo sabor em dois tamanhos no mesmo pedido: a pessoa escolhe um por vez; o segundo vai nas observações (limite conhecido do MVP, um cartão é uma linha).
- Mensagem colada fora do padrão: o despacho encaminha o texto inteiro e deixa endereço e total em branco para a pessoa completar.

## Requirements *(mandatory)*

- **FR-001 (Tamanhos)**: `item.sizes`, de 2 a 4 entradas `{ id, label (até 30), priceCents }`, ids únicos; o tamanho padrão é o de preço igual a `priceCents`, senão o primeiro.
- **FR-002 (Meio a meio)**: `item.halfAndHalf: true`; a outra metade é outro item com `halfAndHalf` e, se houver tamanhos, com o mesmo `id` de tamanho. Preço da unidade: o maior dos dois.
- **FR-003 (Adicionais)**: `item.extras = { label (até 30), choices: [{ id, label (até 40), priceCents }] }`, até 6 opções, escolha única e opcional; cada opção pode ter `prices: { <sizeId>: cents }` para preço por tamanho.
- **FR-004 (Mensagem e total)**: total e linhas da mensagem usam o preço da unidade com as escolhas; a página sem JavaScript lista os tamanhos com preço.
- **FR-005 (Links das plataformas)**: `deliveryPlatforms.ifood` e `deliveryPlatforms.food99`, HTTPS, sem usuário, senha nem porta, host igual ou subdomínio de `ifood.com.br` e `99app.com`.
- **FR-006 (Taxa)**: `orderFields.deliveryFeeCents` entre 0 e R$ 500,00, só aplicada na entrega.
- **FR-007 (Pagamento)**: `orderFields.payment: true` mostra Pix, Cartão na entrega e Dinheiro (com troco opcional); variável `{pagamento}`.
- **FR-008 (Plataformas no pedido)**: no passo dos dados, links "Prefere pedir pelo app?"; na página, bloco "Também estamos no".
- **FR-009 (Painel Delivery)**: seção em Configurações com links, taxa, pagamento e entregadores.
- **FR-010 (Entregadores)**: `deliveryCouriers`, até 20 `{ id, name (até 60), whatsapp }` com o mesmo formato do WhatsApp da vitrine.
- **FR-011 (Despacho)**: módulo puro que extrai do texto colado nome, endereço, total, pagamento e observações e monta a mensagem e o link `wa.me` do entregador; sem rede.
- **FR-012 (Privacidade)**: `deliveryCouriers` fica fora da projeção pública e é tratado como chave privada pelo verificador de vazamento.
- **FR-013 (Endereço com mapa)**: `orderFields.addressMap: true` liga sugestões de endereço, "Usar minha localização" e o mapa com pino ajustável; o ponto vira link do Google Maps na mensagem, sem chave nem API paga.
- **FR-014 (Proxy do mapa)**: `/api/geo/search`, `/api/geo/reverse` e `/api/geo/tile/:z/:x/:y.png` no Worker, com User-Agent próprio, recusa de pedidos de outros sites, busca restrita ao Brasil e sem cache, e blocos do OpenStreetMap em cache por 7 dias. A CSP da vitrine continua `img-src 'self'; connect-src 'self'`.
- **FR-015 (Geolocalização)**: só as páginas da vitrine recebem `Permissions-Policy: geolocation=(self)`, e a localização só é pedida no toque em "Usar minha localização".

## Success Criteria

- **SC-001**: a vitrine da Forno de Minas usa tamanhos, meio a meio e borda nos 25 sabores, sem preço de tamanho na descrição.
- **SC-002**: testes cobrem preço de meio a meio e adicional por tamanho, taxa no total, `{pagamento}`, recusa de domínio e ausência de entregadores no artefato público.
- **SC-003**: `npm test` verde e orçamento da vitrine pública mantido.

## Assumptions

- Sem API do iFood, do 99Food nem do WhatsApp: tudo é link.
- O Vitrine continua sem intermediar pagamento.
