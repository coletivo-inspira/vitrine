# Feature Specification: Leilão de verdade para itens no modo lance (`013-leilao`)

**Feature Branch**: `cursor/leilao-lances-cac0`

**Created**: 2026-11-12

**Status**: Approved for Implementation

**Input**: Implementar na Vitrine Inspira um leilão de verdade para itens no modo lance: lances registrados no Supabase, prazo de encerramento, lance mínimo e incremento, regras contra fraude e abuso (limite por visitante, validação no servidor, RLS), vencedor visível para o dono no painel e contato seguindo o fluxo atual por WhatsApp.

## Contexto

Hoje o item "de lance" (`priceMode: "offer"`) só aceita uma oferta digitada pelo visitante, que vai para o carrinho e segue no texto da mensagem do WhatsApp. Nada é registrado: o proprietário não sabe qual foi o maior lance, não há prazo e qualquer pessoa pode oferecer qualquer valor. Esta funcionalidade transforma o item de lance com prazo em um leilão real, registrado no servidor, mantendo o WhatsApp como único canal de conversa (o link abre a conversa; nada é enviado automaticamente).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visitante dá um lance registrado em um leilão aberto (Priority: P1)

Como visitante de uma vitrine publicada, quero ver o lance atual, o mínimo para o próximo lance e quanto tempo falta, e registrar meu lance com nome e WhatsApp, para disputar o item de forma transparente.

**Why this priority**: É o núcleo do leilão; sem lance registrado não há vencedor.

**Independent Test**: Publicar uma vitrine com um item de lance com encerramento futuro, abrir a página pública, dar um lance válido e conferir que o cartão passa a mostrar o novo lance atual, a contagem de lances e o aviso "Você está na frente".

**Acceptance Scenarios**:

1. **Given** um item de lance com encerramento no futuro e lance mínimo de R$ 50,00, **When** o visitante abre a vitrine, **Then** o cartão mostra "Lance inicial R$ 50,00", o incremento, a data e a hora de encerramento e o tempo restante.
2. **Given** o lance atual de R$ 80,00 e incremento de R$ 5,00, **When** o visitante oferece R$ 84,00, **Then** o lance é recusado com a mensagem "O lance mínimo agora é R$ 85,00" e nada é registrado.
3. **Given** um lance válido de R$ 85,00 com nome, WhatsApp e consentimento, **When** o visitante confirma, **Then** o lance é registrado, o cartão mostra R$ 85,00 como lance atual e oferece o botão "Avisar pelo WhatsApp", que abre a conversa com a vitrine com o texto do lance já preenchido.
4. **Given** um visitante que deu o maior lance, **When** outra pessoa cobre o lance e a vitrine atualiza, **Then** o primeiro visitante vê "Seu lance foi superado" e o novo mínimo.
5. **Given** um leilão encerrado, **When** o visitante abre a vitrine, **Then** vê "Leilão encerrado" com o lance vencedor (ou "Encerrado sem lances") e nenhum campo para lance.

---

### User Story 2 - Regras contra fraude e abuso aplicadas no servidor (Priority: P1)

Como proprietário, quero que o servidor aplique as regras do leilão e limite abusos, para que lances falsos, automatizados ou repetidos não estraguem a disputa.

**Why this priority**: Sem validação no servidor, qualquer pessoa poderia gravar lances arbitrários chamando a API diretamente.

**Independent Test**: Executar a suíte de testes que chama a API e o banco diretamente, cobrindo lance abaixo do mínimo, lance após o prazo, rajada de lances do mesmo visitante, troca de identidade, chamada direta ao banco sem a chave do canal e leitura das tabelas por anônimos ou por outra vitrine.

**Acceptance Scenarios**:

