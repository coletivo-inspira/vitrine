# Estudo de mercado 2026 — integrações, aquisição e preços

Data: 2026-11-14. Texto-base enviado pelo Lino e resumido aqui sem alterar números
nem recomendações. Os valores de 2026 vêm das fontes listadas no fim e **não foram
reconferidos** nesta entrega (Princípio IV da constituição: preços de terceiros mudam
e devem ser revistos antes de cada uso público).

Decisões do Lino sobre o estudo, em 2026-11-14:

- **1.a — arquitetura atual mantida.** O estudo propõe um SaaS com um repositório
  `vtr-*` por cliente (via `@octokit/rest`), Astro 5, Tailwind e Cloudflare Pages.
  Isso **não** será adotado. Continuam o Worker único `vitrine-inspira`, o Supabase
  e os snapshots públicos imutáveis (ADR 0005, 0008 e 0009). Só as funcionalidades do
  estudo são adaptadas a essa base.
- **2.b — planos do estudo e cobrança recorrente pelo Asaas desde já**, com o Stripe
  como complemento posterior. Registrado no [ADR 0013](adr/0013-plans-and-recurring-billing.md).

As issues derivadas estão em [`docs/backlog/estudo-mercado/`](backlog/estudo-mercado/README.md).

## 1. Posicionamento

O mercado se divide em três categorias, e nenhuma atende bem micro e pequenos
negócios, criadores, produtores culturais e serviços locais (piloto: Guavira Fotos):

1. **Link na bio** (Linktree, Beacons.ai). O Linktree não aceita domínio próprio em
   nenhum plano. O Beacons cobra 9% por venda nos planos Free e Creator (US$ 10).
2. **Loja com carrinho** (Nuvemshop, Bagy). O abandono de carrinho passa de 70% (Baymard).
3. **Automação de conversas** (Manychat, BotConversa, Kommo, Total Chat, Octadesk).
   Configuração complexa, preço em dólar ou acrescido das tarifas da Meta.

Comportamento do público: 82% conversam com marcas pelo WhatsApp, 60% compram pelo
canal e a conversão chega a ser 4 vezes maior; 71% enviam imagens e 60% vídeos.
A vitrine funciona como **pré-filtro visual**: o visitante escolhe antes e chega ao
WhatsApp por um link `wa.me` com a mensagem pronta, como lead qualificado.

**Lugar da Vitrine Inspira:** página pública leve, com domínio próprio, 0% de
comissão e conversão final pelo WhatsApp do negócio (ou pela Mila, ADR 0012).

## 2. Tarifas da Meta (Cloud API do WhatsApp, Brasil)

- Desde 01/07/2025 a cobrança é por mensagem entregue. Desde 01/10/2026 as mensagens
  de serviço e de utilidade dentro da janela de 24 h também passam a ser cobradas,
  depois de uma franquia de 1.000 mensagens de serviço por mês por número.
- Marketing: US$ 0,0625 (R$ 0,32 a 0,4633), sem desconto. Utilidade: US$ 0,0068
  (R$ 0,035 a 0,0504). Autenticação: US$ 0,0068. Serviço: US$ 0,0068 depois de
  1.000 por mês. Meta Business Agent: US$ 2 por milhão de tokens (cerca de
  US$ 0,04 a 0,05 por mensagem, R$ 0,20 a 0,28), sem franquia.
- Click-to-WhatsApp: gratuito por até 7 dias (ou 72 h) quando a empresa responde em
  24 h. WhatsApp Flows: até 8 telas numa mensagem, economia de até 90%.
- Efeito estimado: loja com 3.000 respostas por mês, cerca de R$ 70 a mais;
  restaurante com 10.000 respostas e 2.000 confirmações, cerca de R$ 385; clínica com
  20.000 respostas e 4.000 lembretes, cerca de R$ 800.

**Consequência para a Vitrine:** a navegação acontece numa página estática, fora da
cobrança por mensagem; o WhatsApp entra só no fechamento. Nenhuma issue usa a API
oficial do WhatsApp nem a do Instagram (ADR 0005 e 0012).

## 3. Concorrentes e preços (2026)

