# Modelo "Serviços e produtos" (`servicos-produtos-v1`)

Receita de seções para quem vende o próprio trabalho: aulas, atendimentos,
mentorias, encomendas e peças prontas na mesma vitrine. A ordem e o porquê vêm de
[`docs/referencia-laurapires.md`](referencia-laurapires.md) (decisões 1 e 10); não é
tema novo nem CMS de terceiros, só módulos que a vitrine já tem.

## Receita

| Ordem | Seção (`id`) | Módulo | Para quê |
| --- | --- | --- | --- |
| 1 | `sec-abertura` | `hero` | Foto da pessoa, especialidade, frase de valor e duas ações: ver os itens (`selecao`) e conversar (`whatsapp`) |
| 2 | `sec-destaques` | `highlights` | Quatro garantias curtas: formato, para quem, condição que dá segurança, atendimento direto |
| 3 | `sec-itens` | `catalog_grid` | Itens da vitrine em duas colunas |
| 4 | `sec-sobre` | `about_story` | História e experiência |
| 5 | `sec-depoimentos` | `testimonials` | Começa vazio: publicar exige `consent: true` em cada depoimento |
| 6 | `sec-perguntas` | `faq` | Pagamento, formato e remarcação |
| 7 | `sec-chamada-final` | `hero` | Convite final com o botão do WhatsApp |

Cabeçalho (identidade, menu, sacola) e rodapé continuam sendo os da vitrine. Tema
sólido: destaque `#9C4221` (contraste AA com texto claro), par `editorial-syne` e
botões arredondados.

Página opcional **"Para empresas"** (`slug: empresas`), desligada por padrão:
`hero` → `quote_request` → `faq`. Ao ligar em *Estrutura da vitrine → Páginas*, ela
sai publicada como as outras páginas extras (`#pagina-empresas`). Enquanto o pedido
de orçamento por webhook não existir, o `quote_request` dessa página vira um convite
"Pedir orçamento pelo WhatsApp", sem somar nada ao pedido.

Os textos iniciais dizem o que escrever ("Conte em uma frase para quem é o seu
trabalho"); não há nome, preço nem depoimento inventado.

## Onde está

- Receita: `src/servicos-produtos-template.mjs`, espelhada na migração
  `supabase/migrations/20261116001800_template_servicos_produtos.sql`
  (`public.templates`, coluna nova `default_pages`). O teste
  `test/servicos-produtos-template.test.mjs` confere que as duas são iguais.
- Páginas do modelo: `resolveShowcaseManifest` herda `defaultPages` como herda as
  seções da página inicial; o Worker lê `default_pages` em `getStructureDefaults`.
- Painel: cartão "Serviços e produtos" no passo 2 de *Nova vitrine*; vitrines de
  itens existentes trocam para o modelo em *Estrutura da vitrine → Modelo visual*,
  sem perder itens, categorias nem contato.
- Exemplo fictício: `content/vitrines/servicos-produtos-exemplo.json` (Ateliê Barro
  Claro, foto `web/assets/atelie-exemplo-hero.webp`), usado pelo orçamento da
  vitrine pública (`test/storefront-budget.test.mjs`). Não entra no `dist`.