1. **Given** um lance enviado depois do encerramento, **When** chega ao servidor, **Then** é recusado com "Este leilão já foi encerrado".
2. **Given** um visitante que acabou de dar um lance, **When** tenta outro lance em menos de 15 segundos, **Then** recebe "Aguarde alguns segundos antes de um novo lance".
3. **Given** um visitante que já usou 3 WhatsApps diferentes no mesmo leilão, **When** tenta um quarto, **Then** o lance é recusado.
4. **Given** a pessoa que já tem o maior lance, **When** tenta cobrir o próprio lance, **Then** recebe "Seu lance já é o maior".
5. **Given** um lance com o WhatsApp da própria vitrine, **When** chega ao servidor, **Then** é recusado.
6. **Given** um lance mais de 10 vezes acima do mínimo exigido, **When** chega ao servidor, **Then** é recusado como valor fora do limite.
7. **Given** uma chamada direta à função do banco sem a chave do canal do Worker, **When** executada com a chave pública anônima, **Then** é recusada e nada é gravado.
8. **Given** um usuário anônimo ou membro de outra vitrine, **When** tenta ler as tabelas de lances, **Then** não recebe nenhuma linha.
9. **Given** um lance nos 3 minutos finais, **When** é aceito, **Then** o encerramento é prorrogado para 3 minutos após o lance, até no máximo 60 minutos além do prazo original.

---

### User Story 3 - Proprietário vê o vencedor no painel e combina pelo WhatsApp (Priority: P1)

Como proprietário ou administrador da vitrine, quero ver os leilões, os lances e o vencedor com nome e WhatsApp, e abrir a conversa com um clique, para combinar pagamento e entrega como já faço hoje.

**Why this priority**: O leilão só gera valor se o proprietário souber quem venceu e conseguir falar com a pessoa.

**Independent Test**: Com lances registrados, abrir "Leilões" no painel, conferir status, valor, vencedor, lista de lances e o link "Chamar no WhatsApp".

**Acceptance Scenarios**:

1. **Given** um leilão encerrado com lances, **When** o proprietário abre "Leilões", **Then** vê o vencedor (nome, WhatsApp e valor) e o botão "Chamar no WhatsApp", que abre a conversa com uma mensagem pronta.
2. **Given** um leilão aberto, **When** o proprietário abre "Leilões", **Then** vê quem está na frente, o lance atual, a contagem e o encerramento.
3. **Given** um membro com papel editor ou leitor, **When** tenta abrir os leilões da vitrine, **Then** não vê contatos (a área responde como inexistente).
4. **Given** um vencedor que não responde ou um lance claramente falso, **When** o proprietário desconsidera o lance com um motivo, **Then** o próximo maior lance válido passa a vencer e a ação fica registrada na trilha de auditoria.
5. **Given** a opção "Bloquear este contato nesta vitrine" marcada ao desconsiderar, **When** a mesma pessoa tenta novo lance na vitrine, **Then** o lance é recusado.

---

### User Story 4 - Proprietário configura o leilão no editor (Priority: P2)

Como proprietário, quero definir no item de lance a data e a hora de encerramento, o lance mínimo e o incremento, para criar o leilão sem ajuda técnica.

**Why this priority**: Necessária para criar leilões, mas reaproveita o editor existente.

**Independent Test**: No editor, marcar um item como "Item de lance", preencher encerramento e incremento, salvar, publicar e conferir os termos na vitrine pública.

**Acceptance Scenarios**:

1. **Given** um item de lance, **When** o proprietário preenche "Encerramento do leilão" e "Incremento mínimo", **Then** a prévia mostra o cartão de leilão com esses termos.
2. **Given** um item de lance sem data de encerramento, **When** publicado, **Then** continua no fluxo anterior de oferta pelo WhatsApp, sem registro.
3. **Given** um encerramento mais de 60 dias à frente ou um incremento fora da faixa, **When** o proprietário salva, **Then** recebe erro de validação claro.

### Edge Cases

