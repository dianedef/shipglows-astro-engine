/**
 * i18n légère et sans style : langue courante, chemins par langue, alternates hreflang.
 * Les traductions de contenu (textes d'interface, articles) restent dans chaque site.
 */

/** Une langue du site. Tout est optionnel : les valeurs par défaut dérivent du code. */
export interface LocaleDefinition {
  /** Segment d'URL (`en` → `/en/…`). Par défaut le code. Ignoré pour la langue par défaut sans préfixe. */
  prefix?: string;
  /** Valeur `hreflang` (ex. `fr-fr`). Par défaut le code. */
  hreflang?: string;
  /** Valeur de `lang` sur <html> et sur les liens. Par défaut le code. */
  lang?: string;
  /** `og:locale` (ex. `fr_FR`). Par défaut déduit des langues courantes. */
  ogLocale?: string;
  /** Nom affiché dans le sélecteur, dans sa propre langue (« Français »). */
  label?: string;
  /** Locale `Intl` pour dates et nombres (ex. `fr-BE`). Par défaut `lang`. */
  intl?: string;
}

export interface I18nConfig<L extends string = string> {
  /** Langues du site ; l'ordre des clés est l'ordre d'affichage. */
  locales: Record<L, LocaleDefinition>;
  defaultLocale: L;
  /** Préfixer aussi la langue par défaut (`/fr/…`). Les chemins sans préfixe restent attribués à la langue par défaut. */
  prefixDefaultLocale?: boolean;
  /** Langues publiées (alternates, sélecteur, réécriture). Par défaut toutes. */
  published?: readonly L[];
  /**
   * Paires de slugs traduits, en chemins complets :
   * `{ en: "/privacy", fr: "/fr/confidentialite" }`. Prioritaires sur la règle de préfixe.
   * Une langue absente d'une paire = pas de traduction pour cette page.
   */
  routes?: readonly Partial<Record<L, string>>[];
  /**
   * Chemins (sans préfixe) qui existent dans toutes les langues avec le même slug.
   * `true` (défaut) : tous. Une liste : seulement ceux-là ; `"/parcours/*"` couvre la section.
   */
  sharedPaths?: true | readonly string[];
  /** Langue visée par `hreflang="x-default"` ; `false` pour ne pas en émettre. Par défaut la langue par défaut. */
  xDefault?: L | false;
  /** Barre finale des chemins produits. Par défaut `never` (la racine reste `/`). */
  trailingSlash?: "never" | "always";
  /** Chemins jamais localisés, rendus tels quels. Par défaut `/api` et `/_astro`. */
  unlocalizedPaths?: readonly string[];
  /** Paramètre de requête qui force la langue (`?lang=fr`), lu par `localeFromUrl`. */
  queryParam?: string;
  /** Racines de deux lettres qui ne sont pas des langues (ex. `rh`), pour `parsePath().unknownLocale`. */
  notLocales?: readonly string[];
}

export type LocaleOf<C> = C extends I18nConfig<infer L> ? L : string;

export interface LocaleInfo<L extends string = string> {
  code: L;
  /** Segment d'URL effectif, vide pour la langue par défaut sans préfixe. */
  prefix: string;
  hreflang: string;
  lang: string;
  ogLocale: string;
  label: string;
  intl: string;
}

export interface LocaleLink<L extends string = string> extends LocaleInfo<L> {
  href: string;
  /** La page affichée est dans cette langue. */
  current: boolean;
  /** Une vraie traduction existe ; sinon `href` pointe vers l'accueil de la langue. */
  translated: boolean;
}

export interface Alternate {
  hreflang: string;
  href: string;
}

export interface LinkOptions<L extends string = string> {
  /** Langue de la page, si elle ne se déduit pas du chemin (article dont la langue vient du frontmatter). */
  locale?: L;
  /**
   * Traductions connues de la page (articles : `alternateSlug`, `contentId`…).
   * Si fourni, fait foi : une langue absente ou `null` n'a pas de traduction.
   */
  translations?: Partial<Record<L, string | null>>;
  /** Origine du site (`Astro.site`) pour produire des URL absolues. */
  site?: string | URL;
}

