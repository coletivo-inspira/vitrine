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

`publishedPortfolio` valida e projeta somente cases publicados, ordenando por order.
Não busca sites nem gera imagens. `quoteContactLink` precisa do número comercial
da equipe em formato internacional, sem símbolos; sem ele retorna null.
Ainda não há interface de edição ou exibição integrada ao site.
