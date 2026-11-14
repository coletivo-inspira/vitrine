---
titulo: "[Estudo de mercado] Link de pagamento do próprio negócio por item"
rotulos: estudo-mercado, vitrine-publica, referencia-laurapires, enhancement
depende: 20
---
## Contexto

A plataforma não tem checkout nem cobrança do lojista, por decisão: o estudo e o
ADR 0013 mandam as vendas do lojista pelos links de pagamento dele (Mercado Pago,
Asaas do lojista), sem Stripe Connect e sem responsabilidade da plataforma por
estornos. A referência usa um link externo da Hotmart em todos os botões do curso;
é esse o caminho que cabe na Vitrine.

## Escopo

- Campo opcional por item, `paymentLink`, com `url` e `label` (padrão "Pagar no site
  do negócio", até 32 caracteres).
- Só `https://` de uma lista fechada de domínios de pagamento mantida no código (por
  exemplo `mpago.la`, `mpago.li`, `link.mercadopago.com.br`, `www.mercadopago.com.br`,
  `pay.hotmart.com`, `www.asaas.com`, `sandbox.asaas.com`, `pag.ae`,
  `pagseguro.uol.com.br`, `picpay.me`, `buy.stripe.com`, `pay.kiwify.com.br`,
  `www.sympla.com.br`). Fora da lista, o servidor recusa e pede para falar com a equipe.
- Aparece na página do item (issue {{issue:20}}), abaixo do controle de seleção,
  como ação secundária, e na etapa "Revisar e enviar" para os itens com link.
- Abre em nova aba com `rel="noopener noreferrer"` e o aviso "O pagamento é feito no
  site do negócio. A Vitrine Inspira não recebe nem guarda dados de pagamento."
- O WhatsApp continua sendo a ação principal.
- A contagem de cliques é a métrica agregada `payment_link_click` da issue
  {{issue:09}}, sem parâmetros do visitante.
- Termos de uso: parágrafo sobre a responsabilidade do negócio e do provedor
  escolhido, no mesmo texto revisado pela issue {{issue:01}}.

## Fora de escopo

- Gerar cobrança, Pix, boleto ou link pelo painel; API de qualquer provedor.
- Confirmar pagamento, mudar o estado do pedido ou calcular parcelas.

## Critérios de aceite

- [ ] Link de domínio permitido aparece na página do item e na revisão; domínio fora
      da lista, `http://` ou `javascript:` é recusado com erro no campo (teste de servidor).
- [ ] O link abre em nova aba com `rel="noopener noreferrer"` e o aviso ao lado.
- [ ] A ação principal continua sendo a seleção e o WhatsApp (ordem e estilo em 390 px).
- [ ] A plataforma não acrescenta parâmetros de rastreamento ao link.
- [ ] `web/termos/` contém o parágrafo de responsabilidade.
- [ ] Nenhuma tela usa "checkout", "carrinho" ou "finalizar compra".

## Dependências

- {{issue:20}} `20-pagina-do-item.md`.
- Para a contagem: {{issue:09}}; para os termos: {{issue:01}}.
- Passo humano: o Lino revisa a lista de domínios antes do merge.

## Referências

- [Referência laurapires.com](../../referencia-laurapires.md): seções 2 (Carrinho e
  checkout), 7.1 e decisão 5.
- Estudo: [seção 5, Meios de pagamento](../../market-study-2026.md#5-precificação-adotada-decisão-2b);
  ADR 0013, item 8.
