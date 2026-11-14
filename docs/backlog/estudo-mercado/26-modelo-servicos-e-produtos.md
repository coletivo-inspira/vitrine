---
titulo: "[Estudo de mercado] Modelo \"Serviços e produtos\" com a receita de seções"
rotulos: estudo-mercado, vitrine-publica, painel, referencia-laurapires, enhancement
depende: 18, 21, 22, 25
---
## Contexto

Os modelos ficam em `public.templates` com seções padrão
(`202611120006_cms_pages_sections_releases.sql`): `pizzeria-v1`, `products-v1`,
`booking-v1`, `quote-v1` e `catalog-bio-v1`. Nenhum segue a estrutura que o Lino
escolheu para quem vende serviços e produtos (mentoras, terapeutas, fotógrafos,
artesãos, cursos): cabeçalho → hero pessoal → destaques → itens → sobre →
depoimentos → perguntas frequentes → chamada final → rodapé, com página por item e
uma página para um segundo público ("Para empresas").

## Escopo

- Migração nova com o modelo `servicos-produtos-v1`, vertical `services`, tipo
  `products`, tema sólido com cantos arredondados, e as seções na ordem: `hero` (com
  foto e duas ações, issue {{issue:21}}), `highlights`, grade de itens, `about_story`,
  `testimonials` e `faq` (issue {{issue:22}}) e um `hero` secundário como chamada final.
- Página opcional "Para empresas", desligada por padrão, com `hero`, `quote_request`
  e `faq` (com o webhook da issue {{issue:11}} quando o plano permitir).
- Textos iniciais neutros, sem termos proibidos, com indicações do que escrever
  ("Conte em uma frase para quem é o seu trabalho").
- Ficha do modelo no painel (criação de vitrine) e em Possibilidades, com uma vitrine
  de exemplo fictícia identificada como ilustração.
- Documento curto em `docs/` com a receita das seções e o porquê de cada uma,
  apontando para `docs/referencia-laurapires.md`.
- O modelo é uma boa base para a vitrine piloto da issue {{issue:14}} (Guavira Fotos).

## Fora de escopo

- Migrar vitrines existentes para o modelo novo.
- Paleta ou fontes da referência; preço "de/por" (decisão 9 da referência).

## Critérios de aceite

- [ ] O modelo aparece na criação de vitrine e cria um rascunho com as 7 seções na ordem.
- [ ] "Para empresas" vem desligada e, ao ligar, publica no padrão de páginas atual.
- [ ] O teste de terminologia passa nos textos iniciais da migração.
- [ ] A vitrine de exemplo passa no orçamento da issue {{issue:27}}.
- [ ] Trocar uma vitrine existente para este modelo preserva itens e contato (spec 009, US4).

## Dependências

- {{issue:18}}, {{issue:21}}, {{issue:22}} e {{issue:25}}. Recomendado {{issue:20}}
  (o modelo funciona sem a página do item).
- Auditoria: `PB-12` antes de publicar a ficha no site de divulgação.

## Referências

- [Referência laurapires.com](../../referencia-laurapires.md): seções 2 e 8 e
  decisões 1, 10 e 12.
- Spec 009 (US4, modelos e herança); spec 015 (Possibilidades).
