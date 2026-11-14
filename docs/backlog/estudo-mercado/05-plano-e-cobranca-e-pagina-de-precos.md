---
titulo: "[Estudo de mercado] Tela \"Plano e cobrança\" no painel e página de preços"
rotulos: estudo-mercado, cobranca, painel, enhancement
depende: 04
---
## Contexto

O estudo mostra que o Manychat revela limites só depois do clique e deixa a
carteira em branco sem erro (seção 4). A diretriz 6 pede transparência financeira.
Hoje `/planos/` diz "Assinatura em definição" e o painel não mostra plano nem fatura.

## Escopo

- **Painel:** seção "Plano e cobrança" (hash `#plano`), visível para o dono do
  tenant: plano atual, status (ativo, em tolerância até a data, suspenso), próximo
  vencimento, histórico de faturas com link para o comprovante do Asaas, botões
  "Mudar de plano" e "Cancelar assinatura" com resumo do efeito antes de confirmar.
  Membros que não são donos veem só o nome do plano.
- Recursos bloqueados no painel mostram o plano que os libera **antes** do clique
  (selo "Profissional" no botão, texto do que muda), nunca depois.
- **Site público:** `/planos/` lê `content/plans.json` (issue {{issue:01}}) e mostra
  os quatro planos, a implantação e o projeto sob medida, com o que cada um inclui e
  não inclui, limites e pré-requisitos (domínio próprio depende de vaga e do DNS).
- Comparação com a taxa de 9% do Beacons: "Vendendo mais de R$ 433 por mês, a taxa de
  9% já passa do Essencial". Sem nome de concorrente em tom depreciativo.
- Usar o componente de estado (`PB-02`), a trava de envio (`PB-03`) e a região de
  mensagens (`PB-01`) da auditoria, sem criar versões próprias.

## Fora de escopo

- Cupons, plano anual e nota fiscal automática.
- Faturas de consultoria (seguem por orçamento; podem entrar depois na mesma tela).

## Critérios de aceite

- [ ] Em 1280 e 375 px, nos temas claro e escuro, o dono vê plano, status e
      vencimento; contraste ≥ 4,5:1 (capturas no PR).
- [ ] Falha ao carregar a cobrança mostra erro com "Tentar de novo", nunca "sem faturas".
- [ ] Clique duplo em "Mudar de plano" gera um único checkout.
- [ ] `/planos/` mostra os preços de `content/plans.json`; mudar o JSON muda a página
      no `npm run build`.
- [ ] Todo recurso pago no painel exibe o plano necessário sem precisar clicar.
- [ ] O teste de terminologia passa (sempre "vitrine").

## Dependências

- {{issue:04}} `04-ciclo-da-assinatura.md`.
- Auditoria: `PB-01`, `PB-02` e `PB-03` (`docs/auditoria-ux/relatorio-consolidado.md`, seção 6.1).

## Referências

- Estudo: [seções 4, 5 e 7 (diretrizes 1 e 6)](../../market-study-2026.md#7-diretrizes-do-painel).
- `DESIGN.md` e `docs/marketing-design.md` antes da interface.
