import { cores as C, ciclo, contarItens, formatarPreco, fotos, modelo, totais } from './campanha.mjs';
import { criarLinhaDoTempo, passos } from './linha-do-tempo.mjs';

export const LARGURA = 1200;
export const ALTURA = 900;

const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = value => Math.round(value * 100) / 100;

// Janela principal dos modelos em lista; o cartão da direita sobrepõe sua borda ao avançar.
const JANELA = { x: 96, y: 84, w: 590, h: 760 };
const LINHAS = [284, 418, 552];
const CARTAO_X = 664;
const CARTAO_W = 472;

function texto(ctx, x, y, conteudo, { tam = 20, peso = 400, cor = C.floresta, ancora = 'start', fam = 'texto', espaco, opacidade } = {}) {
  const attrs = [`x="${x}"`, `y="${y}"`, `font-size="${tam}"`, `font-weight="${peso}"`, `fill="${cor}"`];
  if (ancora !== 'start') attrs.push(`text-anchor="${ancora}"`);
  if (espaco) attrs.push(`letter-spacing="${espaco}"`);
  if (opacidade !== undefined) attrs.push(`fill-opacity="${opacidade}"`);
  return `<text ${attrs.join(' ')} class="${ctx.p}-${fam}">${esc(conteudo)}</text>`;
}

const grupo = (classe, conteudo) => `<g class="${classe}">${conteudo}</g>`;
const em = (x, y, conteudo) => `<g transform="translate(${x} ${y})">${conteudo}</g>`;

function definirFoto(ctx, chave) {
  const foto = fotos[chave];
  const id = `${ctx.p}-foto-${chave}`;
  if (!ctx.fotos.has(chave)) {
    ctx.fotos.add(chave);
    ctx.defs.push(`<image id="${id}" href="${esc(ctx.imagem(foto.arquivo))}" width="${foto.largura}" height="${foto.altura}" preserveAspectRatio="none"/>`);
  }
  return id;
}

// Recorta uma região da foto original para preencher a caixa, como object-fit: cover.
function recorte(ctx, { de, regiao }, caixa, raio = 18, classeInterna) {
  const id = definirFoto(ctx, de);
  const [rx, ry, rw, rh] = regiao;
  const { x, y, w, h } = caixa;
  const escala = Math.max(w / rw, h / rh);
  const tx = x - rx * escala + (w - rw * escala) / 2;
  const ty = y - ry * escala + (h - rh * escala) / 2;
  const clip = `${ctx.p}-recorte-${ctx.recortes++}`;
  ctx.defs.push(`<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${raio}"/></clipPath>`);
  const imagem = `<use href="#${id}" transform="translate(${r2(tx)} ${r2(ty)}) scale(${r2(escala * 10000) / 10000})"/>`;
  return `<g clip-path="url(#${clip})">${classeInterna ? grupo(classeInterna, imagem) : imagem}</g>`;
}

function definicoesBase(ctx) {
  const { p } = ctx;
  ctx.defs.push(
    `<filter id="${p}-sombra" x="-30%" y="-20%" width="160%" height="160%"><feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="${C.floresta}" flood-opacity=".15"/></filter>`,
    `<filter id="${p}-sombra-alta" x="-30%" y="-25%" width="160%" height="175%"><feDropShadow dx="0" dy="38" stdDeviation="30" flood-color="${C.floresta}" flood-opacity=".26"/></filter>`,
    `<filter id="${p}-sombra-curta" x="-20%" y="-30%" width="140%" height="190%"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="${C.floresta}" flood-opacity=".2"/></filter>`,
    `<linearGradient id="${p}-luz-borda" x1="0" y1="0" x2=".55" y2="1"><stop offset="0" stop-color="${C.lima}" stop-opacity=".95"/><stop offset=".28" stop-color="${C.menta}" stop-opacity=".7"/><stop offset=".7" stop-color="${C.menta}" stop-opacity="0"/></linearGradient>`,
    `<radialGradient id="${p}-brilho" cx=".3" cy=".25" r=".8"><stop offset="0" stop-color="${C.menta}" stop-opacity=".5"/><stop offset=".6" stop-color="${C.menta}" stop-opacity=".12"/><stop offset="1" stop-color="${C.menta}" stop-opacity="0"/></radialGradient>`,
    `<pattern id="${p}-pontos" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="15" cy="15" r="1.6" fill="${C.floresta}" fill-opacity=".13"/></pattern>`
  );
}

function fundo(ctx) {
  return `<rect width="${LARGURA}" height="${ALTURA}" fill="${C.papel}"/><rect width="${LARGURA}" height="${ALTURA}" fill="url(#${ctx.p}-pontos)"/><rect width="${LARGURA}" height="${ALTURA}" fill="url(#${ctx.p}-brilho)"/>`;
}

// Janela com sombra macia, contorno discreto e luz de borda lima/menta no canto superior.
function janela(ctx, { x, y, w, h }, { raio = 32, cor = C.branco, sombra = 'sombra', luz = true } = {}) {
  const base = `x="${x}" y="${y}" width="${w}" height="${h}" rx="${raio}"`;
  return `<rect ${base} fill="${cor}" filter="url(#${ctx.p}-${sombra})"/>`
    + `<rect ${base} fill="none" stroke="${C.floresta}" stroke-opacity=".08" stroke-width="1.2"/>`
    + (luz ? `<rect ${base} fill="none" stroke="url(#${ctx.p}-luz-borda)" stroke-width="3"/>` : '');
}

function janelaDeTras(ctx, { x, y, w, h }) {
  return `<rect x="${x - 38}" y="${y - 30}" width="${w}" height="${h}" rx="34" fill="${C.mentaClara}" stroke="${C.menta}" stroke-width="2"/>`
    + `<rect x="${x - 10}" y="${y - 12}" width="140" height="10" rx="5" fill="${C.menta}" fill-opacity=".9"/>`;
}

function etiquetaDemonstracao(ctx) {
  return `<g><rect x="878" y="34" width="262" height="42" rx="21" fill="${C.branco}" stroke="${C.linha}" stroke-width="1.5"/>`
    + `<circle cx="904" cy="55" r="6" fill="${C.mostarda}"/>`
    + texto(ctx, 1022, 61, 'Demonstração ilustrativa', { tam: 16, peso: 600, cor: C.florestaSuave, ancora: 'middle' })
    + '</g>';
}

