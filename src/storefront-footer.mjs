// O HTML público é montado sem sessão, então o selo de apoio do plano Gratuito é
// decidido na publicação e gravado no snapshot (mesmo padrão de `local-seo.mjs`).
import { hasPlanFeature } from './entitlements.mjs';
import { PortalValidationError } from './portal-validation.mjs';

export * from '../web/assets/storefront-footer.mjs';

/** Opções de publicação derivadas do plano (entram em compilePublicStorefront). */
export function publicationFooterOptions({ entitlements } = {}) {
  return { supportBadge: !hasPlanFeature(entitlements, 'support_badge_optional') };
}

/** Campo do snapshot: só `supportBadge: false`, quando o plano dispensa o selo. */
export function projectPublicFooter({ supportBadge } = {}) {
  return supportBadge === false ? { supportBadge: false } : {};
}

export function assertPublicFooter(menu) {
  if (menu.supportBadge !== undefined && menu.supportBadge !== false) {
    throw new PortalValidationError(422, 'PRIVATE_FIELD_LEAKAGE', 'Campo supportBadge inválido.');
  }
}
