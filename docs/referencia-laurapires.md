# Referência: laurapires.com como padrão de vitrine de serviços e produtos

Data: 14/11/2026. Análise feita com navegador automatizado (Chrome 157) em desktop (1280×800) e celular (390×844, iPhone), sem comprar nada e sem preencher dados no checkout. Um item foi adicionado ao carrinho só para ver o comportamento da gaveta lateral. As 65 capturas citadas pelo nome (prefixo `desktop-` ou `mobile-`, sufixo `-dobra` para a primeira tela e `-inteira` para a página inteira) ficam no Context do projeto, em `media/referencia-laurapires/`, e não são versionadas neste repositório.

Pesquisa de apoio às issues 18 a 27 de [`docs/backlog/estudo-mercado/`](backlog/estudo-mercado/README.md).

## Resumo

O que vale para a Vitrine é a **estrutura** do site da Laura, não a tecnologia. Três padrões explicam por que o Lino gostou:

1. Um **cabeçalho enxuto** com a identidade da pessoa à esquerda e, no celular, só dois controles à direita: o ícone de sacola com contador e o menu.
2. Uma **página por serviço ou produto** que funciona como página de venda: foto, preço, promessa curta, detalhes práticos, metodologia, FAQ do próprio item, relacionados e compartilhar.
3. Uma **seleção sempre à mão**: a sacola no cabeçalho abre uma gaveta lateral com o que a pessoa escolheu, sem sair da página.

A Vitrine já tem a parte difícil: seleção de itens com quantidade, fluxo em etapas (Escolher → Dados → Revisar e enviar) e mensagem pronta no WhatsApp, além dos módulos de sobre, horários, FAQ e depoimentos. O que falta é a casca: cabeçalho com identidade e sacola, gaveta lateral, página própria do item, hero com foto e rodapé completo.

**Decisão central:** o "carrinho" da Laura vira **"Sua seleção"**, uma lista de interesse que termina numa mensagem de WhatsApp (pedido ou pré-orçamento). Não há pagamento nem checkout na plataforma. Quando o negócio quiser receber online, cada item pode levar o **link de pagamento do próprio negócio**, exatamente como a Laura faz com a Hotmart no curso.

## 1. Stack identificada

| Camada | O que roda | Evidência |
| --- | --- | --- |
| CMS | WordPress | `/wp-json/`, `xmlrpc.php`, `wp-content/` |
| Tema | Salient 18.0.2 + tema filho, construtor WPBakery (`js_composer_salient`), Salient Core e Salient Portfolio | caminhos `wp-content/themes/salient`, meta `generator` |
| Loja | WooCommerce, com pagamento por Mercado Pago (cartão, Pix e saldo) | campos `mercadopago_custom[*]` no checkout |
| Curso | Hotmart (link externo `pay.hotmart.com/...?offDiscount=ANIVERSARIO`) | todos os botões de `/dra/` |
| Marketing | Yoast SEO, Site Kit (Google), GTM, Google Analytics, Facebook Pixel + Facebook for WooCommerce, Mailchimp for WooCommerce | sitemaps Yoast, hosts de terceiros carregados |
| Captação | Google Forms para "lista de interesse" | link na barra lateral da loja e nos produtos esgotados |
| Apoio recorrente | Apoia.se | bloco "Apoie meu trabalho" na home |
| Servidor | Apache, `Cache-Control: no-store` no HTML | cabeçalhos HTTP |

Conteúdo publicado: 14 páginas, 33 produtos (quase todos turmas passadas, agora "fora de estoque"), 3 categorias (Mentoria, Encontros ao vivo, E-books), 5 tags e 2 itens de portfólio que são **conteúdo de demonstração do tema** (`resize-image-using-photoshop`, `measure-digital-progress`).

## 2. Estrutura e hierarquia

### Mapa do site

```
Home (/)
├── Curso (/dra/)            → landing longa, venda pela Hotmart
│   └── /apoiadores/         → mesma landing com 50% para apoiadores do Apoia.se
├── Loja (/loja/)            → grade WooCommerce com busca e filtros
│   ├── /produto-categoria/{mentoria,encontros-ao-vivo,ebooks,todos}/
│   └── /loja/<produto>/     → página de venda do serviço
├── Mentorias                → atalho para a categoria Mentoria
├── /empresas/               → palestras, parcerias e publis (fora do menu)
├── /inventando-amor/        → landing de um encontro (fora do menu)
├── /carrinho/, /checkout/, /minha-conta/
└── /politica-privacidade/, /termos-condicoes/, /devolucao/
```