function cabecalho(ctx, m, { x = JANELA.x + 36, y = JANELA.y } = {}) {
  return texto(ctx, x, y + 74, m.negocio, { tam: 34, peso: 700, fam: 'titulo', espaco: '-0.6' })
    + texto(ctx, x, y + 106, m.segmento, { tam: 19, cor: C.florestaSuave });
}

function abasDaJanela(ctx, rotulos, { x = JANELA.x + 36, y = 222 } = {}) {
  const larguras = rotulos.map(rotulo => Math.round(rotulo.length * 10.6 + 44));
  let cursor = x;
  return rotulos.map((rotulo, i) => {
    const w = larguras[i];
    const ativo = i === 0;
    const pedaco = `<rect x="${cursor}" y="${y}" width="${w}" height="42" rx="21" fill="${ativo ? C.floresta : C.papel}" stroke="${ativo ? C.floresta : C.linha}" stroke-width="1.5"/>`
      + texto(ctx, cursor + w / 2, y + 28, rotulo, { tam: 18, peso: 600, cor: ativo ? C.papel : C.florestaSuave, ancora: 'middle' });
    cursor += w + 10;
    return pedaco;
  }).join('');
}

const iconeMais = (cor = C.floresta) => `<path d="M-10 0H10M0 -10V10" stroke="${cor}" stroke-width="3.5" stroke-linecap="round" fill="none"/>`;
const iconeCheck = (cor = C.floresta) => `<path d="M-10 1 -3 8 11 -7" stroke="${cor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
const iconeMenos = (cor = C.floresta) => `<path d="M-9 0H9" stroke="${cor}" stroke-width="3.5" stroke-linecap="round" fill="none"/>`;

const icones = {
  rolo: `<path d="M-26 -22h40a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5h-40a5 5 0 0 1-5-5v-8a5 5 0 0 1 5-5Z M19 -13h7v15H-4v10" fill="none" stroke="${C.floresta}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><rect x="-9" y="12" width="10" height="18" rx="3" fill="${C.floresta}"/>`,
  nivel: `<path d="M-30 -14H30M-30 14H30M-22 -14V-26M22 14V26" fill="none" stroke="${C.floresta}" stroke-width="4" stroke-linecap="round"/><rect x="-14" y="-5" width="28" height="10" rx="5" fill="none" stroke="${C.floresta}" stroke-width="3.5"/><circle cx="0" cy="0" r="2.5" fill="${C.floresta}"/>`,
  raio: `<path d="M5 -30-16 4H0L-5 30 16-4H0Z" fill="none" stroke="${C.floresta}" stroke-width="4" stroke-linejoin="round"/>`
};

// Toque visível: anel lima com contorno floresta que cresce e some em 400 ms.
function toque(ctx, nome, cx, cy, t) {
  const anel = ctx.tl.trilha(`${nome}-anel`, passos({ o: 0, s: 0.5 }, [[t, { o: 0.95, s: 0.85 }, 0.18], [t + 0.18, { o: 0, s: 1.45 }, 0.22], [t + 0.4, { s: 0.5 }, 0.2]]));
  const ponto = ctx.tl.trilha(`${nome}-ponto`, passos({ o: 0, s: 0.6 }, [[t, { o: 0.4, s: 1 }, 0.18], [t + 0.18, { o: 0, s: 0.6 }, 0.22]]));
  ctx.sinais.push({ t, tipo: 'toque' });
  return em(cx, cy, grupo(anel, `<circle r="34" fill="${C.lima}" fill-opacity=".35" stroke="${C.floresta}" stroke-width="3"/>`)
    + grupo(ponto, `<circle r="15" fill="${C.floresta}"/>`));
}

/** Troca de valores com deslocamento vertical curto; `estados` = [[inicio, texto], ...]. */
function rolagem(ctx, nome, x, y, estados, estilo, retorno) {
  const tempos = estados.map(([t]) => t);
  return estados.map(([, conteudo], k) => {
    const mudancas = [];
    if (k === 0) {
      if (tempos.length > 1) mudancas.push([tempos[1], { o: 0, y: -16 }]);
      mudancas.push([retorno, { o: 1, y: 0 }, 0.3]);
      const classe = ctx.tl.trilha(`${nome}-${k}`, passos({ o: 1, y: 0 }, mudancas));
      return grupo(classe, texto(ctx, x, y, conteudo, estilo));
    }
    mudancas.push([tempos[k], { o: 1, y: 0 }]);
    if (k + 1 < tempos.length) mudancas.push([tempos[k + 1], { o: 0, y: -16 }]);
    mudancas.push([retorno, { o: 0, y: 16 }, 0.3]);
    const classe = ctx.tl.trilha(`${nome}-${k}`, passos({ o: 0, y: 16 }, mudancas));
    return grupo(classe, texto(ctx, x, y, conteudo, estilo));
  }).join('');
}

// Assinatura: trilha de nós ortogonais (DotTrail do brandbook) que acende a cada etapa.
function trilhaDeEtapas(ctx, { x = 772, y = 742, passo = 156, rotulos, tempos, retorno }) {
  let s = '';
  for (let i = 0; i < rotulos.length - 1; i += 1) {
    const x1 = x + i * passo + 12;
    const x2 = x + (i + 1) * passo - 12;
    const comprimento = x2 - x1;
    const linha = ctx.tl.trilha(`etapa-linha-${i}`, passos({ 'stroke-dashoffset': comprimento }, [[tempos[i + 1], { 'stroke-dashoffset': 0 }], [retorno, { 'stroke-dashoffset': comprimento }, 0.3]]));
    s += `<path d="M${x1} ${y}H${x2}" stroke="${C.linha}" stroke-width="4" stroke-linecap="round"/>`
      + `<path class="${linha}" d="M${x1} ${y}H${x2}" stroke="${C.floresta}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${comprimento}"/>`;
  }
  rotulos.forEach((rotulo, i) => {
    const cx = x + i * passo;
    const ativo = `<circle r="12" fill="${C.lima}" stroke="${C.floresta}" stroke-width="3.5"/>`;
    const nome = texto(ctx, cx, y + 44, rotulo, { tam: 18, peso: 600, ancora: 'middle' });
    if (tempos[i] === null) {
      s += em(cx, y, ativo) + nome;
      return;
    }
    const no = ctx.tl.trilha(`etapa-no-${i}`, passos({ o: 0, s: 0.4 }, [[tempos[i], { o: 1, s: 1 }], [retorno, { o: 0, s: 0.4 }, 0.3]]));
    const rot = ctx.tl.trilha(`etapa-rotulo-${i}`, passos({ o: 0.55 }, [[tempos[i], { o: 1 }], [retorno, { o: 0.55 }, 0.3]]));
    s += `<circle cx="${cx}" cy="${y}" r="10" fill="${C.papel}" stroke="${C.linha}" stroke-width="3"/>`
      + em(cx, y, grupo(no, ativo))
      + grupo(rot, nome);
  });
  return `<g>${s}</g>`;
}

