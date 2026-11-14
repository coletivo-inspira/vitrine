---
titulo: "[Estudo de mercado] Página própria do item, compartilhável"
rotulos: estudo-mercado, vitrine-publica, referencia-laurapires, enhancement
depende: 07, 18, 19
---
## Contexto

Hoje cada item existe só como cartão na grade, com uma foto (`imageUrl`) e uma
descrição curta. Não há endereço próprio para mandar no Instagram ou no WhatsApp.

Na referência, cada serviço tem uma página de venda: trilha, galeria, nome e preço,
promessa curta, detalhes práticos (datas, duração, plataforma, vagas), texto longo,
perguntas frequentes do item, relacionados e botão de compartilhar.

## Escopo

- Rota pública `/<endereço>/item/<item>` (e o equivalente no domínio próprio),
  resolvida pelo Worker a partir do manifesto publicado, sem consultar rascunhos
  (ADR 0008). O identificador do item é gerado do nome na publicação, único na
  vitrine e estável enquanto o nome não mudar.
- Campos novos e opcionais por item, editáveis no painel e incluídos nas chaves
  públicas permitidas (`ALLOWED_ITEM_KEYS`):
  - `details`: até 6 linhas "rótulo: valor" (ex.: "Duração: 1 hora");
  - `longDescription`: texto simples com parágrafos, até 2.000 caracteres;
  - `faq`: até 6 perguntas, com respostas de até 300 caracteres;
  - `gallery`: até 4 imagens WebP (ADR 0011), além de `imageUrl`.
- Página: trilha (vitrine › categoria › item), galeria com miniaturas, nome, preço
  ou modalidade, descrição curta, detalhes, o mesmo controle de seleção do cartão,
  descrição longa, perguntas frequentes em `details/summary` (com o componente
  visual da issue {{issue:22}}, quando existir), até 3 relacionados da mesma
  categoria e "Compartilhar".
- "Compartilhar" usa `navigator.share` quando existe; senão copia o endereço e
  anuncia "Link copiado".
- O cartão da grade ganha "Ver detalhes" só quando o item tem algum campo novo.
- Metadados por item (`<title>`, `description`, `og:*` com a foto do item,
  `link rel="canonical"`) pelo mesmo gerador da issue {{issue:07}}, sem um segundo.
- Cabeçalho, gaveta e rodapé iguais aos da vitrine (issues {{issue:18}},
  {{issue:19}} e {{issue:25}}); a seleção é compartilhada.
- O validador recusa manifestos acima de 256 KiB (ADR 0009) com uma mensagem que diz
  quantos itens com descrição longa cabem.

## Fora de escopo

- Avaliações com nota ou comentários de visitantes; vídeo.
- JSON-LD `Product` ou `Service` (continua na issue {{issue:07}}).
- Uma página por turma ou data: a data é um campo do item.
- Redirecionar o endereço antigo quando o item é renomeado.

## Critérios de aceite

- [ ] Um item com `details`, `longDescription` e `faq` publica e abre em
      `/<endereço>/item/<item>` com `200`; item inexistente responde o `404` da vitrine.
- [ ] A página do item tem um único `h1` (nome do item) e `og:image` igual à foto do item.
- [ ] Adicionar pela página atualiza o contador do cabeçalho e aparece na gaveta e na
      mensagem do WhatsApp.
- [ ] "Compartilhar" chama `navigator.share` quando disponível; sem ele, copia e anuncia.
- [ ] `assertNoPrivateLeakage` passa e nenhum campo privado aparece no HTML do item (teste).
- [ ] Manifesto acima de 256 KiB é recusado com mensagem clara.
- [ ] Renomear um item muda o endereço só na próxima publicação; o antigo responde `404`.
- [ ] A resolução da rota fica dentro do orçamento de CPU do ADR 0008 e do orçamento
      da issue {{issue:27}}.

## Dependências

- {{issue:07}} `07-seo-local-e-cartao-de-previa.md` (gerador de metadados).
- {{issue:18}} `18-cabecalho-identidade-e-sua-selecao.md` e {{issue:19}} `19-gaveta-sua-selecao.md`.

## Referências

- [Referência laurapires.com](../../referencia-laurapires.md): seções 2 (Página de
  serviço/produto), 6.5 e decisão 6.
- Estudo: [seção 6, item 1](../../market-study-2026.md#6-estratégias-de-aquisição)
  (o link do item vira peça de divulgação).
