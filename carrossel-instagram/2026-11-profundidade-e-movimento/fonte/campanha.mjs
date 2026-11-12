// Fonte única da campanha: textos, cores, preços e tempos usados por SVG, PNG, GIF e MP4.

export const versao = '2026-11-profundidade-e-movimento';
export const endereco = 'vitrine.inspira.dev.br';

export const cores = Object.freeze({
  floresta: '#133824',
  lima: '#BAFF29',
  menta: '#A3E5C2',
  papel: '#F7F7F4',
  mostarda: '#E5A93C',
  branco: '#FFFFFF',
  florestaSuave: '#4A6455',
  florestaProfunda: '#0C2618',
  mentaClara: '#E4F6EB',
  linha: '#DCE4DD'
});

export const fontes = Object.freeze({
  titulo: "Syne, 'DM Sans', sans-serif",
  texto: "'DM Sans', sans-serif"
});

// Ciclo de cada modelo: transições curtas, tempo para ler o resultado e volta ao início.
export const ciclo = Object.freeze({
  duracao: 4,
  transicaoMin: 0.18,
  transicaoMax: 0.3,
  curva: 'cubic-bezier(.2,.7,.2,1)'
});

export const formatarPreco = centavos => {
  if (!Number.isInteger(centavos) || centavos < 0) throw new Error(`Preço inválido: ${centavos}`);
  const reais = String(Math.floor(centavos / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${reais},${String(centavos % 100).padStart(2, '0')}`;
};

export const contarItens = quantidade => (quantidade === 1 ? '1 item' : `${quantidade} itens`);

// Fotos de apoio geradas com ImageGen (1152 × 864). Regiões em pixels da imagem original.
export const fotos = Object.freeze({
  prato: { arquivo: 'prato-moqueca', largura: 1152, altura: 864 },
  lanche: { arquivo: 'lanche-combo', largura: 1152, altura: 864 },
  projeto: { arquivo: 'projeto-interiores', largura: 1152, altura: 864 }
});

export const modelos = Object.freeze([
  {
    id: 'cardapio',
    prefixo: 'mcd',
    nomeCampanha: 'Cardápio',
    // Páginas de divulgação usam "vitrine/itens" em vez de cardápio (CONTEXT.md).
    nomeSite: 'Pratos',
    titulo: 'Escolha o prato. Veja o total.',
    beneficio: 'O cliente escolhe e já vê quanto vai pagar.',
    negocio: 'Sabor da Praça',
    segmento: 'Cozinha caseira · aberto agora',
    abas: ['Pratos', 'Porções', 'Bebidas'],
    itens: [
      { id: 'moqueca', nome: 'Moqueca de banana-da-terra', detalhe: 'Leite de coco, pimentões e coentro', preco: 4200, foto: { de: 'prato', regiao: [228, 107, 653, 653] } },
      { id: 'arroz', nome: 'Arroz com farofa', detalhe: 'Porção individual', preco: 1200, foto: { de: 'prato', regiao: [832, 6, 315, 315] } },
      { id: 'suco', nome: 'Suco de laranja', detalhe: 'Natural, 400 ml', preco: 900, foto: { de: 'lanche', regiao: [700, 250, 300, 300] } }
    ],
    selecao: { item: 'moqueca', quantidade: 1 },
    acao: 'Continuar no WhatsApp',
    momentos: { toque: 0.45, total: 0.62, continuar: 1.3, cartao: 1.4, mensagem: 1.66, aproxima: 2.0, retorno: 3.45 },
    pose: 2.8,
    poseLimpa: 1.95,
    detalhe: [116, 704, 290, 108],
    foco: [760, 560],
    altTexto: 'Demonstração ilustrativa de vitrine de restaurante: a pessoa toca em Moqueca de banana-da-terra, o total passa de R$ 0,00 para R$ 42,00 e a mensagem do pedido aparece pronta para continuar no WhatsApp.'
  },
  {
    id: 'lanches',
    prefixo: 'mla',
    nomeCampanha: 'Lanches',
    nomeSite: 'Lanches',
    titulo: 'Monte o pedido. Continue no WhatsApp.',
    beneficio: 'Quantidade e total se ajustam a cada toque.',
    negocio: 'Lanche do Bairro',
    segmento: 'Hambúrgueres e combos',
    abas: ['Combos', 'Lanches', 'Bebidas'],
    itens: [
      { id: 'classico', nome: 'Combo Clássico', detalhe: 'Hambúrguer, fritas e suco', preco: 3200, foto: { de: 'lanche', regiao: [190, 80, 620, 620] } },
      { id: 'duplo', nome: 'Combo Duplo', detalhe: 'Dois hambúrgueres, fritas e suco', preco: 4100, foto: { de: 'lanche', regiao: [235, 336, 380, 380] } },
      { id: 'fritas', nome: 'Porção de fritas', detalhe: 'Batata crocante, 200 g', preco: 1400, foto: { de: 'lanche', regiao: [394, 50, 330, 330] } }
    ],
    selecao: { item: 'classico', quantidade: 1, depois: 2 },
    acao: 'Continuar no WhatsApp',
    momentos: { toque: 0.45, total: 0.62, mais: 1.25, recalcula: 1.34, verResumo: 1.85, resumo: 1.95, aproxima: 2.3, retorno: 3.45 },
    pose: 2.9,
    poseLimpa: 2.26,
    detalhe: [664, 506, 472, 124],
    foco: [800, 520],
    altTexto: 'Demonstração ilustrativa de vitrine de lanchonete: a pessoa escolhe o Combo Clássico, aumenta a quantidade para 2, o total muda de R$ 32,00 para R$ 64,00 e o resumo do pedido fica em destaque com a opção de continuar no WhatsApp.'
  },
  {
    id: 'servicos',
    prefixo: 'mse',
    nomeCampanha: 'Serviços',
    nomeSite: 'Serviços',
    titulo: 'Apresente seu serviço. Facilite o orçamento.',
    beneficio: 'O pedido de orçamento chega organizado.',
    negocio: 'Casa em Ordem',
    segmento: 'Reparos e pintura residencial',
    abas: ['Serviços', 'Como funciona', 'Avaliações'],
    itens: [
      { id: 'pintura', nome: 'Pintura de cômodo', detalhe: 'Massa corrida e duas demãos', preco: 38000, icone: 'rolo' },
      { id: 'prateleiras', nome: 'Instalação de prateleiras', detalhe: 'Até 3 peças, com nivelamento', preco: 12000, icone: 'nivel' },
      { id: 'eletrica', nome: 'Pequeno reparo elétrico', detalhe: 'Tomadas, interruptores e luminárias', preco: 15000, icone: 'raio' }
    ],
    selecao: { item: 'pintura', quantidade: 1 },
    acao: 'Pedir orçamento no WhatsApp',
    momentos: { toque: 0.45, cartao: 0.7, linhas: [1.0, 1.3, 1.6], destaque: 2.0, aproxima: 2.42, retorno: 3.45 },
    pose: 2.9,
    poseLimpa: 2.4,
    detalhe: [664, 490, 472, 140],
    foco: [820, 500],
    altTexto: 'Demonstração ilustrativa de vitrine de serviços: a pessoa escolhe Pintura de cômodo e o pedido de orçamento se forma com o serviço, o que inclui e a estimativa a partir de R$ 380,00, pronto para enviar pelo WhatsApp.'
  },
  {
    id: 'portfolio',
    prefixo: 'mpo',
    nomeCampanha: 'Portfólio',
    nomeSite: 'Portfólio',
    titulo: 'Projetos, currículo e conquistas em uma apresentação.',
    beneficio: 'Trabalho, trajetória e formação no mesmo lugar.',
    negocio: 'Marina Rocha',
    segmento: 'Arquitetura e interiores',
    abas: ['Projeto', 'Currículo', 'Diploma'],
    projeto: { titulo: 'Apartamento Jardim', meta: '2025 · 62 m² · Reforma completa', etiquetas: ['Residencial', 'Interiores'], foto: { de: 'projeto', regiao: [0, 40, 1152, 780] } },
    curriculo: [
      { periodo: '2023 — hoje', papel: 'Arquiteta autônoma', local: 'Projetos residenciais' },
      { periodo: '2020 — 2023', papel: 'Arquiteta', local: 'Estúdio Casa Viva' },
      { periodo: '2019', papel: 'Estágio em interiores', local: 'Escritório Linha' }
    ],
    habilidades: ['Interiores', 'Reformas', 'Projeto 3D'],
    diploma: { titulo: 'Bacharel em Arquitetura e Urbanismo', conclusao: 'Concluído em 2019' },
    acao: 'Conversar no WhatsApp',
    momentos: { abas: [0.95, 2.05, 3.4] },
    pose: 0.8,
    poseLimpa: 0.8,
    poses: { projeto: 0.8, curriculo: 1.85, diploma: 3.0 },
    foco: [440, 560],
    altTexto: 'Demonstração ilustrativa de portfólio de arquitetura: a apresentação alterna entre o projeto Apartamento Jardim, o currículo com três experiências e o diploma de Arquitetura e Urbanismo, aproximando cada conteúdo selecionado.'
  }
]);

export const modelo = id => {
  const encontrado = modelos.find(entry => entry.id === id);
  if (!encontrado) throw new Error(`Modelo desconhecido: ${id}`);
  return encontrado;
};

// Totais derivados dos preços: nenhum valor exibido é digitado à mão.
export function totais(id) {
  const m = modelo(id);
  if (!m.selecao) return null;
  const item = m.itens.find(entry => entry.id === m.selecao.item);
  const quantidade = m.selecao.quantidade;
  const resultado = { item, quantidade, total: item.preco * quantidade };
  if (m.selecao.depois) Object.assign(resultado, { quantidadeDepois: m.selecao.depois, totalDepois: item.preco * m.selecao.depois });
  return resultado;
}

export const carrossel = Object.freeze([
  { n: 1, id: 'capa', titulo: 'Mostre o que você faz.', apoio: 'Facilite o próximo passo.' },
  { n: 2, id: 'caminho', titulo: 'Deixe claro o que você oferece.', passos: ['Conhecer', 'Escolher', 'Entrar em contato'] },
  { n: 3, id: 'cardapio', rotulo: 'Cardápio', titulo: 'Escolha o prato. Veja o total.' },
  { n: 4, id: 'lanches', rotulo: 'Lanches', titulo: 'Monte o pedido. Continue no WhatsApp.' },
  { n: 5, id: 'servicos', rotulo: 'Serviços', titulo: 'Apresente seu serviço. Facilite o orçamento.' },
  { n: 6, id: 'portfolio', rotulo: 'Portfólio', titulo: 'Projetos, currículo e conquistas em uma apresentação.' },
  { n: 7, id: 'encerramento', titulo: 'Qual combina com a sua ideia?', chamada: 'Crie sua vitrine grátis' }
]);

// Roteiro dos vídeos: abertura de 2 s, quatro demonstrações de 4 s e encerramento de 2 s.
export const roteiro = Object.freeze({
  duracao: 20,
  fps: 30,
  cenas: [
    { id: 'abertura', inicio: 0, fim: 2 },
    { id: 'cardapio', inicio: 2, fim: 6 },
    { id: 'lanches', inicio: 6, fim: 10 },
    { id: 'servicos', inicio: 10, fim: 14 },
    { id: 'portfolio', inicio: 14, fim: 18 },
    { id: 'encerramento', inicio: 18, fim: 20 }
  ]
});

export const formatos = Object.freeze({
  carrossel: { largura: 1080, altura: 1080 },
  feed: { largura: 1080, altura: 1080 },
  story: { largura: 1080, altura: 1920, seguro: { topo: 250, base: 340 }, adesivo: { y: 1450, altura: 130 } },
  gif: { largura: 600, altura: 450, fps: 25 },
  modelo: { largura: 1200, altura: 900 }
});