function camera(ctx, m, conteudo, mudancas) {
  const [fx, fy] = m.foco;
  const classe = ctx.tl.trilha('camera', passos({ s: 1 }, mudancas), { caixa: 'view-box', origem: `${fx}px ${fy}px` });
  return grupo(classe, conteudo);
}

function linhaDeItem(ctx, item, y, { selecionada = '', lateral = '', precoPrefixo = '' } = {}) {
  const { p } = ctx;
  const x = JANELA.x + 20;
  const w = JANELA.w - 40;
  const miniatura = item.foto
    ? recorte(ctx, item.foto, { x: x + 16, y: y + 12, w: 96, h: 96 }, 18)
    : `<rect x="${x + 16}" y="${y + 12}" width="96" height="96" rx="18" fill="${C.mentaClara}"/>${em(x + 64, y + 60, `<g transform="scale(.9)">${icones[item.icone]}</g>`)}`;
  const preco = precoPrefixo
    ? `<text x="${x + 130}" y="${y + 102}" font-size="22" fill="${C.floresta}" class="${p}-texto"><tspan font-weight="400" fill="${C.florestaSuave}" font-size="18">${esc(precoPrefixo)} </tspan><tspan font-weight="700">${esc(formatarPreco(item.preco))}</tspan></text>`
    : texto(ctx, x + 130, y + 102, formatarPreco(item.preco), { tam: 23, peso: 700 });
  const corpo = `<rect x="${x}" y="${y}" width="${w}" height="120" rx="24" fill="${C.papel}"/>`
    + (selecionada ? grupo(selecionada, `<rect x="${x}" y="${y}" width="${w}" height="120" rx="24" fill="${C.branco}"/>`) : '')
    + miniatura
    + texto(ctx, x + 130, y + 44, item.nome, { tam: 24, peso: 600 })
    + texto(ctx, x + 130, y + 72, item.detalhe, { tam: 18, cor: C.florestaSuave })
    + preco
    + lateral;
  return { x, w, corpo };
}

// Linha escolhida: sobe, clareia, ganha sombra própria e contorno lima.
const classeDoFundoElevado = (ctx, nome, t, retorno) => ctx.tl.trilha(`${nome}-fundo`, passos({ o: 0 }, [[t, { o: 1 }], [retorno, { o: 0 }, 0.3]]));

function linhaElevada(ctx, nome, base, y, t, retorno) {
  const elevar = ctx.tl.trilha(`${nome}-eleva`, passos({ y: 0, s: 1 }, [[t, { y: -8, s: 1.025 }], [retorno, { y: 0, s: 1 }, 0.3]]));
  const sombra = ctx.tl.trilha(`${nome}-sombra`, passos({ o: 0 }, [[t, { o: 1 }], [retorno, { o: 0 }, 0.3]]));
  const contorno = ctx.tl.trilha(`${nome}-contorno`, passos({ o: 0 }, [[t, { o: 1 }], [retorno, { o: 0 }, 0.3]]));
  return grupo(elevar,
    grupo(sombra, `<rect x="${base.x}" y="${y}" width="${base.w}" height="120" rx="24" fill="${C.branco}" filter="url(#${ctx.p}-sombra-curta)"/>`)
    + base.corpo
    + grupo(contorno, `<rect x="${base.x}" y="${y}" width="${base.w}" height="120" rx="24" fill="none" stroke="${C.lima}" stroke-width="4"/><rect x="${base.x}" y="${y}" width="${base.w}" height="120" rx="24" fill="none" stroke="${C.floresta}" stroke-opacity=".25" stroke-width="1"/>`));
}

function barraDoPedido(ctx, { rotulos, valores, valorTam = 34, botao, botaoLargura = 236, ativa, pressiona, retorno }) {
  const x = JANELA.x + 20;
  const y = 704;
  const w = JANELA.w - 40;
  const bx = x + w - 20 - botaoLargura;
  const ativar = ctx.tl.trilha('barra-botao', passos({ o: 0.4, s: 1 }, [
    [ativa, { o: 1 }],
    ...(pressiona !== undefined ? [[pressiona, { s: 0.94 }, 0.18], [pressiona + 0.18, { s: 1 }, 0.2]] : []),
    [retorno, { o: 0.4 }, 0.3]
  ]));
  return `<rect x="${x}" y="${y}" width="${w}" height="108" rx="26" fill="${C.floresta}"/>`
    + rolagem(ctx, 'barra-rotulo', x + 26, y + 40, rotulos, { tam: 17, peso: 600, cor: C.menta }, retorno)
    + rolagem(ctx, 'barra-valor', x + 26, y + 84, valores, { tam: valorTam, peso: 700, cor: C.papel }, retorno)
    + grupo(ativar, `<rect x="${bx}" y="${y + 26}" width="${botaoLargura}" height="56" rx="28" fill="${C.lima}"/>`
      + texto(ctx, bx + botaoLargura / 2, y + 61, botao, { tam: 18, peso: 700, ancora: 'middle' }));
}

// Cartão à direita: começa recuado e esmaecido; avança para a frente quando a ação acontece.
function cartaoQueAvanca(ctx, { y, h, t, retorno, conteudo }) {
  const x = CARTAO_X;
  const w = CARTAO_W;
  const avancar = ctx.tl.trilha('cartao', passos({ o: 0.62, s: 0.92, y: 22 }, [[t, { o: 1, s: 1, y: 0 }, 0.28], [retorno, { o: 0.62, s: 0.92, y: 22 }, 0.3]]), { origem: '100% 50%' });
  const sombraAlta = ctx.tl.trilha('cartao-sombra', passos({ o: 0 }, [[t, { o: 1 }, 0.28], [retorno, { o: 0 }, 0.3]]));
  const luz = ctx.tl.trilha('cartao-luz', passos({ o: 0 }, [[t, { o: 1 }, 0.28], [retorno, { o: 0 }, 0.3]]));
  ctx.sinais.push({ t, tipo: 'avanca' });
  const caixa = `x="${x}" y="${y}" width="${w}" height="${h}" rx="28"`;
  return grupo(avancar,
    `<rect ${caixa} fill="${C.branco}" filter="url(#${ctx.p}-sombra)"/>`
    + grupo(sombraAlta, `<rect ${caixa} fill="${C.branco}" filter="url(#${ctx.p}-sombra-alta)"/>`)
    + `<rect ${caixa} fill="none" stroke="${C.floresta}" stroke-opacity=".08" stroke-width="1.2"/>`
    + grupo(luz, `<rect ${caixa} fill="none" stroke="url(#${ctx.p}-luz-borda)" stroke-width="4"/>`)
    + conteudo(x, y, w));
}

