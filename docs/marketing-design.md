# Modelagem do site de divulgação

Status: proposta de front-end; não é implementação nem publicação. Escopo confirmado
pelo usuário em 2026-11-07: somente `vitrine.inspira.dev.br`. Painel, login, editor,
cardápio funcional e checkout não fazem parte desta entrega visual.

**Revisão de cor em andamento:** o usuário preserva a distribuição e rejeita o
excesso de verde/lima e peso visual do estudo abaixo. Comparações em
[palette-exploration.md](design/palette-exploration.md). Não implementar a paleta
saturada anterior nem assumir uma das novas opções como já escolhida.

[Estudo visual desktop/mobile alinhado ao brandbook](design/marketing-brandbook-concept.png), gerado
como mockup conceitual. É referência de composição, não screenshot de interface
implementada. Nomes de negócios e imagens dentro dos previews são demonstrativos,
não cases; o logotipo de produção deve vir dos vetores oficiais. O arquivo não deve ser
usado como imagem única para simular uma página funcional.

O estudo anterior `marketing-liquid-glass-concept.png` foi superado pela orientação
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

Uma vitrine do Coletivo Inspira: off-white #F7F7F4 pontilhado, floresta #133824 na
tipografia e estrutura, lima #BAFF29 no foco de ação e menta #A3E5C2 nos módulos.
Syne nos títulos, DM Sans no corpo. Composição modular, blocos nítidos e superfícies
estáveis. Usar os vetores oficiais sem redesenho. Efeito de vidro sobretudo na Orb,
sem a atmosfera azul-clara, cápsulas brilhantes ou botões esmeralda do estudo inicial.

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

Esta modelagem não cria DESIGN.md definitivo, não publica o site e não altera DNS.
Antes de publicar: confirmar responsável pela conta/zona, contato comercial,
cases autorizados, conteúdo de privacidade e o estado real da oferta.