### Cabeçalho

- **Desktop** (`desktop-home-dobra.png`): nome "LAURA PIRES" em caixa alta à esquerda; à direita, Home, Curso, Loja, Mentorias, ícone do Instagram e ícone de sacola. Fino, fixo, sem botão de destaque.
- **Celular** (`mobile-home-dobra.png`, `mobile-cabecalho-com-item.png`): nome à esquerda, **sacola** e **hambúrguer** à direita. A sacola é `a#mobile-cart-link` com `href="/carrinho/"` e `data-cart-style="slide_in_click"`. Com JavaScript, o toque abre a gaveta lateral; sem JavaScript, o link leva à página do carrinho. O contador aparece num círculo roxo sobre o ícone quando há item (`1`).
- **Menu do celular** (`mobile-menu-aberto.png`): painel lilás em tela cheia com 4 links grandes e o ícone do Instagram. Defeito visível: a fonte do painel cai para Times (a Poppins não é aplicada ali) e o texto branco sobre lilás claro tem contraste baixo.

### Home (`desktop-home-inteira.png`, `mobile-home-inteira.png`)

1. **Hero pessoal**: foto da Laura em moldura arredondada, título "Oi, sou a Laura Pires." com sublinhado manuscrito, uma frase de posicionamento, **um botão principal** ("Quero aprender!") e **um link secundário** com ícone ("Quero apoiar").
2. **Conheça os Encontros**: 4 destaques com ícone e uma linha (ao vivo sem gravação, turmas pequenas, material de apoio, curadoria de leituras) e um botão "Fortaleça sua saúde social".
3. **Apoie meu trabalho**: mosaico de imagens do Apoia.se, texto curto e botão "Vem fazer parte!".
4. **Desaprendendo Relações Amorosas**: capa do curso, problema em forma de pergunta, lista de benefícios com marcadores (3 módulos em áudio, material de apoio, acesso por um ano, **garantia de 7 dias**) e botão "Conheça o curso".
5. **Sem rodapé**: o `#footer-outer` só repete o menu. Não há contato, política de privacidade, termos nem créditos no fim da página.

### Página de serviço/produto (`desktop-produto-mentoria-inteira.png`, `mobile-produto-encontro-inteira.png`)

Ordem: trilha (Início › Loja › Todos › item) → galeria com zoom → nome e preço → promessa em negrito → detalhes práticos em lista com emoji (📅 datas, 🟣 duração, 💻 plataforma, 🎟️ ao vivo e vagas limitadas, ⚠️ aviso de e-mail) → botão "Adicionar ao carrinho" → faixa de 4 ícones (sessões personalizadas, espaço acolhedor, situações reais, online com horário flexível) → texto longo → "Entenda a metodologia" em 4 cartões coloridos → CTA intermediário ("Dê o primeiro passo") → **Perguntas frequentes do item** (formas de pagamento, se é online, o que acontece se faltar) → produtos relacionados → botão flutuante de **compartilhar**.

Para turmas encerradas, o produto fica "fora de estoque" e o topo da descrição vira **"Quer saber da próxima turma em primeira mão? Cadastre-se na lista de interesse"** (`mobile-produto-esgotado-lista-interesse.png`). É o padrão de conversão mais útil para serviços com turma ou agenda.

### Landing de oferta (`/dra/`, `desktop-dra-inteira.png`)

Título-pergunta que nomeia a dor ("E se o problema não for você…") → explicação → "Como é o curso" → módulos 01/02/03 em blocos de cor → **cartão de preço "De R$ 360 por R$ 252, ou 12x de R$ 26,06"** com oferta de aniversário (`mobile-dra-preco-oferta.png`) → "Oi, sou Laura Pires" (autoridade) → "Você se identifica?" em 3 cartões → **Depoimentos** atribuídos à turma ("Desaprendendo Relações Amorosas, turma 01", `mobile-dra-depoimentos.png`) → Dúvidas frequentes → faixa final "Sua jornada começa aqui" com o botão de compra. São 4 botões de compra na página, todos para o mesmo link da Hotmart.

### Carrinho e checkout

