# Modelagem do site de divulgação

Status: proposta de front-end; não é implementação nem publicação. Escopo confirmado
pelo usuário em 2026-11-07: somente `vitrine.inspira.dev.br`. Painel, login, editor,
cardápio funcional e checkout não fazem parte desta entrega visual.

## Trabalho da página

Modo: Persuade. Ajudar a pessoa de um pequeno negócio a entender o produto, ver
uma possibilidade concreta e iniciar conversa sobre sua vitrine. O resultado
esperado é compreensão e contato qualificado, não um cadastro simulado.

Contexto de produto em PRODUCT.md. Direção Liquid Glass solicitada pelo usuário;
recomendações de composição delegadas ao agente. Nenhuma marca, logo ou paleta
oficial adicional foi fornecida.

## Direção proposta

Uma vitrine luminosa: base branca com luz azul-clara e verde suave, texto escuro,
um acento verde para ação e vidro concentrado na navegação e controles. O conteúdo
principal fica sobre superfícies estáveis. A demonstração do produto é o foco;
efeitos óticos não substituem demonstração nem explicação.

Referência: [Apple — Materials](https://developer.apple.com/design/human-interface-guidelines/materials).
Traduzir a linguagem de transparência, profundidade e movimento para a web, sem
alegar uso do componente nativo Apple. Materiais distintos, leitura e preferências
de acessibilidade precisam continuar funcionando sem blur.

Não haverá vidro em todos os blocos, textos sobre fotografia difícil de ler,
refratores WebGL, partículas ou animação contínua de fundo. Começar com CSS leve,
tipografia de sistema bem ajustada e movimento breve; sem fonte ou biblioteca paga.

## Primeiro viewport

- Cabeçalho flutuante: marca, Como funciona, Possibilidades, Planos e contato.
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
camadas fixas sobrepostas. Touch targets com pelo menos 44 px como meta de projeto.

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
