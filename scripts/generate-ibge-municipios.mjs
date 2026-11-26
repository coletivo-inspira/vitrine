// One-off generator for the static municipality lists used by the portal Perfil form.
// Runs only on a developer machine; the portal never calls IBGE at runtime
// (ADR 0005 zero cost, CSP connect-src 'self').
// Usage: node scripts/generate-ibge-municipios.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { BRAZIL_STATES } from '../web/portal/br-locations.js';

const outputDir = new URL('../web/portal/data/municipios/', import.meta.url);
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

async function fetchMunicipios(uf) {
  const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`IBGE ${uf}: HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error(`IBGE ${uf}: lista vazia`);
  const names = [...new Set(data.map((m) => String(m.nome || '').trim()).filter(Boolean))];
  return names.sort(collator.compare);
}

await mkdir(outputDir, { recursive: true });
let total = 0;
for (const { uf } of BRAZIL_STATES) {
  const names = await fetchMunicipios(uf);
  await writeFile(new URL(`${uf}.json`, outputDir), `${JSON.stringify(names)}\n`);
  total += names.length;
  console.log(`${uf}: ${names.length} municípios`);
}
console.log(`Total: ${total} municípios em ${BRAZIL_STATES.length} arquivos.`);
