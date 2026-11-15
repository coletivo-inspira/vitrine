# Kit Comment-to-Vitrine: do comentário no Instagram para a vitrine

Issue [#122](https://github.com/coletivo-inspira/vitrine/issues/122). Estudo de mercado,
[seção 2](../market-study-2026.md#2-tarifas-da-meta-cloud-api-do-whatsapp-brasil) e
[seção 6, itens 1 e 2](../market-study-2026.md#6-estratégias-de-aquisição).

Este guia é para quem tem uma vitrine publicada e quer que um comentário no Instagram
("quero", "link", "preço") receba **uma** mensagem no Direct com o link da vitrine.
A pessoa olha os itens com calma na vitrine e, quando decide, abre a conversa no
WhatsApp do negócio com a mensagem pronta.

```text
Comentário no post → 1 mensagem no Direct com o link → vitrine → WhatsApp (wa.me)
```

## O que a Vitrine faz e o que ela não faz

- **Faz:** monta o link da sua vitrine com a marcação de origem
  `?utm_source=ig_comment&utm_campaign=<post>` e conta as visitas que chegam por ele.
- **Não faz:** não se conecta ao Instagram, ao Manychat nem ao BotConversa, não usa a
  API da Meta e não manda mensagens. Quem envia o Direct é a ferramenta que você
  escolher, na sua conta. O link `wa.me` só abre a conversa; a pessoa é quem envia.

## Antes de começar

1. **Vitrine publicada.** No painel, abra a vitrine, confira os itens e clique em
   **Publicar**.
2. **Cartão de prévia.** Na aba **Configurações**, bloco **Google e WhatsApp**, confira
   a simulação do cartão (nome, texto de boas-vindas e imagem). É esse cartão que
   aparece no Direct quando o link é enviado. Se mudar algo, publique de novo; o
   Instagram e o WhatsApp guardam a prévia antiga por algumas horas.
3. **Conta profissional do Instagram** (comercial ou de criador de conteúdo) ligada a
   uma página do Facebook, como as ferramentas pedem.
4. **Conta na ferramenta** (Manychat ou BotConversa) criada por você. A Vitrine não cria
   contas nem fluxos de terceiros.

## 1. Pegue o link no painel

1. No painel, abra a vitrine e vá à aba **Configurações**.
2. Desça até o bloco **Comentário no Instagram: link para o Direct**, logo abaixo do
   QR Code.
3. Em **Nome do post (campanha)**, escreva um nome curto para o post ou reel, como
   `reel_01` ou `promo_dia_maes`. Use um nome diferente para cada post: é assim que você
   compara os posts depois.
4. Clique em **Copiar** ao lado de **Link para a mensagem do Direct**. O painel avisa
   "Link do Direct copiado." (também para quem usa leitor de tela).
5. Se for usar a variável global (recomendado), copie também o **Valor da variável
   `URL_VITRINE_INSPIRA`**: é o endereço da vitrine sem a marcação, igual para todos
   os posts.

Regras do nome do post, as mesmas dos Insights: letras sem acento, números, `_` ou `-`,
até 32 caracteres, começando por letra ou número. O painel converte sozinho
("Reel de Natal!" vira `reel_de_natal`). Seis números seguidos são recusados, porque
parecem telefone, CPF ou CEP. Não coloque nome, telefone ou e-mail de ninguém no nome
do post.

O link fica assim (troque `seu-endereco` pelo endereço da sua vitrine):

```text
https://vitrine.inspira.dev.br/seu-endereco?utm_source=ig_comment&utm_campaign=reel_01
```

O painel usa sempre o endereço da plataforma (`vitrine.inspira.dev.br/...`), que vale
em todos os planos.

## 2. Manychat

Os nomes de menus abaixo são os da interface em português em 2026-11-14; o Manychat
muda telas com frequência e às vezes mostra termos em inglês (entre parênteses). Se um
nome não bater, procure a opção equivalente.

### 2.1 Crie a variável global `URL_VITRINE_INSPIRA`

Assim o endereço fica num lugar só: se ele mudar, você troca uma vez e todos os fluxos
acompanham.

1. Em **Configurações** (Settings), abra **Campos** (Fields).
2. Na parte de **Campos do bot** (Bot Fields), clique em **Novo campo**.
3. Nome: `URL_VITRINE_INSPIRA`. Tipo: **Texto**.
4. Valor: cole o **Valor da variável `URL_VITRINE_INSPIRA`** copiado do painel, por
   exemplo `https://vitrine.inspira.dev.br/seu-endereco`. Salve.

Campo do bot vale para a conta inteira; não confunda com **campo do usuário** (User
Field), que guarda um valor diferente para cada pessoa.

### 2.2 Caminho A: "Usar como modelo"

Quando o Coletivo Inspira publicar o modelo público do fluxo, o link dele fica neste
guia e no painel (ainda não publicado; veja "Passos que dependem de pessoas" no fim).

1. Abra o link do modelo com a sua conta do Manychat aberta no navegador.
2. Clique em **Usar como modelo** (Use template) e escolha a conta do Instagram que vai
   receber o fluxo.
3. O Manychat instala uma cópia na sua conta. A cópia é sua: mudanças no modelo
   original não chegam até ela.
4. Confira a variável `URL_VITRINE_INSPIRA` (passo 2.1). Se o modelo a criou vazia,
   preencha o valor.
5. Siga do passo 5 do caminho B para escolher o post, as palavras e ativar.

### 2.3 Caminho B: montar do zero

1. Vá a **Automação** (Automation) e clique em **Nova automação**.
2. Escolha o gatilho do Instagram **Comentário em post ou reel** (Post or Reel
   Comments).
3. Em **Qual post?**, escolha um post específico (recomendado, combina com o nome do
   post do link) ou qualquer post.
4. Em **Palavras-chave**, coloque as palavras do seu chamado na legenda, por exemplo
   `quero`, `link`, `vitrine`. Evite "qualquer comentário": o robô responderia também a
   elogios e perguntas que pedem uma resposta sua.
5. Ligue a **resposta pública ao comentário** (opcional) e escreva duas ou três
   variações (textos na seção 4), para não repetir a mesma frase em todos os
   comentários.
6. Na **mensagem do Direct**, escreva o texto e, no lugar do link, insira o campo
   `URL_VITRINE_INSPIRA` seguido da marcação do post:

   ```text
   {{URL_VITRINE_INSPIRA}}?utm_source=ig_comment&utm_campaign=reel_01
   ```

   Sem a variável, cole direto o **Link para a mensagem do Direct** do painel.
7. Envie **uma** mensagem só. Botões e menus extras multiplicam as mensagens e o
   consumo do plano (estudo, seção 4); a escolha acontece na vitrine.
8. **Salvar não é publicar:** depois de salvar, clique em **Ativar** ou **Publicar** e
   confira se a automação aparece como ativa.

## 3. BotConversa

O BotConversa é usado sobretudo no WhatsApp. Os nomes abaixo são de 2026-11-14 e podem
mudar; confira na [central de ajuda do BotConversa](https://ajuda.botconversa.com.br/).

### 3.1 Variável `URL_VITRINE_INSPIRA`

1. Abra a área de **campos personalizados** (ou variáveis) da conta.
2. Crie `URL_VITRINE_INSPIRA`, tipo texto, com o valor copiado do painel.
3. Se a sua versão não tiver valor fixo para a conta inteira, cole o endereço direto
   na mensagem do fluxo.

### 3.2 Fluxo padrão

Quando o Coletivo Inspira disponibilizar o fluxo padrão para importar, o link dele
fica neste guia. Até lá, monte assim:

1. Crie um **novo fluxo** chamado, por exemplo, `Comentário → vitrine`.
2. Adicione um bloco de **mensagem** com o texto do Direct (seção 4) e o link:

   ```text
   {{URL_VITRINE_INSPIRA}}?utm_source=ig_comment&utm_campaign=reel_01
   ```

3. Escolha o gatilho:
   - **Comentário no Instagram**, se a sua conta tiver o canal do Instagram conectado;
   - **palavra-chave**, se usar só o WhatsApp (por exemplo, a legenda diz "mande
     VITRINE no nosso WhatsApp"). Nesse caso use `utm_source=whatsapp` no lugar de
     `ig_comment`, para não misturar as origens nos Insights.
4. Termine o fluxo depois dessa mensagem: sem perguntas encadeadas nem menus.
5. Salve, **ative** o fluxo e teste (seção 5).

## 4. Textos prontos

Sem promessas de resultado, prazo ou desconto que você não oferece. Ajuste ao seu
jeito de falar.

**Chamada na legenda do post**

- "Comente QUERO que eu te mando o link da vitrine no Direct."
- "Quer ver todos os itens e valores? Comente LINK."
- "Comente VITRINE e receba o link para escolher com calma."

**Resposta pública ao comentário** (alterne entre elas)

- "Te mandei o link no Direct!"
- "Enviado no Direct, dá uma olhada lá."
- "Mandei a vitrine no seu Direct. Qualquer dúvida, é só chamar."

**Mensagem do Direct**

> Oi! Aqui está a nossa vitrine, com os itens e valores:
> {{URL_VITRINE_INSPIRA}}?utm_source=ig_comment&utm_campaign=reel_01
> Quando escolher, é só tocar em "Continuar" que a conversa abre no nosso WhatsApp
> com o pedido escrito.

**Para serviços e agendamentos**

> Oi! Os serviços, valores e horários estão na nossa vitrine:
> {{URL_VITRINE_INSPIRA}}?utm_source=ig_comment&utm_campaign=reel_01
> Escolha o que precisa e envie pelo WhatsApp; a gente confirma a data por lá.

Evite: "garantido", "últimas vagas", "só hoje" (se não for verdade), "resultado em X
dias" e qualquer número de vendas ou seguidores.

## 5. Teste antes de divulgar

1. Com **outra** conta do Instagram, comente a palavra-chave no post.
2. Confira se chegou **uma** mensagem no Direct e se o cartão de prévia aparece com o
   nome, a imagem e o texto da vitrine.
3. Toque no link: a vitrine abre. Escolha um item e toque em **Continuar** para ver a
   conversa do WhatsApp com a mensagem pronta (não precisa enviar).
4. No painel, em **Insights**, a visita entra com a origem **Comentário no Instagram**
   e o nome do post (`reel_01`). O quadro **Visitas por origem** faz parte dos planos
   Profissional e Equipe; nos outros planos a visita é contada no total, com a origem
   guardada, e o quadro aparece quando o plano muda.

Se o cartão não aparecer, confira a seção "Antes de começar", passo 2, e espere
algumas horas depois de publicar de novo.

## 6. Plano Profissional: o robô consulta o `vitrine.json`

Nos planos Profissional e Equipe, a vitrine publica um arquivo de leitura pública,
`vitrine.json`, com horário, "Aberto agora", endereço, rota, links e itens. Com o
Manychat Pro (ação **External Request**) ou o BotConversa Pro (bloco de requisição
HTTP), o robô lê esse arquivo e responde com os dados da vitrine, sem você manter a
mesma informação em dois lugares.

- Contrato, respostas e exemplos de configuração: [`docs/vitrine-json.md`](../vitrine-json.md).
- Endereço: `https://vitrine.inspira.dev.br/seu-endereco/vitrine.json` (método `GET`,
  sem chave nem cabeçalho).
- Campos mais úteis no Direct: `openNow.label` ("Aberto agora"), `address.formatted`,
  `address.routeUrl`, `url` e `whatsapp.url`.
- Use o link com a marcação do post na mensagem, e não o `url` puro do arquivo, para
  a visita contar como **Comentário no Instagram**:

  > Agora estamos: {{vitrine_status}}. Veja tudo em
  > {{URL_VITRINE_INSPIRA}}?utm_source=ig_comment&utm_campaign=reel_01

- Se a requisição falhar (`404` ou `503`), mande a mensagem padrão com o link da
  vitrine.
- Quem acabou de contratar o Profissional precisa **publicar de novo** para ligar o
  `vitrine.json`.

## 7. Limites e custos de terceiros

A Vitrine não cobra nada a mais por este kit. As ferramentas e a Meta têm regras e
preços próprios, que mudam. Os números abaixo vêm do
[estudo de mercado](../market-study-2026.md), levantados em **2026-11-14** e **não
reconferidos**; confira na página oficial antes de contratar.

| Ferramenta | O que o estudo registra (2026-11-14) | Fonte |
| --- | --- | --- |
| Manychat | Plano Free limitado a 25 contatos; planos pagos em dólar, cobrados por faixa de contatos | Estudo, seção 3; confira em [manychat.com/pricing](https://manychat.com/pricing) |
| BotConversa | Sem plano gratuito registrado; Starter usa conexão por QR Code não oficial e não tem IA; a requisição HTTP para o `vitrine.json` pede o plano Pro | Estudo, seção 3 (dealism.ai e botconversa.com.br); confira em [botconversa.com.br](https://botconversa.com.br/) |

Cuidados:

- **Plano gratuito não é garantia.** Quando o limite de contatos acaba, a ferramenta
  pode parar de responder até você mudar de plano. Acompanhe o contador na sua conta.
- **Janela de 24 horas.** A Meta só deixa a empresa responder livremente por um tempo
  depois da última mensagem da pessoa; fora dessa janela as ferramentas bloqueiam o
  envio ou exigem mensagens pagas e aprovadas. Por isso o kit manda **uma** mensagem
  logo depois do comentário e para por aí.
- **Custos da Meta no WhatsApp (API oficial).** Desde 01/07/2025 a Meta cobra por
  mensagem entregue. Fora da janela de 24 h só vale mensagem de modelo: marketing
  US$ 0,0625 (R$ 0,32 a 0,4633) e utilidade US$ 0,0068 (R$ 0,035 a 0,0504). Desde
  01/10/2026, mensagens de serviço dentro da janela também são cobradas depois de
  1.000 por mês por número (estudo, seção 2, fonte developers.facebook.com). Esses
  valores entram na carteira da ferramenta (Manychat ou BotConversa), não na Vitrine.
- **Por que o kit economiza.** A navegação acontece na vitrine, fora da cobrança por
  mensagem; o WhatsApp entra só no fechamento, numa conversa que a própria pessoa
  abre pelo `wa.me`.

## 8. Privacidade

- A marcação do link guarda só a origem (`ig_comment`) e o nome do post. A vitrine não
  grava cookie nem nada no navegador de quem visita.
- Nome, telefone e mensagens do Instagram ficam na ferramenta que você usa, sob as
  regras dela e da Meta. Informe isso na sua política de privacidade, se a ferramenta
  guardar contatos.

## 9. Problemas comuns

| O que aconteceu | O que fazer |
| --- | --- |
| O robô não respondeu | Confira se a automação está **ativa** (não só salva), se a palavra-chave bate e se o limite do plano gratuito não acabou |
| Chegou o link sem cartão de prévia | Publique a vitrine, confira o bloco "Google e WhatsApp" e espere algumas horas |
| A visita não aparece como "Comentário no Instagram" | Confira se o link tem `utm_source=ig_comment` (sem espaço nem letra maiúscula) e se o nome do post segue as regras da seção 1 |
| A origem aparece como "Outra origem" | O valor de `utm_source` foi digitado diferente; copie de novo pelo painel |
| O nome do post sumiu nos Insights | Tinha seis números seguidos, acento ou mais de 32 caracteres; gere de novo pelo painel |

## Passos que dependem de pessoas

- Publicar o modelo do Manychat ("Usar como modelo") e o fluxo padrão do BotConversa
  na conta do Coletivo Inspira e colocar os links neste guia.
- Teste com uma pessoa voluntária sem conhecimento técnico, registrado no PR.
- Conferir o cartão de prévia no Direct junto com `BLK-UX-68-OG`.
- Reconferir os limites e preços da seção 7 antes de qualquer uso público.
