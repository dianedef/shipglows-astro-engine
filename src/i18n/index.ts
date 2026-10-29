/**
 * i18n commune aux sites ShipGlows, sans style. Une seule convention d'URL pour tous :
 *
 * - la langue par défaut n'a pas de préfixe, chaque autre langue est sous `/<code>` ;
 * - les slugs sont traduits, chaque paire est déclarée dans `routes` (articles : `translations`) ;
 * - la section précède le slug (`/fr/blog/…`), pas de barre finale ;
 * - `hreflang` = code de langue seul, `x-default` = langue par défaut, seulement sur les pages traduites ;
 * - le sélecteur est toujours là : sans traduction, il mène à l'accueil de la langue ;
 * - `?lang=<code>` redirige en 301 vers l'URL de la langue.
 *
 * Seules valeurs propres à un site : ses langues, sa langue par défaut, ses paires de slugs.
 * Les traductions de contenu (textes d'interface, articles) restent dans chaque site.
 */

/** Une langue du site. Le préfixe d'URL, `lang` et `hreflang` sont toujours le code. */
export interface LocaleDefinition {
  /** Nom affiché dans le sélecteur, dans sa propre langue. Par défaut « Français », « English »… */
  label?: string;
  /** `og:locale` (ex. `fr_FR`). Par défaut déduit du code. */
  ogLocale?: string;
  /** Locale `Intl` pour dates et nombres (ex. `fr-BE`). Par défaut le code. */
  intl?: string;
}

/**
 * Une page et ses traductions, en chemins complets : `{ en: "/privacy", fr: "/fr/confidentialite" }`.
 * Une section dont chaque page existe dans toutes ses langues avec le même slug final :
 * `{ en: "/compare/*", fr: "/fr/comparatif/*" }` (`/compare/glasp` ↔ `/fr/comparatif/glasp`).
 * L'index d'une section se déclare à part ; une paire exacte l'emporte sur une section.
 */
export type Route<L extends string = string> = Partial<Record<L, string>> & {
  /** Anciennes URL de la page, redirigées en 301 vers la langue correspondante (`astroRedirects`). */
  legacy?: Partial<Record<L, readonly string[]>>;
};

export interface I18nConfig<L extends string = string> {
  /** Langues du site, codes ISO 639-1 (`fr`, `en`) ; l'ordre des clés est l'ordre d'affichage. */
  locales: Record<L, LocaleDefinition>;
  defaultLocale: L;
  /** Langues publiées (alternates, sélecteur, réécriture). Par défaut toutes. */
  published?: readonly L[];
  /**
   * Pages traduites. Une langue absente d'une paire = pas de traduction : ni hreflang ni lien direct.
   * Un chemin hors de `routes` n'a pas d'alternate, sauf `translations` passées par la page.
   */
  routes?: readonly Route<L>[];
  /** Chemins jamais localisés, rendus tels quels. Par défaut `/api` et `/_astro`. */
  unlocalizedPaths?: readonly string[];
}

export type LocaleOf<C> = C extends I18nConfig<infer L> ? L : string;

export interface LocaleInfo<L extends string = string> {
  code: L;
  /** Segment d'URL, vide pour la langue par défaut. */
  prefix: string;
  /** `lang` de <html> et `hreflang` : le code. */
  lang: string;
  hreflang: string;
  ogLocale: string;
  label: string;
  intl: string;
}

export interface LocaleLink<L extends string = string> extends LocaleInfo<L> {
  href: string;
  /** La page affichée est dans cette langue. */
  current: boolean;
  /** Une vraie traduction existe ; sinon `href` mène à l'accueil de la langue. */
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

export interface ParsedPath<L extends string = string> {
  locale: L;
  /** Chemin sans préfixe de langue, normalisé. */
  path: string;
  /** `?…#…` d'origine. */
  suffix: string;
  /** Premier segment qui ressemble à une langue non configurée (`/de/…`) : la page n'est sans doute pas à servir. */
  unknownLocale?: string;
}

const DEFAULT_UNLOCALIZED = ["/api", "/_astro"];
const LANGUAGE_CODE = /^[a-z]{2}$/;
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
  for (const code of codes) {
    if (!LANGUAGE_CODE.test(code)) throw new Error(`i18n : « ${code} » doit être un code de langue à deux lettres minuscules.`);
  }
  check(config.defaultLocale, "defaultLocale");
  for (const locale of config.published ?? []) check(locale, "published");

