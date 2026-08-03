/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Module de Redirection de Paiement Multi-Plateforme (Pure JS)
 * ═══════════════════════════════════════════════════════════
 * Détecte l'appareil (Desktop vs Mobile) et calcule la cible de redirection
 * optimale sans jamais provoquer d'écran blanc ni de redirection vers undefined.
 */

/**
 * Détection multi-critères fiable de l'appareil mobile.
 * Ne se base PAS uniquement sur le User-Agent (ex: iPadOS se déclare "Macintosh").
 * Combine `pointer: coarse`, `hover: none` et `maxTouchPoints`.
 */
export function detectIsMobile() {
  if (typeof window === 'undefined') return false;

  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  const hasTouch = (navigator.maxTouchPoints || 0) > 0;
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  return (isCoarse && noHover) || (hasTouch && isMobileUA);
}

/**
 * Construit la stratégie de redirection en fonction de la réponse de l'API et de la plateforme.
 */
export function createRedirectPlan(response) {
  if (!response) {
    return {
      targetUrl: null,
      fallbackUrl: null,
      isMobile: detectIsMobile(),
      stayOnPage: false,
      qrCode: null,
    };
  }

  const isMobile = detectIsMobile();
  const qrCode = response.qr_code || null;
  const paymentUrl = response.payment_url || null;

  // L'URL de secours web prioritaire est payment_url, puis MAXIT/OM si payment_url absent
  const fallbackUrl = paymentUrl || response.deep_links?.MAXIT || response.deep_links?.OM || null;

  // 1. Cas SUR DESKTOP / PC :
  if (!isMobile) {
    // Si un QR Code est disponible (Wave / Orange), rester sur la page pour l'afficher pendant le polling
    if (qrCode) {
      return {
        targetUrl: null,
        fallbackUrl,
        isMobile: false,
        stayOnPage: true,
        qrCode,
      };
    }

    // Sinon (ex: Orange Money Max It sans QR Code), utiliser l'URL web payment_url (JAMAIS les liens page.link / OM)
    return {
      targetUrl: paymentUrl,
      fallbackUrl,
      isMobile: false,
      stayOnPage: false,
      qrCode: null,
    };
  }

  // 2. Cas SUR MOBILE :
  // Chaîne de priorité deep links : MAXIT -> OM -> payment_url
  const mobileTarget = response.deep_links?.MAXIT || response.deep_links?.OM || paymentUrl;

  return {
    targetUrl: mobileTarget,
    fallbackUrl,
    isMobile: true,
    stayOnPage: false,
    qrCode,
  };
}

/**
 * Exécute la redirection via window.location.href (JAMAIS window.open qui est bloqué par les mobiles).
 * Garantit qu'aucune navigation vers undefined n'a lieu.
 */
export function executeRedirect(targetUrl) {
  if (!targetUrl || typeof window === 'undefined') return false;
  window.location.href = targetUrl;
  return true;
}
