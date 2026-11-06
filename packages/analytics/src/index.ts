/*
 * Mesure d'audience ShipGlows : préférences du visiteur (opposition, consentement).
 *
 * Deux modes, choisis par le visiteur et jamais par le site :
 * - « exempté » (par défaut, sans bandeau) : cadre de l'exemption CNIL (outil d'auto-évaluation
 *   de juillet 2025). Identifiant first-party aléatoire de 13 mois maximum, non prolongé ;
 *   référent réduit au domaine ; aucune UTM, aucun identifiant de campagne.
 * - « consenti » : seulement après un acte positif du visiteur (bandeau de consentement). Ajoute
 *   les UTM et l'identifiant de campagne, utiles aux mesures d'acquisition (finalité marketing).
 *
 * L'opposition prime sur tout : plus aucun envoi et l'identifiant est effacé. Elle doit être
 * proposée par un bouton dans la politique de confidentialité (`AnalyticsOptOut.astro`).
 *
 * Tout est stocké en localStorage du site (first-party) ; un navigateur qui refuse le stockage
 * n'envoie rien plutôt que de mesurer sans pouvoir respecter l'opposition.
 */

/** Durée de vie maximale de l'identifiant visiteur : 13 mois (395 jours), jamais prolongée. */
export const VISITOR_TTL_MS = 395 * 24 * 60 * 60 * 1000;
/** Une session se termine après 30 minutes sans activité. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;
/** Validité d'un choix de consentement (acceptation comme refus) : 6 mois, recommandation CNIL. */
export const CONSENT_TTL_MS = 182 * 24 * 60 * 60 * 1000;

export const STORAGE_KEYS = {
  visitor: "sg_aud_vid",
  session: "sg_aud_sid",
  optOut: "sg_aud_optout",
  consent: "sg_aud_consent",
} as const;

export type ConsentState = "granted" | "denied" | "unset";

function read(key: string, store: "local" | "session" = "local"): string | null {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null, store: "local" | "session" = "local"): boolean {
  try {
    const target = store === "local" ? localStorage : sessionStorage;
    if (value === null) target.removeItem(key);
    else target.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Vrai quand le stockage du site est utilisable (sinon le tracker reste muet). */
export function storageAvailable(): boolean {
  return write("sg_aud_probe", "1") && write("sg_aud_probe", null);
}

export function isOptedOut(): boolean {
  return read(STORAGE_KEYS.optOut) === "1";
}

/** Opposition du visiteur : arrêt de la mesure et effacement de ses identifiants. */
export function optOut(): void {
  write(STORAGE_KEYS.optOut, "1");
  write(STORAGE_KEYS.visitor, null);
  write(STORAGE_KEYS.consent, null);
  write(STORAGE_KEYS.session, null, "session");
  dispatchChange();
}

/** Retrait de l'opposition : la mesure exemptée reprend avec un nouvel identifiant. */
export function optIn(): void {
  write(STORAGE_KEYS.optOut, null);
  dispatchChange();
}

/** Choix du bandeau de consentement : `true` après « Accepter », `false` après « Refuser ». */
export function setAnalyticsConsent(granted: boolean): void {
  write(STORAGE_KEYS.consent, JSON.stringify({ granted, at: Date.now() }));
  dispatchChange();
}

export function getAnalyticsConsent(): ConsentState {
  const raw = read(STORAGE_KEYS.consent);
  if (!raw) return "unset";
  try {
    const value = JSON.parse(raw) as { granted?: unknown; at?: unknown };
    if (typeof value.at !== "number" || Date.now() - value.at > CONSENT_TTL_MS) return "unset";
    return value.granted === true ? "granted" : "denied";
  } catch {
    return "unset";
  }
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Identifiant visiteur : créé une fois, expire 13 mois après sa création, jamais prolongé. */
export function visitorId(now = Date.now()): string | null {
  const raw = read(STORAGE_KEYS.visitor);
  if (raw) {
    try {
      const value = JSON.parse(raw) as { id?: unknown; exp?: unknown };
      if (typeof value.id === "string" && typeof value.exp === "number" && value.exp > now) {
        return value.id;
      }
    } catch {}
  }
  const id = randomId();
  return write(STORAGE_KEYS.visitor, JSON.stringify({ id, exp: now + VISITOR_TTL_MS })) ? id : null;
}

/** Identifiant de session : renouvelé après 30 minutes d'inactivité. */
export function sessionId(now = Date.now()): string {
  const raw = read(STORAGE_KEYS.session, "session");
  let id: string | null = null;
  if (raw) {
    try {
      const value = JSON.parse(raw) as { id?: unknown; last?: unknown };
      if (typeof value.id === "string" && typeof value.last === "number" && now - value.last < SESSION_IDLE_MS) {
        id = value.id;
      }
    } catch {}
  }
  id ??= randomId();
  write(STORAGE_KEYS.session, JSON.stringify({ id, last: now }), "session");
  return id;
}

export function newPageviewId(): string {
  return randomId();
}

/** Événement émis sur `window` à chaque changement d'opposition ou de consentement. */
export const PREFERENCES_EVENT = "sg:analytics-preferences";

function dispatchChange(): void {
  try {
    window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT));
  } catch {}
}