function avatar(ctx, cx, cy, iniciais, r = 24) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.floresta}"/>` + texto(ctx, cx, cy + r * 0.3, iniciais, { tam: Math.round(r * 0.72), peso: 700, cor: C.lima, ancora: 'middle', fam: 'titulo' });
}

const iniciais = nome => nome.split(/\s+/).map(parte => parte[0]).slice(0, 2).join('').toUpperCase();

function placeholder(x, y, w) {
  return `<rect x="${x}" y="${y}" width="${w}" height="14" rx="7" fill="${C.floresta}" fill-opacity=".1"/>`;
}

function construirCardapio(ctx, m) {
  const M = m.momentos;
  const R = M.retorno;
  const { item, quantidade, total } = totais(m.id);
  const ySel = LINHAS[m.itens.indexOf(item)];
  const mudar = M.toque + 0.05;
  let cena = janelaDeTras(ctx, JANELA) + janela(ctx, JANELA) + cabecalho(ctx, m) + abasDaJanela(ctx, m.abas);
  const linhas = m.itens.map((entry, i) => {
    const selecionada = entry.id === item.id;
    const cx = JANELA.x + JANELA.w - 60;
    const cy = LINHAS[i] + 88;
    if (!selecionada) {
      return linhaDeItem(ctx, entry, LINHAS[i], { lateral: `<circle cx="${cx}" cy="${cy}" r="24" fill="${C.branco}" stroke="${C.floresta}" stroke-width="2.5"/>${em(cx, cy, iconeMais())}` }).corpo;
    }
    const mais = ctx.tl.trilha('item-mais', passos({ o: 1 }, [[mudar, { o: 0 }, 0.18], [R, { o: 1 }, 0.3]]));
    const ok = ctx.tl.trilha('item-ok', passos({ o: 0, s: 0.6 }, [[mudar, { o: 1, s: 1 }], [R, { o: 0, s: 0.6 }, 0.3]]));
    const lateral = em(cx, cy, grupo(mais, `<circle r="24" fill="${C.branco}" stroke="${C.floresta}" stroke-width="2.5"/>${iconeMais()}`)
      + grupo(ok, `<circle r="26" fill="${C.lima}" stroke="${C.floresta}" stroke-width="2.5"/>${iconeCheck()}`));
    return { elevada: linhaElevada(ctx, 'item', linhaDeItem(ctx, entry, LINHAS[i], { selecionada: classeDoFundoElevado(ctx, 'item', mudar, R), lateral }), LINHAS[i], mudar, R) };
  });
  cena += linhas.filter(entry => typeof entry === 'string').join('') + linhas.find(entry => entry.elevada).elevada;
  cena += barraDoPedido(ctx, {
    rotulos: [[0, 'Nenhum item'], [M.total, `Total · ${contarItens(quantidade)}`]],
    valores: [[0, formatarPreco(0)], [M.total, formatarPreco(total)]],
    botao: m.acao,
    ativa: M.total,
    pressiona: M.continuar,
    retorno: R
  });
  ctx.sinais.push({ t: M.total, tipo: 'confirma' });

  const cy = 250;
  cena += cartaoQueAvanca(ctx, {
    y: cy, h: 372, t: M.cartao, retorno: R,
    conteudo: (x, y, w) => {
      const vazio = ctx.tl.trilha('mensagem-vazia', passos({ o: 1 }, [[M.mensagem, { o: 0 }, 0.2], [R, { o: 1 }, 0.3]]));
      const cheia = ctx.tl.trilha('mensagem', passos({ o: 0, y: 10 }, [[M.mensagem, { o: 1, y: 0 }], [R, { o: 0, y: 10 }, 0.3]]));
      const enviar = ctx.tl.trilha('enviar', passos({ o: 0.4 }, [[M.mensagem, { o: 1 }], [R, { o: 0.4 }, 0.3]]));
      return avatar(ctx, x + 46, y + 50, iniciais(m.negocio))
        + texto(ctx, x + 84, y + 44, m.negocio, { tam: 22, peso: 700 })
        + texto(ctx, x + 84, y + 70, 'Mensagem pronta para o WhatsApp', { tam: 16, cor: C.florestaSuave })
        + `<path d="M${x + 24} ${y + 96}H${x + w - 24}" stroke="${C.linha}" stroke-width="1.5"/>`
        + `<path d="M${x + 24} ${y + 116}h${w - 72}a20 20 0 0 1 20 20v130a20 20 0 0 1-20 20H${x + 44}a20 20 0 0 1-20-20Z" fill="${C.mentaClara}"/>`
        + grupo(vazio, placeholder(x + 46, y + 146, 220) + placeholder(x + 46, y + 182, 320) + placeholder(x + 46, y + 218, 180))
        + grupo(cheia, texto(ctx, x + 46, y + 156, 'Olá! Quero fazer um pedido:', { tam: 19 })
          + texto(ctx, x + 46, y + 196, `${quantidade}× ${item.nome}`, { tam: 19, peso: 600 })
          + texto(ctx, x + 46, y + 240, `Total: ${formatarPreco(total)}`, { tam: 22, peso: 700 }))
        + texto(ctx, x + 24, y + 340, 'Revise e envie', { tam: 16, cor: C.florestaSuave })
        + grupo(enviar, `<rect x="${x + w - 154}" y="${y + 306}" width="130" height="48" rx="24" fill="${C.lima}"/>` + texto(ctx, x + w - 89, y + 337, 'Enviar', { tam: 18, peso: 700, ancora: 'middle' }));
    }
  });
  cena += trilhaDeEtapas(ctx, { rotulos: ['Escolher', 'Ver total', 'WhatsApp'], tempos: [mudar, M.total, M.mensagem], retorno: R });
  cena += toque(ctx, 'toque-item', JANELA.x + JANELA.w - 60, ySel + 88, M.toque);
  cena += toque(ctx, 'toque-continuar', JANELA.x + JANELA.w - 40 - 118, 704 + 54, M.continuar);
  return camera(ctx, m, cena, [[M.aproxima, { s: 1.07 }, 0.3], [R, { s: 1 }, 0.3]]);
}

