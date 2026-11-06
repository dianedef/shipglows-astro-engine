// ShipGlows content tree model (skills/references/content-tree-model.md in ShipGlows).
// Plain Node module so astro.config.mjs, pages and tools share one implementation.
// Shipped by @shipglows/astro-content/model; the Astro helpers live in ./site.ts.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

export const ARTICLES_DIR = 'src/content/articles';
export const TAXONOMY_FILE = 'src/content/taxonomy.yaml';
export const REDIRECTS_FILE = 'src/content/redirects.json';
export const MANIFEST_FILE = '.shipglows.content.json';
export const MAX_TAXONOMY_DEPTH = 4;
/** Globs a server-rendered site must ship with its functions: the model reads these with `fs` at runtime (e.g. `vercel({ includeFiles: CONTENT_INCLUDE_FILES })`). */
export const CONTENT_INCLUDE_FILES = [MANIFEST_FILE, TAXONOMY_FILE, REDIRECTS_FILE, `${ARTICLES_DIR}/**/*.md`];
export const FORBIDDEN_FIELDS = ['slug', 'locale', 'category', 'categories', 'section', 'permalink', 'url', 'parent', 'date', 'pubDate'];
const CATCH_ALL_SLUGS = new Set(['autres', 'autre', 'divers', 'misc', 'other', 'others']);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function readContentManifest(siteRoot) {
  const file = join(siteRoot, MANIFEST_FILE);
  if (!existsSync(file)) throw new Error(`Content manifest missing: ${MANIFEST_FILE}`);
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  if (manifest.schema !== 'shipglows-content/v1') throw new Error(`Unsupported content manifest schema: ${manifest.schema}`);
  if (!manifest.locales?.includes(manifest.defaultLocale)) throw new Error('defaultLocale must be one of locales');
  if (manifest.trailingSlash !== undefined && !['never', 'always'].includes(manifest.trailingSlash)) throw new Error('trailingSlash must be "never" or "always"');
  return manifest;
}

/** Site-wide URL shape: `trailingSlash` ("never" by default, or "always") must match the Astro `trailingSlash` setting. */
function finishUrl(manifest, url) {
  return manifest.trailingSlash === 'always' && !url.endsWith('/') ? `${url}/` : url;
}

export function localePrefix(manifest, locale) {
  return locale === manifest.defaultLocale && !manifest.prefixDefaultLocale ? '' : `/${locale}`;
}

export function loadTaxonomy(siteRoot, manifest) {
  const nodes = parseYaml(readFileSync(join(siteRoot, TAXONOMY_FILE), 'utf8')) ?? [];
  const byId = new Map();
  for (const node of nodes) {
    if (!node?.id || !SLUG_PATTERN.test(node.id)) throw new Error(`Invalid taxonomy id: ${JSON.stringify(node?.id)}`);
    if (byId.has(node.id)) throw new Error(`Duplicate taxonomy id: ${node.id}`);
    byId.set(node.id, node);
  }
  for (const node of nodes) {
    if (node.parent && !byId.has(node.parent)) throw new Error(`Taxonomy node ${node.id} has unknown parent ${node.parent}`);
    for (const locale of manifest.locales) {
      const label = node.labels?.[locale];
      if (!label?.slug || !label.title || !label.description) throw new Error(`Taxonomy node ${node.id} lacks a complete ${locale} label`);
      if (!SLUG_PATTERN.test(label.slug)) throw new Error(`Taxonomy node ${node.id} has an invalid ${locale} slug`);
      if (CATCH_ALL_SLUGS.has(label.slug) || CATCH_ALL_SLUGS.has(node.id)) throw new Error(`Catch-all taxonomy node is forbidden: ${node.id}`);
    }
    if (nodePath({ byId }, node.id).length > MAX_TAXONOMY_DEPTH) throw new Error(`Taxonomy node ${node.id} is deeper than ${MAX_TAXONOMY_DEPTH} levels`);
  }
  return { nodes, byId };
}

/** Ancestors of a node, pillar first, the node itself last. */
export function nodePath(taxonomy, id) {
  const path = [];
  const seen = new Set();
  for (let node = taxonomy.byId.get(id); node; node = taxonomy.byId.get(node.parent)) {
    if (seen.has(node.id)) throw new Error(`Taxonomy cycle at ${node.id}`);
    seen.add(node.id);
    path.unshift(node);
  }
  return path;
}

export function childNodes(taxonomy, id) {
  return taxonomy.nodes.filter((node) => (node.parent ?? null) === (id ?? null));
}

export function nodeUrl(manifest, taxonomy, locale, id) {
  const path = nodePath(taxonomy, id);
  const pillar = path[0].labels[locale].slug;
  const prefix = localePrefix(manifest, locale);
  return finishUrl(manifest, path.length === 1 ? `${prefix}/${pillar}` : `${prefix}/${pillar}/${path.at(-1).labels[locale].slug}`);
}