const DEFAULT_UNLOCALIZED = ["/api", "/_astro"];
const LANGUAGE_TAG = /^[a-z]{2}(?:-[a-z0-9]{2,8})*$/i;
const KNOWN: Record<string, { label: string; ogLocale: string }> = {
  fr: { label: "Français", ogLocale: "fr_FR" },
  en: { label: "English", ogLocale: "en_US" },
  es: { label: "Español", ogLocale: "es_ES" },
  de: { label: "Deutsch", ogLocale: "de_DE" },
  it: { label: "Italiano", ogLocale: "it_IT" },
  pt: { label: "Português", ogLocale: "pt_PT" },
  nl: { label: "Nederlands", ogLocale: "nl_NL" },
};

export function defineI18nConfig<const L extends string>(config: I18nConfig<L>): I18nConfig<L> {
  const codes = Object.keys(config.locales) as L[];
  const check = (locale: string, where: string) => {
    if (!codes.includes(locale as L)) throw new Error(`i18n : « ${locale} » (${where}) n'est pas dans locales.`);
  };
  check(config.defaultLocale, "defaultLocale");
  for (const locale of config.published ?? []) check(locale, "published");
  if (config.xDefault) check(config.xDefault, "xDefault");

  const prefixes = new Set<string>();
  for (const code of codes) {
    const prefix = localeInfo(config, code).prefix;
    if (!prefix) continue;
    if (prefixes.has(prefix)) throw new Error(`i18n : le préfixe « ${prefix} » est utilisé par deux langues.`);
    prefixes.add(prefix);
  }

  const seen = new Set<string>();
  for (const route of config.routes ?? []) {
    for (const [locale, path] of Object.entries(route) as [string, string][]) {
      if (!path) continue;
      check(locale, `routes ${path}`);
      if (!path.startsWith("/")) throw new Error(`i18n : le chemin « ${path} » de routes doit commencer par /.`);
      const key = normalize(path);
      if (seen.has(key)) throw new Error(`i18n : le chemin « ${path} » apparaît dans deux paires de routes.`);
      seen.add(key);
    }
  }
  return config;
}

export function isLocale<C extends I18nConfig>(config: C, value: unknown): value is LocaleOf<C> {
  return typeof value === "string" && Object.hasOwn(config.locales, value);
}

/** Valeurs effectives d'une langue (préfixe, hreflang, og:locale, libellé…). */
export function localeInfo<C extends I18nConfig>(config: C, locale: LocaleOf<C>): LocaleInfo<LocaleOf<C>> {
  const definition = (config.locales as Record<string, LocaleDefinition>)[locale] ?? {};
  const isUnprefixedDefault = locale === config.defaultLocale && !config.prefixDefaultLocale;
  const lang = definition.lang ?? locale;
  const known = KNOWN[lang.split("-")[0].toLowerCase()];
  return {
    code: locale,
    prefix: isUnprefixedDefault ? "" : (definition.prefix ?? locale),
    hreflang: definition.hreflang ?? lang,
    lang,
    ogLocale: definition.ogLocale ?? known?.ogLocale ?? lang.replace("-", "_"),
    label: definition.label ?? known?.label ?? locale.toUpperCase(),
    intl: definition.intl ?? lang,
  };
}

/** Langue d'une valeur libre (`en-US`, `fr_BE`, frontmatter, Accept-Language), sinon `undefined`. */
export function matchLocale<C extends I18nConfig>(config: C, value: string | null | undefined): LocaleOf<C> | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase().replace(/_/g, "-");
  const codes = localeCodes(config);
  return codes.find((code) => code.toLowerCase() === normalized)
    ?? codes.find((code) => code.toLowerCase() === normalized.split("-")[0]);
}