function construirLanches(ctx, m) {
  const M = m.momentos;
  const R = M.retorno;
  const { item, quantidade, total, quantidadeDepois, totalDepois } = totais(m.id);
  const ySel = LINHAS[m.itens.indexOf(item)];
  const mudar = M.toque + 0.05;
  const cx = JANELA.x + JANELA.w - 60;
  let cena = janelaDeTras(ctx, JANELA) + janela(ctx, JANELA) + cabecalho(ctx, m) + abasDaJanela(ctx, m.abas);
  let elevada = '';
  m.itens.forEach((entry, i) => {
    const cy = LINHAS[i] + 88;
    if (entry.id !== item.id) {
      cena += linhaDeItem(ctx, entry, LINHAS[i], { lateral: `<circle cx="${cx}" cy="${cy}" r="24" fill="${C.branco}" stroke="${C.floresta}" stroke-width="2.5"/>${em(cx, cy, iconeMais())}` }).corpo;
      return;
    }
    const mais = ctx.tl.trilha('item-mais', passos({ o: 1, s: 1 }, [[mudar, { o: 0, s: 0.8 }, 0.18], [R, { o: 1, s: 1 }, 0.3]]));
    const seletor = ctx.tl.trilha('seletor', passos({ o: 0, s: 0.85 }, [[mudar, { o: 1, s: 1 }], [R, { o: 0, s: 0.85 }, 0.3]]), { origem: '100% 50%' });
    const sx = cx + 26;
    const lateral = em(cx, cy, grupo(mais, `<circle r="24" fill="${C.branco}" stroke="${C.floresta}" stroke-width="2.5"/>${iconeMais()}`))
      + grupo(seletor, `<rect x="${sx - 134}" y="${cy - 26}" width="134" height="52" rx="26" fill="${C.mentaClara}" stroke="${C.floresta}" stroke-width="2"/>`
        + em(sx - 108, cy, iconeMenos())
        + rolagem(ctx, 'quantidade', sx - 67, cy + 9, [[0, String(quantidade)], [M.recalcula, String(quantidadeDepois)]], { tam: 24, peso: 700, ancora: 'middle' }, R)
        + `<circle cx="${sx - 26}" cy="${cy}" r="20" fill="${C.lima}" stroke="${C.floresta}" stroke-width="2"/>` + em(sx - 26, cy, `<g transform="scale(.8)">${iconeMais()}</g>`));
    elevada = linhaElevada(ctx, 'item', linhaDeItem(ctx, entry, LINHAS[i], { selecionada: classeDoFundoElevado(ctx, 'item', mudar, R), lateral }), LINHAS[i], mudar, R);
  });
  cena += elevada;
  cena += barraDoPedido(ctx, {
    rotulos: [[0, 'Nenhum item'], [M.total, `Total · ${contarItens(quantidade)}`], [M.recalcula, `Total · ${contarItens(quantidadeDepois)}`]],
    valores: [[0, formatarPreco(0)], [M.total, formatarPreco(total)], [M.recalcula, formatarPreco(totalDepois)]],
    botao: 'Ver resumo',
    botaoLargura: 170,
    ativa: M.total,
    pressiona: M.verResumo,
    retorno: R
  });
  ctx.sinais.push({ t: M.total, tipo: 'confirma' }, { t: M.recalcula, tipo: 'confirma' });

  cena += cartaoQueAvanca(ctx, {
    y: 236, h: 400, t: M.resumo, retorno: R,
    conteudo: (x, y, w) => {
      const vazio = ctx.tl.trilha('resumo-vazio', passos({ o: 1 }, [[M.total, { o: 0 }, 0.2], [R, { o: 1 }, 0.3]]));
      const linhaResumo = ctx.tl.trilha('resumo-linha', passos({ o: 0 }, [[M.total, { o: 1 }], [R, { o: 0 }, 0.3]]));
      const destaque = ctx.tl.trilha('resumo-destaque', passos({ o: 0 }, [[M.resumo, { o: 1 }, 0.28], [R, { o: 0 }, 0.3]]));
      return texto(ctx, x + 30, y + 56, 'Resumo do pedido', { tam: 26, peso: 700, fam: 'titulo', espaco: '-0.4' })
        + texto(ctx, x + 30, y + 86, m.negocio, { tam: 17, cor: C.florestaSuave })
        + `<path d="M${x + 24} ${y + 110}H${x + w - 24}" stroke="${C.linha}" stroke-width="1.5"/>`
        + grupo(destaque, `<rect x="${x + 16}" y="${y + 124}" width="${w - 32}" height="76" rx="18" fill="${C.mentaClara}"/>`)
        + grupo(vazio, placeholder(x + 30, y + 156, 260))
        + grupo(linhaResumo,
          rolagem(ctx, 'resumo-qtd', x + 30, y + 170, [[0, `${quantidade}× ${item.nome}`], [M.recalcula, `${quantidadeDepois}× ${item.nome}`]], { tam: 21, peso: 600 }, R)
          + rolagem(ctx, 'resumo-preco', x + w - 30, y + 170, [[0, formatarPreco(total)], [M.recalcula, formatarPreco(totalDepois)]], { tam: 21, peso: 700, ancora: 'end' }, R))
        + texto(ctx, x + 30, y + 240, 'Retirada no balcão', { tam: 18, cor: C.florestaSuave })
        + texto(ctx, x + w - 30, y + 240, 'sem taxa', { tam: 18, cor: C.florestaSuave, ancora: 'end' })
        + `<path d="M${x + 24} ${y + 266}H${x + w - 24}" stroke="${C.linha}" stroke-width="1.5"/>`
        + texto(ctx, x + 30, y + 304, 'Total', { tam: 20, peso: 600 })
        + grupo(linhaResumo, rolagem(ctx, 'resumo-total', x + w - 30, y + 306, [[0, formatarPreco(total)], [M.recalcula, formatarPreco(totalDepois)]], { tam: 28, peso: 700, ancora: 'end' }, R))
        + `<rect x="${x + 24}" y="${y + 326}" width="${w - 48}" height="54" rx="27" fill="${C.lima}"/>`
        + texto(ctx, x + w / 2, y + 360, m.acao, { tam: 19, peso: 700, ancora: 'middle' });
    }
  });
  cena += trilhaDeEtapas(ctx, { y: 762, rotulos: ['Escolher', 'Quantidade', 'Resumo'], tempos: [mudar, M.recalcula, M.resumo], retorno: R });
  cena += toque(ctx, 'toque-item', cx, ySel + 88, M.toque);
  cena += toque(ctx, 'toque-mais', cx, ySel + 88, M.mais);
  cena += toque(ctx, 'toque-resumo', JANELA.x + JANELA.w - 40 - 85, 704 + 54, M.verResumo);
  return camera(ctx, m, cena, [[M.aproxima, { s: 1.07 }, 0.3], [R, { s: 1 }, 0.3]]);
}

