# Feature Specification: Curtidas por Item na Vitrine Pública (`011-curtidas-produto`)

**Feature Branch**: `cursor/curtidas-produto-d462`

**Created**: 2026-11-12

**Status**: Approved for Implementation

**Input**: Implementar curtidas por produto (item) na vitrine pública, com contagem no servidor, proteção contra curtida repetida sem exigir login do visitante e métrica de curtidas por item para o dono no painel, a custo zero (Workers Free + Supabase Free), mantendo CSP `script-src 'self'` e o compromisso de privacidade já exibido na vitrine.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visitante curte um item da vitrine (Priority: P1)

Como visitante de uma vitrine publicada, quero tocar em um coração no card de um item para registrar que gostei dele e ver quantas pessoas também curtiram, sem precisar entrar com conta.

**Why this priority**: É o valor principal da funcionalidade e a fonte de dados das demais histórias.

**Independent Test**: Abrir `/loja1` no ambiente local com o Worker em memória, tocar no coração de um item e verificar que o contador sobe para 1, o botão fica marcado (`aria-pressed="true"`) e, ao recarregar a página, o estado e a contagem continuam iguais.

**Acceptance Scenarios**:

1. **Given** uma vitrine publicada com itens ativos, **When** a página carrega, **Then** cada card de item ativo mostra um botão de curtir com a contagem atual vinda do servidor (oculta quando zero) e o estado "curtido" do próprio visitante.
2. **Given** um item ainda não curtido pelo visitante, **When** o visitante toca no coração, **Then** o botão muda imediatamente para curtido, a contagem sobe 1 e o servidor confirma a contagem final.
3. **Given** um item já curtido pelo visitante, **When** o visitante toca de novo, **Then** a curtida é removida e a contagem desce 1 (alternância).
4. **Given** que o servidor recusa ou falha ao registrar, **When** a resposta chega, **Then** o botão volta ao estado anterior e uma mensagem curta e acessível explica o motivo.
5. **Given** que o serviço de curtidas está indisponível (por exemplo, migração ainda não aplicada), **When** a vitrine carrega, **Then** nenhum botão de curtir aparece e o restante da vitrine funciona normalmente.

---

### User Story 2 - Proteção contra curtida repetida sem login (Priority: P1)

Como dono de vitrine, quero que a mesma pessoa não consiga inflar a contagem de um item clicando várias vezes, para que o número reflita interesse real.

**Why this priority**: Sem essa proteção a métrica perde sentido; é requisito explícito do pedido.

**Independent Test**: Enviar várias requisições `POST /api/likes` com o mesmo cookie de visitante e confirmar que a contagem não passa de 1; enviar requisições em massa sem cookie e confirmar o teto por hora (`429 LIKE_RATE_LIMITED`).

**Acceptance Scenarios**:

1. **Given** um visitante com o cookie funcional de curtidas, **When** ele envia "curtir" repetidas vezes para o mesmo item (inclusive em paralelo), **Then** a contagem do item aumenta no máximo 1.
2. **Given** um visitante sem cookie, **When** ele curte um item, **Then** o servidor gera um identificador aleatório anônimo, grava somente o hash desse identificador e devolve o cookie `HttpOnly`, `Secure`, `SameSite=Lax`, restrito ao caminho `/api/likes`.
3. **Given** uma rajada de curtidas novas no mesmo item ou na mesma vitrine, **When** os tetos por hora são atingidos (30 por item e 150 por vitrine), **Then** novas curtidas são recusadas com `429 LIKE_RATE_LIMITED` até a janela liberar, sem afetar remoções.
4. **Given** uma requisição de origem diferente da vitrine, sem JSON, acima de 1 KiB, de robô conhecido ou para item inexistente na versão publicada, **When** chega ao Worker, **Then** é recusada sem gravar nada.

---

### User Story 3 - Dono acompanha curtidas por item no painel (Priority: P2)

Como dono (ou membro da equipe) de uma vitrine, quero ver no Painel de Insights quantas curtidas cada item tem no total e quantas recebeu no período escolhido, para entender o que mais agrada.

**Why this priority**: Transforma o dado público em decisão de negócio; depende da US1.

**Independent Test**: Curtir itens na vitrine local, abrir `#insights` no painel como dono e conferir o card "Itens mais curtidos" com total, novas no período e ranking; como usuário sem acesso, confirmar `404 SITE_NOT_FOUND` e nenhuma linha.

**Acceptance Scenarios**:

1. **Given** uma vitrine com curtidas, **When** o dono abre o Painel de Insights em 7, 30 ou 90 dias, **Then** vê o total de curtidas atuais, as curtidas novas no período e o ranking de até 10 itens mais curtidos com nome e categoria.
2. **Given** uma vitrine sem curtidas, **When** o dono abre o painel, **Then** vê um estado vazio que explica como as curtidas aparecem.
3. **Given** um usuário sem associação à vitrine, **When** consulta os insights ou chama a função de estatísticas diretamente, **Then** não recebe nenhum dado de curtidas.
4. **Given** um item removido da vitrine publicada, **When** o dono abre o painel, **Then** o item não aparece no ranking.

### Edge Cases