| Produto | Preço | Observação |
| --- | --- | --- |
| Manychat | Free (25 contatos); Essential US$ 17 (US$ 14 anual, 250 contatos, +US$ 0,10/contato); Pro US$ 39 (US$ 29 anual, 2.500, +US$ 0,05); Business US$ 99; Advanced US$ 199 | Carteira pré-paga para WhatsApp, e-mail e SMS. Comment-to-DM, menção em Story, menu do Instagram, campos, tags, integrações. Dificuldade média a alta |
| SendPulse | Grátis (3 bots, 500 inscritos); Professional US$ 12 (US$ 9,60 anual) | — |
| Chatfuel | A partir de US$ 20 com US$ 20 em créditos | — |
| BotConversa | Starter R$ 189/mês anual (R$ 2.268) ou R$ 297 mensal; Pro + API Oficial R$ 199/mês anual (R$ 2.388), promoção 12× R$ 149, R$ 299 mensal | Mais de 50 mil clientes. Starter usa QR Code não oficial, até 5 membros, sem IA. Carteira Meta: marketing R$ 0,4633; utilidade e serviço R$ 0,0504 |
| Total Chat | Básico R$ 99,90 (2 usuários); Profissional R$ 179,90 (promoção) ou R$ 349,90 (5 usuários, +R$ 65/usuário) | Pouca transparência técnica |
| Azallon (Dispara PRO) | R$ 167/mês (1 usuário e 1 número), +R$ 39/usuário, +R$ 47/número | Só API oficial; WebChat e CRM Kanban |
| Dealism.ai | Starter R$ 99 (100 créditos de IA/dia); Pro R$ 199 (150/dia) | Agentes sem fluxos |
| RMChat | R$ 397 (5 atendentes), R$ 597, R$ 1.597,90 (20) | — |
| Kommo | US$ 20, 30 ou 45 por usuário/mês, fidelidade mínima de 6 meses | 2.500, 5.000 ou 10.000 leads; Salesbot, Kanban, links e QR |
| Octadesk | Care R$ 1.399 (1.500 usuários ativos por dia + R$ 150/usuário); One R$ 2.499 (R$ 1.999 anual promo); Flow R$ 4.399 (R$ 3.519 anual); Nexus sob consulta | Implantação obrigatória |
| Blip | Consultivo; cerca de R$ 2.449 a 2.600/mês, mínimo R$ 1.023,04; Blip Super R$ 7.292 (50 agentes) | — |
| WATI, respond.io, SleekFlow | US$ 49–249 (cerca de 20% de acréscimo); US$ 79–279; US$ 149/349 | — |
| Linktree | Free; Starter US$ 8 (6); Pro US$ 15 (12); Premium US$ 35 (30) | Taxa de 0 a 12% + Stripe; sem domínio próprio; estatísticas de 28 dias no Free |
| Beacons.ai | Free; Creator US$ 10 (US$ 100/ano, domínio grátis no 1º ano); Creator Plus/Store Pro US$ 30; Creator Max US$ 90–100 | 9% no Free e no Creator + Stripe 2,9% + US$ 0,30 ≈ 12%. Acima de US$ 222–333 por mês em vendas vale migrar para o de US$ 30 (≈ R$ 165) |
| Stan Store | US$ 29 e US$ 99 | Sem plano grátis; 0% de taxa da plataforma |
| Carrd / NiftySite | US$ 9–19 por ano / Free e US$ 15 | — |
| Kyte | FREE R$ 0 (1 usuário, só celular, 1 foto por item); PRO R$ 49,90 (3); GROW R$ 69,90 (10, versão web, IA); PRIME R$ 99,90 | Sem NF-e; layout engessado; endereço `seu-negocio.kyte.site` |
| Bagy / Nuvemshop | Bagy a partir de R$ 19; Nuvemshop Grátis, R$ 58,66/mês anual (R$ 704/ano), R$ 139/mês, R$ 381,66/mês anual (R$ 4.580/ano) | — |
| JunquiNet | 0% de comissão + taxa única de ativação de cerca de R$ 950 em 3× + mensalidade enxuta | Referência para a implantação paga |

## 4. Fricções observadas no Manychat (22 pontos, conta do Coletivo INSPIRA)

