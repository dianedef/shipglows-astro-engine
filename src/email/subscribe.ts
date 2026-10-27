/*
 * Inscription aux e-mails ShipGlows : script navigateur sans dépendance.
 *
 * Améliore tout `form[data-shipglows-subscribe]` : envoi JSON sans identifiant (credentials omit),
 * garde contre le double envoi, messages FR/EN pour chaque code public du service central, et
 * lecture de `?subscription=pending|error&reason=` après un envoi sans JavaScript (redirection
 * vers `return_to`). Sans JavaScript, le formulaire reste un POST classique vers le service.
 *
 * Aucun jeton ici : le navigateur ne reçoit que l'URL publique du service et les identifiants publics.
 * Les messages sont toujours écrits avec `textContent`, jamais en HTML.
 *
 * Les fonctions pures (mapping des codes, lecture du retour, corps JSON) n'accèdent ni à `document`
 * ni à `window` : elles sont testées dans Node. Ce fichier n'a aucun effet de bord à l'import.
 */

export type SubscribeLocale = "fr" | "en";

export type SubscribeMessageKey =
  | "pending"
  | "invalidEmail"
  | "consentRequired"
  | "captchaFailed"
  | "rateLimited"
  | "unavailable"
  | "invalidRequest"
  | "network"
  | "server"
  | "submitting";

export type SubscribeMessages = Record<SubscribeMessageKey, string>;

/**
 * Textes affichés. Dictionnaire exporté et modifiable : un site peut remplacer une phrase
 * (`subscribeMessages.fr.pending = "…"`) ou passer `messages` à `initSubscribeForms`.
 */
export const subscribeMessages: Record<SubscribeLocale, SubscribeMessages> = {
  fr: {
    pending: "Vérifie ta boîte mail pour confirmer ton inscription.",
    invalidEmail: "Saisis une adresse e-mail valide.",
    consentRequired: "Coche la case pour accepter de recevoir les e-mails.",
    captchaFailed: "La vérification anti-robot a échoué. Réessaie.",
    rateLimited: "Trop de tentatives. Réessaie plus tard.",
    unavailable: "L’inscription n’est pas disponible depuis cette page pour le moment.",
    invalidRequest: "Le formulaire n’a pas pu être envoyé. Réessaie plus tard.",
    network: "Impossible de joindre le serveur. Vérifie ta connexion et réessaie.",
    server: "Une erreur est survenue. Réessaie plus tard.",
    submitting: "Envoi…",
  },
  en: {
    pending: "Check your inbox to confirm your subscription.",
    invalidEmail: "Enter a valid email address.",
    consentRequired: "Tick the box to agree to receive emails.",
    captchaFailed: "The anti-bot check failed. Please try again.",
    rateLimited: "Too many attempts. Please try again later.",
    unavailable: "Signup isn’t available from this page yet.",
    invalidRequest: "The form could not be sent. Please try again later.",
    network: "Could not reach the server. Check your connection and try again.",
    server: "Something went wrong. Please try again later.",
    submitting: "Sending…",
  },
};

/**
 * Codes du service central (contrat v1, « Public subscription ») vers un message. Les codes
 * internes que d'anciens sites recevaient encore sont gardés ; `network` vient du navigateur.
 */
export const SUBSCRIBE_CODE_KEYS: Readonly<Record<string, SubscribeMessageKey>> = {
  invalid_email: "invalidEmail",
  consent_required: "consentRequired",
  captcha_failed: "captchaFailed",
  rate_limited: "rateLimited",
  forbidden_origin: "unavailable",
  public_subscribe_unavailable: "unavailable",
  unavailable: "server",
  invalid_input: "invalidRequest",
  unsupported_media_type: "invalidRequest",
  payload_too_large: "invalidRequest",
  method_not_allowed: "invalidRequest",
  forbidden: "unavailable",
  configuration_unavailable: "unavailable",
  network: "network",
};

const ERROR_CODE = /^[a-z_]{1,64}$/;

function ownKey(table: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, key);
}

/**
 * Clé de message pour un code d'erreur (ou un statut HTTP sans code). Un code connu gagne ;
 * sinon 429 est une limite de débit, 403 un site non autorisé, et tout le reste un échec générique.
 */
