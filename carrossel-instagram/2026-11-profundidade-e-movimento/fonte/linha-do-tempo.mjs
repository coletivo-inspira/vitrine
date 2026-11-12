import { ciclo } from './campanha.mjs';

// x, y, s valem para SVG e HTML; z, rx e ry criam perspectiva e só se aplicam a HTML.
const TRANSFORM_KEYS = ['x', 'y', 's', 'z', 'rx', 'ry'];
const NAMES = { o: 'opacity' };
const round = value => Math.round(value * 1000) / 1000;
const percent = (t, duration) => `${round((t / duration) * 100)}%`;

function declarations(props) {
  const parts = [];
  if (['z', 'rx', 'ry'].some(key => key in props)) {
    parts.push(`transform:translate3d(${props.x ?? 0}px,${props.y ?? 0}px,${props.z ?? 0}px) rotateX(${props.rx ?? 0}deg) rotateY(${props.ry ?? 0}deg) scale(${props.s ?? 1})`);
  } else if (TRANSFORM_KEYS.some(key => key in props)) {
    parts.push(`transform:translate(${props.x ?? 0}px,${props.y ?? 0}px) scale(${props.s ?? 1})`);
  }
  for (const [key, value] of Object.entries(props)) {
    if (TRANSFORM_KEYS.includes(key)) continue;
    parts.push(`${NAMES[key] ?? key}:${value}`);
  }
  return parts.join(';');
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Cria trilhas de animação CSS com prefixo exclusivo. Cada trilha recebe paradas
 * `[segundos, propriedades]`; a última parada volta ao estado inicial para o loop
 * não saltar, e toda mudança precisa durar entre 180 e 300 ms.
 */
export function criarLinhaDoTempo({ prefixo, duracao = ciclo.duracao, limites = ciclo, inicio = 0 } = {}) {
  if (!/^[a-z][a-z0-9-]*$/.test(prefixo)) throw new Error(`Prefixo inválido: ${prefixo}`);
  const trilhas = [];
  const regras = [];

  function trilha(nome, paradas, { origem = 'center', caixa = 'fill-box', curva = ciclo.curva, laco = true } = {}) {
    const classe = `${prefixo}-${nome}`;
    if (trilhas.some(entry => entry.classe === classe)) throw new Error(`Trilha repetida: ${classe}`);
    if (!paradas.length || paradas[0][0] !== 0) throw new Error(`${classe}: a primeira parada deve estar em 0 s`);
    let acumulado = {};
    const completas = paradas.map(([t, props]) => {
      acumulado = { ...acumulado, ...props };
      return [round(t), { ...acumulado }];
    });
    const chaves = Object.keys(acumulado);
    for (const [, props] of completas) for (const chave of chaves) if (!(chave in props)) throw new Error(`${classe}: "${chave}" precisa existir na parada inicial`);
    // Sem a parada final, o navegador interpolaria de volta ao valor de base até 100%.
    if (completas.at(-1)[0] < duracao) completas.push([duracao, { ...(laco ? completas[0][1] : completas.at(-1)[1]) }]);
    if (laco && !same(completas.at(-1)[1], completas[0][1])) throw new Error(`${classe}: o loop precisa terminar no estado inicial`);
    for (let i = 1; i < completas.length; i += 1) {
      const [t0, a] = completas[i - 1];
      const [t1, b] = completas[i];
      if (t1 < t0) throw new Error(`${classe}: paradas fora de ordem`);
      if (!same(a, b)) {
        const passo = round(t1 - t0);
        if (passo < limites.transicaoMin - 1e-9 || passo > limites.transicaoMax + 1e-9) {
          throw new Error(`${classe}: transição de ${passo}s em ${t0}s fora de ${limites.transicaoMin}–${limites.transicaoMax}s`);
        }
      }
    }
    trilhas.push({ classe, paradas: completas });
    const quadros = completas
      .map(([t, props]) => `${percent(t, duracao)}{${declarations(props)};animation-timing-function:${curva}}`)
      .join('');
    const repeticao = laco ? 'infinite' : '1';
    regras.push(
      `@keyframes ${classe}{${quadros}}`,
      `.${classe}{animation:${classe} ${duracao}s linear ${inicio ? `${inicio}s ` : ''}${repeticao} both;transform-box:${caixa};transform-origin:${origem}}`
    );
    return classe;
  }

  return {
    trilha,
    css: () => regras.join('\n'),
    trilhas: () => trilhas.map(entry => ({ ...entry, paradas: entry.paradas.map(([t, p]) => [t, { ...p }]) }))
  };
}

/** Descreve uma trilha por mudanças: `[inicio, propriedades, duracao = 0.24]`. */
export function passos(inicial, mudancas) {
  const paradas = [[0, inicial]];
  let atual = inicial;
  for (const [t, props, duracao = 0.24] of mudancas) {
    paradas.push([round(t), atual]);
    atual = { ...atual, ...props };
    paradas.push([round(t + duracao), atual]);
  }
  return paradas;
}