- **Autenticação confusa:** login pelo Instagram versus Meta for Business; recursos
  bloqueados por permissões; WhatsApp "Não verificado", limite de 250 conversas em
  24 h, linha de crédito "Atualização necessária" e botões desabilitados sem explicação.
- **Salvar versus publicar:** "Salvando…" no editor do menu do Instagram e um botão
  separado "Atualizar Menu". Excluir o Instagram apaga assinantes; excluir o WhatsApp
  preserva, e nenhum dos dois pede confirmação proporcional ao efeito.
- **Fluxos:** campos do usuário versus campos do bot, tags e mensagem padrão; regra
  contraditória ("Atribuir ao mesmo agente" marcado e texto "Não atribuída"). Menus
  com botões multiplicam por 5 a 10 o consumo da franquia.
- **Limite revelado tarde:** o limite de canais (Telegram) aparece só depois de clicar
  em Conectar. Carteira em branco sem mensagem de erro. Traduções ruins ("Digite" para
  *Type*, abas em inglês) e rótulos acessíveis invertidos num formulário.

Essas fricções viram as diretrizes do painel (seção 7).

## 5. Precificação adotada (decisão 2.b)

| Nível | Plano | Preço | Resumo |
| --- | --- | --- | --- |
| 0 | Gratuito/Social | R$ 0 | Endereço `vitrine.inspira.dev.br/<endereço>`, selo "Apoio Coletivo Me Inspira", financiado pelo patrocínio do nível 3 |
| 1A | Essencial | R$ 39/mês | Vitrine com domínio próprio do cliente, dados estruturados de negócio local, botões de WhatsApp e Instagram, 0% de comissão |
| 1B | Profissional | R$ 89/mês | Vários blocos de itens, pré-orçamento com webhook para CRM ou planilha, `vitrine.json` para robôs de conversa, relatórios de conversão |
| 1C | Equipe/Multi-Vitrine | R$ 149 a 199/mês (tabela: R$ 169) | Várias vitrines do mesmo cliente |
| 2 | Consultoria | Implantação Chave na Mão R$ 290 a 490; projetos a partir de R$ 950 | DNS, imagens, Google Meu Negócio e QR Codes impressos; design exclusivo e módulos novos |
| 3 | Patrocínio | Cotas negociadas | Leitura de métricas agregadas |

O Essencial fica 22% abaixo do Kyte PRO, 33% abaixo da Nuvemshop anual e abaixo do
Linktree Starter e do Beacons Creator. Quem vende acima de R$ 433 por mês no Beacons
paga mais de R$ 39 só na taxa de 9%.

**Margem** (fórmula do estudo): \( R_{liq} = P - (P \cdot \tau_{perc} + \tau_{fixa}) - C_{infra} - C_{suporte} - I_{trib} \).
Stripe cartão: 3,99% + R$ 0,39; com Billing, +0,7% e R$ 0,50.

| Plano | Stripe | Stripe Billing | Asaas (estimado) | Margem |
| --- | --- | --- | --- | --- |
| Essencial R$ 39 | R$ 37,05 | R$ 36,67 | R$ 37,01 a 38,00 | 94,0% a 97,4% |
| Profissional R$ 89 | R$ 85,06 | R$ 84,33 | R$ 86,50 a 87,50 | 94,7% a 98,3% |
| Equipe R$ 169 | R$ 161,87 | R$ 160,57 | R$ 166 a 167 | 95,0% a 98,8% |
| Consultoria R$ 950 | R$ 911,70 | R$ 904,94 | R$ 945 a 948 (Pix) | — |

**Meios de pagamento:**

- **Asaas** é o motor principal: sem mensalidade, tarifa só no recebimento (Pix,
  boleto e cartão) e Pix Automático.
- **Stripe** é complemento para cartão e clientes do exterior, depois.
- **Stripe Connect (repasse entre contas)** custa R$ 6 por conta ativa por mês +
  0,25% + R$ 0,67 por repasse: **evitar**. As vendas do lojista seguem pelos links de
  pagamento dele (Mercado Pago, Asaas do lojista), sem a Vitrine responder por
  estornos.

## 6. Estratégias de aquisição

