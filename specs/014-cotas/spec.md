# Feature Specification: Cotas de apoio sem sorteio (`014-cotas`)

**Feature Branch**: `cursor/cotas-de-apoio-c931`

**Created**: 2026-11-12

**Status**: Implementada nesta branch (aguardando revisão do Lino)

**Input**: Implementar na Vitrine Inspira a ideia "venda de cotas estilo rifa", decidida de forma legal no Brasil. Sorteio ou distribuição gratuita de prêmios mediante pagamento depende de autorização federal (Lei 5.768/1971 e regulamentação vigente); pesquisar as regras atuais e escolher um formato que não dependa de autorização, por exemplo cotas de apoio ou compra coletiva sem sorteio, registrando a fundamentação na spec.

## Fundamentação legal (resumo)

A pesquisa completa, com fontes oficiais, está em [`research.md`](./research.md). Em resumo:

- **Rifa não é permitida sem autorização.** Toda operação que "faz depender de sorteio a obtenção de prêmio" é loteria (Decreto-Lei 3.688/1941, art. 51, § 2º; Decreto-Lei 6.259/1944, art. 40). A própria Secretaria de Prêmios e Apostas do Ministério da Fazenda (SPA/MF) responde, no FAQ oficial, que "as 'rifas' não são admitidas pela legislação brasileira".
- **Sorteio, vale-brinde ou concurso com prêmio**, inclusive gratuito para clientes, depende de prévia autorização da SPA/MF (Lei 5.768/1971, arts. 1º e 4º; Decreto 70.951/1972; Portaria SEAE/ME 7.638/2022; Portaria SECAP/ME 20.749/2020 para OSC). Pessoa física não pode ser autorizada.
- **Cota com retorno financeiro** é valor mobiliário (Lei 6.385/1976, art. 2º, IX); a Resolução CVM 88/2022, art. 1º, § 3º, exclui doações e contrapartidas em brindes, recompensas, bens ou serviços.
- **Recebimento antecipado em oferta pública** pode cair no art. 7º da Lei 5.768/1971; por isso a vitrine não cobra nem guarda valores.

**Formato escolhido**: *cotas de apoio sem sorteio*. O proprietário divide uma meta (um equipamento, um projeto, um lote de compra coletiva) em partes iguais de valor fixo. Toda cota garante o mesmo benefício declarado (ou nenhum). O visitante escolhe **quantas** cotas quer reservar, nunca um número; a reserva vira mensagem de WhatsApp e o pagamento é combinado diretamente com o proprietário. Compra coletiva sem sorteio é coberta pelo mesmo formato (cada cota é uma fração definida do lote).

## Fora do escopo por motivo legal

1. Rifa, bilhete numerado, "número da sorte", escolha de número e qualquer sorteio entre cotistas (loteria não autorizada; LCP art. 51).
2. Sorteio ou brinde gratuito "para quem comprou" (promoção comercial; Lei 5.768/1971, art. 1º; exige autorização prévia da SPA/MF e só para pessoa jurídica).
3. Rifa beneficente de OSC (Lei 5.768/1971, art. 4º; exige autorização da SPA/MF caso a caso).
4. "Ação entre amigos", "vaquinha premiada" e demais nomes para a mesma mecânica (DL 6.259/1944, art. 40, parágrafo único).
5. Cota com lucro, juros, rendimento, dividendos ou participação no resultado (valor mobiliário; CVM).
6. Fila de contemplação por sorteio ou lance (consórcio; Lei 11.795/2008).
7. Cobrança, custódia ou repasse de valores pela plataforma (arranjo de pagamento; Lei 12.865/2013) e venda com recebimento antecipado gerida pela plataforma (Lei 5.768/1971, art. 7º, II).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Proprietário cria um item de cotas de apoio (Priority: P1)

Como proprietário de uma vitrine, quero cadastrar um item do tipo "Cotas de apoio" informando o valor de cada cota, o total de cotas, quantas já foram confirmadas, o que cada cota garante e as condições, para arrecadar apoio de forma clara e sem sorteio.

**Why this priority**: sem o cadastro no painel não existe a funcionalidade.

**Independent Test**: no editor, escolher "Cotas de apoio (sem sorteio)" no menu "Adicionar item" ou no seletor "Tipo do item", preencher os campos e salvar o rascunho; o servidor aceita e a prévia ao vivo mostra o progresso.

**Acceptance Scenarios**:

