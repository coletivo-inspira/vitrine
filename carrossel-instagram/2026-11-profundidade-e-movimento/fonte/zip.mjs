import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const JA_COMPRIMIDOS = /\.(png|jpe?g|gif|mp4|webp|zip|woff2?)$/i;
// Data fixa: o mesmo conteúdo gera o mesmo ZIP.
const HORA_DOS = (12 << 11) | (0 << 5);
const DATA_DOS = ((2026 - 1980) << 9) | (11 << 5) | 12;

async function listar(raiz, aceitar) {
  const entradas = await readdir(raiz, { recursive: true, withFileTypes: true });
  return entradas
    .filter(entrada => entrada.isFile())
    .map(entrada => relative(raiz, join(entrada.parentPath ?? entrada.path, entrada.name)).split(sep).join('/'))
    .filter(aceitar)
    .sort();
}

/** Compacta `raiz` em `destino`, guardando caminhos relativos em UTF-8. */
export async function criarZip(destino, raiz, aceitar = () => true) {
  const nomes = await listar(raiz, aceitar);
  const locais = [];
  const central = [];
  let deslocamento = 0;
  for (const nome of nomes) {
    const dados = await readFile(join(raiz, nome));
    const metodo = JA_COMPRIMIDOS.test(nome) ? 0 : 8;
    const corpo = metodo === 8 ? deflateRawSync(dados, { level: 9 }) : dados;
    const nomeBytes = Buffer.from(nome, 'utf8');
    const crc = crc32(dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(HORA_DOS, 10);
    local.writeUInt16LE(DATA_DOS, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(corpo.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nomeBytes.length, 26);
    locais.push(local, nomeBytes, corpo);
    const registro = Buffer.alloc(46);
    registro.writeUInt32LE(0x02014b50, 0);
    registro.writeUInt16LE(20, 4);
    registro.writeUInt16LE(20, 6);
    registro.writeUInt16LE(0x0800, 8);
    registro.writeUInt16LE(metodo, 10);
    registro.writeUInt16LE(HORA_DOS, 12);
    registro.writeUInt16LE(DATA_DOS, 14);
    registro.writeUInt32LE(crc, 16);
    registro.writeUInt32LE(corpo.length, 20);
    registro.writeUInt32LE(dados.length, 24);
    registro.writeUInt16LE(nomeBytes.length, 28);
    registro.writeUInt32LE(deslocamento, 42);
    central.push(registro, nomeBytes);
    deslocamento += 30 + nomeBytes.length + corpo.length;
  }
  const tamanhoCentral = central.reduce((soma, parte) => soma + parte.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(nomes.length, 8);
  fim.writeUInt16LE(nomes.length, 10);
  fim.writeUInt32LE(tamanhoCentral, 12);
  fim.writeUInt32LE(deslocamento, 16);
  await writeFile(destino, Buffer.concat([...locais, ...central, fim]));
  return nomes.length;
}
