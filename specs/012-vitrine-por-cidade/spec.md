# Especificação: Vitrine por cidade (lance, doação e troca)

**Diretório**: `specs/012-vitrine-por-cidade/`
**Criada**: 2026-11-12
**Status**: Implementada (primeira fatia) — aguardando aplicação da migração no Supabase de produção
**Entrada**: "Página pública que reúne, por cidade, os itens de lance, doação e troca das vitrines publicadas (os modos já existem no editor). Decidir como a cidade é obtida, filtros, privacidade do dono e paginação dentro do plano gratuito. Outro worker faz o leilão de verdade em paralelo (spec 013); mostrar lances do jeito que existem hoje e deixar o ponto de encaixe documentado."

## Contexto

O editor já permite marcar cada item como **venda** (`fixed`), **lance** (`offer`), **doação** (`donation`) ou **troca** (`trade`), e a publicação já projeta esses modos no manifesto público. Hoje cada item só aparece dentro da sua vitrine. Esta funcionalidade cria um ponto de encontro público por cidade, para quem quer doar, trocar ou propor valor por algo perto de casa.

## Cenários de usuário e testes

### História 1 — Visitante encontra itens perto dele (Prioridade: P1)

Uma pessoa abre a página "Por cidade", escolhe a sua cidade e vê, em um só lugar, os itens de lance, doação e troca das vitrines daquela cidade. Ao escolher um item, segue para a vitrine dona do item e combina pelo WhatsApp como já acontece hoje.

**Por que P1**: é o valor central da funcionalidade.

**Teste independente**: publicar duas vitrines na mesma cidade com itens de lance, doação, troca e venda; abrir a página da cidade e conferir que só os três modos aparecem, com link para cada vitrine.

**Cenários de aceite**:

1. **Dado** que duas vitrines publicadas autorizaram a listagem em "Porto Alegre – RS", **quando** o visitante abre a página dessa cidade, **então** vê os itens de lance, doação e troca das duas, e nenhum item de venda.
2. **Dado** um item de lance com valor mínimo, **quando** ele aparece na página, **então** mostra "Lance" e "a partir de R$ X"; sem mínimo, mostra "Faça sua oferta".
3. **Dado** um item de troca com "Aceito em troca" preenchido, **quando** ele aparece, **então** o texto é exibido; o mesmo vale para as condições de uma doação.
4. **Dado** o índice de cidades, **quando** o visitante o abre, **então** vê só cidades com pelo menos um item, agrupadas por estado, com a contagem de itens.

### História 2 — Proprietário decide aparecer na página da cidade (Prioridade: P1)

No editor, em Ajustes, o proprietário encontra "Página por cidade": uma caixa de autorização (desligada por padrão), o estado (UF) e o nome da cidade. Ao publicar com a caixa marcada, os itens de lance, doação e troca da vitrine passam a aparecer na página da cidade. Ao desmarcar e publicar de novo, somem.

**Por que P1**: sem autorização explícita não há dados para mostrar, e a privacidade do dono depende disso.

**Teste independente**: publicar com e sem a autorização e conferir a presença e a ausência na página da cidade.

**Cenários de aceite**:

1. **Dado** uma vitrine sem autorização, **quando** é publicada, **então** nenhum item dela aparece em qualquer página de cidade.
2. **Dado** a autorização marcada sem cidade ou UF, **quando** o proprietário tenta salvar, **então** recebe uma mensagem clara pedindo a cidade e o estado.
3. **Dado** uma vitrine listada, **quando** o proprietário desmarca a autorização e publica, **então** os itens deixam de aparecer na página (respeitado o tempo máximo de cache).
4. **Dado** uma vitrine listada, **quando** ela é revertida para uma versão anterior sem autorização, **então** os itens também saem da página.

### História 3 — Visitante filtra e navega por páginas (Prioridade: P2)

O visitante filtra a cidade por **Todos**, **Lance**, **Doação** ou **Troca** e avança com "Mais itens" quando há mais de uma página.

**Teste independente**: com mais de 24 itens em uma cidade, conferir que a primeira página traz 24, que "Mais itens" traz os seguintes sem repetir, e que cada filtro mostra só o modo escolhido.

**Cenários de aceite**:

