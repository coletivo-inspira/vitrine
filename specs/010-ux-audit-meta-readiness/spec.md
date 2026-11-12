# Feature Specification: Programa de Auditoria UX de Ponta a Ponta e Prontidão de Conformidade Meta/Instagram (`010-ux-audit-meta-readiness`)

**Feature Branch**: `cursor/plano-issues-abertas-6c44`

**Created**: 2026-11-12

**Status**: Approved for Implementation (4 Fases Sequenciais — Matriz Central & Pré-Requisitos, Primeira Onda de Jornadas Essenciais, Segunda Onda de Fluxos Complementares + HITL, Consolidação & Priorização)

**Input**: Executar o programa completo de Auditoria UX de ponta a ponta da plataforma **Vitrine Inspira** (issues `#61` a `#73`) e preparar os entregáveis públicos de conformidade exigidos pelo mapeamento Meta/Instagram (issue `#48`), sobre a base já entregue das especificações `008-portal-redesign` (`#34` a `#38`) e `009-modular-admin-platform` (`#39` a `#44`), operando a custo zero, sem planos pagos ou upgrades automáticos, sem afirmar deploy remoto não verificado e utilizando sempre o termo canônico **vitrine** em qualquer texto voltado ao usuário.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Identificação de Ambientes, Matriz Central de Auditoria e Páginas Públicas de Conformidade (`010-US1` — Issues `#61` e `#48`) (Priority: P1)

Como Operador Inspira ou responsável pela qualidade do produto, quero comparar o estado do ambiente local verificável com os endereços planejados de produção, abrir a matriz central estruturada de telas, controles e cenários (`#61`) e dispor das páginas institucionais públicas de Política de Privacidade (`/privacidade`) e Termos de Uso (`/termos`, incluindo instruções de exclusão de dados `#exclusao-dados`) exigidas pela configuração Meta (`#48`), para que todas as ondas de auditoria UX e a submissão humana do aplicativo Meta tenham base verificável e sem bloqueios de documentação.

**Why this priority**: A issue `#61` é pré-requisito direto das issues `#62` a `#72`, e as páginas `/privacidade` e `/termos` são o único pré-requisito de código estático pendente para destravar o cadastro das URLs obrigatórias pelo Lino no console Meta (`#48`).

**Independent Test**: Executar `npm run build` e `npm run preview`, validar a presença e estrutura de `docs/auditoria-ux/matriz-central.md` (contendo URLs, versões, papéis, telas disponíveis e bloqueios) e verificar que `/privacidade` e `/termos` respondem no pacote estático `dist/` com superfície sólida ("no glass"), navegação consistente, CSP estrita e seção `#exclusao-dados`.

**Acceptance Scenarios**:

1. **Given** o repositório na branch principal e o servidor local de pré-visualização (`127.0.0.1:4173`), **When** a etapa inicial da auditoria (`#61`) é executada, **Then** a matriz central registra o comparativo entre ambiente local e endereços planejados (`vitrine.inspira.dev.br` e `painel.inspira.dev.br`), os papéis testáveis (`visitante`, `owner`, `admin`, `editor`, `viewer`, `platform_admin`), a disponibilidade real de cada tela e os bloqueios externos sem afirmar deploy remoto.
2. **Given** cada tela inventariada na matriz central, **When** um controle interativo (botão, link, campo, aba, menu ou ícone) é catalogado, **Then** o registro contém estado, largura testada (`360`, `390`, `768`, `1024`, `1440 px`, orientação horizontal e zoom `200%`), finalidade, comportamento esperado, comportamento observado, feedback visual/acessível e classificação (`P0` a `P3` e tipo: `problema_confirmado`, `risco_codigo`, `critica_ux` ou `nao_verificado`).
3. **Given** os requisitos da configuração Meta para Instagram (`#48`), **When** um visitante ou revisor da Meta acessa `/privacidade`, `/privacidade#exclusao-dados` ou `/termos`, **Then** encontra páginas públicas estáticas em português, sem uso dos termos proibidos em texto visível ao usuário, descrevendo o uso restrito à leitura de perfil e mídias da vitrine autorizada e o procedimento de desconexão e exclusão de dados.

---