1. **Given** o editor aberto, **When** o proprietário adiciona um item "Cotas de apoio", **Then** o cartão mostra o aviso legal fixo, os campos "Valor de cada cota (BRL)", "Total de cotas (2 a 1000)", "Cotas já confirmadas", "O que cada cota garante (opcional)" e "Condições (opcional)", com total padrão de 10 e 0 confirmadas.
2. **Given** um item de cota sem valor ou com total fora de 2 a 1000, **When** o proprietário tenta salvar, **Then** o editor bloqueia com mensagem clara e o servidor rejeita com 422 (`INVALID_QUOTA_PRICE` ou `INVALID_QUOTA_TOTAL`).
3. **Given** cotas confirmadas maiores que o total, **When** o rascunho é salvo, **Then** o editor ajusta o campo ao total e o servidor rejeita valores inválidos (`INVALID_QUOTA_FILLED`).

---

### User Story 2 - Visitante reserva cotas pela vitrine pública (Priority: P1)

Como visitante, quero ver quanto falta para a meta, o valor de cada cota e o que ela garante, escolher quantas cotas reservar e enviar a reserva pelo WhatsApp, sabendo que não há sorteio e que o pagamento é combinado direto com o negócio.

**Why this priority**: é o valor entregue ao visitante e a conversão do proprietário.

**Independent Test**: publicar uma vitrine com item de cota, abrir a página pública, reservar cotas, revisar e conferir a mensagem gerada.

**Acceptance Scenarios**:

1. **Given** um item com 50 cotas e 32 confirmadas, **When** a vitrine pública carrega, **Then** o cartão mostra "32 de 50 cotas confirmadas", barra de progresso, "Meta: R$ 1.000,00 · 18 cotas disponíveis", "R$ 20,00 por cota" e o aviso "Sem sorteio: toda cota garante o mesmo benefício. A reserva não é pagamento…".
2. **Given** 3 cotas disponíveis, **When** o visitante tenta reservar a 4ª, **Then** o botão "+" fica desabilitado e a quantidade não passa do saldo.
3. **Given** um item com todas as cotas confirmadas, **When** a vitrine carrega, **Then** aparece "Cotas esgotadas" e não é possível reservar.
4. **Given** 3 cotas de R$ 20,00 reservadas, **When** o visitante revisa o pedido, **Then** o resumo mostra "3 cotas de apoio: …" com R$ 60,00, um bloco "Total em cotas (reserva)" separado do total de produtos e a mensagem do WhatsApp inclui "reserva sem sorteio; o pagamento é combinado nesta conversa".
5. **Given** cotas e produtos de preço fixo no mesmo pedido, **When** a mensagem é montada, **Then** o total dos produtos não soma as cotas e as cotas aparecem como "Cotas reservadas (à parte do total)".

---

### User Story 3 - A plataforma impede rifa disfarçada (Priority: P1)

Como Operador Inspira, quero que a vitrine não aceite itens com mecânica ou linguagem de rifa, sorteio, prêmio ou retorno financeiro, para que a plataforma não hospede operações que dependem de autorização federal.

**Why this priority**: sem essa trava, o mesmo recurso poderia ser usado para vender números de rifa, inclusive em itens de preço fixo.

**Independent Test**: tentar salvar itens com "Rifa do forno", "Concorra no sorteio", "Número da sorte 23" ou "Rendimento de 2% ao mês" e confirmar a rejeição; confirmar que "Kit de pães sortidos" e "Café premiado" continuam aceitos.

**Acceptance Scenarios**:

1. **Given** qualquer item da vitrine, **When** nome, descrição, condições, troca, seção ou benefício contém "rifa", "sorteio" (e variações), "número da sorte" ou "ação entre amigos", **Then** o servidor rejeita com 422 `RAFFLE_NOT_ALLOWED` (ou `QUOTA_PROHIBITED_TERMS` em item de cota) e o editor mostra o aviso no próprio cartão enquanto o texto é digitado.
2. **Given** um item de cota, **When** algum texto contém "prêmio", "concorra", "bilhete", "loteria", "bingo", "lucro", "juros", "rendimento", "rentabilidade", "dividendo", "retorno financeiro" ou "participação nos resultados", **Then** o servidor rejeita com `QUOTA_PROHIBITED_TERMS`.
3. **Given** a verificação, **When** o texto usa acentos ou maiúsculas ("SORTEIO", "Ação entre amigos"), **Then** a regra continua valendo.

### Edge Cases