export function articleUrl(manifest, taxonomy, locale, slug, topic) {
  const pillar = nodePath(taxonomy, topic)[0];
  if (!pillar) throw new Error(`Unknown topic ${topic} for ${locale}/${slug}`);
  return finishUrl(manifest, `${localePrefix(manifest, locale)}/${pillar.labels[locale].slug}/${slug}`);
}

export function splitFrontmatter(raw) {
  const match = raw.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  return { data: parseYaml(match[1]) ?? {}, body: match[2] };
}

/** Every article file, published or not, with the facts tools need. */
export function loadArticleIndex(siteRoot, manifest, taxonomy) {
  const root = join(siteRoot, ARTICLES_DIR);
  const articles = [];
  for (const locale of readdirSync(root)) {
    const dir = join(root, locale);
    if (!statSync(dir).isDirectory()) continue;
    if (!manifest.locales.includes(locale)) throw new Error(`Article folder ${locale} is not a declared locale`);
    for (const file of readdirSync(dir)) {
      const path = join(dir, file);
      if (statSync(path).isDirectory()) throw new Error(`Subfolders are not allowed under ${ARTICLES_DIR}/${locale}: ${file}`);
      if (!file.endsWith('.md') || file.startsWith('_')) continue;
      const slug = file.slice(0, -3);
      const { data, body } = splitFrontmatter(readFileSync(path, 'utf8'));
      const topic = data.hubFor ?? data.topic;
      if (!taxonomy.byId.has(topic)) throw new Error(`${locale}/${slug}: unknown topic ${topic}`);
      articles.push({
        id: `${locale}/${slug}`,
        locale,
        slug,
        path,
        title: data.title,
        description: data.description ?? null,
        sidebarLabel: data.sidebar?.label ?? null,
        topic,
        hubFor: data.hubFor ?? null,
        draft: data.draft === true,
        translationKey: data.translationKey,
        publishDate: data.publishDate ? String(data.publishDate) : null,
        updatedDate: data.updatedDate ? String(data.updatedDate) : null,
        url: data.hubFor ? nodeUrl(manifest, taxonomy, locale, data.hubFor) : articleUrl(manifest, taxonomy, locale, slug, topic),
        body,
      });
    }
  }
  return articles;
}

/** slug -> target, per locale. Taxonomy node slugs and article slugs share one namespace. */
export function buildLinkTargets(manifest, taxonomy, articles) {
  const targets = new Map(manifest.locales.map((locale) => [locale, new Map()]));
  for (const node of taxonomy.nodes) {
    for (const locale of manifest.locales) {
      targets.get(locale).set(node.labels[locale].slug, {
        kind: 'topic',
        id: node.id,
        title: node.labels[locale].title,
        url: nodeUrl(manifest, taxonomy, locale, node.id),
        draft: false,
      });
    }
  }
  for (const article of articles) {
    const map = targets.get(article.locale);
    if (article.hubFor) {
      if (map.get(article.slug)?.id !== article.hubFor) {
        throw new Error(`${article.id}: a hubFor article must be named after its node slug (${taxonomy.byId.get(article.hubFor).labels[article.locale].slug})`);
      }
      continue;
    }
    if (map.has(article.slug)) throw new Error(`${article.id}: slug already used by ${map.get(article.slug).kind} ${map.get(article.slug).id}`);
    map.set(article.slug, { kind: 'article', id: article.id, title: article.title, url: article.url, draft: article.draft });
  }
  return targets;
}

const WIKILINK_PATTERN = /\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