### User Story 2 - Primeira Onda de Auditoria UX: Jornadas Essenciais da Descoberta à Publicação e Contato (`010-US2` — Issues `#62` a `#68`) (Priority: P1)

Como pessoa usuária (visitante ou proprietário de negócio), quero que toda a jornada principal — desde a descoberta no site institucional até o contato (`#62`), entrada, navegação e perfil no painel (`#63`), painel inicial e seleção de vitrines (`#64`), criação de vitrine em 3 passos (`#65`), edição manual de itens e categorias da vitrine (`#66`), prévia, rascunho, histórico e publicação (`#67`) e uso da vitrine pública em etapas até o WhatsApp (`#68`) — seja auditada em todas as larguras, temas e modos de acessibilidade, identificando e classificando qualquer falha funcional ou visual.

**Why this priority**: Cobre 100% do fluxo crítico de valor do produto (aquisição, ativação, edição, publicação e conversão de pedidos pelo visitante).

**Independent Test**: Executar o roteiro automatizado e de inspeção sobre as 7 jornadas (`#62` a `#68`) em `360`, `390`, `768`, `1024` e `1440 px`, orientação horizontal, zoom `200%`, temas claro/escuro, teclado, foco, contraste e movimento reduzido, preenchendo a matriz central com evidências e classificação `P0`–`P3`.

**Acceptance Scenarios**:

1. **Given** o site institucional multipágina (`/`, `/como-funciona/`, `/possibilidades/`, `/planos/`, `/orcamento/`), **When** auditado na issue `#62`, **Then** menu, apresentação, exemplos, filtros, carrossel, ofertas, dúvidas, rodapé, ilustração da Mila e bolinha fixa (com reação a hover/foco e pausa em `prefers-reduced-motion: reduce`) têm todos os destinos e mensagens de contato verificados sem uso de termos proibidos.
2. **Given** a tela de autenticação, o cabeçalho, a navegação do painel e a tela de perfil (`#63` e `#64`), **When** auditados com login, cancelamento, modo local, sessão expirada, alternância de tema, avatar, máscara de WhatsApp, seleção de até 8 interesses (incluindo `outro:`), lista vazia/extensa de vitrines, nomes longos e distinção entre editar/visualizar/publicar, **Then** cada controle e estado é verificado e registrado na matriz central.
3. **Given** o assistente de criação de vitrine (`#65`) e o editor manual em cartões (`#66`), **When** testados do modelo ao endereço (incluindo retorno sem perda, conflito de endereço e duplo clique) e na inclusão, edição, remoção, ordenação, disponibilidade, fotos WebP, estrutura visual e modalidades de negociação (preço fixo, lance mínimo, doação e troca), **Then** todos os estados de validação, campos obrigatórios, vazios e recuperação são documentados com evidências.
4. **Given** o ciclo de rascunho, prévia assinada, publicação e restauração de versões (`#67`) e a vitrine pública em 3 etapas (`#68`), **When** auditados com alterações não salvas, falha, repetição, conflito de revisão, histórico de 5 versões, fidelidade entre prévia e vitrine publicada, caracteres especiais na mensagem do WhatsApp, estados vazios/erro/404 e ausência de controles administrativos no público, **Then** a matriz central registra o resultado completo por largura e dispositivo.

---

### User Story 3 - Segunda Onda de Auditoria UX: Fluxos Complementares e Administração da Plataforma (`010-US3` — Issues `#69` a `#72`) (Priority: P2)

Como proprietário de vitrine ou Operador Inspira, quero auditar os fluxos complementares de importação e exportação por planilha CSV (`#69`), solicitação e acompanhamento de customizações (`#70`), leitura de indicadores no painel de Insights (`#71`) e administração global da plataforma (`#72`), garantindo precisão nos dados, preservação contra perda acidental e isolamento rigoroso de permissões por papel.

**Why this priority**: Completa a cobertura de todas as funcionalidades entregues nas especificações `008` e `009`, combinando verificação AFK imediata com o checklist estruturado para o teste HITL com conta de operador (`#72`).

**Independent Test**: Executar os cenários de teste de importação CSV (`#69`), pedidos de customização (`#70`), Insights nos períodos `7d`/`30d`/`90d` (`#71`) e Administração da Plataforma (`#72`, em modo local simulado AFK e checklist HITL para conta real), validando todas as larguras e estados na matriz central.

