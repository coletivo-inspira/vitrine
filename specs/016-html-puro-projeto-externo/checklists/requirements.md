# Specification Quality Checklist: HTML puro em página emoldurada e em bloco, projeto externo e configurações por cliente

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-21
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Iteração 2 (2026-11-21): as 2 marcações [NEEDS CLARIFICATION] foram resolvidas pelo usuário. (1) Pacotes HTML só a partir do Essencial, com o Gratuito/Social bloqueado e convite ao plano, sem contratação automática: FR-056 a FR-060, US1 cenários 7 e 8, SC-011; nome do recurso e números de pacotes por plano ficam como suposição em Assumptions. (2) Comprovação de posse do domínio de destino antes da primeira ativação, por registro DNS TXT (preferido) ou arquivo em `/.well-known/`, mais a confirmação do operador; a verificação diária refaz a prova e suspende o redirecionamento se falhar; troca de domínio exige nova prova: FR-061 a FR-064, US4 cenários 1, 2, 8, 9 e 10, SC-012 e SC-013.
- Os números novos (FR-056 a FR-064) foram acrescentados nos grupos correspondentes para não mudar as referências de `research-usabilidade.md`.
- Endereços (`https://`, `/<endereço-da-vitrine>/<página>`, `/.well-known/…`), o nome do registro DNS de comprovação, parâmetros de campanha (`utm_*`) e `vitrine.json` aparecem nos requisitos porque são visíveis ao operador, ao proprietário ou ao visitante, não como escolha de implementação.
- Atributos da moldura, política de conteúdo, formato da mensagem de altura e código HTTP do redirecionamento ficam em Assumptions como restrições herdadas do ADR 0010 (aceito) ou padrões escolhidos, e na seção "Ponto de partida", que só descreve o que já existe no código.
- Iteração 1: o FR-004 misturava um alerta automático objetivo com um julgamento subjetivo (imitação de marca); a imitação passou para a lista de conferência do revisor (FR-028).
- Evidências de navegador real (capturas em `/opt/cursor/artifacts/`, não versionadas) estão em [`research-usabilidade.md`](../research-usabilidade.md).
