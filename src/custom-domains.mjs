import { PortalValidationError } from './portal-validation.mjs';

const hostnamePattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const blockedSuffixes = ['inspira.dev.br', 'workers.dev', 'pages.dev', 'localhost', 'local', 'test', 'invalid'];

export function validateCustomHostname(value) {
  const hostname = typeof value === 'string' ? value.trim().toLowerCase().replace(/\.$/, '') : '';
  if (hostname.length > 253 || !hostnamePattern.test(hostname) ||
      !/[a-z]/.test(hostname.split('.').at(-1)) ||
      blockedSuffixes.some(suffix => hostname === suffix || hostname.endsWith('.' + suffix))) {
    throw new PortalValidationError(422, 'INVALID_HOSTNAME', 'Informe um domínio público ou subdomínio válido.');
  }
  return hostname;
}

export function createDomainChallenge(hostname, cnameTarget) {
  const parts = hostname.split('.');
  const suffixLength = /\.(?:com|org|net|gov|edu)\.[a-z]{2}$/.test(hostname) ? 2 : 1;
  return {
    hostname,
    is_apex: parts.length === suffixLength + 1,
    verification_txt_name: '_vitrine-verify.' + hostname,
    verification_txt_value: 'vitrine=' + crypto.randomUUID(),
    cname_target: cnameTarget
  };
}

export async function verifyDomainDns(domain, fetchImpl = fetch) {
  async function resolve(name, type) {
    const url = new URL('https://cloudflare-dns.com/dns-query');
    url.search = new URLSearchParams({ name, type });
    const response = await fetchImpl(url, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error('Falha ao consultar o DNS.');
    const data = await response.json();
    if (![0, 3].includes(data.Status)) throw new Error('O DNS não respondeu de forma conclusiva.');
    return Array.isArray(data.Answer) ? data.Answer : [];
  }
  const [txt, cname] = await Promise.all([
    resolve(domain.verification_txt_name, 'TXT'),
    domain.is_apex ? [] : resolve(domain.hostname, 'CNAME')
  ]);
  const normalize = value => String(value).toLowerCase().replace(/\.$/, '');
  const ownsDomain = txt.some(record => record.type === 16 &&
    normalize(record.name) === normalize(domain.verification_txt_name) &&
    String(record.data).replace(/^"|"$/g, '') === domain.verification_txt_value);
  const pointsToPlatform = domain.is_apex || cname.some(record => record.type === 5 &&
    normalize(record.name) === domain.hostname && normalize(record.data) === normalize(domain.cname_target));
  return ownsDomain && pointsToPlatform;
}

export class CloudflareHostnames {
  constructor(zoneId, token, fetchImpl = fetch) {
    if (!/^[a-f0-9]{32}$/i.test(zoneId)) throw new TypeError('Zona Cloudflare inválida.');
    this.url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames`;
    this.token = token;
    this.fetch = fetchImpl;
  }

  async request(path, method = 'GET', body) {
    const response = await this.fetch(this.url + path, {
      method,
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(8000)
    });
    if (response.status === 404 && method === 'DELETE') return null;
    const data = await response.json();
    if (!response.ok || data.success !== true) throw new Error('Falha na consulta de domínios à Cloudflare.');
    return data;
  }

  async find(hostname) {
    const query = new URLSearchParams({ hostname });
    const result = await this.request('?' + query);
    return result.result.find(entry => entry.hostname === hostname) ?? null;
  }

  async create(hostname) {
    const page = await this.request('?page=1&per_page=1');
    if (!Number.isSafeInteger(page.result_info?.total_count) || page.result_info.total_count >= 95) {
      throw new PortalValidationError(403, 'DOMAIN_QUOTA_REACHED', 'A cota de domínios da zona foi atingida.');
    }
    const result = await this.request('', 'POST', {
      hostname, ssl: { method: 'http', type: 'dv' }
    });
    return result.result;
  }

  async remove(id) {
    if (!/^[a-f0-9-]{32,36}$/i.test(id)) throw new TypeError('Identificador Cloudflare inválido.');
    await this.request('/' + id, 'DELETE');
  }
}
