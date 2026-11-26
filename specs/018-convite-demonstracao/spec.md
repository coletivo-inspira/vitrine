# Feature Specification: Convite de demonstração e equipe da vitrine

**Feature Branch**: `cursor/spec-018-convite-demonstracao-a7fe`

**Created**: 2026-11-26

**Status**: Draft (proposta; depende do [ADR 0016](../../docs/adr/0016-convite-demonstracao-e-cortesia.md), ainda proposto)

**Input**: Pedido do Lino: para trazer negócios para a Vitrine, a equipe Inspira monta por conta própria uma vitrine temporária para um negócio (por exemplo, um salão de cabeleireiro do bairro que tem os serviços no catálogo do WhatsApp), gera um convite e o envia ao dono. Quem abre o convite vê a vitrine pronta, entra no painel, fica com a vitrine e pode editá-la e chamar outras pessoas para a equipe (administrador ou funcionário). Como incentivo, o negócio ganha 3 meses do plano Profissional. Só o administrador do sistema, ou pessoas que ele autorizar para essa função, pode criar demonstrações e enviar convites.

Decisões do Lino em 2026-11-26: entregar primeiro a especificação (implementação depois); antes do aceite, a vitrine aparece só numa prévia fora do Google aberta pelo link do convite; no fim dos 3 meses, a vitrine volta ao Gratuito sem apagar nada.

Vocabulário em [`CONTEXT.md`](../../CONTEXT.md). Decisões anteriores: [ADR 0002](../../docs/adr/0002-site-access-boundary.md) (acesso por vitrine), [ADR 0005](../../docs/adr/0005-zero-cost-mvp.md) (custo zero), [ADR 0013](../../docs/adr/0013-plans-and-recurring-billing.md) (planos e assinatura) e a decisão 2 de [`docs/roadmap.md`](../../docs/roadmap.md) (equipe por vitrine; "fluxo de convites e permissões detalhadas ainda será definido"). Pesquisa em [`research.md`](research.md).

## Ponto de partida

