// Loose types for the plain-JS content model shared with astro.config.mjs and the site index.
export const FORBIDDEN_FIELDS: string[];
export function createContentModel(siteRoot: string, options?: { ttlMs?: number }): () => any;
export function buildContentGraph(model: any): { schema: string; nodes: any[]; edges: any[] };
export function buildLinkTargets(manifest: any, taxonomy: any, articles: any[]): Map<string, Map<string, any>>;
export function splitFrontmatter(raw: string): { data: any; body: string };
export function articleUrl(manifest: any, taxonomy: any, locale: string, slug: string, topic: string | undefined): string;
export function nodeUrl(manifest: any, taxonomy: any, locale: string, id: string): string;
export function nodePath(taxonomy: any, id: string): any[];
export function childNodes(taxonomy: any, id: string | null): any[];
export function localePrefix(manifest: any, locale: string): string;
export function loadRedirects(siteRoot: string): Record<string, { status: 301; destination: string }>;
export function createWikilinkPlugin(loadModel: () => any): any;
export function findBrokenWikilinks(model: any): string[];