- Item de cota numa vitrine de agendamento: tratado como serviço comum (o agendamento não usa modos de preço).
- Item de cota sem `quotaTotal` válido no artefato público: a vitrine trata como item de preço fixo, sem quebrar a página.
- Proprietário troca o tipo de "Cotas" para outro: os campos de cota ficam no rascunho, mas não são publicados.
- Cotas e lances no mesmo pedido: o total dos produtos continua "(sem os lances)" e as cotas aparecem à parte.
- Quantidade máxima por reserva: o menor valor entre o saldo e 99.
- Texto longo nos campos de cota: até 240 caracteres, com o mesmo bloqueio de marcação executável dos demais campos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O editor DEVE oferecer o tipo "Cotas de apoio (sem sorteio)" no seletor "Tipo do item" e no menu "Adicionar item" para vitrines de produtos e de orçamento.
- **FR-002**: Um item de cota DEVE ter valor por cota maior que zero e total de cotas inteiro entre 2 e 1000; cotas confirmadas são inteiras entre 0 e o total (padrão 0).
- **FR-003**: O item de cota PODE ter "O que cada cota garante" e "Condições", cada um com até 240 caracteres.
- **FR-004**: O editor DEVE exibir no cartão de cota um aviso fixo explicando que não há sorteio, que rifa, sorteio, prêmio e retorno financeiro exigem autorização federal e que o pagamento é combinado direto com cada apoiador.
- **FR-005**: O servidor DEVE rejeitar com 422 qualquer item que use termos de rifa ou sorteio e qualquer item de cota que use termos de prêmio ou retorno financeiro (lista em `research.md`, seção 4), com normalização de acentos e maiúsculas.
- **FR-006**: A publicação DEVE projetar apenas `priceMode`, `priceCents`, `quotaTotal`, `quotaFilled`, `quotaReward` e `conditions` dos itens de cota; itens de outros tipos não publicam campos de cota.
- **FR-007**: A vitrine pública DEVE mostrar progresso (confirmadas/total), meta em reais, saldo, valor por cota, benefício, condições e o aviso fixo "Sem sorteio: toda cota garante o mesmo benefício. A reserva não é pagamento. O valor é combinado direto com a vitrine pelo WhatsApp."
- **FR-008**: O visitante DEVE escolher apenas a quantidade de cotas (1 até o menor entre saldo e 99); a vitrine NÃO DEVE oferecer escolha ou atribuição de números.
- **FR-009**: O total em cotas DEVE aparecer separado do total de produtos na barra de seleção, na revisão e na mensagem do WhatsApp.
- **FR-010**: Item com saldo zero DEVE exibir "Cotas esgotadas" e não aceitar reserva.
- **FR-011**: A vitrine NÃO DEVE processar, guardar ou repassar pagamentos; a reserva é uma mensagem aberta pelo visitante no WhatsApp.

### Key Entities

- **Item de cota**: item da vitrine com `priceMode: "quota"`, valor por cota (`priceCents`), total (`quotaTotal`), confirmadas (`quotaFilled`, atualizado manualmente pelo proprietário), benefício por cota (`quotaReward`) e condições (`conditions`). Detalhes em [`data-model.md`](./data-model.md).
- **Reserva de cotas**: quantidade escolhida pelo visitante na sessão do navegador, transformada em linha da mensagem do WhatsApp. Não é persistida pela plataforma.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um proprietário cadastra um item de cota completo em até 2 minutos, sem consultar ajuda.
- **SC-002**: 100% dos itens com termos de rifa/sorteio são rejeitados no salvamento, por chamada direta à API ou pelo editor.
- **SC-003**: Em 375 px e 1280 px, claro e escuro, o cartão de cota mostra progresso, valor, benefício e aviso sem texto cortado nem rolagem horizontal.
- **SC-004**: Em 100% das reservas, a mensagem do WhatsApp informa quantidade, valor por cota, subtotal e que não há sorteio.
- **SC-005**: O visitante nunca consegue reservar mais cotas do que o saldo informado.

## Assumptions

- "Cotas já confirmadas" é informação declarada pelo proprietário; a vitrine não confirma pagamento. O rótulo deixa isso explícito ("confirmadas" pela vitrine).
- Sem migração Supabase: o item vive no JSON do rascunho e da publicação, como os demais modos de preço.
- A importação/exportação por planilha (CSV) não carrega campos de cota nesta entrega; o proprietário converte o item no editor.
- O limite de 20 itens ativos do plano gratuito vale também para itens de cota.
- Revisão jurídica externa não bloqueia a entrega, mas é recomendada antes de divulgar a funcionalidade como garantia legal a terceiros.
