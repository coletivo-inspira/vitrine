import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { caminhos } from './caminhos.mjs';

// WOFF 1.0: as tabelas da TTF comprimidas com zlib, sem alterar glifos ou métricas.
export function ttfParaWoff(ttf) {
  const fluxo = ttf.readUInt32BE(0);
  const total = ttf.readUInt16BE(4);
  const tabelas = [];
  for (let i = 0; i < total; i += 1) {
    const base = 12 + i * 16;
    const deslocamento = ttf.readUInt32BE(base + 8);
    const tamanho = ttf.readUInt32BE(base + 12);
    const original = ttf.subarray(deslocamento, deslocamento + tamanho);
    const comprimida = deflateSync(original, { level: 9 });
    tabelas.push({
      etiqueta: ttf.subarray(base, base + 4),
      soma: ttf.readUInt32BE(base + 4),
      tamanho,
      dados: comprimida.length < tamanho ? comprimida : original
    });
  }
  const cabecalho = 44 + total * 20;
  let posicao = cabecalho;
  const blocos = [];
  const diretorio = Buffer.alloc(total * 20);
  tabelas.forEach((tabela, i) => {
    tabela.etiqueta.copy(diretorio, i * 20);
    diretorio.writeUInt32BE(posicao, i * 20 + 4);
    diretorio.writeUInt32BE(tabela.dados.length, i * 20 + 8);
    diretorio.writeUInt32BE(tabela.tamanho, i * 20 + 12);
    diretorio.writeUInt32BE(tabela.soma, i * 20 + 16);
    const preenchimento = (4 - (tabela.dados.length % 4)) % 4;
    blocos.push(tabela.dados, Buffer.alloc(preenchimento));
    posicao += tabela.dados.length + preenchimento;
  });
  const sfnt = 12 + total * 16 + tabelas.reduce((soma, tabela) => soma + tabela.tamanho + ((4 - (tabela.tamanho % 4)) % 4), 0);
  const topo = Buffer.alloc(44);
  topo.write('wOFF', 0, 'latin1');
  topo.writeUInt32BE(fluxo, 4);
  topo.writeUInt32BE(posicao, 8);
  topo.writeUInt16BE(total, 12);
  topo.writeUInt32BE(sfnt, 16);
  topo.writeUInt16BE(1, 20);
  return Buffer.concat([topo, diretorio, ...blocos]);
}

const FACES = [
  { familia: 'Syne', arquivo: 'syne.ttf', pesos: '400 800' },
  { familia: 'DM Sans', arquivo: 'dm-sans.ttf', pesos: '100 1000' }
];

/** @font-face embutido (data URI) para SVGs e páginas que precisam funcionar sem arquivos ao lado. */
export async function fontesEmbutidas() {
  const regras = await Promise.all(FACES.map(async face => {
    const woff = ttfParaWoff(await readFile(caminhos.fonte(face.arquivo)));
    return `@font-face{font-family:'${face.familia}';src:url(data:font/woff;base64,${woff.toString('base64')}) format('woff');font-weight:${face.pesos};font-style:normal}`;
  }));
  return regras.join('\n');
}

/** @font-face apontando para as fontes locais do site, usado nas páginas de captura. */
export function fontesLocais() {
  return FACES.map(face => `@font-face{font-family:'${face.familia}';src:url('${pathToFileURL(caminhos.fonte(face.arquivo)).href}') format('truetype');font-weight:${face.pesos};font-style:normal}`).join('\n');
}