function construirServicos(ctx, m) {
  const M = m.momentos;
  const R = M.retorno;
  const { item } = totais(m.id);
  const ySel = LINHAS[m.itens.indexOf(item)];
  const mudar = M.toque + 0.05;
  const cx = JANELA.x + JANELA.w - 60;
  let cena = janelaDeTras(ctx, JANELA) + janela(ctx, JANELA) + cabecalho(ctx, m) + abasDaJanela(ctx, m.abas);
  let elevada = '';
  m.itens.forEach((entry, i) => {
    const cy = LINHAS[i] + 88;
    const radio = `<circle cx="${cx}" cy="${cy}" r="20" fill="${C.branco}" stroke="${C.floresta}" stroke-width="2.5"/>`;
    if (entry.id !== item.id) {
      cena += linhaDeItem(ctx, entry, LINHAS[i], { precoPrefixo: 'a partir de', lateral: radio }).corpo;
      return;
    }
    const ok = ctx.tl.trilha('item-ok', passos({ o: 0, s: 0.6 }, [[mudar, { o: 1, s: 1 }], [R, { o: 0, s: 0.6 }, 0.3]]));
    const lateral = radio + em(cx, cy, grupo(ok, `<circle r="24" fill="${C.lima}" stroke="${C.floresta}" stroke-width="2.5"/>${iconeCheck()}`));
    elevada = linhaElevada(ctx, 'item', linhaDeItem(ctx, entry, LINHAS[i], { selecionada: classeDoFundoElevado(ctx, 'item', mudar, R), precoPrefixo: 'a partir de', lateral }), LINHAS[i], mudar, R);
  });
  cena += elevada;
  cena += barraDoPedido(ctx, {
    rotulos: [[0, 'Orçamento sem compromisso'], [mudar, 'Serviço escolhido']],
    valores: [[0, 'Escolha um serviço'], [mudar, item.nome]],
    valorTam: 26,
    botao: 'Pedir orçamento',
    botaoLargura: 190,
    ativa: mudar,
    retorno: R
  });

  const campos = [
    ['Serviço', item.nome],
    ['Inclui', item.detalhe],
    ['Estimativa', `a partir de ${formatarPreco(item.preco)}`]
  ];
  cena += cartaoQueAvanca(ctx, {
    y: 214, h: 430, t: M.cartao, retorno: R,
    conteudo: (x, y, w) => {
      let s = texto(ctx, x + 30, y + 56, 'Pedido de orçamento', { tam: 26, peso: 700, fam: 'titulo', espaco: '-0.4' })
        + texto(ctx, x + 30, y + 86, `Para ${m.negocio}, pelo WhatsApp`, { tam: 17, cor: C.florestaSuave })
        + `<path d="M${x + 24} ${y + 108}H${x + w - 24}" stroke="${C.linha}" stroke-width="1.5"/>`;
      campos.forEach(([rotulo, valor], k) => {
        const t = M.linhas[k];
        const ly = y + 132 + k * 76;
        const vazio = ctx.tl.trilha(`campo-${k}-vazio`, passos({ o: 1 }, [[t, { o: 0 }, 0.2], [R, { o: 1 }, 0.3]]));
        const cheio = ctx.tl.trilha(`campo-${k}`, passos({ o: 0, x: -10 }, [[t, { o: 1, x: 0 }], [R, { o: 0, x: -10 }, 0.3]]));
        const marca = ctx.tl.trilha(`campo-${k}-ok`, passos({ o: 0, s: 0.5 }, [[t + 0.06, { o: 1, s: 1 }], [R, { o: 0, s: 0.5 }, 0.3]]));
        ctx.sinais.push({ t, tipo: 'confirma' });
        s += texto(ctx, x + 30, ly + 18, rotulo.toUpperCase(), { tam: 14, peso: 700, cor: C.florestaSuave, espaco: '1.4' })
          + grupo(vazio, placeholder(x + 30, ly + 34, 230 - k * 30))
          + grupo(cheio, texto(ctx, x + 30, ly + 50, valor, { tam: 21, peso: k === 2 ? 700 : 600 }))
          + `<circle cx="${x + w - 44}" cy="${ly + 34}" r="15" fill="none" stroke="${C.linha}" stroke-width="2.5"/>`
          + em(x + w - 44, ly + 34, grupo(marca, `<circle r="16" fill="${C.lima}" stroke="${C.floresta}" stroke-width="2"/><g transform="scale(.7)">${iconeCheck()}</g>`));
      });
      const botao = ctx.tl.trilha('pedir', passos({ o: 0.45, s: 1 }, [[M.linhas[2] + 0.06, { o: 1 }], [M.destaque, { s: 0.95 }, 0.18], [M.destaque + 0.18, { s: 1 }, 0.2], [R, { o: 0.45 }, 0.3]]));
      s += grupo(botao, `<rect x="${x + 24}" y="${y + 354}" width="${w - 48}" height="54" rx="27" fill="${C.lima}"/>` + texto(ctx, x + w / 2, y + 388, m.acao, { tam: 19, peso: 700, ancora: 'middle' }));
      return s;
    }
  });
  cena += trilhaDeEtapas(ctx, { y: 742, rotulos: ['Serviço', 'Detalhes', 'Orçamento'], tempos: [mudar, M.linhas[1], M.destaque], retorno: R });
  cena += toque(ctx, 'toque-item', cx, ySel + 88, M.toque);
  cena += toque(ctx, 'toque-pedir', CARTAO_X + CARTAO_W / 2, 214 + 381, M.destaque);
  return camera(ctx, m, cena, [[M.aproxima, { s: 1.07 }, 0.3], [R, { s: 1 }, 0.3]]);
}

