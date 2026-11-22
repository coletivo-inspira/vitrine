# Specification Quality Checklist: Login múltiplo no painel

**Purpose**: Validar a completude e a qualidade da especificação antes do planejamento detalhado.
**Created**: 2026-11-22
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] Foca no valor para a pessoa que entra no painel e nas necessidades do negócio.
- [x] Escrita para quem não é técnico; nomes de rotas aparecem só onde o contrato exige.
- [x] Todas as seções obrigatórias preenchidas.

## Requirement Completeness

- [x] Nenhum marcador `[NEEDS CLARIFICATION]` restante; dúvidas viraram decisões registradas em `research.md` e no ADR 0015.
- [x] Requisitos testáveis e sem ambiguidade.
- [x] Critérios de sucesso mensuráveis.
- [x] Critérios de sucesso sem detalhe de implementação, exceto o custo zero, que é restrição do ADR 0005.
- [x] Cenários de aceite definidos para todas as histórias.
- [x] Casos de borda identificados (nono dígito, número estrangeiro, WhatsApp fora do ar, link em outro navegador).
- [x] Escopo delimitado em "Fora de escopo".
- [x] Dependências e suposições identificadas (passos humanos BLK-SMTP-01, BLK-WA-01, BLK-HOOK-01 e BLK-TURNSTILE-01).

## Feature Readiness

- [x] Todo requisito funcional tem critério de aceite em alguma história.
- [x] As histórias cobrem os fluxos principais: tela, e-mail, código pelo WhatsApp, telefone e senha, abuso.
- [x] A funcionalidade atende aos resultados mensuráveis definidos.
- [x] Nenhum detalhe de implementação vaza para os cenários além do necessário.

## Notes

- A emenda da constituição (0.2.0) e o ADR 0015 são propostas: o Lino precisa ratificá-los antes de ligar os métodos em produção.
- Preços da Meta e cotas do SMTP DEVEM ser reconferidos no momento de ligar cada método.