1. **Comment-to-Vitrine.** Um gatilho de comentário no Manychat ou no BotConversa
   envia **uma** mensagem no Direct com o cartão de prévia (OpenGraph) da vitrine e
   UTM (`?utm_source=ig_comment&utm_campaign=reel_01`). A conversão termina no `wa.me`
   com mensagem pronta e economiza até 90% das mensagens faturadas.
2. **Modelos compartilháveis.** "Usar como modelo" do Manychat (link público
   instalável) e fluxo padrão no BotConversa, com a variável global
   `URL_VITRINE_INSPIRA` e notas para criar a vitrine grátis ou Essencial. Para
   Profissional com Manychat Pro ou BotConversa Pro: `vitrine.json` consultado por
   HTTP GET (horário, links, agenda).
3. **Pré-qualificação para CRMs** (Kommo, Total Chat, BotConversa, Google Planilhas):
   micro-formulário de pré-orçamento (categoria, data, bairro) junto ao botão do
   WhatsApp. O Worker dispara um webhook em segundo plano e cria o card no funil antes
   da primeira mensagem. Plano Profissional.
4. **Migração sem comissão.** Usuários do Linktree: um importador lê os links públicos
   e a foto e monta um rascunho de demonstração. Beacons: acima de R$ 433 por mês em
   vendas, a comissão passa de R$ 39. Kyte: identidade própria, domínio e edição no
   computador.
5. **Arranque:** publicar o piloto Guavira Fotos e trazer portfólios anteriores como
   mostruário para patrocinadores e clientes.

## 7. Diretrizes do painel

1. **Central de canais transparente:** limites e pré-requisitos antes do clique;
   links diretos (`wa.me`, perfil do Instagram, sem login de terceiros) separados de
   integrações (API e webhook); status, titular, escopos e diagnóstico.
2. **Publicação em 3 estados:** rascunho salvo, prévia para testar no celular e
   publicado no domínio oficial (data, hora e status do certificado).
3. **Ações críticas reversíveis:** pausar a vitrine (sai do ar, dados intactos),
   desconectar domínio e arquivar ou excluir, sempre com resumo do impacto e restauração.
4. **Papéis:** proprietário do coletivo, consultor ou desenvolvedor, cliente lojista
   e patrocinador (só leitura de métricas agregadas).
5. **Dados validados na origem,** com rótulos em português claro; recusar telefone
   fora de `55DDDNÚMERO` e cor hexadecimal inválida.
6. **Transparência financeira e telemetria:** fatura da assinatura, orçamentos de
   consultoria e relatório de visitas, cliques no WhatsApp, "Traçar rota" e leituras
   de QR, conforme a LGPD.

O que já tem cobertura no repositório e o que virou issue está no
[índice do backlog](backlog/estudo-mercado/README.md#cobertura-existente-fusões-e-cortes).

## 8. Fontes citadas no estudo

manylinks.io (Linktree Free vs Pro 2026); builtbyfoundry.io e elev8or.io (taxa de 9%
do Beacons); nuvemshop.com.br; bagy.com.br; dealism.ai (preço do BotConversa 2026);
kommo.com/precos; octadesk.com/precos; developers.facebook.com (preços da WhatsApp
Business Platform); getkanal.com; omago.ai; assessoriadigital.com.br;
activepieces.com; agenciaprimeirapagina.com.br; azallon.com.br;
ajuda.botconversa.com.br (faturamento e carteira); botconversa.com.br (WhatsApp
Flows); help.octadesk.com (nova cobrança da Meta, outubro de 2026); nacao.digital;
chatfuel.com; botconversa.app.br; rmchat.com.br; tudoprawhats.com.br;
botaihub.com.br; talqui.chat; niftysite.co; beacons.ai; help.beacons.ai;
mingly.link; withme.so; stan.store; zanfia.com; kyteapp.com; vendasimples.com.br;
aiinfluencer.cc; catalogomobile.com.br; onixfy.com; renvchat.com.br;
reclameaqui.com.br; converzap.com; 7club.com.br; staffia.com.br;
whatsappbusiness.com; docs.kyteapp.com; socialhub.pro; rdstation.com;
wchat.com.br; mercabot.com.br; zapfunil.com; blip.ai; webcatalogo.com;
stoqui.com.br; linkvendas.com.br. Baymard Institute para o abandono de carrinho.
