# Cadastro inicial do portfólio

Editar portfolio.json e preencher entries com objetos como este (exemplo apenas):

```json
{
  "id": "case-exemplo",
  "title": "Nome do projeto",
  "url": "https://example.com/",
  "summary": "Descrever somente o trabalho realizado e autorizado para divulgação.",
  "category": "Cardápio",
  "tags": ["WhatsApp", "Layout personalizado"],
  "order": 1,
  "featured": true,
  "published": false
}
```

Mudar published para true só após revisar link, descrição e autorização.
O catálogo fica em repositório público: mesmo entradas não publicadas não podem
conter informação privada. published controla a exibição no futuro site, não sigilo.
Para rascunhos privados, usar outro local até existir o painel de operadores.
Case à espera de autorização leva `"authorization": "pendente: <passo humano>"` e
`published: false`; `test/guavira-piloto.test.mjs` impede publicar case com
autorização pendente ou com o marcador `[a preencher com o conteúdo autorizado]`.

# Vitrines de exemplo

`vitrines/*.json` são rascunhos no formato do painel, cobertos pelo orçamento da
vitrine pública (`test/storefront-budget.test.mjs`). O build publica só `loja1`;
`rascunho-guavira-fotos.json` é demonstração fictícia da issue #124 e não vai para
`dist/` (roteiro em `docs/aquisicao/guavira-piloto.md`).

`publishedPortfolio` valida e projeta somente cases publicados, ordenando por order.
Não busca sites nem gera imagens. `quoteContactLink` precisa do número comercial
da equipe em formato internacional, sem símbolos; sem ele retorna null.
A exibição de cases publicados está integrada à divulgação. A edição continua pelo
catálogo no repositório; ainda não há painel de edição.

# Tabela de planos

`plans.json` é a fonte única dos planos e serviços avulsos do ADR 0013: preço
mensal em centavos, limites e recursos de uma lista fechada. `src/plans.mjs`
valida a tabela, e `test/plans.test.mjs` falha se o ADR 0013 ou
`docs/commercial-offer.md` divergirem dela. Mudar um preço exige mudar os três.
