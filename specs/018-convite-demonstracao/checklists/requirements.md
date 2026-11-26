# Specification Quality Checklist: Convite de demonstração e equipe da vitrine

**Purpose**: Validar a completude e a qualidade da especificação antes do planejamento detalhado.
**Created**: 2026-11-26
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] Foca no valor para o Operador Inspira, para o dono do negócio e para a equipe da vitrine.
- [x] Escrita para quem não é técnico; nomes de rotas, tabelas e cabeçalhos aparecem só onde o requisito de segurança exige.
- [x] Todas as seções obrigatórias preenchidas.

## Requirement Completeness

- [x] Nenhum marcador `[NEEDS CLARIFICATION]` restante; as três dúvidas de escopo (só especificação, prévia `noindex` e volta ao Gratuito) foram respondidas pelo Lino em 2026-11-26.
- [x] Requisitos testáveis e sem ambiguidade.
- [x] Critérios de sucesso mensuráveis.
- [x] Critérios de sucesso sem detalhe de implementação, exceto o custo zero (ADR 0005) e o cabeçalho `noindex`, que é o artefato a conferir.
- [x] Cenários de aceite definidos para todas as histórias.
- [x] Casos de borda identificados (aceite simultâneo, convite encaminhado, recusa pelo WhatsApp, demonstração vencida, fotos do negócio, robôs).
- [x] Escopo delimitado em "Fora de escopo".
- [x] Dependências e suposições identificadas (métodos de entrada, avisos de assinatura existentes, Workers Free e Supabase Free).

## Feature Readiness

- [x] Todo requisito funcional tem critério de aceite em alguma história.
- [x] As histórias cobrem os fluxos principais: montar, convidar, aceitar ou recusar, fim da cortesia, equipe e operadores.
- [x] A funcionalidade atende aos resultados mensuráveis definidos.
- [x] Nenhum detalhe de implementação vaza para os cenários além do necessário.

## Notes

- O ADR 0016 é proposta: o Lino precisa ratificá-lo antes de a implementação ir para produção.
- A regra de blocos no fim da cortesia segue a regra atual (`assertItemBlocksAllowed`: os blocos que já existiam continuam, mas não se criam novos acima do plano). Isso substitui a ideia de "juntar os blocos" da pergunta feita ao Lino.
