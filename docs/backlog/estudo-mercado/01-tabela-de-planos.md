---
titulo: "[Estudo de mercado] Tabela de planos como fonte única (content/plans.json)"
rotulos: estudo-mercado, cobranca, documentation
depende:
---
## Contexto

O [ADR 0013](../../adr/0013-plans-and-recurring-billing.md) e a
[oferta comercial](../../commercial-offer.md) já trazem a tabela de planos adotada
pelo Lino (escolha 2.b): Gratuito/Social R$ 0, Essencial R$ 39, Profissional R$ 89 e
Equipe R$ 169, mais Implantação Chave na Mão (R$ 290 a 490) e projetos a partir de
R$ 950. Hoje a tabela existe só em texto. A página de preços, o painel e o banco
vão precisar dos mesmos números, e três cópias divergem com o tempo.

## Escopo

- Criar `content/plans.json` com, por plano: código (`free`, `essencial`,
  `profissional`, `equipe`), nome, preço mensal em centavos, limites (vitrines,
  itens ativos por vitrine, blocos de itens) e lista de recursos (`custom_domain`,
  `inspira_subdomain`, `local_seo`, `public_json`, `quote_webhook`,
  `conversion_reports`, `multi_vitrine`, `support_badge_optional`).
- Incluir os serviços avulsos (implantação e projeto) com faixa de preço.
- Validador em `src/` com teste: preços inteiros em centavos, códigos únicos,
  limites dentro do teto técnico de 100 itens (ADR 0005), recursos de uma lista fechada.
- Teste que confere os preços da tabela do ADR 0013 e de `docs/commercial-offer.md`
  com o JSON (falha se alguém mudar um e esquecer o outro).
- Acrescentar a `CONTEXT.md` os termos **Plano**, **Assinatura**, **Recurso do plano**
  e **Tolerância**.
- Revisar `/termos/` e `/privacidade/` com o que muda quando houver cobrança
  (dados enviados ao Asaas, cancelamento, tolerância de 7 dias, nada apagado).

## Fora de escopo

- Tabelas no banco e liberação de recursos (issue {{issue:02}}).
- Exibir preços no site público (issue {{issue:05}}).

## Critérios de aceite

- [ ] `content/plans.json` existe e o validador passa em `npm test`.
- [ ] Mudar o preço do Essencial só no JSON faz o teste de coerência com o ADR 0013 falhar.
- [ ] Nenhum plano tem mais de 100 itens ativos por vitrine.
- [ ] `CONTEXT.md` define os quatro termos novos.
- [ ] Termos de uso e política de privacidade citam o Asaas como operador de
      pagamento e a política de tolerância, sem prometer processamento gratuito.
- [ ] Nenhum texto visível usa "catálogo" nem "cardápio" (teste de terminologia atual passa).

## Dependências

Nenhuma.

## Referências

- Estudo: [seção 5, Precificação adotada](../../market-study-2026.md#5-precificação-adotada-decisão-2b).
- ADR 0013, ADR 0007 (partes substituídas), ADR 0005 (teto de 100 itens).
