import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fonte = dirname(fileURLToPath(import.meta.url));
const campanha = resolve(fonte, '..');
const repositorio = resolve(campanha, '..', '..');

export const caminhos = Object.freeze({
  repositorio,
  campanha,
  fonte: arquivo => join(repositorio, 'web', 'assets', 'fonts', arquivo),
  marca: arquivo => join(repositorio, 'web', 'assets', 'brand', arquivo),
  apoioOriginal: nome => join(campanha, 'imagens-apoio', `${nome}-original.jpg`),
  apoioOtimizado: nome => join(campanha, 'imagens-apoio', `${nome}.jpg`),
  paginas: join(campanha, 'fonte', 'paginas'),
  exportacoes: join(campanha, 'exportacoes'),
  site: join(repositorio, 'web', 'assets', 'modelos'),
  temporario: join(campanha, '.temporario')
});
