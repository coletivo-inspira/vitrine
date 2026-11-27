// Estados e municípios para o campo de localização do Perfil.
// O perfil continua guardando um único texto `city` no formato "Cidade, UF"
// (máximo 120 caracteres, validado em src/portal-validation.mjs).

export const BRAZIL_STATES = Object.freeze([
  { uf: 'AC', name: 'Acre' },
  { uf: 'AL', name: 'Alagoas' },
  { uf: 'AP', name: 'Amapá' },
  { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' },
  { uf: 'CE', name: 'Ceará' },
  { uf: 'DF', name: 'Distrito Federal' },
  { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' },
  { uf: 'MA', name: 'Maranhão' },
  { uf: 'MT', name: 'Mato Grosso' },
  { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' },
  { uf: 'PA', name: 'Pará' },
  { uf: 'PB', name: 'Paraíba' },
  { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' },
  { uf: 'PI', name: 'Piauí' },
  { uf: 'RJ', name: 'Rio de Janeiro' },
  { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' },
  { uf: 'RO', name: 'Rondônia' },
  { uf: 'RR', name: 'Roraima' },
  { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' },
  { uf: 'SE', name: 'Sergipe' },
  { uf: 'TO', name: 'Tocantins' }
]);

export const PROFILE_CITY_MAX_LENGTH = 120;
// ", UF" ocupa 4 caracteres do limite do servidor.
export const CITY_NAME_MAX_LENGTH = PROFILE_CITY_MAX_LENGTH - 4;

const UF_SET = new Set(BRAZIL_STATES.map((s) => s.uf));

export function normalizeLocationText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const STATE_BY_NORMALIZED_NAME = new Map(
  BRAZIL_STATES.map((s) => [normalizeLocationText(s.name), s.uf])
);

export function findStateUf(value) {
  const raw = String(value ?? '').trim();
  if (UF_SET.has(raw.toUpperCase())) return raw.toUpperCase();
  return STATE_BY_NORMALIZED_NAME.get(normalizeLocationText(raw)) || '';
}

// Aceita "Cidade, UF", "Cidade - UF", "Cidade/UF", "Cidade UF", "Cidade, Nome do Estado"
// e só a sigla. Um nome de estado sozinho ("São Paulo") é tratado como cidade.
// Texto sem estado reconhecível volta inteiro em `city`.
export function parseProfileCity(value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return { uf: '', city: '' };

  if (UF_SET.has(text.toUpperCase())) return { uf: text.toUpperCase(), city: '' };

  const separated = text.match(/^(.+)[,\/\-–]\s*([^,\/\-–]+)$/);
  if (separated) {
    const uf = findStateUf(separated[2]);
    const city = separated[1].trim();
    if (uf && city) return { uf, city };
  }

  const trailingUf = text.match(/^(.+)\s([A-Za-z]{2})$/);
  if (trailingUf && UF_SET.has(trailingUf[2].toUpperCase())) {
    return { uf: trailingUf[2].toUpperCase(), city: trailingUf[1].trim() };
  }

  return { uf: '', city: text };
}

export function formatProfileCity(city, uf) {
  const name = String(city ?? '').trim().replace(/\s+/g, ' ').slice(0, CITY_NAME_MAX_LENGTH);
  const state = UF_SET.has(String(uf ?? '').toUpperCase()) ? String(uf).toUpperCase() : '';
  if (name && state) return `${name}, ${state}`;
  return (name || state).slice(0, PROFILE_CITY_MAX_LENGTH);
}

export function matchMunicipio(city, municipios = []) {
  const target = normalizeLocationText(city);
  if (!target) return null;
  return municipios.find((name) => normalizeLocationText(name) === target) || null;
}

const municipiosCache = new Map();

export function loadMunicipios(uf, fetchImpl = globalThis.fetch) {
  const state = String(uf ?? '').toUpperCase();
  if (!UF_SET.has(state)) return Promise.resolve([]);
  if (!municipiosCache.has(state)) {
    const url = new URL(`./data/municipios/${state}.json`, import.meta.url);
    const request = fetchImpl(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((names) => (Array.isArray(names) ? names.filter((n) => typeof n === 'string') : []))
      .catch((err) => {
        municipiosCache.delete(state);
        throw err;
      });
    municipiosCache.set(state, request);
  }
  return municipiosCache.get(state);
}

const HELP_PICK_STATE = 'Selecione o estado para listar as cidades.';
const HELP_CONFIRM_STATE = 'Selecione o estado para confirmar a cidade.';
const HELP_LOADING = 'Carregando cidades...';
const HELP_SEARCH = 'Digite para buscar a cidade na lista.';
const HELP_UNLISTED = 'Cidade fora da lista deste estado; será salva como digitada.';
const HELP_LOAD_ERROR = 'Não foi possível carregar a lista de cidades. Digite o nome da cidade.';

// Liga o <select> de estado ao campo de cidade com <datalist>.
// Um valor antigo que não está na lista continua no campo e como opção.
export function createLocationPicker({ stateSelect, cityInput, cityList, cityHelp, loader = loadMunicipios }) {
  if (!stateSelect || !cityInput) return null;
  const doc = stateSelect.ownerDocument;

  for (const { uf, name } of BRAZIL_STATES) {
    const option = doc.createElement('option');
    option.value = uf;
    option.textContent = `${name} (${uf})`;
    stateSelect.append(option);
  }

  let municipios = [];
  let loadToken = 0;
  let loadFailed = false;

  const setHelp = (text) => {
    if (cityHelp && cityHelp.textContent !== text) cityHelp.textContent = text;
  };

  const refreshHelp = () => {
    const city = cityInput.value.trim();
    if (!stateSelect.value) setHelp(city ? HELP_CONFIRM_STATE : HELP_PICK_STATE);
    else if (loadFailed) setHelp(HELP_LOAD_ERROR);
    else if (city && municipios.length && !matchMunicipio(city, municipios)) setHelp(HELP_UNLISTED);
    else setHelp(HELP_SEARCH);
  };

  const refreshEnabled = () => {
    const enabled = Boolean(stateSelect.value || cityInput.value.trim());
    cityInput.disabled = !enabled;
    cityInput.placeholder = stateSelect.value ? 'Digite para buscar' : 'Escolha o estado primeiro';
  };

  const renderOptions = () => {
    if (!cityList) return;
    const city = cityInput.value.trim();
    const names = city && !matchMunicipio(city, municipios) ? [city, ...municipios] : municipios;
    cityList.replaceChildren(
      ...names.map((name) => {
        const option = doc.createElement('option');
        option.value = name;
        return option;
      })
    );
  };

  async function loadState({ clearForeignCity = false } = {}) {
    const token = ++loadToken;
    const uf = stateSelect.value;
    const previous = municipios;
    municipios = [];
    loadFailed = false;
    refreshEnabled();
    if (!uf) {
      renderOptions();
      refreshHelp();
      return;
    }
    setHelp(HELP_LOADING);
    try {
      const names = await loader(uf);
      if (token !== loadToken) return;
      municipios = names;
      const city = cityInput.value.trim();
      const match = matchMunicipio(city, names);
      if (match) cityInput.value = match;
      else if (clearForeignCity && matchMunicipio(city, previous)) cityInput.value = '';
    } catch {
      if (token !== loadToken) return;
      loadFailed = true;
    }
    refreshEnabled();
    renderOptions();
    refreshHelp();
  }

  stateSelect.addEventListener('change', () => loadState({ clearForeignCity: true }));
  cityInput.addEventListener('input', refreshHelp);
  cityInput.addEventListener('change', () => {
    const match = matchMunicipio(cityInput.value, municipios);
    if (match) cityInput.value = match;
    refreshEnabled();
    refreshHelp();
  });

  return {
    setValue(value) {
      const { uf, city } = parseProfileCity(value);
      stateSelect.value = uf;
      cityInput.value = city;
      return loadState();
    },
    getValue() {
      const city = cityInput.value.trim();
      return formatProfileCity(matchMunicipio(city, municipios) || city, stateSelect.value);
    }
  };
}