/** Comme `matchLocale`, avec repli sur la langue par défaut. */
export function normalizeLocale<C extends I18nConfig>(config: C, value: string | null | undefined): LocaleOf<C> {
  return matchLocale(config, value) ?? (config.defaultLocale as LocaleOf<C>);
}

export interface ParsedPath<L extends string = string> {
  locale: L;
  /** Chemin sans préfixe de langue, normalisé selon `trailingSlash`. */
  path: string;
  /** `?…#…` d'origine. */
  suffix: string;
  /** Premier segment qui ressemble à une langue non configurée (`/de/…`) : la page n'est sans doute pas à servir. */
  unknownLocale?: string;
}

/** Découpe un chemin : langue, chemin sans préfixe, suffixe. */
export function parsePath<C extends I18nConfig>(config: C, path: string): ParsedPath<LocaleOf<C>> {
  const { pathname, suffix } = splitSuffix(stripOrigin(path));
  const normalized = normalize(pathname);
  const routeLocale = findRoute(config, normalized)?.locale;
  const first = normalized.split("/")[1] ?? "";
  const prefixed = localeCodes(config).find((code) => {
    const prefix = localeInfo(config, code).prefix;
    return prefix !== "" && prefix === first;
  });
  const rest = prefixed ? normalize(normalized.slice(first.length + 1)) : normalized;
  const parsed: ParsedPath<LocaleOf<C>> = {
    locale: routeLocale ?? prefixed ?? (config.defaultLocale as LocaleOf<C>),
    path: format(config, rest),
    suffix,
  };
  if (!prefixed && first && LANGUAGE_TAG.test(first) && !config.notLocales?.includes(first.toLowerCase())) {
    parsed.unknownLocale = first;
  }
  return parsed;
}

/** Langue d'un chemin : paire de `routes`, puis préfixe, sinon langue par défaut. */
export function localeFromPath<C extends I18nConfig>(config: C, path: string): LocaleOf<C> {
  return parsePath(config, path).locale;
}

/** Comme `localeFromPath`, mais `?<queryParam>=<langue>` l'emporte quand `queryParam` est configuré. */
export function localeFromUrl<C extends I18nConfig>(config: C, url: string | URL): LocaleOf<C> {
  const parsed = new URL(url, "http://localhost");
  const forced = config.queryParam ? parsed.searchParams.get(config.queryParam) : null;
  return isLocale(config, forced) ? forced : localeFromPath(config, parsed.pathname);
}

/** Chemin sans préfixe de langue, suffixe `?…#…` conservé. */
export function stripLocale<C extends I18nConfig>(config: C, path: string): string {
  const { path: rest, suffix } = parsePath(config, path);
  return `${rest}${suffix}`;
}

/**
 * Chemin d'un lien vers `locale` : paire de `routes`, sinon règle de préfixe.
 * Les URL externes, ancres et `unlocalizedPaths` sont rendues telles quelles.
 */
export function localizedPath<C extends I18nConfig>(config: C, path: string, locale: LocaleOf<C>): string {
  if (!isLocalizable(config, path)) return path;
  const { pathname, suffix } = splitSuffix(path);
  const route = findRoute(config, normalize(pathname))?.route;
  const translated = route?.[locale];
  if (translated) return `${format(config, translated)}${suffix}`;
  return `${prefixPath(config, locale, parsePath(config, pathname).path)}${suffix}`;
}

/**
 * Équivalent de la page dans `locale`, ou `null` s'il n'existe pas
 * (paire sans cette langue, chemin hors `sharedPaths`, chemin non localisé).
 */
export function translatePath<C extends I18nConfig>(config: C, path: string, locale: LocaleOf<C>): string | null {
  const local = stripOrigin(path);
  if (!isLocalizable(config, local)) return null;
  const { pathname, suffix } = splitSuffix(local);
  const normalized = normalize(pathname);
  const match = findRoute(config, normalized);
  if (match) {
    const translated = match.route[locale];
    return translated ? `${format(config, translated)}${suffix}` : null;
  }
  const parsed = parsePath(config, normalized);
  if (parsed.locale === locale) return `${format(config, normalized)}${suffix}`;
  if (!matchesPaths(config.sharedPaths ?? true, parsed.path)) return null;
  return `${prefixPath(config, locale, parsed.path)}${suffix}`;
}

