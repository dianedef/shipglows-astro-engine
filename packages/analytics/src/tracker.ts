/*
 * Tracker navigateur de la mesure d'audience ShipGlows (backend ContentGlows, `/a/collect`).
 *
 * Trois types d'événements seulement, ceux qu'admet la grille CNIL de juillet 2025 :
 * - `pv` : présence sur une page (chemin, type, auteur, catégorie, langue, référent réduit au domaine) ;
 * - `cl` : utilisation d'une fonctionnalité (lien sortant, téléchargement, élément `data-sg-track`) ;
 * - `en` : statistiques de la page (profondeur de défilement, temps d'attention, temps de chargement).
 *
 * Jamais collectés : chaîne de requête, fragment, contenu de formulaire, texte saisi, position de la
 * souris, rejeu de session, empreinte du terminal. Les UTM ne partent qu'avec le consentement.
 *
 * Configuration lue sur l'élément `[data-sg-analytics]` rendu par `Analytics.astro`, relue à chaque
 * navigation `astro:page-load` (ClientRouter) pour suivre auteur et catégorie de la nouvelle page.
 */
import {
  PREFERENCES_EVENT,
  getAnalyticsConsent,
  isOptedOut,
  newPageviewId,
  sessionId,
  storageAvailable,
  visitorId,
} from "./index";

type PageMeta = {
  endpoint: string;
  pageType?: string;
  author?: string;
  category?: string;
  lang?: string;
};

type PageState = {
  meta: PageMeta;
  id: string;
  path: string;
  startedAt: number;
  engagedMs: number;
  lastActiveAt: number;
  maxScroll: number;
  loadMs?: number;
  clicks: number;
  sent: string;
};

/** Le visiteur est compté « attentif » s'il a agi (défilement, clavier, pointeur) dans les 15 dernières secondes. */
const ACTIVE_WINDOW_MS = 15_000;
const MAX_CLICKS_PER_PAGE = 30;
const DOWNLOAD_EXTENSIONS = /\.(pdf|zip|epub|mp3|mp4|docx?|xlsx?|pptx?|csv)$/i;

let page: PageState | null = null;
let firstPage = true;

