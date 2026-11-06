// Astro helpers of the content tree model. They need the `articles` collection
// declared in the site's src/content.config.ts. The site root is passed in, so
// nothing here assumes a particular repository layout.
import { getCollection, type CollectionEntry } from 'astro:content';
import {
  articleUrl,
  childNodes,
  createContentModel,
  createContentStructure,
  localePrefix,
  nodePath,
  nodeUrl,
} from './model.mjs';

/** Locale code as declared in the site's .shipglows.content.json. */
export type Locale = string;
export type HreflangLink = { hrefLang: string; href: string };
export type ArticleEntry = CollectionEntry<'articles'>;
export type Crumb = { label: string; url: string };
export type ContentRouteProps =
  | { kind: 'article'; locale: Locale; entry: ArticleEntry }
  | { kind: 'topic'; locale: Locale; topicId: string };

export interface ContentSiteOptions {
  /** Absolute path of the site root (the folder holding .shipglows.content.json and src/content/). */
  siteRoot: string;
  /** Milliseconds a loaded model is reused before the files are read again. Default 1500. */
  ttlMs?: number;
}

export function articleLocale(entry: ArticleEntry): Locale {
  return entry.id.split('/')[0];
}

export function articleSlug(entry: ArticleEntry): string {
  return entry.id.split('/')[1];
}

function revisionDate(entry: ArticleEntry): number {
  return (entry.data.updatedDate ?? entry.data.publishDate).valueOf();
}

/**
 * Helpers bound to one site root. Call it once per site, typically in a shared module:
 * `export const content = createContentSite({ siteRoot: process.cwd() });`
 */
export function createContentSite({ siteRoot, ttlMs }: ContentSiteOptions) {
  const loadContentModel = createContentModel(siteRoot, { ttlMs });
  // URLs, labels and crumbs need no article: large sites must not read them all for a path.
  const loadStructure = createContentStructure(siteRoot);

  function articlePath(entry: ArticleEntry): string {
    const { manifest, taxonomy } = loadStructure();
    const locale = articleLocale(entry);
    return entry.data.hubFor
      ? nodeUrl(manifest, taxonomy, locale, entry.data.hubFor)
      : articleUrl(manifest, taxonomy, locale, articleSlug(entry), entry.data.topic);
  }

  function topicPath(locale: Locale, topicId: string): string {
    const { manifest, taxonomy } = loadStructure();
    return nodeUrl(manifest, taxonomy, locale, topicId);
  }

  function topicLabel(locale: Locale, topicId: string) {
    return loadStructure().taxonomy.byId.get(topicId).labels[locale] as { slug: string; title: string; description: string };
  }

  /** Taxonomy trail from the pillar down to the topic itself. */
  function topicCrumbs(locale: Locale, topicId: string): Crumb[] {
    const { manifest, taxonomy } = loadStructure();
    return nodePath(taxonomy, topicId).map((node: any) => ({
      label: node.labels[locale].title,
      url: nodeUrl(manifest, taxonomy, locale, node.id),
    }));
  }

  function pillarOf(topicId: string): string {
    return nodePath(loadStructure().taxonomy, topicId)[0].id;
  }

  function homePath(locale: Locale): string {
    const prefix = localePrefix(loadStructure().manifest, locale);
    return prefix || '/';
  }

  /** Published articles of a locale, hub introductions excluded, newest revision first. */
  async function getPublishedArticles(locale: Locale): Promise<ArticleEntry[]> {
    const entries = await getCollection('articles', (entry) => !entry.data.draft && !entry.data.hubFor && entry.id.startsWith(`${locale}/`));
    return entries.sort((a, b) => revisionDate(b) - revisionDate(a) || a.id.localeCompare(b.id));
  }

  async function getHubIntro(locale: Locale, topicId: string): Promise<ArticleEntry | undefined> {
    const entries = await getCollection('articles', (entry) => !entry.data.draft && entry.data.hubFor === topicId && entry.id.startsWith(`${locale}/`));
    return entries[0];
  }

  function descendantIds(topicId: string): Set<string> {
    const { taxonomy } = loadStructure();
    const ids = new Set<string>([topicId]);
    for (const node of taxonomy.nodes) if (nodePath(taxonomy, node.id).some((ancestor: any) => ancestor.id === topicId)) ids.add(node.id);
    return ids;
  }

  /** Articles filed under a topic or any of its sub-topics. */
  async function getTopicArticles(locale: Locale, topicId: string): Promise<ArticleEntry[]> {
    const ids = descendantIds(topicId);
    return (await getPublishedArticles(locale)).filter((entry) => ids.has(entry.data.topic!));
  }

  function getSubTopics(topicId: string | null): string[] {
    return childNodes(loadStructure().taxonomy, topicId).map((node: any) => node.id);
  }

  /** Topics with a published article or hub introduction on the node or below it: only those get a hub page. */
  async function getLiveTopics(locale: Locale): Promise<string[]> {
    const entries = await getCollection('articles', (entry) => !entry.data.draft && entry.id.startsWith(`${locale}/`));
    const { taxonomy } = loadStructure();
    const live = new Set<string>();
    for (const entry of entries) {
      for (const node of nodePath(taxonomy, entry.data.hubFor ?? entry.data.topic!)) live.add(node.id);
    }
    return taxonomy.nodes.map((node: any) => node.id).filter((id: string) => live.has(id));
  }

  async function getLivePillars(locale: Locale): Promise<string[]> {
    const live = new Set(await getLiveTopics(locale));
    return getSubTopics(null).filter((id) => live.has(id));
  }

  /** hreflang links for the published locale versions sharing a translationKey. */
  async function getArticleAlternates(entry: ArticleEntry): Promise<{ alternateLocales: HreflangLink[]; xDefaultUrl?: string }> {
    const versions = await getCollection('articles', (candidate) => !candidate.data.draft && candidate.data.translationKey === entry.data.translationKey);
    if (versions.length < 2) return { alternateLocales: [] };
    const alternateLocales = versions.map((version) => ({ hrefLang: articleLocale(version), href: articlePath(version) }));
    const { defaultLocale } = loadStructure().manifest;
    return { alternateLocales, xDefaultUrl: alternateLocales.find((alternate) => alternate.hrefLang === defaultLocale)?.href };
  }

  /** Static paths of every article and live hub of a locale, relative to the locale prefix. */
  async function contentStaticPaths(locale: Locale) {
    const prefix = localePrefix(loadStructure().manifest, locale);
    // Astro's rest parameter takes no trailing slash, whatever the site's URL shape.
    const relative = (url: string) => url.slice(prefix.length + 1).replace(/\/$/, '');
    const articles = (await getPublishedArticles(locale)).map((entry) => ({
      params: { path: relative(articlePath(entry)) },
      props: { kind: 'article', locale, entry } satisfies ContentRouteProps,
    }));
    const topics = (await getLiveTopics(locale)).map((topicId) => ({
      params: { path: relative(topicPath(locale, topicId)) },
      props: { kind: 'topic', locale, topicId } satisfies ContentRouteProps,
    }));
    return [...topics, ...articles];
  }

  return {
    loadContentModel,
    articlePath,
    topicPath,
    topicLabel,
    topicCrumbs,
    pillarOf,
    homePath,
    getPublishedArticles,
    getHubIntro,
    getTopicArticles,
    getSubTopics,
    getLiveTopics,
    getLivePillars,
    getArticleAlternates,
    contentStaticPaths,
  };
}

export type ContentSite = ReturnType<typeof createContentSite>;
