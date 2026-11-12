#!/usr/bin/env node
// Exporta a campanha: `node exportar.mjs [apoio] [estaticos] [modelos] [gifs] [videos] [audio] [site] [previas] [pacote]`.
import { mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatos, modelos, roteiro, versao } from './campanha.mjs';
import { caminhos } from './caminhos.mjs';
import { fontesEmbutidas } from './fontes.mjs';
import { ffmpeg, otimizarJpeg, pngParaWebp, receberQuadros } from './midia.mjs';
import { iniciarNavegador } from './navegador.mjs';
import { renderizarModelo } from './modelos.mjs';
import { BUSCA_ESTATICA, paginaModelo, paginasEstaticas } from './pecas.mjs';
import { paginasDeVideo } from './videos.mjs';
import { escreverWav, sintetizar } from './audio.mjs';
import { criarZip } from './zip.mjs';

const ETAPAS = ['apoio', 'estaticos', 'modelos', 'gifs', 'videos', 'audio', 'site', 'previas', 'pacote'];
const pedidas = process.argv.slice(2);
const etapas = pedidas.length ? pedidas : ETAPAS;
for (const etapa of etapas) if (!ETAPAS.includes(etapa)) throw new Error(`Etapa desconhecida: ${etapa}. Use: ${ETAPAS.join(', ')}`);

const saida = (...partes) => join(caminhos.exportacoes, ...partes);
const FOTOS = ['prato-moqueca', 'lanche-combo', 'projeto-interiores'];

async function gravarPagina(nome, html) {
  await mkdir(caminhos.paginas, { recursive: true });
  const destino = join(caminhos.paginas, `${nome}.html`);
  await writeFile(destino, html);
  return pathToFileURL(destino).href;
}

async function apoio() {
  for (const nome of FOTOS) await otimizarJpeg(caminhos.apoioOriginal(nome), caminhos.apoioOtimizado(nome));
  console.log('Fotos de apoio otimizadas (960 px).');
}

async function estaticos(navegador) {
  for (const { nome, formato, html } of paginasEstaticas()) {
    const pagina = await navegador.abrir(await gravarPagina(nome, html), formato);
    await pagina.buscar(BUSCA_ESTATICA);
    const [grupo, arquivo] = nome.startsWith('carrossel') ? ['carrossel', `${nome.replace('carrossel-', '')}.png`] : [nome.includes('story') ? 'story' : 'video-feed', `${nome}-${formato.largura}x${formato.altura}.png`];
    await mkdir(saida(grupo), { recursive: true });
    await writeFile(saida(grupo, arquivo), await pagina.capturar());
    await pagina.fechar();
    console.log(`${grupo}/${arquivo}`);
  }
}

async function capturarModelo(navegador, id) {
  return navegador.abrir(await gravarPagina(`modelo-${id}`, paginaModelo(id)), formatos.modelo);
}

async function exportarModelos(navegador) {
  await mkdir(saida('modelos-site'), { recursive: true });
  const fontesCss = await fontesEmbutidas();
  const dataUri = async nome => `data:image/jpeg;base64,${(await readFile(caminhos.apoioOtimizado(nome))).toString('base64')}`;
  const imagens = Object.fromEntries(await Promise.all(FOTOS.map(async nome => [nome, await dataUri(nome)])));
  for (const m of modelos) {
    const { svg } = renderizarModelo(m.id, { imagem: nome => imagens[nome], fontesCss });
    await writeFile(saida('modelos-site', `${m.id}-1200x900.svg`), svg);
    const pagina = await capturarModelo(navegador, m.id);
    await pagina.buscar(m.pose);
    await writeFile(saida('modelos-site', `${m.id}-1200x900.png`), await pagina.capturar());
    await pagina.fechar();
    console.log(`modelos-site/${m.id}-1200x900.{svg,png}`);
  }
}

async function exportarGifs(navegador) {
  await mkdir(saida('gifs'), { recursive: true });
  const { fps, largura, altura } = formatos.gif;
  for (const m of modelos) {
    const pagina = await capturarModelo(navegador, m.id);
    const destino = saida('gifs', `${m.id}-${largura}x${altura}-4s.gif`);
    const quadros = receberQuadros(['-framerate', String(fps), '-i', '-', '-filter_complex',
      `[0:v]scale=${largura}:${altura}:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a`,
      '-loop', '0', destino]);
    const total = fps * 4;
    for (let i = 0; i < total; i += 1) {
      await pagina.buscar(i / fps);
      await quadros.escrever(await pagina.capturar());
    }
    await quadros.concluir();
    await pagina.fechar();
    console.log(`gifs/${m.id}-${largura}x${altura}-4s.gif (${total} quadros)`);
  }
}

// VIDEOS=feed ou VIDEOS=story limita as etapas de vídeo e áudio a um formato.
const videosPedidos = () => paginasDeVideo().filter(video => !process.env.VIDEOS || process.env.VIDEOS.split(',').includes(video.nome));
const nomeDoVideo = (nome, formato) => `vitrine-${nome}-${formato.largura}x${formato.altura}-20s`;

async function exportarVideos(navegador) {
  const { fps, duracao } = roteiro;
  for (const { nome, grupo, formato, html } of videosPedidos()) {
    await mkdir(saida(grupo), { recursive: true });
    const mudo = saida(grupo, `${nomeDoVideo(nome, formato)}-sem-audio.mp4`);
    const pagina = await navegador.abrir(await gravarPagina(`video-${nome}`, html), formato);
    const quadros = receberQuadros(['-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19',
      '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', mudo]);
    const total = fps * duracao;
    for (let i = 0; i < total; i += 1) {
      await pagina.buscar(i / fps);
      await quadros.escrever(await pagina.capturar());
      if (i % 60 === 0) process.stdout.write(`\r${nome}: ${i}/${total}`);
    }
    await quadros.concluir();
    await pagina.fechar();
    process.stdout.write(`\r${grupo}/${nomeDoVideo(nome, formato)}-sem-audio.mp4\n`);
  }
}

