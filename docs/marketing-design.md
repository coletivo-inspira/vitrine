# Modelagem do site de divulgação

## Categorias dos exemplos reais — revisão solicitada

Agrupamento por função do site, não por profissão:

| Tipo | Exemplos |
| --- | --- |
| Cardápio digital | Pastus Fogo & Parrilla; Bar da Cácia |
| Serviços | Felipe Carvalho; Nexa Enfermagem; Sara Coutinho; Cássio Bragança; Dani Braga Design |
| Portfólio | Nathália Verri; Dani Braga Design; Aldeia MIX; Fantaze |

Dani aparece nas duas funções por orientação do usuário. Prévias de coluna:
Pastus, Felipe e Nathália, respectivamente. Preservar nomes e links existentes;
não inferir especialidades profissionais a partir da categoria. Os exemplos
são trabalhos reais e não modelos disponíveis para contratação. Este agrupamento
substitui as listas anteriores de exemplos nas colunas Portfólio/Serviços.
Verificação: 23 testes e build passaram; ambos os temas em 1440/390 px sem
overflow ou erros, menu e controle de tema funcionais.

Tema claro/escuro solicitado e implementado: alternância sol/lua sempre visível
no cabeçalho com JavaScript, preferência inicial do sistema e escolha explícita
salva no navegador. No escuro, base floresta/carvão, texto branco quebrado e ações
pêssego; letras e endosso da logo invertidos, caixa lima/V floresta preservados.
As capturas dos exemplos mantêm as próprias identidades. Tokens em DESIGN.md.

Revisão de marca aprovada em 2026-11-07: opção A do estudo de logo, V na caixa
verde-lima e somente “vitrine” em letras de proporção natural. Aplicada em SVG
no cabeçalho, rodapé e favicon; endosso do coletivo no texto do rodapé e Orb oficial
preservada. Animação única de abertura de 700 ms, sem movimento no modo reduzido.
Essa decisão substitui a assinatura anterior do produto; Syne/DM Sans da página,
paleta laranja pontual e restante da composição permanecem.

Status: direção aprovada e interface de divulgação implementada; sem publicação remota. Escopo confirmado
pelo usuário em 2026-11-07: somente `vitrine.inspira.dev.br`. Painel, login, editor,
cardápio funcional e checkout não fazem parte desta entrega visual.

**Direção aprovada: A — Laranja pontual.** Distribuição preservada, fundo neutro,
texto carvão e laranja nas ações; sem os campos verde/lima e sombras fortes do
estudo anterior. [Paleta e critérios](design/palette-exploration.md).

[Estudo visual desktop/mobile aprovado — A](design/marketing-palette-orange.png), gerado
como mockup conceitual. É referência de composição, não screenshot de interface
implementada. Nomes de negócios e imagens dentro dos previews são demonstrativos,
não cases; o logotipo de produção deve vir dos vetores oficiais. O arquivo não deve ser
usado como imagem única para simular uma página funcional.

Os estudos anteriores `marketing-liquid-glass-concept.png` e
`marketing-brandbook-concept.png` foram superados pela orientação
do usuário de priorizar o brandbook; permanece apenas como histórico, sem autoridade
para implementação.

## Trabalho da página

Modo: Persuade. Ajudar a pessoa de um pequeno negócio a entender o produto, ver
uma possibilidade concreta e iniciar conversa sobre sua vitrine. O resultado
esperado é compreensão e contato qualificado, não um cadastro simulado.

Contexto de produto em PRODUCT.md. Autoridade principal: brandbook do coletivo,
fornecido pelo usuário após o estudo inicial. Liquid Glass é referência secundária.
Extração da marca em [brandbook-reference.md](design/brandbook-reference.md).

## Direção proposta

