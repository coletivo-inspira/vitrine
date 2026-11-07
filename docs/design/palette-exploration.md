# Exploração de paletas — divulgação

Data: 2026-11-07. O usuário aprovou a distribuição da proposta e rejeitou o excesso
de verde e intensidade. Solicitou testes de outras paletas, citando laranja como
possibilidade. Após comparar os estudos, escolheu explicitamente a opção **A — Laranja pontual**.

## O que permanece

Somente divulgação, com a mesma hierarquia e distribuição: cabeçalho, chamada à
esquerda, modelo demonstrativo à direita, processo e possibilidades abaixo; no
celular, conteúdo empilhado. Syne/DM Sans, marca oficial e Orb preservadas.
As demonstrações não são cases e não significam produto já publicado.

## Ajuste comum às três opções

Fundo predominantemente neutro, texto em carvão, cor restrita à ação e pequenos
detalhes. Reduzir bordas escuras, sombras deslocadas e blocos saturados atrás da
demonstração; manter suas posições com superfícies discretas. Diminuir a presença
da malha pontilhada. Não redesenhar o layout para justificar uma nova cor.

Isso é uma alteração autorizada para a Vitrine, não edição do brandbook global.
Identidade continua reconhecível em tipografia, marca, conteúdo e assinatura.

## Variantes

| Papel | A — Laranja pontual | B — Mostarda suave | C — Menta discreta |
| --- | --- | --- | --- |
| Base | #F7F7F4 | #FDFCEB, leitura quase neutra | #F7F7F4 |
| Tinta | #27322E | #27322E | #27322E |
| Superfície leve | #FBEDE5 | #F5EEDC | #EDF5EF |
| Ação | #C74414 | #E5A93C | #A3E5C2 |
| Texto da ação | #FFFFFF | #133824 | #133824 |
| Borda discreta | #DDDCD6 | #DDDCD6 | #D9E3DC |

A deriva do laranja já presente na identidade do coletivo; B explora a variação
Solar/mostarda; C reduz drasticamente a área ocupada pela menta. Derivações claras
são tratamentos propostos para esta superfície, não cores oficiais adicionais.
Logo e Orb não são recoloridos para combinar com cada alternativa.

Direção aprovada: **A — Laranja pontual**, com base neutra, texto carvão e laranja
concentrado nas ações. B e C permanecem apenas como estudos históricos.
Não há resultados de teste com visitantes que provem superioridade de uma opção.

## Estudos visuais

- [A — Laranja pontual](marketing-palette-orange.png)
- [B — Mostarda suave](marketing-palette-mustard.png)
- [C — Menta discreta](marketing-palette-mint.png)

Mockups raster gerados para comparar material e cor; não screenshots de interface
implementada. A geração pode produzir pequenas diferenças além da paleta. O teste
controlado futuro deve usar componentes idênticos com troca de tokens, no mesmo
viewport e com o mesmo conteúdo. Não inferir taxa de conversão dessas imagens.

## Contraste dos tokens propostos

Razão calculada com luminância relativa sRGB, considerando cores sólidas:

| Par texto / fundo | Razão aproximada |
| --- | --- |
| #FFFFFF / #C74414 (A) | 4,92:1 |
| #133824 / #E5A93C (B) | 6,22:1 |
| #133824 / #A3E5C2 (C) | 8,98:1 |

Laranja original #F05D23 com floresta #133824 resulta em 3,89:1, abaixo de 4,5:1
para texto normal. Por isso a ação de A usa derivação mais escura com branco.
Fonte do critério: [WCAG 2.2 — contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Esses cálculos validam pares teóricos, não pixels do mockup nem página em produção.
Blur, transparência, foco e estados hover exigem verificação após implementação.

## Critérios de decisão e medição

Não há visitas, conversões ou baseline: os indicadores abaixo são definições para
validação futura, não números observados nem metas de marketing.

| Indicador | Definição e origem | Decisão que informa | Limite |
| --- | --- | --- | --- |
| Compreensão da proposta | Participantes que explicam, sem ajuda, que se trata de site por modelo para seu negócio, dividido por participantes expostos ao mesmo conteúdo; registrar respostas em sessão de teste | Se a página explica o produto ou precisa rever mensagem/hierarquia | Amostra pequena é formativa; cores não são a única causa |
| Localização da ação | Participantes que encontram Ver possibilidades sem ajuda, dividido por participantes com a mesma tarefa; registrar primeira tentativa e tempo | Se o CTA está perceptível sem saturar a página | Um clique não é lead nem venda |
| Conforto visual — proteção | Resposta à mesma pergunta em escala ordinal de 1 (desconfortável) a 5 (confortável), coletada após cada variante | Identificar versão que mantém leitura sem cansaço | Preferência declarada não prova conversão; evitar médias tratadas como evidência de causalidade |

Condições: mostrar o mesmo conteúdo e dimensão; variar a ordem entre participantes
para reduzir efeito de novidade; separar desktop/mobile. Registrar texto de opinião,
não só nota. Fonte será o teste manual, sem contratar analytics ou coletar identidade
pessoal desnecessária. Responsável: equipe Inspira. Revisar antes de fechar o design.

Proteções de liberação: contraste de texto/controles verificado no render final,
foco de teclado, leitura com redução de movimento e Orb sem obstruir CTA. Não
definir meta de conversão sem baseline e sem página/contato operantes. Após lançar,
considerar pedidos qualificados como resultado, evitando otimizar somente clique.