- **Gaveta lateral** (`mobile-carrinho-slidein-pelo-icone.png`): título "Cart" (em inglês), botão "Close Cart", item com preço, "Remover", seletor de quantidade, subtotal e dois botões: "Ver carrinho" e "Finalização de compra". Ocupa ~90% da largura no celular, com fundo escurecido.
- **Depois de "Adicionar ao carrinho" na página do item**, o site **não abre a gaveta**: recarrega e vai para `/carrinho/` com a faixa "foi adicionado ao seu carrinho" (`desktop-carrinho-slidein-apos-adicionar.png`, `mobile-carrinho-slidein-apos-adicionar.png`). O comportamento muda conforme o caminho.
- **Página do carrinho** (`*-carrinho-pagina.png`): tabela, cupom, "Atualizar carrinho", "Você pode se interessar por…" e "Continuar para finalização".
- **Checkout** (`desktop-checkout.png`, `mobile-checkout.png`): para uma mentoria online de R$ 250, pede nome, sobrenome, tipo de pessoa, CPF (e CNPJ/IE se PJ), país (lista com 240 opções), CEP, endereço, número, complemento, bairro, cidade, estado, telefone e e-mail, além de cartão, Pix ou saldo Mercado Pago. **A newsletter vem marcada por padrão.** São 17 campos de cobrança antes de pagar.

### Outras páginas