- Dois lances iguais quase simultâneos: o banco trava o leilão durante o registro; o segundo recebe "O lance mínimo agora é ...".
- O proprietário republica a vitrine mudando prazo, mínimo ou incremento depois do primeiro lance: os termos ficam congelados no leilão em andamento; a mudança só vale para um novo leilão depois do encerramento.
- O item sai da vitrine publicada ou deixa de ser de lance: novos lances são recusados; o histórico continua no painel.
- O proprietário desconsidera todos os lances: o leilão volta a "sem lances" e, se ainda estiver aberto, aceita o lance inicial de novo.
- Relógio do visitante errado: o tempo restante usa a hora do servidor enviada junto do quadro de lances.
- Prazo já vencido na publicação: a vitrine mostra "Leilão encerrado".
- Chave do canal não configurada: o servidor recusa lances com "Leilões indisponíveis no momento" (falha fechada) e a vitrine continua funcionando para os demais itens.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Um item com modo "lance" e data de encerramento DEVE ser tratado como leilão; sem data, DEVE manter o fluxo anterior de oferta pelo WhatsApp.
- **FR-002**: O leilão DEVE ter lance inicial (lance mínimo do item ou R$ 1,00 quando vazio), incremento mínimo (padrão R$ 1,00, entre R$ 1,00 e R$ 10.000,00) e encerramento até 60 dias à frente.
- **FR-003**: Cada lance DEVE ser registrado no servidor com valor, nome (2 a 60 caracteres), WhatsApp válido e consentimento explícito de compartilhar o contato com o proprietário.
- **FR-004**: O servidor DEVE recusar lances abaixo do mínimo exigido (lance inicial ou lance atual + incremento), acima de 10 vezes esse mínimo, acima de R$ 1.000.000,00 ou após o encerramento.
- **FR-005**: O servidor DEVE limitar cada visitante a um lance a cada 15 segundos por vitrine, 10 lances por leilão por hora, 40 lances por vitrine em 24 horas e 3 WhatsApps distintos por leilão; cada leilão aceita no máximo 300 lances.
- **FR-006**: O servidor DEVE recusar lance de quem já tem o maior lance, lance com o WhatsApp da vitrine e lance de contato bloqueado na vitrine.
- **FR-007**: Lances nos 3 minutos finais DEVEM prorrogar o encerramento para 3 minutos após o lance, até 60 minutos além do prazo original.
- **FR-008**: Os termos (lance inicial, incremento, prazo) DEVEM congelar no primeiro lance.
- **FR-009**: A vitrine pública DEVE mostrar lance atual, próximo mínimo, contagem, encerramento, tempo restante e os 5 últimos valores com horário, sem nome nem WhatsApp de ninguém.
- **FR-010**: Só proprietário e administradores da vitrine DEVEM ver nomes e WhatsApps dos licitantes; ninguém mais (anônimos, outras vitrines, editores, leitores) pode ler esses dados, inclusive por chamada direta ao banco.
- **FR-011**: O painel DEVE listar os leilões da vitrine com status, lance atual, vencedor ou líder, todos os lances e o link "Chamar no WhatsApp".
- **FR-012**: Proprietário e administradores DEVEM poder desconsiderar um lance com motivo, opcionalmente bloqueando o contato na vitrine; o vencedor é recalculado e a ação vai para a trilha de auditoria.
- **FR-013**: O contato DEVE seguir o fluxo atual: links que abrem o WhatsApp com texto pronto (visitante → vitrine após o lance; proprietário → vencedor no painel), sem envio automático.
- **FR-014**: Nomes, WhatsApps e identificadores de visitante DEVEM ser apagados 90 dias após o encerramento, mantendo só os totais do leilão.
- **FR-015**: O identificador de visitante NÃO DEVE guardar o IP; deve ser derivado no servidor de forma irreversível.
- **FR-016**: Itens de leilão NÃO DEVEM entrar no carrinho nem somar no total do pedido.

### Key Entities

- **Leilão (lote)**: um item de lance de uma vitrine com termos congelados (lance inicial, incremento, prazo original, encerramento efetivo), lance atual e contagem.
- **Lance**: valor, nome, WhatsApp, identificador irreversível do visitante, situação (válido ou desconsiderado, com motivo) e horário.
- **Bloqueio**: contato (WhatsApp e/ou visitante) impedido de dar lances em uma vitrine, criado ao desconsiderar um lance.
- **Quadro público**: visão sem dados pessoais do estado de cada leilão de uma vitrine publicada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos lances inválidos dos cenários de aceite (abaixo do mínimo, após o prazo, rajada, troca de identidade, chamada direta sem chave) são recusados nos testes automatizados.
- **SC-002**: Nenhum dado pessoal de licitante aparece na vitrine pública nem em respostas a anônimos ou a outras vitrines (verificado por testes).
- **SC-003**: O proprietário identifica o vencedor e abre a conversa no WhatsApp em no máximo 2 cliques a partir de "Leilões".
- **SC-004**: O visitante registra um lance em até 3 passos (valor, dados de contato, confirmar).
- **SC-005**: A funcionalidade opera dentro dos planos gratuitos: no máximo uma consulta ao quadro a cada 30 segundos por visitante com a aba visível e nenhuma tarefa agendada nova.
- **SC-006**: Capturas em 1280 px e 375 px, temas claro e escuro, sem campos cortados nem rolagem horizontal.