/** Un lien par langue publiée, pour un sélecteur ou les `og:locale:alternate`. */
export function localeLinks<C extends I18nConfig>(
  config: C,
  path: string,
  options: LinkOptions<LocaleOf<C>> = {},
): LocaleLink<LocaleOf<C>>[] {
  const current = options.locale ?? localeFromPath(config, path);
  return publishedLocales(config).map((locale) => {
    let target: string | null;
    if (locale === current) target = format(config, splitSuffix(stripOrigin(path)).pathname);
    else if (options.translations) target = formatOptional(config, options.translations[locale]);
    else target = translatePath(config, path, locale);
    const href = target ?? prefixPath(config, locale, "/");
    return {
      ...localeInfo(config, locale),
      href: absolute(href, options.site),
      current: locale === current,
      translated: target !== null,
    };
  });
}

/**
 * Balises `<link rel="alternate" hreflang>` de la page : langues traduites + `x-default`.
 * Vide quand la page n'existe que dans une langue.
 */
export function alternates<C extends I18nConfig>(
  config: C,
  path: string,
  options: LinkOptions<LocaleOf<C>> = {},
): Alternate[] {
  const links = localeLinks(config, path, options).filter((link) => link.translated);
  if (links.length < 2) return [];
  const result: Alternate[] = links.map(({ hreflang, href }) => ({ hreflang, href }));
  const xDefault = config.xDefault ?? config.defaultLocale;
  const fallback = xDefault === false ? undefined : links.find((link) => link.code === xDefault);
  if (fallback) result.push({ hreflang: "x-default", href: fallback.href });
  return result;
}

/** `alternates` au format `links` de `@astrojs/sitemap` (`serialize`). */
export function sitemapLinks<C extends I18nConfig>(
  config: C,
  path: string,
  options: LinkOptions<LocaleOf<C>> & { site: string | URL },
): { lang: string; url: string }[] {
  return alternates(config, path, options).map(({ hreflang, href }) => ({ lang: hreflang, url: href }));
}

/** Toutes les variantes publiées de chemins (ex. `customPages` du sitemap pour des pages servies par réécriture). */
export function localizedPaths<C extends I18nConfig>(
  config: C,
  paths: readonly string[],
  options: { site?: string | URL } = {},
): string[] {
  const result = new Set<string>();
  for (const path of paths) {
    for (const locale of publishedLocales(config)) {
      const translated = translatePath(config, path, locale);
      if (translated) result.add(absolute(translated, options.site));
    }
  }
  return [...result];
}

/**
 * Pour un middleware qui sert une seule page pour toutes les langues (`/en/carte` → page `/carte`) :
 * le chemin à passer à `context.rewrite()`, ou `null` s'il n'y a rien à réécrire.
 * `paths` limite la réécriture à certaines sections (`"/parcours/*"`).
 */
export function rewritePath<C extends I18nConfig>(
  config: C,
  pathname: string,
  options: { paths?: true | readonly string[] } = {},
): string | null {
  const parsed = parsePath(config, pathname);
  if (!localeInfo(config, parsed.locale).prefix || !publishedLocales(config).includes(parsed.locale)) return null;
  if (parsed.path === format(config, pathname)) return null;
  if (isUnlocalized(config, parsed.path) || !matchesPaths(options.paths ?? true, parsed.path)) return null;
  return parsed.path;
}

