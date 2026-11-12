import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const executar = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export async function ffmpeg(args) {
  try {
    await executar(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 64 * 1024 * 1024 });
  } catch (erro) {
    throw new Error(`ffmpeg ${args.join(' ')}\n${erro.stderr || erro.message}`);
  }
}

export async function sondar(arquivo) {
  const { stdout } = await executar(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,nb_frames,sample_rate,channels', '-of', 'json', arquivo]);
  return JSON.parse(stdout);
}

/** Recebe quadros PNG em sequência e entrega ao ffmpeg sem gravar arquivos intermediários. */
export function receberQuadros(args) {
  const processo = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'png', ...args], { stdio: ['pipe', 'ignore', 'pipe'] });
  let erro = '';
  processo.stderr.on('data', pedaco => { erro += pedaco; });
  const terminou = new Promise((ok, falha) => processo.on('exit', codigo => (codigo === 0 ? ok() : falha(new Error(`ffmpeg falhou (${codigo}): ${erro}`)))));
  return {
    escrever: quadro => new Promise((ok, falha) => (processo.stdin.write(quadro, e => (e ? falha(e) : ok())))),
    async concluir() {
      processo.stdin.end();
      await terminou;
    }
  };
}

export const otimizarJpeg = (entrada, saida, largura = 960, qualidade = 4) => ffmpeg(['-i', entrada, '-vf', `scale=${largura}:-2:flags=lanczos`, '-q:v', String(qualidade), saida]);
export const pngParaWebp = (entrada, saida, qualidade = 86) => ffmpeg(['-i', entrada, '-c:v', 'libwebp', '-quality', String(qualidade), '-compression_level', '6', saida]);
