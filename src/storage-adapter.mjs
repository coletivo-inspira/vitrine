const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export class SupabaseStorageProvider {
  constructor({ baseUrl, bucket, anonKey, token, fetchImpl = fetch }) {
    this.baseUrl = baseUrl;
    this.bucket = bucket;
    this.headers = { Authorization: `Bearer ${token}`, apikey: anonKey };
    this.fetch = fetchImpl;
  }

  url(key) {
    return `${this.baseUrl}/storage/v1/object/public/${this.bucket}/${key}`;
  }

  async delete(key) {
    const response = await this.fetch(`${this.baseUrl}/storage/v1/object/${this.bucket}/${key}`, {
      method: 'DELETE', headers: this.headers
    });
    return response?.ok || response?.status === 404;
  }

  async put(key, bytes) {
    const endpoint = `${this.baseUrl}/storage/v1/object`;
    const response = await this.fetch(`${endpoint}/${this.bucket}/${key}`, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Content-Type': 'image/webp',
        'cache-control': CACHE_CONTROL
      },
      body: bytes
    });
    return response?.ok ? this.url(key) : null;
  }
}

export class R2StorageProvider {
  constructor({ binding, publicBaseUrl }) {
    this.binding = binding;
    this.publicBaseUrl = new URL(publicBaseUrl);
    if (this.publicBaseUrl.protocol !== 'https:' || !this.publicBaseUrl.pathname.endsWith('/') ||
        this.publicBaseUrl.username || this.publicBaseUrl.password ||
        this.publicBaseUrl.search || this.publicBaseUrl.hash) {
      throw new TypeError('Informe uma URL pública HTTPS terminada em barra.');
    }
  }

  url(key) {
    return new URL(key, this.publicBaseUrl).href;
  }

  async delete(key) {
    await this.binding.delete(key);
    return true;
  }

  async put(key, bytes) {
    await this.binding.put(key, bytes, {
      httpMetadata: { contentType: 'image/webp', cacheControl: CACHE_CONTROL }
    });
    return this.url(key);
  }
}