**Acceptance Scenarios**:

1. **Given** uma vitrine de teste no editor (`#69`), **When** o usuário baixa o modelo CSV, importa planilhas com erros por linha, duplicatas e excesso de limite, cancela a operação ou aplica nos modos adicionar e substituir, **Then** a vitrine existente é preservada em caso de cancelamento/erro e a prévia de importação destaca cada linha e coluna afetada.
2. **Given** a tela de Pedidos de Customização (`#70`), **When** o usuário preenche, valida, enfrenta erro simulado, registra a solicitação e aciona opcionalmente o link de WhatsApp, **Then** os dados digitados são preservados após erro e a interface distingue claramente entre solicitação registrada na plataforma e abertura opcional de conversa no WhatsApp (sem envio automático).
3. **Given** o painel de Insights (`#71`) em períodos distintos (`7d`, `30d`, `90d`), **When** auditado com vitrine sem eventos, vitrine com valor zero em uma métrica e vitrine com tráfego completo, **Then** a interface distingue zero de ausência de dados e diferencia claramente visita, visualização de item, seleção de item e abertura do WhatsApp.
4. **Given** a visão de Administração da Plataforma (`#72`), **When** auditada por papel (`viewer`, `editor`, `admin`, `owner` vs. `platform_admin`), **Then** contas comuns permanecem bloqueadas (`403`), o operador visualiza visão geral de cotas, CMS institucional, modelos visuais, pedidos de customização e trilha de auditoria, e o roteiro HITL fica pronto para execução com a conta de teste autorizada pelo Lino.

---

### User Story 4 - Consolidação de Evidências, Priorização de Backlog e Governança de Bloqueios (`010-US4` — Issues `#73` e `#48`) (Priority: P2)

Como coordenador do projeto (Lino) ou equipe de engenharia, quero um relatório consolidado da auditoria (`#73`) que feche a cobertura de cenários por dispositivo, liste eventuais achados `P0`/`P1` pendentes, priorize oportunidades de simplificação nos 5 eixos (navegação, conta/tema, formulários, feedback e movimento) e mantenha atualizado o quadro de bloqueios humanos externos (`#48`, `#44` e `#72`), para orientar o próximo ciclo de implementação sem perguntas em aberto.

**Why this priority**: Transforma as inspeções individuais (`#61` a `#72`) em um plano acionável e priorizado de melhoria contínua do produto.

**Independent Test**: Verificar que `docs/auditoria-ux/relatorio-consolidado.md` sintetiza todas as jornadas `#61` a `#72`, valida 100% dos critérios de aceite da `#73` e referencia os bloqueios HITL sem deixar decisões técnicas em aberto.

**Acceptance Scenarios**:

1. **Given** as matrizes preenchidas das ondas 1 (`#62` a `#68`) e 2 (`#69` a `#72`), **When** a consolidação (`#73`) é concluída, **Then** o documento central apresenta o total de cenários executados/aplicáveis, jornadas concluídas por dispositivo, lista priorizada `P0`–`P3` com critério de aceite por achado e oportunidades de simplificação em navegação, conta/tema, formulários, feedback e movimento.
2. **Given** os itens que dependem de ação humana externa (`#48` console Meta e conta `@ganjastudio.br`, `#44` zona DNS/Cloudflare for SaaS, `#72` credencial remota de operador de teste), **When** reportados no plano e na consolidação, **Then** aparecem como bloqueios explícitos com responsável e passo a passo já decidido, nunca como perguntas abertas ou tarefas automáticas.

---

### Edge Cases

