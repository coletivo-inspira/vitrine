# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: o usuário autorizou as recomendações necessárias, priorizando custo
zero. Para a divulgação, recomendar HTML/CSS/JavaScript estáticos e leves, sem
framework obrigatório. Cloudflare Workers Free com Static Assets é a hospedagem
adotada; a página ainda não foi implementada nem publicada.

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
isolamento de dados, com testes locais. Sem interface, login integrado ou deploy.
Infraestrutura gratuita; limitar uso em vez de contratar excedentes.
WhatsApp por link, sem envio automático ou API paga. Preços R$ 10/R$ 15 são
propostas comerciais, não planos liberados. Site de divulgação não oferece
checkout nem deve simular cadastro funcional enquanto o painel estiver pendente.

## Brand Commitments

Nome: Vitrine Inspira. Referência solicitada pelo usuário: Liquid Glass da Apple.
Não há logo, paleta ou tipografia oficial fornecida neste projeto. Direção visual
será modelada para web; não pressupõe componentes nativos de plataformas Apple.

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