function construirPortfolio(ctx, m) {
  const [t1, t2, t3] = m.momentos.abas;
  const janelaP = { x: 80, y: 84, w: 720, h: 760 };
  let cena = janelaDeTras(ctx, janelaP) + janela(ctx, janelaP);
  cena += `<circle cx="146" cy="150" r="36" fill="${C.menta}"/>` + texto(ctx, 146, 160, iniciais(m.negocio), { tam: 26, peso: 700, ancora: 'middle', fam: 'titulo' });
  cena += texto(ctx, 198, 146, m.negocio, { tam: 32, peso: 700, fam: 'titulo', espaco: '-0.6' }) + texto(ctx, 198, 178, m.segmento, { tam: 19, cor: C.florestaSuave });

  const abaX = 110;
  const abaW = 220;
  const ativa = [0, abaW, abaW * 2];
  const indicador = ctx.tl.trilha('aba-indicador', passos({ x: 0 }, [[t1, { x: ativa[1] }, 0.26], [t2, { x: ativa[2] }, 0.26], [t3, { x: 0 }, 0.3]]));
  cena += `<rect x="${abaX}" y="208" width="${abaW * 3}" height="52" rx="26" fill="${C.papel}" stroke="${C.linha}" stroke-width="1.5"/>`;
  cena += grupo(indicador, `<rect x="${abaX + 5}" y="213" width="${abaW - 10}" height="42" rx="21" fill="${C.floresta}"/>`);
  const janelasAtivas = [[0, t1], [t1, t2], [t2, t3]];
  m.abas.forEach((rotulo, i) => {
    const [ini, fim] = janelasAtivas[i];
    const mudancas = i === 0 ? [[t1, { o: 0 }], [t3, { o: 1 }, 0.3]] : [[ini, { o: 1 }], [fim, { o: 0 }, i === 2 ? 0.3 : 0.24]];
    const claro = ctx.tl.trilha(`aba-${i}`, passos({ o: i === 0 ? 1 : 0 }, mudancas));
    const cx = abaX + abaW * i + abaW / 2;
    cena += texto(ctx, cx, 241, rotulo, { tam: 19, peso: 600, cor: C.florestaSuave, ancora: 'middle' })
      + grupo(claro, texto(ctx, cx, 241, rotulo, { tam: 19, peso: 700, cor: C.papel, ancora: 'middle' }));
  });

  const area = { x: 110, y: 284, w: 660, h: 530 };
  ctx.defs.push(`<clipPath id="${ctx.p}-area"><rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" rx="22"/></clipPath>`);
  const painel = (i, conteudo) => {
    const [ini, fim] = janelasAtivas[i];
    const mudancas = i === 0
      ? [[t1, { o: 0, x: -36 }, 0.24], [t1 + 0.24, { x: 36 }, 0.2], [t3, { o: 1, x: 0 }, 0.3]]
      : [[ini, { o: 1, x: 0 }, 0.26], [fim, { o: 0, x: -36 }, i === 2 ? 0.3 : 0.24], [fim + (i === 2 ? 0.3 : 0.24), { x: 36 }, 0.2]];
    const classe = ctx.tl.trilha(`painel-${i}`, passos(i === 0 ? { o: 1, x: 0 } : { o: 0, x: 36 }, mudancas));
    return grupo(classe, conteudo);
  };

  const p = m.projeto;
  const zoomFoto = ctx.tl.trilha('projeto-aproxima', passos({ s: 1 }, [[0.2, { s: 1.07 }, 0.3], [t1, { s: 1 }, 0.24]]));
  const projeto = recorte(ctx, p.foto, { x: area.x, y: area.y, w: area.w, h: 396 }, 22, zoomFoto)
    + texto(ctx, area.x + 4, area.y + 446, p.titulo, { tam: 27, peso: 700, fam: 'titulo', espaco: '-0.4' })
    + texto(ctx, area.x + 4, area.y + 478, p.meta, { tam: 18, cor: C.florestaSuave })
    + p.etiquetas.map((etiqueta, k) => {
      const ex = area.x + area.w - 270 + k * 138;
      return `<rect x="${ex}" y="${area.y + 422}" width="128" height="38" rx="19" fill="${C.mentaClara}"/>` + texto(ctx, ex + 64, area.y + 447, etiqueta, { tam: 16, peso: 600, ancora: 'middle' });
    }).join('');

  const destaqueCv = ctx.tl.trilha('curriculo-destaque', passos({ o: 0, s: 0.97 }, [[t1 + 0.3, { o: 1, s: 1 }], [t2, { o: 0, s: 0.97 }]]));
  const curriculo = texto(ctx, area.x + 4, area.y + 40, 'Experiência', { tam: 26, peso: 700, fam: 'titulo', espaco: '-0.4' })
    + `<path d="M${area.x + 30} ${area.y + 86}V${area.y + 330}" stroke="${C.linha}" stroke-width="4" stroke-linecap="round"/>`
    + grupo(destaqueCv, `<rect x="${area.x}" y="${area.y + 64}" width="${area.w}" height="92" rx="20" fill="${C.mentaClara}"/>`)
    + m.curriculo.map((entry, k) => {
      const ey = area.y + 92 + k * 104;
      return `<circle cx="${area.x + 30}" cy="${ey + 8}" r="11" fill="${k === 0 ? C.lima : C.branco}" stroke="${C.floresta}" stroke-width="3"/>`
        + texto(ctx, area.x + 62, ey + 2, entry.periodo, { tam: 16, peso: 600, cor: C.florestaSuave })
        + texto(ctx, area.x + 62, ey + 32, entry.papel, { tam: 23, peso: 700 })
        + texto(ctx, area.x + 62, ey + 58, entry.local, { tam: 18, cor: C.florestaSuave });
    }).join('')
    + texto(ctx, area.x + 4, area.y + 404, 'HABILIDADES', { tam: 14, peso: 700, cor: C.florestaSuave, espaco: '1.4' })
    + m.habilidades.map((rotulo, k) => {
      const hx = area.x + k * 150;
      return `<rect x="${hx}" y="${area.y + 422}" width="140" height="42" rx="21" fill="${C.papel}" stroke="${C.linha}" stroke-width="1.5"/>` + texto(ctx, hx + 70, area.y + 449, rotulo, { tam: 17, peso: 600, ancora: 'middle' });
    }).join('');

  const d = m.diploma;
  const zoomDiploma = ctx.tl.trilha('diploma-aproxima', passos({ s: 1 }, [[t2 + 0.3, { s: 1.06 }, 0.3], [t3, { s: 1 }, 0.3]]));
  const [linha1, ...resto] = d.titulo.split(' em ');
  const diploma = `<rect x="${area.x + 20}" y="${area.y + 10}" width="${area.w - 40}" height="${area.h - 30}" rx="18" fill="${C.papel}" stroke="${C.mostarda}" stroke-width="4"/>`
    + `<rect x="${area.x + 36}" y="${area.y + 26}" width="${area.w - 72}" height="${area.h - 62}" rx="10" fill="none" stroke="${C.mostarda}" stroke-width="1.5"/>`
    + grupo(zoomDiploma,
      texto(ctx, area.x + area.w / 2, area.y + 92, 'DIPLOMA', { tam: 20, peso: 700, ancora: 'middle', espaco: '6', fam: 'titulo' })
      + texto(ctx, area.x + area.w / 2, area.y + 150, `${linha1} em`, { tam: 30, peso: 700, ancora: 'middle', fam: 'titulo', espaco: '-0.5' })
      + texto(ctx, area.x + area.w / 2, area.y + 190, resto.join(' em '), { tam: 30, peso: 700, ancora: 'middle', fam: 'titulo', espaco: '-0.5' })
      + texto(ctx, area.x + area.w / 2, area.y + 240, m.negocio, { tam: 22, peso: 600, ancora: 'middle' })
      + texto(ctx, area.x + area.w / 2, area.y + 272, d.conclusao, { tam: 18, cor: C.florestaSuave, ancora: 'middle' })
      + em(area.x + area.w / 2, area.y + 372, `<circle r="54" fill="${C.mostarda}"/><circle r="42" fill="none" stroke="${C.floresta}" stroke-width="2" stroke-dasharray="4 5"/><path d="M-16 2-4 14 18-10" fill="none" stroke="${C.floresta}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`))
    + texto(ctx, area.x + area.w / 2, area.y + 470, 'Documento ilustrativo', { tam: 14, cor: C.florestaSuave, ancora: 'middle' });

  cena += `<g clip-path="url(#${ctx.p}-area)">${painel(0, projeto)}${painel(1, curriculo)}${painel(2, diploma)}</g>`;

  cena += `<g>${janela(ctx, { x: 772, y: 300, w: 364, h: 252 }, { raio: 28, sombra: 'sombra-alta' })}`
    + texto(ctx, 802, 354, 'Disponível para', { tam: 24, peso: 700, fam: 'titulo', espaco: '-0.4' })
    + texto(ctx, 802, 386, 'novos projetos', { tam: 24, peso: 700, fam: 'titulo', espaco: '-0.4' })
    + texto(ctx, 802, 420, 'Residenciais e comerciais', { tam: 17, cor: C.florestaSuave })
    + `<rect x="796" y="462" width="316" height="58" rx="29" fill="${C.lima}"/>` + texto(ctx, 954, 498, m.acao, { tam: 19, peso: 700, ancora: 'middle' })
    + '</g>';
  cena += trilhaDeEtapas(ctx, { x: 836, y: 712, passo: 136, rotulos: m.abas, tempos: [null, t1 + 0.05, t2 + 0.05], retorno: t3 });
  m.momentos.abas.forEach((t, i) => {
    const alvo = [1, 2, 0][i];
    cena += toque(ctx, `toque-aba-${i}`, abaX + abaW * alvo + abaW / 2, 234, t);
    ctx.sinais.push({ t: t + 0.05, tipo: 'avanca' });
  });
  return camera(ctx, m, cena, [[0.2, { s: 1.04 }, 0.3], [t3 + 0.1, { s: 1 }, 0.3]]);
}

