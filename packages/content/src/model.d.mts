// Types of the plain-JS content model shared with astro.config.mjs and the site index.
export interface ContentManifest {
  schema: 'shipglows-content/v1';
  locales: string[];
  defaultLocale: string;
  prefixDefaultLocale?: boolean;
  trailingSlash?: 'never' | 'always';
  sourceLocale?: string;
}
export interface TaxonomyLabel { slug: string; title: string; description: string }
export interface TaxonomyNode { id: string; parent?: string; labels: Record<string, TaxonomyLabel>; [key: string]: unknown }
export interface Taxonomy { nodes: TaxonomyNode[]; byId: Map<string, TaxonomyNode> }
export interface ArticleFacts {
  id: string;
  locale: string;
  slug: string;
  path: string;
  title: string;
  description: string | null;
  sidebarLabel: string | null;
  topic: string;
  hubFor: string | null;
  draft: boolean;
  translationKey: string;
  publishDate: string | null;
  updatedDate: string | null;
  url: string;
  body: string;
}
export interface LinkTarget { kind: 'topic' | 'article'; id: string; title: string; url: string; draft: boolean }
export type LinkTargets = Map<string, Map<string, LinkTarget>>;
export interface ContentStructure { manifest: ContentManifest; taxonomy: Taxonomy }
export interface ContentModel extends ContentStructure {
  siteRoot: string;
  articles: ArticleFacts[];
  targets: LinkTargets;
  byPath: Map<string, ArticleFacts>;
}
export interface Wikilink { slug: string; anchor: string; alias: string | null }
export interface ContentGraph {
  schema: string;
  nodes: Array<{ id: string; kind: 'topic' | 'article'; locale: string; title: string; topic: string; url: string }>;
  edges: Array<{ from: string; to: string; kind: 'link' | 'topic' | 'parent' | 'translation' }>;
}

export const ARTICLES_DIR: string;
export const TAXONOMY_FILE: string;
export const REDIRECTS_FILE: string;
export const MANIFEST_FILE: string;
export const MAX_TAXONOMY_DEPTH: number;
export const FORBIDDEN_FIELDS: string[];
export const CONTENT_INCLUDE_FILES: string[];
export function readContentManifest(siteRoot: string): ContentManifest;
export function loadTaxonomy(siteRoot: string, manifest: ContentManifest): Taxonomy;
export function loadArticleIndex(siteRoot: string, manifest: ContentManifest, taxonomy: Taxonomy): ArticleFacts[];
export function createContentStructure(siteRoot: string): () => ContentStructure;
export function createContentModel(siteRoot: string, options?: { ttlMs?: number }): () => ContentModel;
export function buildContentGraph(model: ContentModel): ContentGraph;
export function buildLinkTargets(manifest: ContentManifest, taxonomy: Taxonomy, articles: ArticleFacts[]): LinkTargets;
export function liveTopicIds(taxonomy: Taxonomy, articles: ArticleFacts[], locale: string): Set<string>;
export function splitFrontmatter(raw: string): { data: any; body: string };
export function articleUrl(manifest: ContentManifest, taxonomy: Taxonomy, locale: string, slug: string, topic: string | undefined): string;
export function nodeUrl(manifest: ContentManifest, taxonomy: Taxonomy, locale: string, id: string): string;
export function nodePath(taxonomy: Pick<Taxonomy, 'byId'>, id: string): TaxonomyNode[];
export function childNodes(taxonomy: Taxonomy, id: string | null): TaxonomyNode[];
export function localePrefix(manifest: ContentManifest, locale: string): string;
export function loadRedirects(siteRoot: string): Record<string, { status: 301; destination: string }>;
export function extractWikilinks(body: string): Wikilink[];
export function findBrokenWikilinks(model: ContentModel): string[];
export function rejectForbiddenFields(data: object, context: { addIssue(issue: { code: 'custom'; path: string[]; message: string }): void }): void;
export function createWikilinkPlugin(loadModel: () => ContentModel): any;
export function createRemarkWikilinks(loadModel: () => ContentModel): any;