- **/empresas/** (`*-empresas-*.png`): palestras, parcerias e publis. Tem restos do tema ("START A PROJECT", "Explore Service"), dois `h1` e uma foto que ocupa a primeira tela inteira no celular sem texto.
- **/inventando-amor/**: landing de encontro sem `h1`, com "CONTACT US" de demonstração.
- **Portfólio**: só itens de demonstração do tema. Não existe galeria real de trabalhos.
- **Contato e WhatsApp**: **não há WhatsApp em nenhuma página**. O contato é o e-mail `suporte@laurapires.com` dentro do texto dos produtos e o Instagram no menu.

## 3. Conversão

| Padrão | Onde | Comentário |
| --- | --- | --- |
| Um CTA principal + um link secundário por bloco | hero, seções da home | Igual à regra do DESIGN.md da Vitrine ("a segunda ação é um link sublinhado") |
| Verbo em primeira pessoa nos botões | "Quero aprender!", "Quero apoiar", "Quero meu desconto!", "Garanta sua vaga" | Funciona melhor que "Comprar" ou "Saiba mais" |
| Detalhes práticos antes do texto longo | página do item | Responde "quando, quanto tempo, onde" em 5 linhas |
| FAQ por item com objeções reais | página do item, landing | Formas de pagamento, faltas, certificado, parcelamento |
| Prova social com contexto | landing | Depoimento atribuído à turma, não a "Cliente satisfeito" |
| Garantia explícita | home, landing | "Garantia de 7 dias para reembolso, sem burocracia" |
| Ancoragem de preço e prazo | landing | "De/por", parcelamento e oferta com data. Exige preço anterior real (CDC) |
| Lista de interesse quando esgota | itens esgotados, barra da loja | Mantém o link vivo e captura demanda para a próxima turma |
| Compartilhar item | botão flutuante na página do item | O link do item vira peça de divulgação no Instagram e no WhatsApp |
| Sacola visível com contador | cabeçalho | Lembra a escolha em qualquer página |
| Página para segundo público | /empresas/ | Separa B2B (palestra, publi) do público final |

Pontos fracos de conversão: checkout longo para serviço digital, dois sistemas de pagamento diferentes (WooCommerce e Hotmart), nenhum canal de conversa direta, e a loja exibe só 2 itens ativos com uma barra de filtros e busca desproporcional.

## 4. Desempenho

Medido no navegador automatizado, cache vazio, rede do servidor (não é Lighthouse nem rede móvel real):

| Página | Recursos | Transferido | JS | CSS | `load` |
| --- | --- | --- | --- | --- | --- |
| Home desktop | 79 | 3,1 MB | 42 | 26 | 2,5 s |
| Home celular | 83 | 1,9 MB | 43 | 26 | 2,8 s |
| Produto (encontro) | 99 | 570 KB | 52 | 32 | 0,4–0,9 s |
| Landing /dra/ | 84 | 956 KB | 45 | 29 | 1,2 s |

- LCP no celular: 1,8 s, a foto do hero em PNG de 289 KB (500×500). Uma WebP faria o mesmo em ~40 KB.
- jQuery, `init.js` do Salient (129 KB), FontAwesome em WOFF (100 KB) e ícones icomoon.
- Terceiros na primeira visita: Google Tag Manager, Google Analytics, Facebook Pixel (~260 KB somando os scripts), Mailchimp e jsDelivr. As capturas não mostram banner de consentimento.
- HTML com `no-store`: nenhuma página é cacheada no navegador.

A vitrine pública já é mais leve por arquitetura (um módulo JS próprio, fontes locais, sem terceiros, cache na borda, ADR 0008 e 0011). A referência serve de alerta do que **não** deixar entrar.

## 5. Acessibilidade

Pontos bons: `lang="pt-BR"`, link de pular conteúdo, viewport sem bloquear zoom (`maximum-scale=5`), um `h1` na maioria das páginas, FAQ em acordeão, alvos grandes nos botões.

Problemas encontrados:

- Textos de interface em inglês: "Cart", "Close Cart", "Go To Shop", "Hide Filters", "Search…", "Close Filters", `aria-label="Cart"`.
- Link do Instagram sem nome acessível em todas as páginas; link do Google Forms sem nome na loja; ícones de relacionados sem nome.
- `/empresas/` com dois `h1`; `/inventando-amor/` sem `h1`.
- Menu do celular com fonte de reserva (Times) e texto branco sobre lilás claro, abaixo de 4,5:1.
- Botão do hero quebra a palavra no celular ("QUERO APR / ENDER!").
- Imagens de produto com `alt` vazio (3 de 4 na mentoria, 6 de 8 no encontro).
- Newsletter pré-marcada no checkout (consentimento não é livre, LGPD art. 8º).

## 6. O que vale copiar

1. **Cabeçalho de dois controles no celular**: identidade à esquerda; sacola com contador e menu à direita. No desktop, links curtos + rede social + sacola.
2. **Gaveta lateral da seleção**: abre sobre a página, lista itens, quantidade, remover, subtotal e uma ação principal. Fecha sem perder o contexto.
3. **Hero pessoal**: foto real, título que apresenta a pessoa ou o negócio, uma frase, um botão e um link.
4. **Faixa de destaques**: 3 ou 4 ícones com uma linha cada, logo abaixo do hero.
5. **Página própria por item**, com endereço compartilhável, trilha, galeria, preço, detalhes práticos, descrição, FAQ do item, relacionados e compartilhar.
6. **Estado "próxima turma / avise-me"** em vez de esconder o item.
7. **Depoimentos com contexto** (serviço ou turma) e **FAQ com objeções reais**.
8. **Garantia e condições em linguagem simples** perto do botão.
9. **Página para um segundo público** (empresas, eventos, atacado) com pedido de orçamento.
10. **Link de pagamento externo do próprio negócio** para quem já vende por Hotmart, Mercado Pago ou Asaas.

## 7. O que não copiar

1. **Checkout próprio com cobrança**: 17 campos, CPF e endereço para um serviço online. Fere a regra de não ter checkout do lojista na plataforma e afasta quem só quer conversar.
2. **WordPress, WooCommerce, Salient e WPBakery**: a arquitetura continua um Worker + Supabase com publicações imutáveis (ADR 0005, 0008, 0009).
3. **Rastreadores de terceiros** (Pixel, GA, GTM, Mailchimp) carregados sem consentimento. A Vitrine mantém só métricas agregadas próprias.
4. **Comportamento inconsistente do "adicionar"**: às vezes gaveta, às vezes página do carrinho.
5. **Cupom, conta de cliente, "Atualizar carrinho"** e newsletter pré-marcada.
6. **Restos de tema** (portfólio de demonstração, "START A PROJECT", "CONTACT US") e strings em inglês.
7. **Uma página indexada por turma** (`turma01`, `turma02`, edições especiais): 33 endereços, quase todos esgotados. Na Vitrine, o item continua o mesmo e muda só o estado ou a data.
8. **Ausência de WhatsApp e de rodapé**: perde o canal que mais converte no Brasil e as informações de confiança (contato, políticas).
9. **Ancoragem "de/por" sem regra**: só com preço anterior verdadeiro e data de término. Fica fora do escopo inicial.
10. **Fotos em PNG pesado** e imagens sem texto alternativo.

## 8. Comparação com a vitrine atual

Base lida: `AGENTS.md`, `DESIGN.md`, `CONTEXT.md`, `docs/marketing-design.md`, `docs/architecture.md`, ADRs 0005 a 0012, specs 008 e 009, `docs/auditoria-ux/` (relatório consolidado, matriz e jornada 68), `web/vitrine/index.html`, `web/vitrine/vitrine.js`, `web/assets/storefront-renderer.mjs` e `src/publication-engine.mjs`. Capturas atuais da vitrine no Context do projeto, em `media/auditoria-ux/68-vitrine-publica/` (por exemplo `bazar-375-claro.png` e `barra-selecao-fim-da-pagina-390-claro.png`).

| Elemento da referência | Vitrine hoje | Ação |
| --- | --- | --- |
| Cabeçalho com nome/logo, menu e sacola | Cabeçalho mostra o selo "Vitrine", o endereço `/slug` e o tema; o nome do negócio só aparece no hero. Menus de navegação existem na estrutura modular, mas não há sacola | **Adaptar** (issue 18) |
| Gaveta lateral da seleção | Barra fixa inferior "Resumo da seleção" com total e "Preencher dados"; abre as etapas na mesma página. Seleção em memória, perdida ao recarregar | **Adaptar**: gaveta reaproveita o mesmo estado e leva às etapas (issue 19) |
| Checkout com pagamento | Etapas Escolher → Seus dados → Revisar e enviar, terminando em `wa.me` com mensagem pronta (ou pela Mila, ADR 0012) | **Manter**: é a vantagem da Vitrine. Corrigir a mensagem incompleta já mapeada em `PB-06` |
| Pagamento online | Não existe, por decisão | **Adicionar opcional**: link de pagamento do próprio negócio por item (issue 24) |
| Página por produto | Item só existe como cartão na grade, com uma foto e descrição | **Adicionar** (issue 20) |
| Hero pessoal com foto e 2 ações | Módulo `hero` com título e subtítulo; sem foto nem botões | **Ampliar** o módulo (issue 21) |
| Faixa de destaques com ícones | Não existe | **Adicionar** módulo `highlights` (issue 21) |
| Depoimentos | Módulo `testimonials` com citação e nome, marcação simples | **Ampliar**: contexto, foto opcional, consentimento, visual (issue 22) |
| FAQ | Módulo `faq` com `details/summary` | **Ampliar**: FAQ por item e acabamento (issues 20 e 22) |
| Esgotado + lista de interesse | Item inativo some da publicação (`available` é campo privado) | **Adicionar** estado público "Em breve / avise-me pelo WhatsApp" (issue 23) |
| Compartilhar | Não existe | Incluído na página do item (issue 20) |
| Rodapé | Logo da Vitrine, nota de preços e aviso de privacidade | **Ampliar**: contato, redes, horário, políticas, crédito (issue 25) |
| Página "Empresas" | Páginas adicionais e módulo `quote_request` já existem | **Receita** dentro do modelo (issue 26), sem código novo |
| Landing de oferta longa | Páginas e seções modulares cobrem a maior parte | **Receita** no modelo (issue 26); preço "de/por" fica de fora |
| Categorias e filtros | Chips de categoria | **Manter**. Busca só se a vitrine passar de ~30 itens (fora do escopo) |
| Lista de interesse por e-mail (Google Forms) | — | **Não copiar**: a captação vai por WhatsApp, sem guardar contatos na plataforma |
| SEO por item, JSON-LD | OG da vitrine; JSON-LD previsto na issue 07 | Depende da issue de SEO local do estudo |
| Desempenho e terceiros | Um módulo próprio, sem terceiros, cache na borda | **Proteger** com teste automatizado (issue 27) |

Pontos já cobertos pela auditoria e que estas issues **não duplicam**: foco perdido nas etapas (`PB-09`, `PB-17`), contraste dos selos (`PB-07`), mensagem do WhatsApp incompleta e número fictício (`PB-06`), termos proibidos, incluindo o `<title>` "Cardápio Digital" de `web/vitrine/index.html` (`PB-18`), e o acabamento de 404 e rodapé em 768–1440 px (`PB-26`).

## 9. Decisões

1. **A estrutura da Laura vira o padrão das vitrines de serviços e produtos**, na ordem: cabeçalho (identidade, menu, sacola) → hero pessoal → destaques → itens da vitrine → sobre → depoimentos → FAQ → chamada final → rodapé. É uma receita de módulos dentro da arquitetura atual (um Worker, Supabase, publicações imutáveis), não um tema novo nem um CMS de terceiros.
2. **"Carrinho" vira "Sua seleção".** O ícone é uma sacola com contador, e o texto da interface é "Sua seleção" (nas vitrines de orçamento, "Seu pré-orçamento"). Não se usa "carrinho", "checkout" nem "finalizar compra", porque prometem um pagamento que a plataforma não faz. O botão final é "Enviar pelo WhatsApp" (ou "Enviar para a Mila").
3. **A gaveta não cria um segundo fluxo.** Ela lê e altera o mesmo estado da barra de seleção e leva às etapas existentes. A barra inferior continua no celular quando a gaveta está fechada.
4. **A seleção persiste só na sessão do navegador** (`sessionStorage`, chave por vitrine), sem dados pessoais. Os dados da etapa 2 não são guardados. Fechar a aba apaga tudo.
5. **Sem checkout, cobrança ou conta de cliente na plataforma.** Quem quiser receber online informa o **link de pagamento do próprio negócio** por item. O link só é aceito de uma lista de domínios de pagamento conhecidos, abre fora da vitrine e aparece como opção secundária ao WhatsApp, com o aviso "o pagamento é feito no site do negócio". Isso segue o estudo de mercado (sem Stripe Connect e sem responsabilidade por estornos).
6. **Cada item ganha uma página própria compartilhável**, gerada do mesmo manifesto publicado (sem consulta relacional por visita, ADR 0008), com OG do item e botão "Compartilhar". A descrição longa e o FAQ do item têm limites de tamanho para o manifesto continuar abaixo de 256 KiB (ADR 0009).
7. **Item indisponível pode continuar visível** com "Em breve" e o botão "Avise-me pelo WhatsApp", que abre uma mensagem pronta. A plataforma não guarda lista de e-mails nem telefones.
8. **Nenhum rastreador de terceiros na vitrine pública.** Origem do tráfego e cliques seguem pelas métricas agregadas próprias (issue 09).
9. **Preço "de/por", contagem regressiva e parcelamento simulado ficam fora** desta leva. Exigem regra de preço anterior verdadeiro (CDC) e podem virar uma issue própria depois.
10. **Página "Para empresas" e landing de oferta são receitas de páginas e seções** que já existem (páginas adicionais, `quote_request`, `testimonials`, `faq`), documentadas no modelo. Não exigem módulo novo.
11. **Terminologia**: "vitrine" e "itens da vitrine" em toda a interface; nunca "catálogo", "cardápio", "loja" ou "carrinho".
12. **Visual**: as vitrines seguem sólidas (spec 009, FR-011), com a cor de destaque do tema da vitrine. Da referência vêm a hierarquia, os cantos arredondados e a foto no hero, não a paleta roxa nem as fontes.

## 10. Issues

As 10 propostas viraram as issues 18 a 27 de [`docs/backlog/estudo-mercado/`](backlog/estudo-mercado/README.md), com as partes que repetiam outras issues ou pacotes da auditoria fundidas (lista no índice do backlog):

| Proposta | Issue | Título | Depende de |
| --- | --- | --- | --- |
| 01 | 18 | Cabeçalho da vitrine com identidade, menu e ícone "Sua seleção" | — |
| 02 | 19 | Gaveta lateral "Sua seleção" ligada ao fluxo em etapas | 18, `PB-06`, `PB-09`, `PB-17` |
| 03 | 20 | Página própria do item, compartilhável | 07, 18, 19 |
| 04 | 21 | Hero com foto e duas ações, e módulo de destaques | — |
| 05 | 22 | Depoimentos e perguntas frequentes com acabamento | — |
| 06 | 23 | Item "Em breve" com "Avise-me pelo WhatsApp" | 20 |
| 07 | 24 | Link de pagamento do próprio negócio por item | 20 |
| 08 | 25 | Rodapé completo da vitrine | 08, 18 |
| 09 | 26 | Modelo "Serviços e produtos" com a receita de seções | 18, 21, 22, 25 |
| 10 | 27 | Orçamento de desempenho e acessibilidade da vitrine pública | — |

## 11. Limites desta análise

- As medições de desempenho vêm de um navegador automatizado com rede de servidor. Não substituem Lighthouse nem um teste em 4G real.
- O checkout foi só visualizado. Nenhum dado foi digitado e nenhum pedido foi feito. O item adicionado ficou só na sessão do navegador automatizado.
- O contraste do menu do celular foi avaliado a olho na captura, sem medir.