export function subscribeMessageKey(code?: string | null, status?: number): SubscribeMessageKey {
  if (code && ownKey(SUBSCRIBE_CODE_KEYS, code)) return SUBSCRIBE_CODE_KEYS[code];
  if (status === 429) return "rateLimited";
  if (status === 403) return "unavailable";
  return "server";
}

/** Choisit la langue d'un formulaire ; tout ce qui n'est pas `en` est du français. */
export function pickSubscribeLocale(value?: string | null): SubscribeLocale {
  return value === "en" ? "en" : "fr";
}

/** Dictionnaire effectif : les textes par défaut, remplacés par `overrides` sans les modifier. */
export function mergeSubscribeMessages(
  overrides?: Partial<Record<SubscribeLocale, Partial<SubscribeMessages>>>,
): Record<SubscribeLocale, SubscribeMessages> {
  return {
    fr: { ...subscribeMessages.fr, ...(overrides?.fr ?? {}) },
    en: { ...subscribeMessages.en, ...(overrides?.en ?? {}) },
  };
}

export type SubscribeLanding = { outcome: "pending" } | { outcome: "error"; key: SubscribeMessageKey };

/**
 * Lit le retour d'un envoi sans JavaScript : `?subscription=pending` ou `?subscription=error&reason=<code>`.
 * Toute autre valeur est ignorée.
 */
export function readSubscribeLanding(search: string): SubscribeLanding | undefined {
  const params = new URLSearchParams(search);
  const outcome = params.get("subscription");
  if (outcome === "pending") return { outcome: "pending" };
  if (outcome === "error") return { outcome: "error", key: subscribeMessageKey(params.get("reason")) };
  return undefined;
}

/** Query sans `subscription` ni `reason`, pour nettoyer l'adresse sans toucher aux autres paramètres. */
export function stripSubscribeLanding(search: string): string {
  const params = new URLSearchParams(search);
  if (!params.has("subscription") && !params.has("reason")) return search;
  params.delete("subscription");
  params.delete("reason");
  const query = params.toString();
  return query ? `?${query}` : "";
}

export type SubscribeFields = {
  businessId: string;
  audienceId: string;
  email: string;
  source: string;
  locale: SubscribeLocale;
  /** Champ piège ; doit rester vide, sinon le service répond comme pour un succès sans rien envoyer. */
  website?: string;
  /** Jeton Turnstile du widget, s'il est présent. */
  turnstileToken?: string;
};

/** Corps JSON attendu par `POST /api/v1/email/public/subscriptions`. Jamais de `return_to` en JSON. */
export function buildSubscribeBody(fields: SubscribeFields): Record<string, unknown> {
  const body: Record<string, unknown> = {
    business_id: fields.businessId,
    audience_id: fields.audienceId,
    email: fields.email,
    consent: true,
    source: fields.source,
    locale: fields.locale,
    website: fields.website ?? "",
  };
  if (fields.turnstileToken) body.cf_turnstile_response = fields.turnstileToken;
  return body;
}

export type InitSubscribeOptions = {
  /** Racine de recherche ; `document` par défaut. */
  root?: ParentNode;
  /** Textes à remplacer pour cet appel seulement (les autres restent ceux de `subscribeMessages`). */
  messages?: Partial<Record<SubscribeLocale, Partial<SubscribeMessages>>>;
  /** `fetch` injectable ; `window.fetch` par défaut. */
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
};

const enhancedForms = new WeakSet<HTMLFormElement>();
let landingConsumed = false;

/**
 * Améliore les formulaires `form[data-shipglows-subscribe]` de la page. Idempotent : un formulaire
 * n'est branché qu'une fois, même si le script est chargé deux fois.
 */
export function initSubscribeForms(options: InitSubscribeOptions = {}): void {
  if (typeof document === "undefined") return;
  const root = options.root ?? document;
  const send = options.fetch ?? ((input, init) => fetch(input, init));
  const forms = Array.from(root.querySelectorAll<HTMLFormElement>("form[data-shipglows-subscribe]"));
  const enhanced: HTMLFormElement[] = [];
  for (const form of forms) {
    if (enhanceForm(form, options.messages, send)) enhanced.push(form);
  }
  if (enhanced.length > 0 && !landingConsumed) {
    landingConsumed = true;
    consumeLanding(enhanced[0], options.messages);
  }
}

