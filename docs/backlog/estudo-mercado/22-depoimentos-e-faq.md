---
titulo: "[Estudo de mercado] Depoimentos e perguntas frequentes com acabamento"
rotulos: estudo-mercado, vitrine-publica, referencia-laurapires, enhancement
depende:
---
## Contexto

Os módulos `testimonials` e `faq` já existem no motor de publicação, mas geram
marcação mínima (`blockquote` com nome; `details` sem estilo próprio).

Na referência, os depoimentos são cartões com a citação e o contexto (serviço ou
turma), e as perguntas frequentes respondem objeções reais (pagamento, faltas,
certificado) em acordeão.

## Escopo

- `testimonials`: cada depoimento ganha `context` (até 60 caracteres), `photoUrl`
  opcional (WebP pequena, `alt` vazio porque o nome já está no texto) e `consent: true`
  obrigatório no editor ("Tenho autorização desta pessoa para publicar o depoimento").
  Até 12 depoimentos.
- Visual: cartões em grade (1 coluna no celular, 2 ou 3 no desktop), com citação,
  nome e contexto; sem carrossel automático.
- `faq`: acabamento do `DESIGN.md` (divisórias finas, alvo mínimo de 44 px, ícone
  que gira ao abrir), até 12 perguntas e título da seção editável.
- Sugestões de perguntas no editor para serviços ("Quais são as formas de
  pagamento?", "É online ou presencial?", "E se eu precisar remarcar?", "Tem
  garantia?"). Só sugestão; o dono escreve as respostas.
- Este é o componente visual único de perguntas frequentes, usado também na página
  do item (issue {{issue:20}}).

## Fora de escopo

- Importar avaliações do Google ou do Instagram; nota em estrelas ou média.
- JSON-LD `FAQPage` ou `Review`.

## Critérios de aceite

- [ ] Depoimento sem `consent` é recusado na publicação com erro no campo.
- [ ] 3 depoimentos com contexto aparecem em 3 colunas em 1280 px e em 1 em 390 px.
- [ ] Nenhum movimento automático; com `prefers-reduced-motion`, o ícone não anima.
- [ ] As perguntas abrem e fecham por teclado (Enter e Espaço), com foco visível e
      alvo ≥ 44 px.
- [ ] Vitrines já publicadas com `testimonials` e `faq` renderizam sem os campos novos.
- [ ] Contraste ≥ 4,5:1 do texto sobre o fundo dos cartões nos dois temas.

## Dependências

Nenhuma bloqueante.

## Referências

- [Referência laurapires.com](../../referencia-laurapires.md): seções 2 (Landing de
  oferta), 3, 6.7 e decisão 1.
