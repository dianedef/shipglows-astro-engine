/**
 * Fil d'Ariane : une liste d'étapes, du plus général (accueil) à la page courante (dernière étape).
 * Le même tableau sert au HTML visible et au JSON-LD `BreadcrumbList`, pour qu'ils ne divergent jamais.
 */
export interface BreadcrumbItem {
  label: string;
  /** Lien de l'étape ; facultatif pour la dernière (page courante). Relatif au site ou absolu. */
  href?: string;
}

export interface BreadcrumbsFromPathOptions {
  /** Étape d'accueil ajoutée en tête ; `false` pour ne pas l'ajouter. Par défaut `{ label: "Accueil", href: "/" }`. */
  home?: BreadcrumbItem | false;
  /** Libellé d'un segment (`ia` → « Intelligence artificielle ») : table ou fonction ; sinon le segment est humanisé. */
  labels?: Record<string, string> | ((segment: string, index: number, segments: string[]) => string | undefined);
  /** Remplace le libellé de la dernière étape, ex. le titre de l'article. */
  currentLabel?: string;
  /** Retire un préfixe du chemin avant découpage, ex. la locale (`/en/blog` → `/blog`). */
  stripPrefix?: (pathname: string) => string;
  /** Transforme le chemin cumulé de chaque segment en lien, ex. pour remettre la locale ou corriger une route. */
  hrefFor?: (path: string) => string;
  /** Ajoute `/` final aux liens générés (Astro `trailingSlash: "always"`). */
  trailingSlash?: boolean;
}

/**
 * Construit les étapes depuis l'URL : un segment = une étape, lien = chemin cumulé.
 * Deux étapes consécutives qui mènent au même lien (route redirigée par `hrefFor`) sont fusionnées.
 */
export function breadcrumbsFromPath(pathname: string, options: BreadcrumbsFromPathOptions = {}): BreadcrumbItem[] {
  const { home = { label: "Accueil", href: "/" }, labels, currentLabel, stripPrefix, hrefFor, trailingSlash } = options;
  const path = stripPrefix ? stripPrefix(pathname) : pathname;
  const segments = path.split("/").filter(Boolean);
  const items: BreadcrumbItem[] = home ? [home] : [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    let cumulative = `/${segments.slice(0, index + 1).join("/")}`;
    if (trailingSlash) cumulative += "/";
    const href = hrefFor ? hrefFor(cumulative) : cumulative;
    if (items.at(-1)?.href === href) continue;

    const isLast = index === segments.length - 1;
    const label = isLast && currentLabel ? currentLabel : segmentLabel(segment, index, segments, labels);
    items.push({ label, href });
  }

  return items;
}

/** `mentions-legales` → « Mentions legales » ; décode les segments encodés (`%C3%A9`). */
export function humanizeSegment(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Segment mal encodé : on garde l'original.
  }
  const text = decoded.replace(/-/g, " ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

export interface BreadcrumbJsonLdOptions {
  /** Base des URL absolues : `Astro.site` (ou l'URL du site en dur). */
  site: URL | string | undefined;
  /** URL de la page courante, utilisée si la dernière étape n'a pas de `href` (ex. `Astro.url`). */
  currentUrl?: URL | string;
}

/**
 * Objet JSON-LD `BreadcrumbList` avec des URL absolues.
 * Une étape sans lien (hors dernière avec `currentUrl`) est publiée sans `item`, ce que schema.org admet.
 */
export function breadcrumbJsonLd(items: BreadcrumbItem[], options: BreadcrumbJsonLdOptions) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => {
      const isLast = index === items.length - 1;
      const href = item.href ?? (isLast ? options.currentUrl?.toString() : undefined);
      return {
        "@type": "ListItem",
        position: index + 1,
        name: item.label,
        ...(href ? { item: absoluteUrl(href, options.site) } : {}),
      };
    }),
  };
}

/** Sérialise pour `<script type="application/ld+json">` sans pouvoir fermer la balise (`</script>` dans un titre). */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function absoluteUrl(href: string, site: URL | string | undefined): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(href)) return href;
  if (!site) {
    throw new Error(`Fil d'Ariane : « site » manquant (astro.config), impossible de rendre « ${href} » absolu.`);
  }
  return new URL(href, site).href;
}

function segmentLabel(
  segment: string,
  index: number,
  segments: string[],
  labels: BreadcrumbsFromPathOptions["labels"],
): string {
  if (typeof labels === "function") return labels(segment, index, segments) ?? humanizeSegment(segment);
  if (labels) {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // Segment mal encodé : seule la forme brute est cherchée.
    }
    return labels[segment] ?? labels[decoded] ?? humanizeSegment(segment);
  }
  return humanizeSegment(segment);
}
