# Feature Specification: Oferta, portfólio e pedidos de orçamento

**Feature Branch**: `feat/vitrine-foundation`
**Created**: 2026-11-07
**Status**: Draft; catálogo local implementado, produto comercial não integrado.
**Input**: Gratuidade limitada, mensalidade opcional para endereço personalizado,
domínio próprio sob análise e exemplos de customizações com contato WhatsApp.

## User Scenarios & Testing

### US1 — Entender a oferta (P1)

Visitante compara plano básico e endereço personalizado antes de solicitar adesão.
Aceite: vê o que é gratuito, o que é mensalidade, limites e despesas excluídas;
pedido de domínio novo não aparece como registro gratuito incluído.

### US2 — Encontrar exemplo e pedir orçamento (P1)

Visitante abre um case e solicita algo semelhante. Aceite: link do projeto abre
o destino revisado; contato direciona ao WhatsApp da equipe com referência correta,
sem enviar mensagens automaticamente. Sem telefone configurado, não há botão ativo.

### US3 — Manter portfólio (P2)

Operador cadastra, revisa, publica, ordena e arquiva exemplos. Aceite: somente cases
publicados aparecem; proprietário de vitrine não consegue alterar o portfólio global.
Etapa inicial: catálogo no repositório revisado em PR. Painel próprio é etapa posterior.

### US4 — Manter benefício de endereço (P2)

Operador confirma pagamento e período, valida hostname e ativa benefício.
Aceite: alteração de plano feita pelo próprio cliente não libera DNS ou domínio;
vencimento não apaga conteúdo; vínculo suspenso retorna à vitrine básica.

### Edge Cases

- Nome de subdomínio já usado no inventário é indisponível, mesmo sem vitrine cadastrada.
- Domínio não verificado ou incompatível permanece em análise, sem promessa de ativação.
- Rascunho de case não aparece na projeção; repositório público não é espaço privado.
- Cancelamento preserva conteúdo e não reatribui automaticamente hostname anterior.
- Caso removido não gera referência enganosa no novo pedido de orçamento.

## Requirements

- **FR-001**: Oferta DEVE separar acesso básico, assinatura de endereço e orçamento de implementação.
- **FR-002**: Registro e renovação de domínio NÃO DEVEM ser apresentados como incluídos na mensalidade.
- **FR-003**: Portfólio DEVE conter título, link, resumo, categoria, tags, ordem, destaque e publicação.
- **FR-004**: Somente operadores Inspira DEVEM editar o portfólio e confirmar direitos comerciais.
- **FR-005**: Pedido de orçamento DEVE permitir referência a um case ou pedido sem referência.
- **FR-006**: Ausência de contato configurado NÃO DEVE direcionar a número fictício.
- **FR-007**: Ativação de endereço DEVE depender de disponibilidade, propriedade e confirmação de pagamento.
- **FR-008**: Suspensão premium NÃO DEVE excluir rascunhos nem apagar a vitrine básica.
- **FR-009**: Conteúdo de cliente e operador NÃO DEVE conceder privilégio administrativo.
- **FR-010**: Cobrança e infraestrutura NÃO DEVEM contratar serviços pagos automaticamente.

### Key Entities

Assinatura, período pago, benefício de endereço, vínculo de domínio, case publicado,
pedido de orçamento e operador Inspira. Vocabulário em CONTEXT.md.

## Success Criteria

- Todos os cenários de visitante distinguem mensalidade de registro/renovação.
- Nenhum case despublicado aparece na listagem pública nos testes de aceite.
- Todas as tentativas de cliente alterar cobrança/portfólio são negadas.
- Todos os pedidos com referência levam o identificador correto ao atendimento.
- Todos os cenários de suspensão mantêm conteúdo e acesso pela URL básica.

## Assumptions

Preços R$ 10/R$ 15 e limites são propostas de docs/commercial-offer.md, não oferta
já anunciada. Sem checkout ou cobrança automática nesta etapa. Número WhatsApp
da equipe e links autorizados dos cases ainda não fornecidos. DNS exportado só
serve de inventário para revisão. Domínios externos dependem de análise técnica
e de custo antes de habilitar Cloudflare for SaaS. Interface requer trabalho visual
e testes próprios antes de ser descrita como implementada.