export function extractWikilinks(body) {
  // Code is not prose: `[[...]]` inside fences or inline code (TOML tables, arrays) is not a link.
  const prose = body.replace(/^(```|~~~)[\s\S]*?^\1/gm, '').replace(/`[^`\n]*`/g, '');
  return [...prose.matchAll(WIKILINK_PATTERN)].map((match) => ({ slug: match[1].trim(), anchor: match[2] ?? '', alias: match[3] ?? null }));
}

/**
 * Wikilinks of published pages that point to no article or topic. Astro only logs a Markdown render
 * error and then serves the page empty with a 200, so the build has to refuse them itself.
 */
export function findBrokenWikilinks(model) {
  return model.articles
    .filter((article) => !article.draft)
    .flatMap((article) => extractWikilinks(article.body)
      .filter((link) => !model.targets.get(article.locale).has(link.slug))
      .map((link) => `${article.id}: [[${link.slug}]]`));
}

/** One snapshot of the whole model, reused for a short time so dev edits are picked up. */
export function createContentModel(siteRoot, { ttlMs = 1500 } = {}) {
  let cached = null;
  let loadedAt = 0;
  return function load() {
    if (cached && Date.now() - loadedAt < ttlMs) return cached;
    const manifest = readContentManifest(siteRoot);
    const taxonomy = loadTaxonomy(siteRoot, manifest);
    const articles = loadArticleIndex(siteRoot, manifest, taxonomy);
    const targets = buildLinkTargets(manifest, taxonomy, articles);
    cached = { siteRoot, manifest, taxonomy, articles, targets };
    loadedAt = Date.now();
    return cached;
  };
}

/** The graph shared by the site, ContentGlows and shipglows_app (schema shipglows-content-graph/v1). */
export function buildContentGraph(model) {
  const { manifest, taxonomy, articles, targets } = model;
  const published = articles.filter((article) => !article.draft);
  const nodes = [];
  const edges = [];
  for (const locale of manifest.locales) {
    for (const node of taxonomy.nodes) {
      nodes.push({ id: `${locale}/topic:${node.id}`, kind: 'topic', locale, title: node.labels[locale].title, topic: node.id, url: nodeUrl(manifest, taxonomy, locale, node.id) });
      if (node.parent) edges.push({ from: `${locale}/topic:${node.id}`, to: `${locale}/topic:${node.parent}`, kind: 'parent' });
    }
  }
  for (const article of published) {
    if (article.hubFor) continue;
    nodes.push({ id: article.id, kind: 'article', locale: article.locale, title: article.title, topic: article.topic, url: article.url });
    edges.push({ from: article.id, to: `${article.locale}/topic:${article.topic}`, kind: 'topic' });
  }
  for (const article of published) {
    const from = article.hubFor ? `${article.locale}/topic:${article.hubFor}` : article.id;
    for (const link of extractWikilinks(article.body)) {
      const target = targets.get(article.locale).get(link.slug);
      if (!target || target.draft) continue;
      edges.push({ from, to: target.kind === 'topic' ? `${article.locale}/topic:${target.id}` : target.id, kind: 'link' });
    }
  }
  const byKey = new Map();
  for (const article of published.filter((a) => !a.hubFor && a.translationKey)) {
    byKey.set(article.translationKey, [...(byKey.get(article.translationKey) ?? []), article.id]);
  }
  for (const ids of byKey.values()) {
    for (let i = 1; i < ids.length; i += 1) edges.push({ from: ids[0], to: ids[i], kind: 'translation' });
  }
  return { schema: 'shipglows-content-graph/v1', nodes, edges };
}

export function loadRedirects(siteRoot) {
  const file = join(siteRoot, REDIRECTS_FILE);
  if (!existsSync(file)) return {};
  const entries = JSON.parse(readFileSync(file, 'utf8'));
  return Object.fromEntries(entries.map((entry) => [entry.from, { status: 301, destination: entry.to }]));
}

/**
 * Sätteri mdast plugin resolving `[[slug]]`, `[[slug|text]]` and `[[slug#anchor]]`
 * within the locale of the document. A link to an unknown slug fails the page,
 * except in a draft, where it is reported and left unresolved. A link from a
 * published page to a draft renders as plain text until the draft is published,
 * so that pages can go live one at a time despite the mesh.
 */
export function createWikilinkPlugin(loadModel) {
  return {
    name: 'shipglows-wikilinks',
    options: { position: true },
    link(node, ctx) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || !ctx.source.startsWith('[[', start)) return;
      const file = ctx.fileURL ? fileURLToPath(ctx.fileURL) : '';
      const model = loadModel();
      const current = model.articles.find((article) => article.path === file);
      if (!current) return;
      const raw = ctx.source.slice(start + 2, end - 2);
      const [target, alias] = raw.split('|');
      const [slug, anchor] = target.split('#');
      const resolved = model.targets.get(current.locale).get(slug.trim());
      if (resolved?.draft && !current.draft) {
        ctx.report({ message: `${current.id}: wikilink [[${raw}]] waits for a draft, rendered as plain text`, node, severity: 'warning' });
        ctx.replaceNode(node, { type: 'text', value: alias ?? resolved.title });
        return;
      }
      if (!resolved) {
        const message = `${current.id}: wikilink [[${raw}]] does not resolve to a ${current.locale} article or topic`;
        if (current.draft) {
          ctx.report({ message, node, severity: 'warning' });
          return;
        }
        throw new Error(message);
      }
      const url = anchor ? `${resolved.url}#${anchor}` : resolved.url;
      if (alias === undefined) {
        ctx.replaceNode(node, { type: 'link', url, title: null, children: [{ type: 'text', value: resolved.title }] });
      } else {
        ctx.setProperty(node, 'url', url);
      }
    },
  };
}