function clip(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function readMeta(): PageMeta | null {
  const el = document.querySelector<HTMLElement>("[data-sg-analytics]");
  const endpoint = el?.dataset.endpoint?.replace(/\/+$/, "");
  if (!el || !endpoint) return null;
  return {
    endpoint,
    pageType: clip(el.dataset.pageType, 40),
    author: clip(el.dataset.author, 120),
    category: clip(el.dataset.category, 120),
    lang: clip(el.dataset.lang || document.documentElement.lang, 12),
  };
}

function send(meta: PageMeta, body: Record<string, unknown>): void {
  if (isOptedOut()) return;
  const v = visitorId();
  if (!v) return;
  const payload = {
    d: location.hostname,
    p: location.pathname,
    v,
    s: sessionId(),
    c: getAnalyticsConsent() === "granted" ? 1 : 0,
    ...body,
  };
  const url = `${meta.endpoint}/a/collect`;
  const json = JSON.stringify(payload);
  // text/plain : requête CORS simple, sans pré-vol, compatible sendBeacon partout.
  try {
    if (navigator.sendBeacon?.(url, new Blob([json], { type: "text/plain" }))) return;
  } catch {}
  fetch(url, { method: "POST", body: json, keepalive: true, mode: "cors" }).catch(() => {});
}

/** Référent externe réduit au domaine ; une navigation interne n'en a pas. */
function externalReferrer(): string | undefined {
  try {
    const url = new URL(document.referrer);
    if (url.host === location.host || !/^https?:$/.test(url.protocol)) return undefined;
    return `${url.protocol}//${url.host}`;
  } catch {
    return undefined;
  }
}

function campaign(): Record<string, string> {
  if (getAnalyticsConsent() !== "granted") return {};
  const params = new URLSearchParams(location.search);
  const out: Record<string, string> = {};
  for (const [key, short] of [["utm_source", "us"], ["utm_medium", "um"], ["utm_campaign", "uc"]] as const) {
    const value = clip(params.get(key) ?? undefined, 200);
    if (value) out[short] = value;
  }
  return out;
}

function scrollDepth(): number {
  const doc = document.documentElement;
  const height = Math.max(doc.scrollHeight, document.body?.scrollHeight ?? 0);
  if (height <= window.innerHeight) return 100;
  return Math.min(100, Math.round(((window.scrollY + window.innerHeight) / height) * 100));
}

function loadTime(): number | undefined {
  const [nav] = (performance.getEntriesByType?.("navigation") ?? []) as PerformanceNavigationTiming[];
  const end = nav?.loadEventEnd || nav?.domContentLoadedEventEnd;
  return end ? Math.round(end) : undefined;
}

/** Envoie les statistiques cumulées de la page si elles ont changé (le serveur garde le maximum). */
function flushEngagement(): void {
  if (!page) return;
  page.loadMs ??= firstPage ? loadTime() : undefined;
  const body = {
    k: "en",
    i: page.id,
    sd: page.maxScroll,
    et: page.engagedMs,
    ...(page.loadMs ? { lt: page.loadMs } : {}),
  };
  const signature = JSON.stringify(body);
  if (signature === page.sent) return;
  page.sent = signature;
  send(page.meta, body);
}

function startPage(): void {
  const meta = readMeta();
  if (!meta || isOptedOut()) return;
  if (page && page.path === location.pathname && Date.now() - page.startedAt < 1000) return;
  if (page) {
    flushEngagement();
    firstPage = false;
  }
  const now = Date.now();
  page = {
    meta,
    id: newPageviewId(),
    path: location.pathname,
    startedAt: now,
    engagedMs: 0,
    lastActiveAt: now,
    maxScroll: scrollDepth(),
    clicks: 0,
    sent: "",
  };
  send(meta, {
    k: "pv",
    i: page.id,
    r: firstPage ? externalReferrer() : undefined,
    t: meta.pageType,
    a: meta.author,
    g: meta.category,
    ln: meta.lang,
    ...campaign(),
  });
}

function markActive(): void {
  if (page) page.lastActiveAt = Date.now();
}

function onScroll(): void {
  markActive();
  if (page) page.maxScroll = Math.max(page.maxScroll, scrollDepth());
}

function onClick(event: MouseEvent): void {
  markActive();
  if (!page || page.clicks >= MAX_CLICKS_PER_PAGE) return;
  const target = event.target instanceof Element ? event.target : null;
  const labelled = target?.closest<HTMLElement>("[data-sg-track]");
  const anchor = target?.closest<HTMLAnchorElement>("a[href]");
  const label = clip(labelled?.dataset.sgTrack, 100);
  let destination: string | undefined;
  if (anchor) {
    try {
      const url = new URL(anchor.href, location.href);
      if (url.host !== location.host && /^https?:$/.test(url.protocol)) destination = url.host;
      else if (anchor.hasAttribute("download") || DOWNLOAD_EXTENSIONS.test(url.pathname)) destination = url.pathname;
      else if (label) destination = url.pathname;
    } catch {}
  }
  if (!destination && !label) return;
  page.clicks += 1;
  send(page.meta, { k: "cl", i: page.id, tg: destination?.slice(0, 500), lb: label });
}

/** Mesure manuelle d'une fonctionnalité (bouton d'un îlot, lecture d'une vidéo…). */
export function trackFeature(label: string, destination?: string): void {
  if (!page || page.clicks >= MAX_CLICKS_PER_PAGE) return;
  const lb = clip(label, 100);
  if (!lb) return;
  page.clicks += 1;
  send(page.meta, { k: "cl", i: page.id, tg: clip(destination, 500), lb });
}

/** Démarre la mesure. Idempotent : un second appel ne fait rien. */
export function initAnalytics(): void {
  const w = window as Window & { __sgAnalytics?: boolean };
  if (w.__sgAnalytics || !storageAvailable()) return;
  w.__sgAnalytics = true;

  setInterval(() => {
    if (page && document.visibilityState === "visible" && Date.now() - page.lastActiveAt < ACTIVE_WINDOW_MS) {
      page.engagedMs += 1000;
    }
  }, 1000);

  addEventListener("scroll", onScroll, { passive: true });
  for (const type of ["keydown", "pointerdown", "pointermove", "touchstart"] as const) {
    addEventListener(type, markActive, { passive: true });
  }
  document.addEventListener("click", onClick, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushEngagement();
    else markActive();
  });
  addEventListener("pagehide", flushEngagement);
  document.addEventListener("astro:page-load", startPage);
  addEventListener(PREFERENCES_EVENT, () => {
    if (isOptedOut()) page = null;
    else if (!page) startPage();
  });

  startPage();
}
