import { draftLimits, normalizeEntitlements } from './entitlements.mjs';

// Vitrines publicadas como arquivos estáticos pelo build. Uma publicação no Supabase com
// o mesmo slug vence no Worker, então o negócio assume o endereço ao publicar pela conta.
export const STATIC_STOREFRONTS = Object.freeze([
  Object.freeze({ file: 'loja1.json', slug: 'loja1', publishedAt: '2026-11-11T00:00:00.000Z', limits: {} }),
  Object.freeze({
    file: 'forno-de-minas.json',
    slug: 'forno-de-minas',
    publishedAt: '2026-11-28T05:00:00.000Z',
    limits: draftLimits(normalizeEntitlements({ plan_code: 'profissional' }))
  })
]);

export function staticStorefrontLimits(slug) {
  return STATIC_STOREFRONTS.find((entry) => entry.slug === slug)?.limits ?? {};
}
