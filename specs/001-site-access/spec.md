# Feature Specification: Propriedade e acesso por vitrine

**Feature Branch**: `feat/vitrine-foundation`

**Created**: 2026-11-07

**Status**: Camada SQL implementada e validada localmente; integração Supabase pendente.

**Input**: Uma pessoa administra várias vitrines, cada uma com sua própria equipe;
um funcionário pode acessar apenas uma das pizzarias do mesmo proprietário.

## User Scenarios & Testing

### User Story 1 - Administrar várias vitrines (Priority: P1)

Como proprietário, quero acessar minhas vitrines separadamente para administrar
negócios distintos sem misturar seu conteúdo.

**Why this priority**: É a base do portal multivitrine solicitado.

**Independent Test**: Uma pessoa com duas vitrines consegue consultar e editar
o rascunho de cada uma, sem alterar a outra.

**Acceptance Scenarios**:

1. **Given** proprietário de A e B, **When** abre a lista administrativa,
   **Then** encontra A e B.
2. **Given** rascunhos distintos em A e B, **When** salva uma mudança em A,
   **Then** B permanece intacta.

### User Story 2 - Restringir funcionário a uma vitrine (Priority: P1)

Como proprietário, quero que o acesso concedido a um funcionário seja limitado
à vitrine correspondente, preservando os demais negócios.

**Why this priority**: Evita exposição de dados entre negócios do mesmo dono.

**Independent Test**: Com uma associação já concedida em A, o membro consulta
A e tem negada qualquer consulta administrativa a B.

**Acceptance Scenarios**:

1. **Given** membro somente de A, **When** lista suas vitrines,
   **Then** B não aparece, ainda que A e B tenham o mesmo dono.
2. **Given** membro somente de A, **When** tenta consultar ou alterar B
   diretamente, **Then** o acesso é negado e nenhum conteúdo de B é retornado.
3. **Given** membro de A, **When** tenta atribuir a si acesso a B ou propriedade,
   **Then** a operação é negada sem alterar vínculos existentes.

### Edge Cases

- Visitante sem sessão não acessa rascunhos de nenhuma vitrine.
- Identificador de vitrine substituído manualmente não contorna o limite.
- Uma pessoa pode ser dona de A e membro de B; os vínculos são independentes.
- Conteúdo publicado continua consultável por visitantes, sem acesso à administração.

## Requirements

### Functional Requirements

- **FR-001**: O portal DEVE permitir que uma pessoa seja proprietária de várias vitrines.
- **FR-002**: Cada vitrine DEVE ter sua própria equipe de acesso.
- **FR-003**: Listagem e operações administrativas DEVEM verificar acesso à vitrine específica.
- **FR-004**: Compartilhar proprietário NÃO DEVE conceder acesso entre vitrines.
- **FR-005**: Membros NÃO DEVEM conseguir elevar suas próprias permissões.
- **FR-006**: Alterar o rascunho de uma vitrine NÃO DEVE modificar o de outra.
- **FR-007**: Ausência de sessão válida DEVE impedir leitura e escrita administrativas.

### Key Entities

- **Proprietário**: pessoa responsável por uma ou mais vitrines.
- **Vitrine**: negócio publicado e seu ambiente de administração.
- **Membro**: pessoa com vínculo de acesso a uma vitrine específica.
- **Equipe da vitrine**: conjunto de membros daquela vitrine.

## Success Criteria

### Measurable Outcomes

- **SC-001**: No cenário de duas vitrines do mesmo dono, 100% das tentativas
  administrativas de membro exclusivo de A contra B são negadas.
- **SC-002**: No cenário de edição independente, nenhuma alteração em A modifica B.
- **SC-003**: Proprietário de duas vitrines consegue localizar e abrir ambas;
  membro exclusivo de uma encontra somente a autorizada.
- **SC-004**: Todas as tentativas sem sessão de ler rascunhos ou alterar conteúdo
  são negadas na matriz de aceite.

## Assumptions

- Esta fatia define o limite de acesso, não o fluxo de cadastro ou convites.
- Para o aceite, vínculos de membros são previamente preparados; a experiência
  de concessão, revogação e recuperação será especificada antes da liberação pública.
- Papéis detalhados, transferência e múltiplos proprietários estão fora desta fatia.
- Supabase Auth + Postgres foi escolhido; configuração real e implementação seguem pendentes.
- Cloudflare foi escolhida para hospedagem; não determina o provedor de identidade.
- Base transversal: docs/architecture.md, docs/roadmap.md e ADR 0002.
