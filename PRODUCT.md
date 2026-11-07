# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: o usuário autorizou as recomendações necessárias, priorizando custo
zero. Para a divulgação, recomendar HTML/CSS/JavaScript estáticos e leves, sem
framework obrigatório. Cloudflare Workers Free com Static Assets é a hospedagem
adotada; a página está implementada e validada localmente, ainda sem publicação remota.

## Users

Pessoas e pequenos negócios que precisam de um site a partir de um modelo, com
primeiro recorte de pizzaria/cardápio e contato WhatsApp. A equipe Inspira atende
pedidos de domínio e customização e administra exemplos de trabalhos realizados.

## Product Purpose

Vitrine Inspira permitirá criar e administrar vitrines de negócios. O site de
divulgação em vitrine.inspira.dev.br explica a oferta e apresenta exemplos e
possibilidades de customização. Este trabalho trata somente da divulgação.

## Operating Context

Uma pessoa poderá administrar várias vitrines; equipes têm acesso por vitrine.
Painel e conteúdo público são superfícies separadas. Supabase Auth/Postgres e
login Google foram escolhidos; implementação integrada ainda não existe.

## Capabilities and Constraints

Base atual: projeção pública de cardápio, catálogo de portfólio e migração de
isolamento de dados, com testes locais. Interface de divulgação implementada; sem
painel, login integrado ou deploy remoto.
Infraestrutura gratuita; limitar uso em vez de contratar excedentes.
WhatsApp por link, sem envio automático ou API paga. Preços R$ 10/R$ 15 são
propostas comerciais, não planos liberados. Site de divulgação não oferece
checkout nem deve simular cadastro funcional enquanto o painel estiver pendente.

## Brand Commitments

Revisão aprovada de 2026-11-07: logotipo do produto com V na caixa verde-lima e
somente “vitrine” em lettering firme de proporção natural (opção A do estudo).
“Inspira” permanece no nome do projeto e no endosso do coletivo, fora do lettering.
Marca própria em SVG; animação curta de abertura, com alternativa estática.
Essa aprovação substitui o uso do mais oficial junto ao nome do produto;
o símbolo e a Orb do coletivo continuam preservados.

Nome: Vitrine Inspira. O usuário definiu o [brandbook do Coletivo Inspira](https://brandbook.inspira.dev.br/)
como autoridade principal. Paleta base off-white, floresta, lima e menta; Syne em
títulos e DM Sans no corpo; estrutura modular e malha pontilhada. Usar os vetores
oficiais da marca, sem redesenho do logotipo. A referência Liquid Glass é secundária
e deve respeitar a Orb +INSPIRA e as regras do coletivo. Escopo somente divulgação.

Retorno posterior: o usuário aprovou a distribuição, mas rejeitou o excesso de
verde e cor intensa. Autorizou explorar outras paletas, inclusive laranja, com
tratamento mais discreto. Escolheu a opção A — Laranja pontual: base neutra, texto
carvão e ações em laranja. Preservar Syne/DM Sans, logo e Orb oficiais.

## Evidence on Hand

docs/commercial-offer.md contém proposta comercial; content/portfolio.json contém
um catálogo vazio. O export DNS fornecido gerou inventário em docs/dns-review.md,
sem autorização inferida para divulgar os sites como cases. WhatsApp da equipe
ainda não informado. Não inventar depoimentos, clientes, resultados ou métricas.

## Product Principles

- Separar divulgação, administração e vitrines dos negócios.
- Explicar o que existe e o que está em preparação.
- Distinguir gratuidade, assinatura de endereço e serviço sob orçamento.
- Preservar dados privados e limitar despesas operacionais.