- A migração `supabase/migrations/20261115000900_linktree_demo.sql` (issue #123) já criou a **demonstração**: vitrine sem dono (`owner_user_id` nulo), só com rascunho, prazo de 30 dias (`demo_expires_at`), bloqueio de publicação no banco (`DEMO_NOT_PUBLISHABLE`) e limpeza no `scheduled()` do Worker. Hoje a única origem é o Linktree (`demo_source = 'linktree'`).
- O convite ao dono existe (`invite_linktree_demo_owner`), mas pede o identificador interno (UUID) de uma conta que já existe. Não dá para mandar um link para quem ainda não tem conta.
- Os papéis por vitrine já existem no banco (`202611120005_multi_tenant_rbac_audit.sql`): proprietário (`sites.owner_user_id`), `admin`, `editor` e `viewer`, com o proprietário protegido e as mudanças de equipe gravadas em `audit_logs`. A rota `/api/sites/:id/members` aceita só o UUID da pessoa e o painel não tem aba de equipe.
- Os operadores da plataforma ficam em `platform_operators` com os papéis `platform_admin`, `support_operator` e `sponsor`. Só o `platform_admin` cria demonstrações.
- A assinatura é por organização cliente (`tenants` e `subscriptions`, ADR 0013), com `provider = 'manual'` para ações de um Operador Inspira. Uma vitrine sem organização ou sem assinatura válida recebe o Gratuito (`private.site_entitlements`).
- A prévia de rascunho (`/__preview/:siteId`, `src/preview-token.mjs`) exige sessão no painel; ela não serve para quem ainda não tem conta.
- O painel importa itens por planilha CSV (`web/portal/csv-catalog.js`, modelos `modelo-produtos.csv` e `modelo-servicos.csv`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operador monta uma demonstração para um negócio (Priority: P1)

Uma pessoa da equipe Inspira autorizada (administrador da plataforma ou operador de captação) cria, em "Administração da plataforma", uma vitrine de demonstração com o nome do negócio, o endereço sugerido e o modelo. Depois preenche os itens no editor de sempre, à mão ou pela planilha CSV, a partir do que o negócio já mostra em público (catálogo do WhatsApp, Instagram ou Linktree).

**Why this priority**: sem a demonstração pronta não há o que convidar; é a base de todas as outras histórias.

**Independent Test**: com uma conta `growth_operator`, criar a demonstração "Salão Exemplo" com o modelo de serviços, importar 12 serviços pela planilha, salvar o rascunho e conferir que o endereço público `/salao-exemplo` responde `404`.

**Acceptance Scenarios**:

1. **Given** um operador de captação no painel, **When** abre "Administração da plataforma > Demonstrações" e toca em "Nova demonstração", **Then** informa nome do negócio, endereço sugerido, tipo de vitrine e modelo, e a demonstração aparece na lista com a situação "Sem convite" e o prazo "Apagada em 30 dias se ninguém aceitar".
2. **Given** a demonstração criada, **When** o operador a abre, **Then** usa o mesmo editor das vitrines (itens, blocos, fotos, seções e planilha CSV), com a faixa fixa "Demonstração: não publicada" e sem o botão "Publicar".
3. **Given** um endereço sugerido já usado por outra vitrine, **When** o operador salva, **Then** vê "Este endereço já está em uso" e a demonstração não é criada.
4. **Given** uma pessoa sem papel de operador, ou com papel `support_operator` ou `sponsor`, **When** chama qualquer rota de demonstração, **Then** recebe `403` e nada é gravado.
5. **Given** um operador de captação, **When** tenta abrir ou editar uma vitrine que já tem dono, **Then** recebe `404`; ele só enxerga demonstrações sem dono.
6. **Given** a demonstração perto do fim do prazo, **When** o operador toca em "Prorrogar", **Then** o prazo ganha mais 30 dias, até no máximo 90 dias desde a criação.
7. **Given** a demonstração criada, editada ou prorrogada, **When** a auditoria é consultada, **Then** cada ação aparece com o autor e a data.

---

### User Story 2 - Operador gera o convite e o envia pelo próprio WhatsApp (Priority: P1)

Com a demonstração pronta, o operador gera um link de convite e o painel monta uma mensagem pronta para enviar do WhatsApp do próprio operador ao número do negócio. A Vitrine não manda a mensagem.

**Why this priority**: é o canal de contato com o negócio; sem ele a demonstração não chega a ninguém.

**Independent Test**: gerar o convite, copiar o link, abrir o link `wa.me` montado com o número de teste e conferir o texto; gerar um segundo convite e conferir que o primeiro deixou de abrir.

**Acceptance Scenarios**:

1. **Given** uma demonstração vigente, **When** o operador toca em "Gerar convite", **Then** vê o link do convite uma única vez, o prazo ("vale por 7 dias") e os botões "Copiar link" e "Abrir no WhatsApp".
2. **Given** o operador informa o número do negócio, **When** toca em "Abrir no WhatsApp", **Then** abre `https://wa.me/<número>?text=...` com a mensagem pronta editável (identificação da Inspira, o que foi preparado, os 3 meses do Profissional, o link e "Se não tiver interesse, responda NÃO e apagamos tudo"), e o número não é gravado em lugar nenhum.
3. **Given** um convite ainda aberto, **When** o operador gera outro para a mesma demonstração, **Then** o anterior é revogado e deixa de abrir.
4. **Given** um convite aberto, **When** o operador toca em "Revogar", **Then** o link deixa de abrir na hora.
5. **Given** a lista de demonstrações, **When** o operador a consulta, **Then** vê para cada uma a situação ("Sem convite", "Convite enviado", "Convite aberto", "Aceita", "Recusada" ou "Vencida"), a data da primeira abertura da prévia e o prazo.
6. **Given** a demonstração vence em menos de 7 dias, **When** o convite é gerado, **Then** o prazo do convite é o da demonstração.

---

### User Story 3 - Dono abre o convite, vê a vitrine e fica com ela (Priority: P1)

O dono do negócio toca no link, vê a vitrine montada para ele sem precisar entrar, e decide: "Quero esta vitrine" (entra ou cria conta e vira proprietário, com 3 meses do Profissional) ou "Não tenho interesse" (a demonstração é apagada).

**Why this priority**: é a conversão; é o momento em que a vitrine ganha dono e pode ir ao ar.

**Independent Test**: abrir o link do convite numa janela anônima em 375 px, ver a prévia, tocar em "Quero esta vitrine", entrar com Google, aceitar e cair no editor da vitrine como proprietário, com o plano "Profissional (cortesia até dd/mm/aaaa)"; publicar e ver o endereço público no ar.

**Acceptance Scenarios**:

1. **Given** um convite vigente, **When** qualquer pessoa abre o link, **Then** vê a vitrine como ela ficaria publicada (só os campos públicos, sem botões de pedido ativos), com a faixa "Demonstração preparada pela Vitrine Inspira para <nome do negócio>" e os botões "Quero esta vitrine" e "Não tenho interesse".
2. **Given** a página do convite, **When** é inspecionada, **Then** tem `noindex, nofollow`, não é guardada em cache compartilhado e não envia o endereço como referência a outros sites.
3. **Given** "Quero esta vitrine" sem sessão, **When** a pessoa entra ou cria conta pelos métodos de entrada ligados, **Then** volta para a confirmação do convite sem precisar abrir o link de novo.
4. **Given** a confirmação "Ficar com a vitrine <nome>", **When** a pessoa aceita, **Then** vira proprietária, a demonstração deixa de ser demonstração (sem prazo de remoção), uma organização cliente é criada para ela com 3 meses do Profissional em cortesia, e ela cai no editor com o aviso "Revise e publique quando quiser".
5. **Given** o aceite concluído, **When** a proprietária publica, **Then** a vitrine vai ao ar no endereço público pelo fluxo normal.
6. **Given** "Não tenho interesse", **When** a pessoa confirma, **Then** a demonstração, o rascunho e as fotos são apagados, o convite deixa de abrir e a página mostra "Pronto, apagamos a demonstração", sem exigir conta.
7. **Given** um link inválido, vencido, revogado, já usado ou de uma demonstração apagada, **When** alguém o abre, **Then** vê a mesma página "Este convite não está mais disponível", sem dizer o motivo.
8. **Given** a pessoa já recebeu uma cortesia antes, **When** aceita outra demonstração, **Then** fica com a vitrine no Gratuito e vê "A cortesia do Profissional já foi usada nesta conta".

---

### User Story 4 - Fim da cortesia: a vitrine volta ao Gratuito sem perder nada (Priority: P2)

Depois de 3 meses, se a pessoa não assinou, a vitrine continua no ar com os recursos do Gratuito. Ela é avisada antes.

**Why this priority**: evita cobrança surpresa e vitrine fora do ar, que destruiriam a confiança criada pelo convite.

**Independent Test**: com o relógio simulado, levar uma cortesia ao fim; conferir os avisos de 15 e 3 dias, o plano Gratuito nos direitos da vitrine, a vitrine publicada ainda no ar e todos os itens ainda no rascunho.

**Acceptance Scenarios**:

1. **Given** uma cortesia que termina em 15 dias, e depois em 3, **When** a proprietária abre o painel, **Then** vê "Sua cortesia do Profissional termina em dd/mm. Depois a vitrine continua no ar no plano Gratuito" e o botão "Ver planos".
2. **Given** a data final da cortesia, **When** a data passa, **Then** a cortesia deixa de valer na hora, sem os 7 dias de tolerância e sem cobrança, e a rotina agendada do Worker (de hora em hora) registra "fim da cortesia" na auditoria uma única vez.
3. **Given** a cortesia terminada, **When** os direitos da vitrine são consultados, **Then** valem os do Gratuito, e a versão já publicada continua no ar como está.
4. **Given** um rascunho com mais itens ativos que o limite do Gratuito, **When** a proprietária vai publicar, **Then** o painel pede para escolher quais itens ficam ativos (os primeiros, na ordem da vitrine, vêm marcados) e os demais ficam ocultos, sem ser apagados.
5. **Given** blocos de itens criados durante a cortesia, **When** a cortesia termina, **Then** os blocos que já existiam continuam (regra atual de `assertItemBlocksAllowed`), mas não é possível criar novos acima do limite do Gratuito.
6. **Given** a proprietária contrata um plano durante a cortesia, **When** a assinatura ainda está pendente, **Then** a cortesia continua valendo; **When** o pagamento é confirmado, **Then** valem os direitos do plano pago e a cortesia deixa de contar, sem período duplicado.

---

### User Story 5 - Proprietário monta a equipe da vitrine por link (Priority: P2)

A proprietária chama outras pessoas para a vitrine, escolhendo o papel: administrador (cuida de tudo, menos da propriedade), funcionário (edita itens e rascunho, não publica nem mexe na equipe) ou somente leitura.

**Why this priority**: o negócio raramente é uma pessoa só; mas a vitrine já funciona sem equipe.

**Independent Test**: como proprietária, gerar um convite de funcionário, abri-lo com outra conta, aceitar, editar um item e conferir que "Publicar" e a aba "Equipe" não aparecem para ela; remover a funcionária e conferir que a vitrine sumiu de "Minhas Vitrines" dela.

**Acceptance Scenarios**:

1. **Given** a aba "Equipe" da vitrine, **When** a proprietária a abre, **Then** vê os membros pelo nome de exibição (nunca pelo identificador interno) e o papel, os convites pendentes e o botão "Convidar pessoa".
2. **Given** "Convidar pessoa", **When** escolhe o papel e gera o convite, **Then** recebe o link uma única vez, com "Copiar link" e "Abrir no WhatsApp", e o convite vale por 7 dias.
3. **Given** um administrador da vitrine, **When** convida, **Then** só pode escolher funcionário ou somente leitura; convidar administrador é só da proprietária.
4. **Given** uma pessoa com o link, **When** entra no painel e aceita, **Then** passa a ver só aquela vitrine com o papel do convite; o acesso não se estende às outras vitrines da proprietária.
5. **Given** um funcionário (`editor`), **When** usa o painel, **Then** edita itens, blocos, fotos e rascunho, mas não publica, não restaura versões, não mexe em configurações da vitrine nem na equipe, inclusive por chamada direta à API.
6. **Given** a proprietária ou um administrador, **When** muda o papel ou remove alguém, **Then** a mudança vale na hora e fica na auditoria; a proprietária não pode ser removida nem rebaixada.
7. **Given** a pessoa que abriu o convite já é membro ou proprietária, **When** aceita, **Then** vê "Você já faz parte desta vitrine" e nada muda.

---

### User Story 6 - Administrador da plataforma autoriza operadores de captação (Priority: P3)

O administrador da plataforma dá ou retira, de outra pessoa, o papel de operador de captação: alguém que só cria demonstrações e convites.

**Why this priority**: hoje o Lino faz tudo sozinho; o papel permite delegar a prospecção sem abrir cobrança, CMS institucional ou vitrines dos clientes.

**Independent Test**: como `platform_admin`, conceder o papel a uma conta; com ela, criar uma demonstração e conferir `403` em CMS, cobrança, patrocinadores e qualquer vitrine com dono.

**Acceptance Scenarios**:

1. **Given** "Administração da plataforma > Operadores", **When** o administrador informa a conta e concede "Operador de captação", **Then** a pessoa passa a ver só a área "Demonstrações".
2. **Given** um operador de captação, **When** chama rotas de CMS, modelos, cobrança, patrocinadores ou operadores, **Then** recebe `403`.
3. **Given** o papel retirado, **When** a pessoa volta ao painel, **Then** não vê mais "Demonstrações"; as demonstrações que ela criou continuam e passam a ser geridas pelo administrador.
4. **Given** qualquer concessão ou retirada, **When** a auditoria é consultada, **Then** aparecem o autor, a pessoa e a data.

---

### Edge Cases

- Duas pessoas abrem o mesmo convite de dono e tocam em "Quero esta vitrine" quase juntas: só a primeira vira proprietária; a segunda vê "Este convite não está mais disponível".
- O convite é encaminhado a outra pessoa: quem aceitar primeiro fica com a vitrine. O operador vê na lista quem aceitou e pode, com o administrador da plataforma, corrigir por ação auditada (transferência fora do escopo desta spec).
- O dono responde "NÃO" no WhatsApp em vez de tocar no botão: o operador toca em "Apagar demonstração" na lista e a remoção é a mesma de "Não tenho interesse".
- A demonstração vence com um convite aberto: o convite deixa de abrir e a limpeza apaga a demonstração no prazo normal.
- O operador muda o rascunho depois de enviar o convite: a prévia mostra sempre o rascunho atual.
- O endereço sugerido não agrada ao dono: depois do aceite ele troca pelo fluxo normal de endereço, se existir; trocar o endereço não faz parte desta spec.
- Fotos copiadas do catálogo do negócio: ficam só na demonstração e são apagadas com ela; nada vai para o portfólio ou para a divulgação sem autorização escrita (como no piloto Guavira, `BLK-GUAVIRA-01`).
- A pessoa que aceita já tem vitrines em outra organização cliente: a vitrine aceita entra numa organização nova, com a própria assinatura, sem mexer nas outras.
- Robô tentando adivinhar links de convite: o token tem 256 bits aleatórios, e as tentativas inválidas têm limite por endereço IP no Worker.
- Vitrine pública: nada desta spec muda artefatos publicados (Princípio I); a prévia do convite é gerada na hora e nunca vira publicação.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Criar, editar, prorrogar, apagar demonstrações e gerar ou revogar convites de dono DEVE ser permitido só ao `platform_admin` e ao novo papel `growth_operator` (operador de captação), verificado no servidor e no banco. O `support_operator` e o `sponsor` NÃO DEVEM ter essas permissões.
- **FR-002**: O `growth_operator` DEVE ler e editar só vitrines de demonstração sem dono; vitrines com dono respondem `404` para ele, inclusive por chamada direta.
- **FR-003**: A demonstração DEVE aceitar as origens `linktree` (fluxo atual), `manual` e `csv`; a importação do Linktree passa a ser permitida também ao `growth_operator`.
- **FR-004**: A demonstração DEVE continuar impossível de publicar antes do aceite (bloqueio `DEMO_NOT_PUBLISHABLE` mantido) e DEVE ser apagada, com rascunho e fotos, 30 dias depois da criação, salvo prorrogação (FR-005).
- **FR-005**: A prorrogação DEVE somar 30 dias ao prazo, sem passar de 90 dias desde a criação, e ficar na auditoria.
- **FR-006**: O convite DEVE ser um token aleatório de 32 bytes (256 bits) em base64url, mostrado uma única vez; o banco DEVE guardar só o hash SHA-256 do token, nunca o token em claro.
- **FR-007**: O convite DEVE ter tipo (`demo_owner` ou `team`), vitrine, papel (para `team`), autor, prazo (7 dias, limitado ao prazo da demonstração), estado (aberto, aceito, recusado, revogado ou vencido) e data da primeira abertura, e DEVE ser de uso único.
- **FR-008**: Cada demonstração DEVE ter no máximo um convite de dono aberto; gerar outro revoga o anterior.
- **FR-009**: A página do convite (`/convite/<token>`) DEVE funcionar sem sessão, mostrar só a projeção pública do rascunho (a mesma de `compilePublicStorefront`, sem ações ativas), com os direitos do Profissional para a prévia, e responder com `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, no-store` e `Referrer-Policy: no-referrer`.
- **FR-010**: Token inválido, vencido, revogado, usado ou de demonstração apagada DEVE ter a mesma resposta (`404` e a mesma página), sem revelar o motivo; tentativas inválidas DEVEM ter limite por endereço IP no Worker.
- **FR-011**: O token NÃO DEVE aparecer em logs, auditoria, mensagens de erro, analytics ou cabeçalho `Referer`; durante o login, o painel o guarda só na sessão do navegador (`sessionStorage`) e o apaga depois do aceite ou da recusa.
- **FR-012**: O aceite do convite de dono DEVE, numa única transação: tornar a pessoa proprietária; limpar `demo_source`, `demo_expires_at` e o prazo de remoção; marcar o convite como aceito; criar uma organização cliente da pessoa ligada à vitrine; e criar a cortesia (FR-014), se a pessoa ainda não tiver usado uma.
- **FR-013**: "Não tenho interesse" DEVE funcionar sem sessão, pedir confirmação e apagar a demonstração, o rascunho, as fotos e os convites; a auditoria guarda só que a demonstração foi recusada, com o endereço, sem dados de quem recusou.
- **FR-014**: A cortesia DEVE ser uma concessão do Profissional por 90 dias a partir do aceite, ligada à organização cliente da vitrine e separada da assinatura paga; cada conta recebe no máximo uma cortesia, e o administrador da plataforma pode conceder outra por ação auditada. Os direitos da vitrine DEVEM seguir esta ordem: assinatura paga que vale, senão cortesia vigente, senão Gratuito.
- **FR-015**: A cortesia DEVE terminar pela data, sem tolerância e sem cobrança; a rotina agendada do Worker (de hora em hora) registra o fim uma única vez na auditoria (`courtesy.ended`). Os direitos voltam ao Gratuito e nada em vitrine, rascunho, publicação ou equipe é apagado. Assinar durante a cortesia DEVE funcionar pelo fluxo atual de "Plano e cobrança", com a cortesia valendo até o pagamento ser confirmado.
- **FR-016**: O painel DEVE avisar a proprietária 15 e 3 dias antes do fim da cortesia, na mesma faixa dos avisos de assinatura (`web/portal/billing-notice.mjs`), sem e-mail ou WhatsApp automático.
- **FR-017**: Ao publicar com mais itens ativos que o plano permite, o painel DEVE oferecer a escolha dos itens que ficam ativos (os primeiros, na ordem da vitrine, já marcados) em vez de só mostrar o erro `ACTIVE_ITEMS_LIMIT_EXCEEDED`; os demais ficam ocultos, não apagados. O servidor continua recusando a publicação acima do limite.
- **FR-018**: A proprietária DEVE poder convidar `admin`, `editor` e `viewer`; um `admin` da vitrine DEVE poder convidar só `editor` e `viewer`; o convite de equipe segue FR-006, FR-007, FR-010 e FR-011, e cada vitrine tem no máximo 20 convites de equipe abertos.
- **FR-019**: O aceite do convite de equipe DEVE exigir sessão, criar a associação com o papel do convite pela mesma regra de `site_memberships` e recusar quem já é proprietário ou membro sem alterar nada.
- **FR-020**: As permissões por papel DEVEM ser as do banco atual: proprietário e `admin` publicam, restauram versões, mudam configurações e gerem a equipe (o `admin` não gere outro `admin`); `editor` ("Funcionário") edita rascunho, itens, blocos e fotos; `viewer` só lê. O painel DEVE esconder o que o papel não pode fazer, e o servidor DEVE recusar com `403`.
- **FR-021**: A aba "Equipe" DEVE mostrar o nome de exibição do perfil de cada membro (ou "Pessoa sem nome" quando não houver), nunca o UUID, o e-mail ou o telefone.
- **FR-022**: Conceder e retirar o papel `growth_operator` DEVE ser só do `platform_admin`, por função auditada, como `grant_sponsor_role` e `revoke_sponsor_role`.
- **FR-023**: Toda criação, edição, prorrogação, remoção de demonstração, geração, revogação, abertura (só a primeira), aceite e recusa de convite e mudança de equipe DEVE ir para `audit_logs`, sem o token e sem o número do WhatsApp do negócio.
- **FR-024**: A Vitrine NÃO DEVE enviar mensagens: o convite sai do WhatsApp de quem o gerou, pelo link `wa.me`; o número informado para montar o link NÃO DEVE ser gravado.

### Key Entities

- **Demonstração**: vitrine sem dono, montada por um Operador Inspira a partir do conteúdo público de um negócio, só em rascunho, com prazo de remoção e origem (`linktree`, `manual` ou `csv`).
- **Convite**: link de uso único e com prazo que dá a quem o aceita a propriedade de uma demonstração (`demo_owner`) ou um papel na equipe de uma vitrine (`team`).
- **Cortesia**: concessão sem cobrança do plano Profissional por 90 dias, dada no aceite de uma demonstração, no máximo uma por conta; não é uma assinatura e perde a vez para uma assinatura paga.
- **Operador de captação**: Operador Inspira que só cria demonstrações e convites de dono (`growth_operator`).
- **Funcionário**: nome mostrado no painel para o papel `editor` da equipe da vitrine.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um operador monta uma demonstração com até 20 itens a partir de uma planilha e gera o convite em até 15 minutos.
- **SC-002**: O dono do negócio vai do toque no link à vitrine publicada em até 5 minutos, já com conta Google.
- **SC-003**: Nenhuma demonstração ou prévia de convite aparece em buscadores, conferido por teste dos cabeçalhos `noindex` de todas as respostas de `/convite/` e do endereço público da demonstração (`404`).
- **SC-004**: 100% dos testes de token inválido, vencido, revogado ou usado recebem a mesma resposta, sem efeito colateral.
- **SC-005**: Nenhum teste encontra o token, o número do WhatsApp do negócio ou dados de quem recusou em logs, auditoria ou tabelas.
- **SC-006**: Custo adicional R$ 0: nenhuma mensagem enviada pela plataforma e nenhum serviço novo contratado (ADR 0005).
- **SC-007**: A lista de demonstrações mostra a taxa de aceite (aceitas sobre convites enviados) para o Lino medir a captação.

## Assumptions

- O conteúdo da demonstração é o que o negócio já mostra em público. A equipe monta à mão ou por planilha; não existe API para exportar o catálogo do WhatsApp Business de outra pessoa (research R4).
- O primeiro contato com o negócio é pessoal e identificado (o operador se apresenta). A mensagem do convite traz como recusar, e a recusa apaga tudo (research R5).
- O login usa os métodos ligados no painel (hoje, Google; a spec 017 acrescenta outros). Esta spec não depende da 017.
- Os avisos de fim de cortesia usam a faixa de avisos de assinatura que já existe no painel (`web/portal/billing-notice.mjs`).
- Workers Free e Supabase Free atendem: nenhuma tabela grande, nenhum serviço novo; a limpeza já roda de hora em hora no `scheduled()`.

## Decisões propostas (revisar no PR)

Motivo, alternativas e riscos em [research.md](research.md).

| Decisão | Requisitos |
|---|---|
| D1. Token de 256 bits guardado como hash SHA-256, de uso único, 7 dias | FR-006 a FR-011 |
| D2. Prévia do convite sem sessão, `noindex`, gerada na hora do rascunho | FR-009, US3 |
| D3. Papel `growth_operator` separado do `support_operator` | FR-001, FR-002, FR-022, US6 |
| D4. Cortesia como concessão separada da assinatura, terminada pela data e sem tolerância | FR-014 a FR-016, US4 |
| D5. Uma cortesia por conta, com organização nova por vitrine aceita | FR-012, FR-014 |
| D6. Recusa sem conta apaga tudo na hora | FR-013 |
| D7. Escolha dos itens ativos ao publicar acima do limite | FR-017 |

## Fora de escopo

- Varredura automática da internet para achar negócios e raspagem do catálogo do WhatsApp, do Instagram ou de outros sites (termos da Meta, LGPD e direitos sobre fotos; research R4 e R5).
- Envio automático de convites por WhatsApp, e-mail ou SMS.
- Cobrança automática ao fim da cortesia; a pessoa assina pelo fluxo normal de "Plano e cobrança" se quiser.
- Publicar a demonstração antes do aceite, mesmo com faixa de "Demonstração".
- Transferir a propriedade de uma vitrine entre pessoas.
- Permissões novas além dos quatro papéis atuais, como "responder pedidos e lances" para funcionário; ficam como evolução depois desta spec.
- Trocar o endereço da vitrine depois do aceite.