  const seen = new Set<string>();
  const claim = (path: string) => {
    if (!path.startsWith("/")) throw new Error(`i18n : le chemin « ${path} » de routes doit commencer par /.`);
    const key = normalize(path);
    if (seen.has(key)) throw new Error(`i18n : le chemin « ${path} » apparaît deux fois dans routes.`);
    seen.add(key);
  };
  for (const route of config.routes ?? []) {
    for (const [locale, path] of routeEntries(route)) {
      check(locale, `routes ${path}`);
      claim(path);
      if (path.includes("*") && !path.endsWith("/*")) throw new Error(`i18n : « ${path} » : * seulement en fin de chemin (/section/*).`);
      const expected = prefixOf(config, locale as L);
      if (expected && normalize(path).split("/")[1] !== expected) {
        throw new Error(`i18n : « ${path} » (${locale}) doit commencer par /${expected}.`);
      }
    }
    for (const [locale, paths] of Object.entries(route.legacy ?? {}) as [string, readonly string[]][]) {
      check(locale, "routes legacy");
      for (const path of paths) {
        claim(path);
        if (path.endsWith("/*") && !route[locale as L]?.endsWith("/*")) {
          throw new Error(`i18n : legacy « ${path} » est une section, la paire ${locale} doit l'être aussi.`);
        }
      }
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
  const known = KNOWN[locale];
  return {
    code: locale,
    prefix: prefixOf(config, locale),
    lang: locale,
    hreflang: locale,
    ogLocale: definition.ogLocale ?? known?.ogLocale ?? `${locale}_${locale.toUpperCase()}`,
    label: definition.label ?? known?.label ?? locale.toUpperCase(),
    intl: definition.intl ?? locale,
  };
}

/** Langue d'une valeur libre (`en-US`, `fr_BE`, frontmatter, Accept-Language), sinon `undefined`. */
export function matchLocale<C extends I18nConfig>(config: C, value: string | null | undefined): LocaleOf<C> | undefined {
  if (!value) return undefined;
  const code = value.trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  return isLocale(config, code) ? code : undefined;
}

/** Comme `matchLocale`, avec repli sur la langue par défaut. */
export function normalizeLocale<C extends I18nConfig>(config: C, value: string | null | undefined): LocaleOf<C> {
  return matchLocale(config, value) ?? (config.defaultLocale as LocaleOf<C>);
}

/** Découpe un chemin : langue, chemin sans préfixe, suffixe. */
export function parsePath<C extends I18nConfig>(config: C, path: string): ParsedPath<LocaleOf<C>> {
  const { pathname, suffix } = splitSuffix(stripOrigin(path));
  const normalized = normalize(pathname);
  const first = normalized.split("/")[1] ?? "";
  const prefixed = isLocale(config, first) && first !== config.defaultLocale ? first : undefined;
  const parsed: ParsedPath<LocaleOf<C>> = {
    locale: prefixed ?? findRoute(config, normalized)?.locale ?? (config.defaultLocale as LocaleOf<C>),
    path: prefixed ? normalize(normalized.slice(first.length + 1)) : normalized,
    suffix,
  };
  if (!prefixed && LANGUAGE_CODE.test(first) && !isLocale(config, first)) parsed.unknownLocale = first;
  return parsed;
}

/** Langue d'un chemin : préfixe, sinon langue par défaut. */
export function localeFromPath<C extends I18nConfig>(config: C, path: string): LocaleOf<C> {
  return parsePath(config, path).locale;
}

/** Chemin sans préfixe de langue, suffixe `?…#…` conservé. */
export function stripLocale<C extends I18nConfig>(config: C, path: string): string {
  const { path: rest, suffix } = parsePath(config, path);
  return `${rest}${suffix}`;
}

/**
 * Chemin d'un lien vers `locale` : paire de `routes`, sinon préfixe ajouté au chemin.
 * Les URL externes, ancres et `unlocalizedPaths` sont rendues telles quelles.
 */
export function localizedPath<C extends I18nConfig>(config: C, path: string, locale: LocaleOf<C>): string {
  if (!isLocalizable(config, path)) return path;
  const { pathname, suffix } = splitSuffix(path);
  const translated = findRoute(config, normalize(pathname))?.pathFor(locale);
  if (translated) return `${translated}${suffix}`;
  return `${prefixPath(config, locale, parsePath(config, pathname).path)}${suffix}`;
}

/** Équivalent de la page dans `locale` d'après `routes`, ou `null` s'il n'est pas déclaré. */
export function translatePath<C extends I18nConfig>(config: C, path: string, locale: LocaleOf<C>): string | null {
  const local = stripOrigin(path);
  if (!isLocalizable(config, local)) return null;
  const { pathname, suffix } = splitSuffix(local);
  const normalized = normalize(pathname);
  if (localeFromPath(config, normalized) === locale) return `${normalized}${suffix}`;
  const translated = findRoute(config, normalized)?.pathFor(locale);
  return translated ? `${translated}${suffix}` : null;
}

/** Un lien par langue publiée, pour le sélecteur et les `og:locale:alternate`. */
export function localeLinks<C extends I18nConfig>(
  config: C,
  path: string,
  options: LinkOptions<LocaleOf<C>> = {},
): LocaleLink<LocaleOf<C>>[] {
  const current = options.locale ?? localeFromPath(config, path);
  return publishedLocales(config).map((locale) => {
    let target: string | null;
    if (locale === current) target = normalize(splitSuffix(stripOrigin(path)).pathname);
    else if (options.translations) target = options.translations[locale] ? normalize(options.translations[locale]!) : null;
    else target = translatePath(config, path, locale);
    return {
      ...localeInfo(config, locale),
      href: absolute(target ?? prefixPath(config, locale, "/"), options.site),
      current: locale === current,
      translated: target !== null,
    };
  });
}

/**
 * Balises `<link rel="alternate" hreflang>` de la page : langues traduites + `x-default` (langue par défaut).
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
  const fallback = links.find((link) => link.code === config.defaultLocale);
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

/** Redirections 301 des URL `legacy` de `routes`, au format `redirects` d'`astro.config`. */
export function astroRedirects<C extends I18nConfig>(config: C): Record<string, { status: 301; destination: string }> {
  const redirects: Record<string, { status: 301; destination: string }> = {};
  for (const route of config.routes ?? []) {
    for (const [locale, paths] of Object.entries(route.legacy ?? {}) as [LocaleOf<C>, readonly string[]][]) {
      const destination = route[locale];
      if (!destination) throw new Error(`i18n : legacy ${locale} sans chemin ${locale} dans la paire.`);
      for (const path of paths) {
        const section = (value: string) => `${normalize(value.slice(0, -2))}/[...slug]`;
        if (path.endsWith("/*")) redirects[section(path)] = { status: 301, destination: section(destination) };
        else redirects[normalize(path)] = { status: 301, destination: normalize(destination) };
      }
    }
  }
  return redirects;
}

/**
 * Pour un middleware : URL vers laquelle rediriger en 301, ou `null`.
 * `?lang=<code>` → même page dans cette langue (paire de `routes`, sinon préfixe), paramètre retiré ;
 * `/<langue par défaut>/…` → chemin sans préfixe.
 */
export function localeRedirect<C extends I18nConfig>(config: C, url: URL): string | null {
  const pathname = normalize(url.pathname);
  const first = pathname.split("/")[1];
  const requested = url.searchParams.get("lang");
  const hasDefaultPrefix = first === config.defaultLocale;
  if (requested === null && !hasDefaultPrefix) return null;

  let path = hasDefaultPrefix ? normalize(pathname.slice(first.length + 1)) : pathname;
  const locale = matchLocale(config, requested);
  if (locale) path = translatePath(config, path, locale) ?? localizedPath(config, path, locale);
  const search = new URLSearchParams(url.search);
  search.delete("lang");
  const query = search.size ? `?${search}` : "";
  return `${path}${query}${url.hash}`;
}

/**
 * Pour un middleware qui sert une seule page pour toutes les langues : chemin de la page à rendre
 * (`context.rewrite()`), ou `null`. `/en/carte` → `/carte` ; avec `routes`, `/fr/confidentialite` → `/privacy`
 * (chemin de la langue par défaut). `paths` limite la réécriture à certaines sections (`"/parcours/*"`).
 */
export function rewritePath<C extends I18nConfig>(
  config: C,
  pathname: string,
  options: { paths?: readonly string[] } = {},
): string | null {
  const normalized = normalize(pathname);
  const parsed = parsePath(config, normalized);
  if (parsed.locale === config.defaultLocale || !publishedLocales(config).includes(parsed.locale)) return null;
  const rendered = findRoute(config, normalized)?.pathFor(config.defaultLocale as LocaleOf<C>) ?? parsed.path;
  if (rendered === normalized || isUnlocalized(config, rendered)) return null;
  if (options.paths && !matchesPaths(options.paths, rendered)) return null;
  return rendered;
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

/** Segments de premier niveau à ne pas utiliser comme slug de contenu (codes de langue + chemins non localisés). */
export function reservedRoots(config: I18nConfig): Set<string> {
  const roots = new Set<string>(Object.keys(config.locales));
  for (const path of config.unlocalizedPaths ?? DEFAULT_UNLOCALIZED) {
    const root = path.split("/")[1];
    if (root) roots.add(root);
  }
  return roots;
}

export function publishedLocales<C extends I18nConfig>(config: C): LocaleOf<C>[] {
  return [...(config.published ?? (Object.keys(config.locales) as LocaleOf<C>[]))] as LocaleOf<C>[];
}

function prefixOf(config: I18nConfig, locale: string): string {
  return locale === config.defaultLocale ? "" : locale;
}

function routeEntries(route: Route): [string, string][] {
  return Object.entries(route).filter((entry): entry is [string, string] => entry[0] !== "legacy" && typeof entry[1] === "string");
}

/** Paire qui couvre le chemin : exacte d'abord, sinon la section la plus longue. */
function findRoute<C extends I18nConfig>(config: C, normalized: string) {
  type L = LocaleOf<C>;
  let best: { route: Route<L>; locale: L; rest: string; depth: number } | undefined;
  for (const route of (config.routes ?? []) as readonly Route<L>[]) {
    for (const [locale, path] of routeEntries(route)) {
      if (!path.endsWith("/*")) {
        if (normalize(path) === normalized) return resolved(route, locale as L, "");
        continue;
      }
      const base = normalize(path.slice(0, -2));
      const prefix = base === "/" ? "/" : `${base}/`;
      if (normalized.startsWith(prefix) && normalized !== base && (!best || base.length > best.depth)) {
        best = { route, locale: locale as L, rest: normalized.slice(prefix.length), depth: base.length };
      }
    }
  }
  return best ? resolved(best.route, best.locale, best.rest) : undefined;
}

function resolved<L extends string>(route: Route<L>, locale: L, rest: string) {
  return {
    locale,
    pathFor(target: L): string | undefined {
      const path = route[target] as string | undefined;
      if (!path) return undefined;
      return path.endsWith("/*") ? normalize(`${path.slice(0, -2)}/${rest}`) : normalize(path);
    },
  };
}

function prefixPath(config: I18nConfig, locale: string, unprefixed: string): string {
  const prefix = prefixOf(config, locale);
  const rest = normalize(unprefixed);
  if (!prefix) return rest;
  return rest === "/" ? `/${prefix}` : `/${prefix}${rest}`;
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

function matchesPaths(paths: readonly string[], path: string): boolean {
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