Uma vitrine do Coletivo Inspira com tratamento A aprovado: fundo #F7F7F4,
texto #27322E, superfície suave #FBEDE5, ação #C74414 com texto branco e borda
#DDDCD6. Syne nos títulos, DM Sans no corpo; malha pontilhada discreta, bordas
finas e sombras suaves. Preservar a distribuição do estudo. Logo e Orb oficiais
mantêm suas cores e proporções; a variação pertence ao produto, não altera o
brandbook global. Liquid Glass permanece complementar.

Referência secundária: [Apple — Materials](https://developer.apple.com/design/human-interface-guidelines/materials).
Usar transparência, profundidade e movimento somente onde o brandbook permite, sem
alegar uso do componente nativo Apple. Materiais distintos, leitura e preferências
de acessibilidade precisam continuar funcionando sem blur.

Não haverá vidro em todos os blocos, textos sobre fotografia difícil de ler,
refratores WebGL, partículas ou animação contínua de fundo. Começar com CSS leve,
Syne/DM Sans com arquivos e licença conferidos e movimento breve; sem biblioteca paga.
Orb conforme a referência oficial: uma por página, canto inferior esquerdo ou
rodapé, link para o hub; não trocar por CTA de orçamento, logotipo ou decoração do hero.

## Primeiro viewport

- Cabeçalho claro, modular: marca oficial, Como funciona, Possibilidades, Planos e contato.
- Chamada: **Seu negócio, em vitrine.**
- Apoio: **Um site com a sua cara. Comece com um modelo e personalize quando precisar.**
- Ação principal: **Ver possibilidades**, leva à seção demonstrativa.
- Ação secundária: **Como funciona**, leva à explicação.
- Demonstração: mockup de cardápio de pizzaria em moldura de navegador, identificado
  como **Modelo demonstrativo**, sem fingir cliente ou interface já disponível.

Na primeira publicação, informar o estado real do lançamento. Enquanto não houver
criação de conta funcional, não usar Criar agora ou Entrar como se fossem operantes.

## Sequência da página

1. Abertura: valor do produto e demonstração identificada.
2. Como funciona: escolher modelo, dar identidade, compartilhar. Texto público
   ajustado ao que estiver operacional na data do lançamento.
3. Possibilidades: cardápio, portfólio e serviços como exemplos ilustrativos.
   Somente cardápio integra o primeiro recorte funcional; outras categorias não
   serão apresentadas como templates disponíveis sem implementação.
4. Feito com a Inspira: portfólio real, alimentado por content/portfolio.json.
   Sem cases aprovados, ocultar esta seção; não preencher com clientes fictícios.
5. Oferta: distinguir vitrine básica, endereço personalizado e projeto sob medida.
   Preços de docs/commercial-offer.md seguem propostos; não exibir contratação ativa
   ou botão de assinatura antes de validar operação e condições comerciais.
6. Customização: objetivo, referência e contato para orçamento; cada case pode
   oferecer Quero algo parecido com sua referência no WhatsApp.
7. Perguntas frequentes: endereço básico, domínio próprio, o que é customização,
   registro/renovação e funcionamento do atendimento.
8. Encerramento: chamada de contato, marca e links de privacidade/termos reais.

O telefone comercial da equipe ainda é pré-requisito para ativar Pedir orçamento.
Até existir, mostrar estado indisponível ou remover a ação; não inventar destino.
Sem formulário de email, analytics de terceiros ou chat pago no lançamento inicial.

## Componentes a desenhar

Cabeçalho desktop/mobile; botão principal, secundário e indisponível; demonstração
de modelo; item de processo; case com link externo; comparação de oferta; FAQ;
chamada final e rodapé. Uma família coerente de contornos, espaçamento, foco,
raios e superfícies; tokens definitivos serão registrados com a implementação.

## Mobile e estados

No celular: título e ação primeiro, demonstração abaixo; navegação compacta,
fluxo vertical, sem rolagem lateral. Evitar fundo desfocado de tela inteira ou
camadas fixas sobrepostas. Reservar espaço para a Orb sem encostar em controles;
usar rodapé quando o canto estiver ocupado. Touch targets com pelo menos 44 px como meta de projeto.

Prever: menu fechado/aberto, foco de teclado, hover sem dependência para leitura,
case sem imagem, portfólio vazio, link externo, contato indisponível e FAQ
expandido/recolhido. A ação não depende de efeito de vidro nem de animação.

## Acessibilidade e desempenho

Texto normal com contraste mínimo 4,5:1 e texto grande 3:1; foco visível e ordem
de leitura semântica. Validar contraste sobre o fundo efetivamente renderizado.
Usar fallback opaco para falta de suporte a backdrop-filter. Respeitar movimento
reduzido e aumento de contraste onde suportados; oferecer alternativa sólida se
a transparência comprometer leitura. Não presumir suporte igual em navegadores.

Imagens responsivas e comprimidas, sem carregar todos os previews antes da dobra;
dimensões reservadas para evitar salto de layout. Sem dependência de rede para
fontes e sem imagem de mockup usada como substituto da página inteira.

## Processo de design e saída esperada

1. Modelagem: este brief e um estudo visual desktop/mobile na conversa.
2. Revisão: ajustar a composição com base no retorno; não reabrir escolhas já delegadas.
3. Implementação posterior: HTML/CSS/JS de verdade, com conteúdo e links finais;
   registrar DESIGN.md e tokens somente a partir da direção efetivamente adotada.
4. Verificação: uma rodada conjunta desktop/mobile, correções em lote e confirmação
   final limitada; teclado, contraste, redução de movimento e fallback de material.
5. Publicação separada: preview Cloudflare, validar e depois conectar o hostname.

A implementação gerou DESIGN.md e .impeccable/design.json a partir do código.
Não publicou o site nem alterou DNS; evidências em docs/design/marketing-qa.md.
Antes de publicar: confirmar responsável pela conta/zona, contato comercial,
cases autorizados, conteúdo de privacidade e o estado real da oferta.

## Revisão: vitrines reais e movimento

Os links indicados pelo usuário em 2026-11-07 foram autorizados como exemplos
reais e conferidos por navegação (HTTP 200). Capturas locais em
`web/assets/showcase/` evitam iframes, trackers e dependência dos sites externos
para renderizar a divulgação. As listas preservam a classificação indicada pelo
usuário; não afirmam autoria, resultados comerciais ou disponibilidade de templates.
Dani Braga aparece em duas categorias por solicitação.

O hero usa quatro folhas: Pastus, Nathália Verri, Dani Braga e Nexa. A folha da
frente sai lateralmente e retorna ao fundo. Intervalo de 5 s; pausa em hover,
foco, aba oculta e fora do viewport. Movimento reduzido desativa autoplay;
próxima vitrine permanece acessível por botão e gesto horizontal. Sem JavaScript,
a primeira prévia e todos os links de exemplos continuam visíveis.

A Orb oficial fica fixa no canto inferior esquerdo, usando o comportamento
original do script, sem `data-mount`. O rodapé tem duas colunas e uma linha de
apoio, empilhadas no celular. A identidade A e as fontes locais são preservadas.

### Critérios de sucesso e medição

Decisão: verificar se exemplos reais ajudam o visitante a encontrar uma referência
para sua ideia. KPI futuro: taxa de exploração = sessões que abrem ao menos um
exemplo / sessões que visualizam Possibilidades. Driver: distribuição dos exemplos
abertos por categoria, para revisar organização e escolha das prévias. São proxies
de interesse, não pedidos ou receita. Não há baseline nem meta de conversão: primeiro
seria necessário aprovar instrumentação e medir um período inicial comparável.
Nenhum rastreamento foi adicionado nesta revisão.

Guardrails verificáveis agora: todos os destinos e recursos carregam; zero erros
JavaScript e overflow horizontal nos tamanhos de QA; pausa e movimento reduzido
funcionam; links acessíveis por teclado; autoplay não continua fora da tela.
Alvos técnicos são critérios de aceite, não resultados comerciais medidos.