## Decisões tomadas

1. Leilão = item `offer` com `auctionEndsAt`; item `offer` sem prazo mantém a oferta pelo WhatsApp (compatibilidade com vitrines publicadas).
2. Lance inicial = lance mínimo do item, ou R$ 1,00 quando vazio; incremento padrão R$ 1,00 (faixa R$ 1,00 a R$ 10.000,00); prazo de até 60 dias; prazo vencido é aceito e aparece como encerrado.
3. Termos congelam no primeiro lance; republicar com outros termos só abre novo leilão depois do encerramento (novo prazo).
4. Prorrogação anti-"sniping": lance nos 3 minutos finais leva o encerramento a 3 minutos após o lance, teto de +60 minutos.
5. Encerramento calculado sob demanda pela hora do banco, sem cron novo.
6. Visitante identificado por HMAC-SHA-256 do IP de borda (`CF-Connecting-IP`) com o segredo do canal; o IP nunca é gravado.
7. Canal Worker → banco autenticado por segredo dedicado `AUCTION_BID_SECRET`; o banco guarda só o SHA-256 em `private.auction_settings` e recusa lances sem o cabeçalho correto (falha fechada). A chave `service_role` continua fora do Worker público.
8. Limites: 15 s entre lances do mesmo visitante na vitrine; 10 por leilão por hora; 40 por vitrine em 24 h; 3 WhatsApps por visitante por leilão; 300 lances por leilão; teto de 10× o mínimo e R$ 1.000.000,00.
9. Não pode cobrir o próprio lance; o WhatsApp da vitrine não pode dar lance; campo isca (`website`) e agentes de robô são recusados na borda.
10. Vitrine pública mostra só valores e horários (5 últimos) e um marcador curto do lance líder para o navegador saber se está na frente; nenhum nome, inicial ou telefone.
11. Contatos visíveis apenas para `owner` e `admin`; `editor` e `viewer` recebem 404 na área de leilões.
12. Desconsiderar lance exige motivo (3 a 200 caracteres), pode bloquear o contato na vitrine, recalcula o vencedor e grava em `audit_logs`; vale também depois do encerramento (vencedor que some).
13. Retenção: lances apagados 90 dias após o encerramento (limpeza oportunista a cada novo lance da vitrine), lote mantém totais.
14. Vitrine consulta o quadro a cada 30 s apenas com a aba visível e após cada lance; resposta `no-store`.
15. Itens de leilão saem do carrinho; o lance registrado conta como `item_select` nas métricas agregadas.
16. Contato pelo WhatsApp por links `wa.me` com texto pronto, nos dois sentidos; nenhuma mensagem automática.
17. Painel ganha a seção "Leilões" na barra lateral e um botão "Leilões" em cada vitrine da lista (acesso no celular); a barra inferior móvel continua com 5 atalhos.
18. Rotas de lance também funcionam em domínios personalizados da vitrine.
19. Com a vitrine no modo Mila (#92), o aviso do visitante sai com o código da Mila no início da mensagem, e o WhatsApp real do dono (do rascunho) também fica impedido de dar lance; o botão "Chamar no WhatsApp" do painel usa o WhatsApp do próprio dono, por escolha dele.
20. `.specify/feature.json` e a seção SPECKIT do `AGENTS.md` não foram alterados (workers paralelos); o gancho opcional `agent-context` foi pulado.

## Assumptions

- O proprietário combina pagamento e entrega fora da plataforma; o lance é um compromisso de intenção, não um pagamento.
- Leilões são poucos por vitrine (até 20 itens ativos no total), o que cabe nas cotas gratuitas.
- O Worker roda atrás da Cloudflare, que fornece `CF-Connecting-IP`.
- A migração é aplicada pelo fluxo de deploy existente; o segredo do canal é configurado por uma pessoa (pendência humana).