function resolveMessages(
  locale: SubscribeLocale,
  overrides?: Partial<Record<SubscribeLocale, Partial<SubscribeMessages>>>,
): SubscribeMessages {
  return mergeSubscribeMessages(overrides)[locale];
}

function fieldValue(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.value : "";
}

function turnstileTokenOf(form: HTMLFormElement): string {
  const field = form.querySelector<HTMLInputElement | HTMLTextAreaElement>('[name="cf-turnstile-response"]');
  return field?.value ?? "";
}

/** Code d'erreur du corps d'une réponse, uniquement s'il est au format attendu. */
async function errorCodeOf(response: Response): Promise<string | undefined> {
  try {
    const data = (await response.json()) as { error?: { code?: unknown } } | null;
    const code = data?.error?.code;
    return typeof code === "string" && ERROR_CODE.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

/** Améliore un formulaire ; renvoie `false` s'il n'est pas branchable (pas d'URL, champs absents). */
function enhanceForm(
  form: HTMLFormElement,
  overrides: InitSubscribeOptions["messages"],
  send: (input: string, init: RequestInit) => Promise<Response>,
): boolean {
  if (enhancedForms.has(form)) return true;
  const endpoint = form.getAttribute("action") ?? "";
  const status = form.querySelector<HTMLElement>("[data-shipglows-status]");
  const email = form.elements.namedItem("email");
  const consent = form.elements.namedItem("consent");
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  // Sans URL (site non configuré) ou sans champs attendus, le formulaire reste inerte.
  if (!endpoint || !status || !(email instanceof HTMLInputElement) || !(consent instanceof HTMLInputElement) || !submit) {
    return false;
  }
  enhancedForms.add(form);

  const locale = pickSubscribeLocale(form.dataset.locale);
  const idleLabel = submit.textContent ?? "";
  let busy = false;

  const show = (text: string, tone: "success" | "error" | "") => {
    status.textContent = text;
    status.dataset.tone = tone;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const copy = resolveMessages(locale, overrides);
    const value = email.value.trim();
    if (!value || !email.checkValidity()) {
      show(copy.invalidEmail, "error");
      email.focus();
      return;
    }
    if (!consent.checked) {
      show(copy.consentRequired, "error");
      consent.focus();
      return;
    }

    busy = true;
    submit.disabled = true;
    submit.textContent = copy.submitting;
    show("", "");
    try {
      const response = await send(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "omit",
        body: JSON.stringify(
          buildSubscribeBody({
            businessId: fieldValue(form, "business_id"),
            audienceId: fieldValue(form, "audience_id"),
            email: value,
            source: fieldValue(form, "source"),
            locale,
            website: fieldValue(form, "website"),
            turnstileToken: turnstileTokenOf(form),
          }),
        ),
      });
      if (response.status === 202) {
        form.reset();
        resetTurnstile(form);
        show(copy.pending, "success");
      } else {
        const key = subscribeMessageKey(await errorCodeOf(response), response.status);
        show(copy[key], "error");
        resetTurnstile(form);
      }
    } catch {
      show(copy.network, "error");
    } finally {
      busy = false;
      submit.disabled = false;
      submit.textContent = idleLabel;
      status.focus();
    }
  });
  return true;
}

/** Un jeton Turnstile ne sert qu'une fois : après chaque réponse, le widget repart à zéro. */
function resetTurnstile(form: HTMLFormElement): void {
  const widget = form.querySelector<HTMLElement>(".cf-turnstile");
  const turnstile = (globalThis as { turnstile?: { reset?: (element?: HTMLElement) => void } }).turnstile;
  if (widget && turnstile?.reset) turnstile.reset(widget);
}

/** Affiche le retour d'un envoi sans JavaScript, puis retire les paramètres de l'adresse. */
function consumeLanding(form: HTMLFormElement, overrides: InitSubscribeOptions["messages"]): void {
  if (typeof window === "undefined") return;
  const landing = readSubscribeLanding(window.location.search);
  if (!landing) return;
  const status = form.querySelector<HTMLElement>("[data-shipglows-status]");
  const copy = resolveMessages(pickSubscribeLocale(form.dataset.locale), overrides);
  if (status) {
    status.textContent = landing.outcome === "pending" ? copy.pending : copy[landing.key];
    status.dataset.tone = landing.outcome === "pending" ? "success" : "error";
  }
  const search = stripSubscribeLanding(window.location.search);
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
}