1. **Dado** o filtro "Troca", **quando** aplicado, **então** só itens de troca aparecem e o filtro fica marcado como atual.
2. **Dado** 30 itens na cidade, **quando** o visitante abre a primeira página, **então** vê 24 itens e o link "Mais itens"; na segunda, os 6 restantes, sem o link.
3. **Dado** um filtro sem resultados, **quando** aplicado, **então** aparece um estado vazio com link para "Todos".
4. **Dado** um cursor de página adulterado, **quando** usado, **então** a página volta para o início sem erro.

### Casos-limite

- Cidade inexistente ou sem itens: página "não encontrada" com link para o índice, sem indexação.
- Mesmo nome de cidade escrito com ou sem acento ("São Paulo" e "Sao Paulo") cai na mesma página dentro do mesmo estado.
- Cidades homônimas em estados diferentes (ex.: "Bom Jesus – RS" e "Bom Jesus – PI") ficam em páginas separadas.
- Item oculto (inativo) não aparece.
- Vitrine com o endereço `por-cidade` não pode ser criada.
- Banco indisponível: página de indisponibilidade temporária, sem cache.
- Página sem JavaScript: filtros e paginação continuam funcionando (são links).

## Requisitos

### Funcionais

- **FR-001**: A plataforma DEVE oferecer um índice público de cidades com itens listados, agrupado por UF, com contagem de itens por cidade.
- **FR-002**: A plataforma DEVE oferecer uma página pública por cidade com os itens ativos de modo lance, doação e troca das vitrines publicadas que autorizaram a listagem naquela cidade.
- **FR-003**: Itens de venda (`fixed`) e itens ocultos NÃO DEVEM aparecer.
- **FR-004**: A cidade DEVE vir de um campo explícito por vitrine (cidade + UF), preenchido pelo proprietário no editor; a cidade do perfil pessoal NÃO DEVE ser usada automaticamente.
- **FR-005**: A listagem DEVE ser opcional e desligada por padrão; só vale após publicação.
- **FR-006**: A página DEVE exibir apenas: nome público da vitrine, endereço da vitrine, cidade/UF e os campos públicos do item (nome, descrição, foto, modo, valor mínimo de lance, condições de doação, "aceito em troca").
- **FR-007**: A página NÃO DEVE exibir nome, e-mail, perfil ou endereço do proprietário, nem o WhatsApp da vitrine; o contato acontece dentro da vitrine.
- **FR-008**: O visitante DEVE poder filtrar por Todos, Lance, Doação e Troca.
- **FR-009**: A lista DEVE ser paginada com 24 itens por página, do mais recentemente publicado para o mais antigo, com navegação "Mais itens" e "Voltar ao início".
- **FR-010**: Lances DEVEM ser mostrados como existem hoje (proposta de valor pelo WhatsApp, com mínimo opcional), com um ponto de encaixe documentado para o leilão da spec 013.
- **FR-011**: A mesma informação DEVE estar disponível em JSON público e somente leitura.
- **FR-012**: Desmarcar a autorização, reverter para versão sem autorização ou excluir a vitrine DEVE remover os itens da página.
- **FR-013**: A página DEVE funcionar sem JavaScript e com a CSP atual (`script-src 'self'`).

### Entidades

- **Localidade da vitrine**: autorização (sim/não), cidade (texto) e UF (lista fechada dos 27 estados). Gera um identificador de cidade (`porto-alegre-rs`).
- **Item listado por cidade**: cópia pública e derivada de um item publicado (vitrine, cidade, modo, campos públicos), refeita a cada publicação.

## Critérios de sucesso

- **SC-001**: Um visitante chega da página inicial do índice à vitrine de um item em até 3 cliques.
- **SC-002**: 100% dos itens exibidos pertencem a vitrines com autorização ativa na versão publicada atual (verificado por teste).
- **SC-003**: Nenhum campo privado (nome/e-mail do dono, identificador interno da vitrine, WhatsApp) aparece no HTML ou JSON da página (verificado por teste).
- **SC-004**: A remoção da autorização reflete na página em até 5 minutos após a publicação.
- **SC-005**: Cada visualização não cacheada custa no máximo 2 consultas leves ao banco (índice de cidades, memorizado por 60 s, e uma página de itens), e a funcionalidade não exige plano pago.

## Premissas

- O volume do piloto (até 10 vitrines × 20 itens ativos) cabe com folga no Supabase Free e no Workers Free; a estimativa de escala está em `research.md`.
- Não há base oficial de municípios embarcada; a normalização por nome sem acento + UF é suficiente nesta fatia.
- O leilão com lances registrados, prazo e maior lance é da spec 013; esta spec não registra lances.
