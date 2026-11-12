import { writeFile } from 'node:fs/promises';

export const TAXA = 48000;

// Ruído determinístico: o mesmo roteiro gera sempre o mesmo áudio.
function criarRuido(semente = 7) {
  let estado = semente;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 2 ** 31 - 1;
  };
}

// Filtro passa-faixa (RBJ) com frequência variável por amostra.
function passaFaixa() {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (entrada, frequencia, q = 1.2) => {
    const w = (2 * Math.PI * frequencia) / TAXA;
    const alfa = Math.sin(w) / (2 * q);
    const a0 = 1 + alfa;
    const b0 = alfa / a0, b2 = -alfa / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alfa) / a0;
    const saida = b0 * entrada + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = entrada; y2 = y1; y1 = saida;
    return saida;
  };
}

const SONS = {
  // Clique suave de toque na tela.
  toque(buffer, inicio, ruido) {
    const n = Math.round(0.05 * TAXA);
    const filtro = passaFaixa();
    for (let i = 0; i < n; i += 1) {
      const t = i / TAXA;
      const corpo = Math.sin(2 * Math.PI * (1500 - 5000 * t) * t) * Math.exp(-t / 0.012);
      const ataque = filtro(ruido(), 3200, 0.9) * Math.exp(-t / 0.004);
      buffer[inicio + i] += 0.28 * corpo + 0.22 * ataque;
    }
  },
  // Confirmação: duas notas curtas e baixas quando um valor muda.
  confirma(buffer, inicio) {
    [[880, 0], [1320, 0.045]].forEach(([frequencia, atraso]) => {
      const desloc = inicio + Math.round(atraso * TAXA);
      const n = Math.round(0.12 * TAXA);
      for (let i = 0; i < n; i += 1) {
        const t = i / TAXA;
        const envelope = Math.min(1, t / 0.004) * Math.exp(-t / 0.035);
        buffer[desloc + i] += 0.1 * envelope * (Math.sin(2 * Math.PI * frequencia * t) + 0.25 * Math.sin(4 * Math.PI * frequencia * t));
      }
    });
  },
  // Deslocamento de uma janela que avança.
  avanca(buffer, inicio, ruido) {
    const duracao = 0.2;
    const n = Math.round(duracao * TAXA);
    const filtro = passaFaixa();
    for (let i = 0; i < n; i += 1) {
      const p = i / n;
      buffer[inicio + i] += 0.16 * Math.sin(Math.PI * p) ** 2 * filtro(ruido(), 700 + 1900 * p, 1.4);
    }
  },
  // Passagem entre cenas.
  passagem(buffer, inicio, ruido) {
    const duracao = 0.3;
    const n = Math.round(duracao * TAXA);
    const filtro = passaFaixa();
    for (let i = 0; i < n; i += 1) {
      const p = i / n;
      buffer[inicio + i] += 0.22 * Math.sin(Math.PI * p) ** 1.5 * filtro(ruido(), 380 + 2200 * p * p, 0.9);
    }
  },
  // Assinatura curta da marca: arpejo ascendente em três notas.
  assinatura(buffer, inicio) {
    [[659.25, 0], [987.77, 0.09], [1318.51, 0.18]].forEach(([frequencia, atraso], k) => {
      const desloc = inicio + Math.round(atraso * TAXA);
      const n = Math.round(0.9 * TAXA);
      for (let i = 0; i < n && desloc + i < buffer.length; i += 1) {
        const t = i / TAXA;
        const envelope = Math.min(1, t / 0.006) * Math.exp(-t / (0.32 - k * 0.04));
        const onda = Math.sin(2 * Math.PI * frequencia * t) + 0.3 * Math.sin(4 * Math.PI * frequencia * t) + 0.08 * Math.sin(6 * Math.PI * frequencia * t);
        buffer[desloc + i] += 0.075 * envelope * onda;
      }
    });
  }
};

/** Mixa os sinais `{ t, tipo }` em uma faixa mono com pico de −3 dBFS. */
export function sintetizar(sinais, duracao) {
  const buffer = new Float32Array(Math.round(duracao * TAXA));
  const ruido = criarRuido();
  for (const { t, tipo } of sinais) {
    const som = SONS[tipo];
    if (!som) throw new Error(`Som desconhecido: ${tipo}`);
    const inicio = Math.round(t * TAXA);
    if (inicio < buffer.length - 0.05 * TAXA) som(buffer, inicio, ruido);
  }
  const pico = buffer.reduce((maior, amostra) => Math.max(maior, Math.abs(amostra)), 0);
  const ganho = pico > 0 ? 0.7 / pico : 1;
  const desvanecer = Math.round(0.02 * TAXA);
  for (let i = 0; i < buffer.length; i += 1) {
    const borda = Math.min(1, i / desvanecer, (buffer.length - 1 - i) / desvanecer);
    buffer[i] *= ganho * borda;
  }
  return buffer;
}

export async function escreverWav(destino, mono) {
  const canais = 2;
  const dados = Buffer.alloc(mono.length * canais * 2);
  for (let i = 0; i < mono.length; i += 1) {
    const valor = Math.max(-1, Math.min(1, mono[i])) * 32767;
    dados.writeInt16LE(Math.round(valor), i * 4);
    dados.writeInt16LE(Math.round(valor), i * 4 + 2);
  }
  const cabecalho = Buffer.alloc(44);
  cabecalho.write('RIFF', 0, 'latin1');
  cabecalho.writeUInt32LE(36 + dados.length, 4);
  cabecalho.write('WAVEfmt ', 8, 'latin1');
  cabecalho.writeUInt32LE(16, 16);
  cabecalho.writeUInt16LE(1, 20);
  cabecalho.writeUInt16LE(canais, 22);
  cabecalho.writeUInt32LE(TAXA, 24);
  cabecalho.writeUInt32LE(TAXA * canais * 2, 28);
  cabecalho.writeUInt16LE(canais * 2, 32);
  cabecalho.writeUInt16LE(16, 34);
  cabecalho.write('data', 36, 'latin1');
  cabecalho.writeUInt32LE(dados.length, 40);
  await writeFile(destino, Buffer.concat([cabecalho, dados]));
}