/** Texte ou valeur dans la langue voulue, avec repli sur la langue par défaut puis la première valeur non vide. */
export function pickLocalized<C extends I18nConfig, T>(
  config: C,
  values: Partial<Record<LocaleOf<C>, T>> | T,
  locale: LocaleOf<C>,
): T | undefined {
  if (values === null || typeof values !== "object" || Array.isArray(values)) return values as T;
  const record = values as Partial<Record<string, T>>;
  const filled = (value: T | undefined) => value !== undefined && value !== null && !(typeof value === "string" && !value.trim());
  if (filled(record[locale])) return record[locale];
  if (filled(record[config.defaultLocale])) return record[config.defaultLocale];
  return Object.values(record).find(filled);
}

/** Segments de premier niveau à ne pas utiliser comme slug de contenu (préfixes de langue + chemins non localisés). */
export function reservedRoots(config: I18nConfig): Set<string> {
  const roots = new Set<string>();
  for (const code of localeCodes(config)) {
    const prefix = localeInfo(config, code).prefix;
    if (prefix) roots.add(prefix);
  }
  for (const path of config.unlocalizedPaths ?? DEFAULT_UNLOCALIZED) {
    const root = path.split("/")[1];
    if (root) roots.add(root);
  }
  return roots;
}

export function publishedLocales<C extends I18nConfig>(config: C): LocaleOf<C>[] {
  return [...(config.published ?? localeCodes(config))] as LocaleOf<C>[];
}

function localeCodes<C extends I18nConfig>(config: C): LocaleOf<C>[] {
  return Object.keys(config.locales) as LocaleOf<C>[];
}

function findRoute<C extends I18nConfig>(config: C, normalized: string) {
  for (const route of config.routes ?? []) {
    for (const [locale, path] of Object.entries(route) as [LocaleOf<C>, string][]) {
      if (path && normalize(path) === normalized) return { route: route as Partial<Record<LocaleOf<C>, string>>, locale };
    }
  }
  return undefined;
}

function prefixPath<C extends I18nConfig>(config: C, locale: LocaleOf<C>, unprefixed: string): string {
  const prefix = localeInfo(config, locale).prefix;
  const rest = normalize(unprefixed);
  if (!prefix) return format(config, rest);
  return format(config, rest === "/" ? `/${prefix}` : `/${prefix}${rest}`);
}

function isLocalizable(config: I18nConfig, path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  return !isUnlocalized(config, normalize(splitSuffix(path).pathname));
}

function isUnlocalized(config: I18nConfig, path: string): boolean {
  const normalized = normalize(path);
  return (config.unlocalizedPaths ?? DEFAULT_UNLOCALIZED).some((root) => {
    const base = normalize(root);
    return normalized === base || normalized.startsWith(`${base}/`);
  });
}

function matchesPaths(paths: true | readonly string[], path: string): boolean {
  if (paths === true) return true;
  const normalized = normalize(path);
  return paths.some((entry) => {
    if (entry.endsWith("/*")) {
      const base = normalize(entry.slice(0, -2));
      return base === "/" || normalized === base || normalized.startsWith(`${base}/`);
    }
    return normalize(entry) === normalized;
  });
}

function absolute(path: string, site?: string | URL): string {
  return site ? new URL(path, site).href : path;
}

function stripOrigin(path: string): string {
  return path.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "") || "/";
}

function splitSuffix(path: string): { pathname: string; suffix: string } {
  const boundary = path.search(/[?#]/);
  return boundary === -1 ? { pathname: path, suffix: "" } : { pathname: path.slice(0, boundary), suffix: path.slice(boundary) };
}

/** `/a//b/` → `/a/b` ; la racine reste `/`. */
function normalize(pathname: string): string {
  const withSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withSlash.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
}

function formatOptional(config: I18nConfig, path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith("/")) return path;
  const { pathname, suffix } = splitSuffix(path);
  return `${format(config, pathname)}${suffix}`;
}

function format(config: I18nConfig, pathname: string): string {
  const normalized = normalize(pathname);
  if (normalized === "/" || config.trailingSlash !== "always") return normalized;
  const last = normalized.slice(normalized.lastIndexOf("/") + 1);
  return last.includes(".") ? normalized : `${normalized}/`;
}