- **Ambiente de produção ainda não publicado ou protegido por desafio da borda durante `#61`**: A auditoria registra explicitamente o estado real observado nos domínios planejados (`vitrine.inspira.dev.br` e `painel.inspira.dev.br`) como bloqueio operacional externo quando aplicável, executa 100% da verificação funcional sobre o build local determinístico (`npm run build && npm run preview`) e jamais afirma que um deploy remoto ocorreu sem confirmação.
- **Telas ou fluxos que dependem de credenciais externas (Google OAuth real, Cloudflare for SaaS real, conta de operador real em `#72` ou aplicativo Meta em `#48`)**: O comportamento de interface, validação, segurança e banco é auditado localmente via modo de demonstração, PGlite e simuladores de API, enquanto a etapa remota é registrada na matriz como bloqueio HITL com checklist de aceite pronto para o Lino.
- **Zoom de `200%` e larguras estreitas (`360 px` e orientação horizontal `844×390`)**: Controles em barra fixa (cabeçalho Liquid Glass, barra de ações do editor e barra inferior móvel) são avaliados contra truncamento de rótulos, sobreposição da bolinha fixa e preservação de alvos mínimos de `44×44 px`.
- **Restrição terminológica em toda documentação e interface voltada ao usuário**: Qualquer texto novo de interface, páginas `/privacidade` e `/termos` ou exemplos voltados ao usuário utiliza exclusivamente o termo **vitrine** (e "itens da vitrine", "seções da vitrine"), evitando os termos proibidos pelos testes de qualidade (`test/marketing-build.test.mjs` e `test/portal-redesign-qa.test.mjs`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (Matriz Central e Comparativo de Ambientes — `#61`)**: O repositório DEVE manter em `docs/auditoria-ux/matriz-central.md` o inventário estruturado de URLs (produção planejada vs. desenvolvimento local), versões (commit SHA e migrações), papéis (`visitante`, `owner`, `admin`, `editor`, `viewer`, `platform_admin`), telas disponíveis, bloqueios HITL e relação completa de controles por tela e estado.
- **FR-002 (Grade Obrigatória de Dispositivos, Larguras e Acessibilidade — `#62` a `#72`)**: Cada jornada auditada DEVE ser verificada nas larguras de `360 px`, `390 px`, `768 px`, `1024 px` e `1440 px`, em orientação horizontal (`844×390 px`), com zoom de `200%`, nos temas claro e escuro, validando navegação por teclado, visibilidade de foco, alvos de toque `>= 44 px`, contraste WCAG AA/AAA e respeito a `prefers-reduced-motion: reduce` e `prefers-reduced-transparency: reduce`.
- **FR-003 (Taxonomia de Classificação de Achados — `#61` a `#73`)**: Todo achado registrado na matriz DEVE ser classificado simultaneamente por severidade (`P0` crítico/bloqueante, `P1` alto impacto funcional ou acessibilidade WCAG AA, `P2` médio/consistência, `P3` cosmético/oportunidade) e por natureza (`problema_confirmado`, `risco_codigo`, `critica_ux` ou `nao_verificado`), acompanhado de critério de aceite objetivo.
- **FR-004 (Cobertura Integral da Primeira Onda — `#62` a `#68`)**: A auditoria DEVE cobrir e documentar todas as 7 jornadas essenciais: descoberta institucional até o contato (`#62`), entrada/navegação/conta/perfil no painel (`#63`), início do painel e seleção de vitrines (`#64`), criação de vitrine em 3 passos (`#65`), edição manual de itens, categorias, estrutura e modalidades de negociação (`#66`), prévia assinada, rascunho, histórico e publicação (`#67`), e vitrine pública em etapas até a geração do link WhatsApp (`#68`).
- **FR-005 (Cobertura Integral da Segunda Onda — `#69` a `#72`)**: A auditoria DEVE cobrir e documentar os 4 fluxos complementares: importação e exportação de itens por planilha CSV (`#69`), solicitação e acompanhamento de customizações (`#70`), leitura dos Insights distinguindo zero de ausência de dados e estágios do funil (`#71`), e administração da plataforma por papel com verificação AFK local e roteiro HITL para conta de teste (`#72`).
- **FR-006 (Relatório Consolidado e Priorização nos 5 Eixos — `#73`)**: O documento `docs/auditoria-ux/relatorio-consolidado.md` DEVE consolidar a cobertura executada/aplicável por dispositivo, listar os itens `P0`/`P1` pendentes e registrar oportunidades priorizadas de simplificação em: (1) navegação, (2) conta e tema, (3) formulários, (4) feedback e estados de sistema, e (5) movimento e transições.
- **FR-007 (Páginas Institucionais de Conformidade Meta — `#48`)**: O pacote estático público (`web/privacidade/index.html` e `web/termos/index.html`) DEVE fornecer as páginas públicas de Política de Privacidade (`/privacidade`), Instruções de Exclusão de Dados (`/privacidade#exclusao-dados`) e Termos de Uso (`/termos`) exigidas no mapeamento `docs/instagram/configuracao-meta.md`, seguindo a direção visual sólida ("no glass"), CSP estrita (`script-src 'self'`, sem estilos ou scripts inline) e terminologia canônica ("vitrine").
- **FR-008 (Gestão Explícita de Bloqueios Humanos — `#48`, `#44`, `#72`)**: Ações que exigem credenciais ou operação humana em consoles externos (criação do aplicativo Meta, confirmação da conta `@ganjastudio.br` e *App Review* na `#48`; apontamento de zona DNS e Cloudflare for SaaS na `#44`; fornecimento de conta remota de operador de teste na `#72`) DEVEM ser documentadas como bloqueios explícitos com decisão técnica já tomada, sem criar tarefas automáticas que assumam credenciais inexistentes.

### Key Entities

- **Matriz de Auditoria UX (`AuditMatrix` / `docs/auditoria-ux/matriz-central.md`)**: Estrutura canônica que relaciona cada jornada (`#61` a `#72`), tela, controle interativo, estado (`default`, `hover`, `focus-visible`, `active`, `disabled`, `loading`, `error`, `empty`), viewport/modo de acessibilidade e resultado observado.
- **Achado de Auditoria (`AuditFinding`)**: Registro individual identificado por código (`UX-001`, `UX-002`, ...), issue de origem (`#62`–`#72`), severidade (`P0`–`P3`), categoria (`problema_confirmado`, `risco_codigo`, `critica_ux`, `nao_verificado`), eixo de simplificação (`navegacao`, `conta_tema`, `formularios`, `feedback`, `movimento`), evidência e critério de aceite.
- **Bloqueio Operacional Humano (`HumanBlocker`)**: Item com decisão arquitetural já tomada pela engenharia, mas cuja execução final depende de ação humana externa (Lino ou proprietário da marca piloto), contendo identificador, issue associada, responsável, pré-requisitos entregues e passo a passo de desbloqueio.
- **Página Pública de Conformidade (`CompliancePage` / `/privacidade` e `/termos`)**: Superfície institucional estática exigida para validação de URLs públicas no console Meta (`#48`) e transparência com proprietários e visitantes das vitrines.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (Cobertura de Jornadas e Issues)**: 100% das 13 issues de Auditoria UX (`#61` a `#73`) e 100% dos itens técnicos da issue `#48` possuem artefatos, matrizes de verificação, decisões fechadas e critérios de aceite rastreáveis sem nenhuma pergunta em aberto.
- **SC-002 (Cobertura de Larguras e Modos de Acessibilidade)**: 100% das jornadas auditadas (`#62` a `#72`) contam com protocolo e verificação nas 5 larguras (`360`, `390`, `768`, `1024`, `1440 px`), orientação horizontal, zoom `200%`, temas claro e escuro, teclado/foco e movimento/transparência reduzidos.
- **SC-003 (Integridade da Suíte e Terminologia)**: 100% dos testes automatizados do repositório (`npm test`), empacotamento estático (`npm run build`) e simulação do Worker (`npx --yes wrangler@4.158.0 deploy --dry-run`) passam com zero regressões de CSP, RLS ou vocabulário ("vitrine").
- **SC-004 (Rastreabilidade de Bloqueios HITL)**: 100% das dependências humanas externas (`#48`, `#44`, `#72`) estão isoladas em checklist objetivo para o Lino, distinguindo claramente o que já está pronto no código do que requer ação no console externo.

## Assumptions

- As funcionalidades de produto das especificações `008-portal-redesign` (`#34` a `#38`) e `009-modular-admin-platform` (`#39` a `#44`) já estão implementadas na branch `main` (incluindo os refinamentos recentes das PRs `#45` a `#86`), servindo como base real sobre a qual a Auditoria UX (`#61` a `#73`) é executada.
- Nenhuma issue aberta no GitHub deve ser fechada automaticamente; o trabalho entrega o plano técnico completo, reconcilia o status real de cada issue e deixa o merge e o fechamento de issues sob controle do Lino.
- A execução opera exclusivamente nos limites gratuitos (Cloudflare Workers Free com Static Assets e Supabase Free), sem contratar planos pagos e sem realizar deploy remoto durante o planejamento.