- Duplo toque rápido: o cliente ignora toques enquanto há requisição pendente do mesmo item; o banco garante unicidade por chave primária.
- Visitante limpa cookies ou usa janela anônima: pode curtir de novo; limite conhecido de qualquer solução sem login, mitigado pelos tetos por hora.
- Cookie adulterado ou em formato inválido: é descartado e substituído por um novo identificador.
- Item oculto ou removido depois de curtido: não recebe novas curtidas e não aparece em contagens públicas nem no ranking; reaparece se voltar a ser publicado.
- Vitrine em domínio próprio: `/api/likes` é atendido no mesmo host, mantendo a verificação de origem.
- Prévia do editor e pré-visualização assinada: sem botão de curtir (não há visitante real).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A vitrine pública DEVE exibir, em cada item ativo, um botão de curtir acessível (alvo mínimo 44×44 px, `aria-pressed`, rótulo com o nome do item) com a contagem atual.
- **FR-002**: A contagem DEVE ser calculada no servidor a partir de registros individuais únicos por (vitrine, item, visitante anônimo); o cliente nunca envia contagens.
- **FR-003**: O servidor DEVE identificar o visitante por um token aleatório de 128 bits em cookie funcional `vitrine_curtidas` (`HttpOnly; Secure; SameSite=Lax; Path=/api/likes; Max-Age=31536000`) e gravar apenas o SHA-256 do token.
- **FR-004**: Curtir DEVE ser idempotente por visitante e item; tocar de novo DEVE remover a curtida.
- **FR-005**: O servidor DEVE aplicar tetos de novas curtidas por hora: 30 por item e 150 por vitrine, respondendo `429 LIKE_RATE_LIMITED`.
- **FR-006**: O Worker DEVE exigir `Origin` igual ao host, `Content-Type: application/json`, corpo de até 1 KiB e recusar robôs conhecidos.
- **FR-007**: Somente itens presentes na versão ativa publicada DEVEM aceitar curtidas e aparecer nas contagens.
- **FR-008**: Visitantes e usuários anônimos NÃO DEVEM ler ou alterar a tabela de curtidas diretamente; leitura e escrita ocorrem apenas por funções `SECURITY DEFINER` com validação.
- **FR-009**: O Painel de Insights DEVE mostrar total atual, novas no período e ranking por item somente para dono e membros da vitrine.
- **FR-010**: O aviso de privacidade da vitrine e do painel DEVE informar o cookie funcional de curtidas, mantendo a ausência de IP e de dados pessoais.
- **FR-011**: Se o serviço de curtidas falhar ou não estiver disponível, a vitrine DEVE continuar funcionando sem botões de curtir.

### Key Entities

- **Curtida de item (`item_likes`)**: vitrine, chave do item, hash do visitante anônimo e data de criação; única por (vitrine, item, visitante).
- **Visitante anônimo**: token aleatório no cookie funcional, sem vínculo com conta, IP ou dados pessoais.
- **Estatística de curtidas por item**: total atual e novas no período, agregadas por item, visíveis apenas para a equipe da vitrine.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Repetir "curtir" N vezes com o mesmo visitante resulta em contagem 1 em 100% dos testes automatizados (sequenciais e paralelos).
- **SC-002**: O visitante vê o coração marcado em até 100 ms após o toque (atualização otimista) e a contagem confirmada pelo servidor na mesma interação.
- **SC-003**: Usuário sem associação à vitrine recebe zero linhas de curtidas em 100% das chamadas diretas e via API.
- **SC-004**: A vitrine continua utilizável (itens, etapas e WhatsApp) quando o serviço de curtidas responde erro.
- **SC-005**: Nenhum IP, e-mail, conta ou token bruto é persistido; apenas hashes de 64 caracteres hexadecimais.

## Assumptions

- Curtidas valem para todos os tipos de vitrine (produtos, agendamento e orçamento) e não exigem ativação pelo dono nesta versão.
- O compromisso público "sem coleta de endereço IP" é mantido; por isso a proteção não usa IP.
- A prévia do editor não mostra curtidas.
- Aplicar a migração no Supabase de produção é ação humana (workflow `Supabase Database Migrate` com `dry_run=false`).

## Decisões tomadas

1. Identificação do visitante por cookie funcional `HttpOnly` gerado no servidor, sem login, sem IP e sem impressão digital do navegador.
2. Persistência de um registro por (vitrine, item, visitante) em vez de contador agregado: a unicidade vem da chave primária e a contagem é `count(*)` no servidor.
3. Curtida alternável (curtir e descurtir), comportamento esperado de um coração.
4. Tetos por hora de 30 curtidas novas por item e 150 por vitrine, para limitar abuso de quem descarta cookies; remoções não têm teto.
5. Contagem pública visível a todos; zero aparece só como coração sem número.
6. Painel mostra total atual (líquido) e novas no período; o período não subtrai curtidas removidas de períodos anteriores.
7. Botão só aparece depois que o servidor responde a contagem inicial (degradação silenciosa se a migração não estiver aplicada).
8. Sem botão na prévia do editor e na prévia assinada.
9. Curtidas de itens removidos ficam guardadas e voltam a contar se o item voltar a ser publicado; exclusão da vitrine apaga tudo em cascata.
10. `/api/likes` também funciona em domínios próprios, reutilizando a verificação de origem do host.
11. Sem configuração por vitrine para desligar curtidas nesta versão.
