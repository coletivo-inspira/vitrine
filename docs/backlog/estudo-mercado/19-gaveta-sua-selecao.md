---
titulo: "[Estudo de mercado] Gaveta lateral \"Sua seleção\" ligada ao fluxo em etapas"
rotulos: estudo-mercado, vitrine-publica, referencia-laurapires, enhancement
depende: 18
---
## Contexto

A vitrine já tem a seleção com quantidade e o fluxo em etapas (Escolher → Seus dados
→ Revisar e enviar) em `web/assets/storefront-renderer.mjs`, com a barra fixa
"Resumo da seleção". A seleção fica só em memória e se perde ao recarregar ou ao
trocar de página da vitrine.

Na referência, a sacola abre uma gaveta lateral com os itens, quantidade, remover,
subtotal e a ação principal, sem sair da página. Lá a ação final é um checkout
próprio; aqui a seleção é uma lista de interesse que termina no WhatsApp (decisão 2
da referência e ADR 0013: sem checkout do lojista na plataforma).

## Escopo

- O ícone "Sua seleção" (issue {{issue:18}}) abre uma gaveta (`<dialog>` modal) da
  direita, com até 420 px no desktop e 90% da largura no celular, fundo escurecido.
- Conteúdo: título "Sua seleção" ("Seu pré-orçamento" no modo `quote`), itens com
  foto pequena, nome, preço ou modalidade, quantidade e "Remover"; total quando os
  preços forem fixos; nota de cotas e lances como já existe na barra.
- "Continuar" leva à etapa 2 (ou à 3 sem campos de pedido) e fecha a gaveta;
  "Continuar escolhendo" só fecha.
- Estado vazio: "Sua seleção está vazia", com o link "Ver itens da vitrine".
- A gaveta lê e altera o mesmo estado da barra inferior; a barra continua no celular
  com a gaveta fechada.
- Adicionar um item **não** abre a gaveta: mostra "Adicionado à sua seleção",
  anunciado, e atualiza o contador. Igual em todas as páginas da vitrine.
- Persistência só na sessão: `sessionStorage`, chave `vitrine-selecao:<endereço>`,
  com apenas `itemId → quantidade` e a versão da publicação. Itens que saíram da
  publicação são descartados com aviso. Dados da etapa 2 nunca são guardados.
- Foco: vai para o título ao abrir; Esc e o botão de fechar devolvem o foco ao
  ícone; foco preso na gaveta aberta (utilitário de `PB-09` e `PB-17`).
- Sem deslizar com `prefers-reduced-motion`.
- Com "Receber pedidos pela Mila" (ADR 0012), o botão final e o aviso de repasse
  continuam os atuais.
- No modo `quote`, quando a issue {{issue:11}} existir, "Continuar" leva ao mesmo
  formulário de pré-orçamento.

## Fora de escopo

- Pagamento, cupom, frete, conta de cliente ou tela de checkout.
- Guardar a seleção no servidor ou entre aparelhos; lembrete de seleção abandonada.

## Critérios de aceite

- [ ] Com 2 itens escolhidos, gaveta e barra mostram os mesmos itens, quantidades e
      total; mudar a quantidade na gaveta muda a barra e o cartão do item.
- [ ] "Continuar" abre a etapa certa e a mensagem do WhatsApp traz os mesmos itens e
      quantidades (teste em `pizzeria-v1` e numa vitrine `quote`).
- [ ] Recarregar mantém a seleção; fechar a aba e abrir de novo começa vazio.
- [ ] `sessionStorage` guarda só identificadores e quantidades; nenhum nome, telefone
      ou endereço (teste automatizado).
- [ ] Nova publicação sem um item selecionado remove o item com aviso visível e anunciado.
- [ ] Teclado: abrir, navegar, remover e fechar sem mouse; Esc fecha; foco volta ao ícone.
- [ ] Nenhuma ocorrência de "carrinho", "checkout", "finalizar compra" ou texto em inglês.
- [ ] Sem JavaScript, as etapas continuam acessíveis pela âncora.

## Dependências

- {{issue:18}} `18-cabecalho-identidade-e-sua-selecao.md`.
- Auditoria: `PB-06` (mensagem completa do WhatsApp), `PB-09` e `PB-17` (foco).
- Desejável: {{issue:11}} `11-pre-orcamento-com-webhook.md` para o modo `quote`.

## Referências

- [Referência laurapires.com](../../referencia-laurapires.md): seções 2 (Carrinho e
  checkout), 7.1, 7.4 e decisões 2, 3, 4 e 5.
- ADR 0012 e ADR 0013 (vendas do lojista fora da plataforma).