const construtores = { cardapio: construirCardapio, lanches: construirLanches, servicos: construirServicos, portfolio: construirPortfolio };

/**
 * Gera o SVG animado de um modelo.
 * @param {string} id cardapio | lanches | servicos | portfolio
 * @param {{ imagem: (arquivo: string) => string, fontesCss?: string, titulo?: string }} opcoes
 *   `imagem` resolve cada foto de apoio (arquivo local ou data URI); `fontesCss` embute as fontes
 *   para o arquivo funcionar sozinho.
 * @returns {{ svg: string, trilhas: Array, sinais: Array<{t: number, tipo: string}> }}
 */
export function renderizarModelo(id, { imagem, fontesCss = '', titulo, prefixo, fundo: comFundo = true } = {}) {
  const m = modelo(id);
  const p0 = prefixo ?? m.prefixo;
  const ctx = { p: p0, tl: criarLinhaDoTempo({ prefixo: p0 }), defs: [], fotos: new Set(), recortes: 0, sinais: [], imagem };
  definicoesBase(ctx);
  const cena = construtores[id](ctx, m);
  const { p } = ctx;
  const estilo = [
    fontesCss,
    // Inline no site, o SVG herdaria `svg{stroke:currentColor}` de styles.css.
    `.${p}-raiz{display:block;width:100%;height:auto;fill:none;stroke:none}`,
    `.${p}-texto{font-family:'DM Sans',sans-serif;font-variant-numeric:tabular-nums}`,
    `.${p}-titulo{font-family:Syne,'DM Sans',sans-serif}`,
    ctx.tl.css(),
    `.${p}-raiz.is-paused *{animation-play-state:paused!important}`,
    `@media (prefers-reduced-motion:reduce){.${p}-raiz *{animation-play-state:paused!important;animation-delay:-${m.pose}s!important}}`
  ].filter(Boolean).join('\n');
  const rotulo = titulo ?? `Demonstração ilustrativa — ${m.nomeSite}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGURA} ${ALTURA}" width="${LARGURA}" height="${ALTURA}" class="${p}-raiz" data-modelo="${m.id}" role="img" aria-labelledby="${p}-titulo ${p}-descricao">`
    + `<title id="${p}-titulo">${esc(rotulo)}</title><desc id="${p}-descricao">${esc(m.altTexto)}</desc>`
    + `<style>${estilo}</style><defs>${ctx.defs.join('')}</defs>`
    + (comFundo ? fundo(ctx) : '') + cena + etiquetaDemonstracao(ctx)
    + '</svg>';
  return { svg, trilhas: ctx.tl.trilhas(), sinais: ctx.sinais.sort((a, b) => a.t - b.t), duracao: ciclo.duracao, pose: m.pose };
}