// Efeitos sonoros sintetizados a partir dos mesmos tempos das animações, sobre o vídeo mudo.
async function exportarAudio() {
  const { duracao } = roteiro;
  await mkdir(caminhos.temporario, { recursive: true });
  for (const { nome, grupo, formato, sinais } of videosPedidos()) {
    const base = nomeDoVideo(nome, formato);
    const wav = join(caminhos.temporario, `${nome}.wav`);
    await escreverWav(wav, sintetizar(sinais, duracao));
    await ffmpeg(['-i', saida(grupo, `${base}-sem-audio.mp4`), '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-t', String(duracao), '-movflags', '+faststart', saida(grupo, `${base}-efeitos.mp4`)]);
    console.log(`${grupo}/${base}-efeitos.mp4 (${sinais.length} efeitos)`);
  }
  await rm(caminhos.temporario, { recursive: true, force: true });
}

async function site() {
  await mkdir(join(caminhos.site, 'apoio'), { recursive: true });
  for (const nome of FOTOS) await copyFile(caminhos.apoioOtimizado(nome), join(caminhos.site, 'apoio', `${nome}.jpg`));
  for (const m of modelos) {
    const { svg } = renderizarModelo(m.id, { imagem: nome => `apoio/${nome}.jpg` });
    await writeFile(join(caminhos.site, `${m.id}.svg`), svg);
    const png = join(caminhos.site, `${m.id}.png`);
    await copyFile(saida('modelos-site', `${m.id}-1200x900.png`), png);
    await pngParaWebp(png, join(caminhos.site, `${m.id}.webp`));
  }
  console.log('web/assets/modelos atualizado.');
}

// Folhas de conferência: carrossel em tamanho real e em largura de celular, quadros de GIFs e vídeos.
async function previas() {
  await mkdir(saida('previas'), { recursive: true });
  const laminas = ['01-capa', '02-caminho', '03-cardapio', '04-lanches', '05-servicos', '06-portfolio', '07-encerramento'].map(nome => saida('carrossel', `${nome}.png`));
  const entradas = laminas.flatMap(arquivo => ['-i', arquivo]);
  const grade = (escala, colunas) => {
    const rotulos = laminas.map((_, i) => `[${i}:v]scale=${escala}:${escala}:flags=lanczos[l${i}]`).join(';');
    const posicoes = laminas.map((_, i) => `${(i % colunas) * escala}_${Math.floor(i / colunas) * escala}`).join('|');
    return `${rotulos};${laminas.map((_, i) => `[l${i}]`).join('')}xstack=inputs=${laminas.length}:layout=${posicoes}:fill=#F7F7F4`;
  };
  await ffmpeg([...entradas, '-filter_complex', grade(540, 4), '-frames:v', '1', saida('previas', 'carrossel-7-laminas.png')]);
  await ffmpeg([...entradas, '-filter_complex', grade(390, 7), '-frames:v', '1', saida('previas', 'carrossel-largura-celular-390.png')]);
  for (const m of modelos) {
    await ffmpeg(['-i', saida('gifs', `${m.id}-600x450-4s.gif`), '-vf', 'fps=2,scale=300:225,tile=8x1', '-frames:v', '1', saida('previas', `gif-${m.id}-quadros-0.5s.png`)]);
  }
  for (const { nome, grupo, formato } of paginasDeVideo()) {
    const arquivo = saida(grupo, `${nomeDoVideo(nome, formato)}-efeitos.mp4`);
    const [w, h, tile] = nome === 'feed' ? [270, 270, '8x5'] : [135, 240, '10x4'];
    await ffmpeg(['-i', arquivo, '-vf', `fps=2,scale=${w}:${h},tile=${tile}`, '-frames:v', '1', saida('previas', `video-${nome}-quadros-0.5s.png`)]);
    await ffmpeg(['-i', arquivo, '-filter_complex', 'showwavespic=s=1600x200:colors=#133824', '-frames:v', '1', saida('previas', `audio-${nome}-forma-de-onda.png`)]);
  }
  console.log('exportacoes/previas atualizado.');
}

async function pacote() {
  const destino = join(caminhos.campanha, `vitrine-inspira-campanha-${versao}.zip`);
  const total = await criarZip(destino, caminhos.campanha, entrada => !/(^|\/)(\.temporario|paginas)(\/|$)|\.zip$/.test(entrada));
  console.log(`${destino} (${total} arquivos)`);
}

const precisaNavegador = etapas.some(etapa => ['estaticos', 'modelos', 'gifs', 'videos'].includes(etapa));
const navegador = precisaNavegador ? await iniciarNavegador() : null;
try {
  for (const etapa of etapas) {
    if (etapa === 'apoio') await apoio();
    if (etapa === 'estaticos') await estaticos(navegador);
    if (etapa === 'modelos') await exportarModelos(navegador);
    if (etapa === 'gifs') await exportarGifs(navegador);
    if (etapa === 'videos') await exportarVideos(navegador);
    if (etapa === 'audio') await exportarAudio();
    if (etapa === 'site') await site();
    if (etapa === 'previas') await previas();
    if (etapa === 'pacote') await pacote();
  }
} finally {
  await navegador?.fechar();
}
