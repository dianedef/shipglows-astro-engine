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

/** Forbidden frontmatter check for a collection schema: `.superRefine((data, ctx) => rejectForbiddenFields(data, ctx))`. */
export function rejectForbiddenFields(data, context) {
  for (const field of FORBIDDEN_FIELDS) {
    if (field in data) context.addIssue({ code: 'custom', path: [field], message: `${field} is derived from the file path or the taxonomy; remove it` });
  }
}

/** Manifest and taxonomy only, reloaded when one of the two files changes: enough for URLs, labels and crumbs. */
export function createContentStructure(siteRoot) {
  let cached = null;
  let signature = '';
  return function load() {
    const next = [MANIFEST_FILE, TAXONOMY_FILE].map((file) => statSync(join(siteRoot, file)).mtimeMs).join(':');
    if (cached && next === signature) return cached;
    const manifest = readContentManifest(siteRoot);
    cached = { manifest, taxonomy: loadTaxonomy(siteRoot, manifest) };
    signature = next;
    return cached;
  };
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

/** Topics that have a page in this locale: a published article or hub introduction on the node or below it. */
export function liveTopicIds(taxonomy, articles, locale) {
  const live = new Set();
  for (const article of articles) {
    if (article.draft || article.locale !== locale) continue;
    for (const node of nodePath(taxonomy, article.topic)) live.add(node.id);
  }
  return live;
}

/**
 * slug -> target, per locale. Taxonomy node slugs and article slugs share one namespace.
 * A topic without a page counts as a draft: a published link to it renders as plain text, not a 404.
 */
export function buildLinkTargets(manifest, taxonomy, articles) {
  const targets = new Map(manifest.locales.map((locale) => [locale, new Map()]));
  for (const locale of manifest.locales) {
    const live = liveTopicIds(taxonomy, articles, locale);
    const map = targets.get(locale);
    for (const node of taxonomy.nodes) {
      const slug = node.labels[locale].slug;
      if (map.has(slug)) throw new Error(`Taxonomy nodes ${map.get(slug).id} and ${node.id} share the ${locale} slug ${slug}`);
      map.set(slug, {
        kind: 'topic',
        id: node.id,
        title: node.labels[locale].title,
        url: nodeUrl(manifest, taxonomy, locale, node.id),
        draft: !live.has(node.id),
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
/** In a Markdown table the alias separator is written `\|`: the backslash belongs to neither side. */
const dropEscape = (text) => text.replace(/\\$/, '');

export function extractWikilinks(body) {
  // Code is not prose: `[[...]]` inside fences or inline code (TOML tables, arrays) is not a link.
  const prose = body.replace(/^(```|~~~)[\s\S]*?^\1/gm, '').replace(/`[^`\n]*`/g, '');
  return [...prose.matchAll(WIKILINK_PATTERN)].map((match) => ({ slug: dropEscape(match[1]).trim(), anchor: dropEscape(match[2] ?? ''), alias: match[3] ?? null }));
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

/** Count, size and newest change of the content files: it moves when a file is added, removed or edited. */
function contentSignature(siteRoot) {
  let count = 0;
  let size = 0;
  let newest = 0;
  const note = (path) => {
    const stats = statSync(path);
    count += 1;
    size += stats.size;
    newest = Math.max(newest, stats.mtimeMs);
    return stats;
  };
  note(join(siteRoot, MANIFEST_FILE));
  note(join(siteRoot, TAXONOMY_FILE));
  const root = join(siteRoot, ARTICLES_DIR);
  for (const locale of readdirSync(root)) {
    const dir = join(root, locale);
    if (!note(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) note(join(dir, file));
  }
  return `${count}:${size}:${newest}`;
}

const normalizePath = (path) => String(path).replaceAll('\\', '/');

/**
 * One snapshot of the whole model. It is read again only when a content file changed;
 * that check stats the files, at most once per `ttlMs`, so large sites stay fast and dev edits are picked up.
 */
export function createContentModel(siteRoot, { ttlMs = 1500 } = {}) {
  let cached = null;
  let signature = '';
  let checkedAt = 0;
  return function load() {
    if (cached && Date.now() - checkedAt < ttlMs) return cached;
    const next = contentSignature(siteRoot);
    checkedAt = Date.now();
    if (cached && next === signature) return cached;
    const manifest = readContentManifest(siteRoot);
    const taxonomy = loadTaxonomy(siteRoot, manifest);
    const articles = loadArticleIndex(siteRoot, manifest, taxonomy);
    const targets = buildLinkTargets(manifest, taxonomy, articles);
    const byPath = new Map(articles.map((article) => [normalizePath(article.path), article]));
    cached = { siteRoot, manifest, taxonomy, articles, targets, byPath };
    signature = next;
    checkedAt = Date.now();
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
    const live = liveTopicIds(taxonomy, articles, locale);
    for (const node of taxonomy.nodes) {
      if (!live.has(node.id)) continue;
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
      const current = model.byPath.get(normalizePath(file));
      if (!current) return;
      const raw = ctx.source.slice(start + 2, end - 2).replace('\\|', '|');
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

function rewriteWikilinks(parent, article, targets) {
  const children = [];
  for (const child of parent.children) {
    if (child.type === 'link' || child.type === 'code' || child.type === 'inlineCode') {
      children.push(child);
    } else if (child.children) {
      rewriteWikilinks(child, article, targets);
      children.push(child);
    } else if (child.type === 'text' && child.value.includes('[[')) {
      let last = 0;
      for (const hit of child.value.matchAll(WIKILINK_PATTERN)) {
        const slug = dropEscape(hit[1]).trim();
        const anchor = dropEscape(hit[2] ?? '');
        const alias = hit[3];
        const target = targets.get(slug);
        if (!target && !article.draft) throw new Error(`${article.id}: wikilink [[${slug}]] does not resolve to a ${article.locale} article or topic`);
        if (!target) {
          console.warn(`${article.id}: wikilink [[${slug}]] does not resolve to a ${article.locale} article or topic`);
          continue;
        }
        if (hit.index > last) children.push({ type: 'text', value: child.value.slice(last, hit.index) });
        if (target.draft && !article.draft) {
          console.warn(`${article.id}: wikilink [[${slug}]] waits for a draft, rendered as plain text`);
          children.push({ type: 'text', value: alias ?? target.title });
        } else {
          children.push({ type: 'link', url: `${target.url}${anchor}`, title: null, children: [{ type: 'text', value: alias ?? target.title }] });
        }
        last = hit.index + hit[0].length;
      }
      if (last === 0) children.push(child);
      else if (last < child.value.length) children.push({ type: 'text', value: child.value.slice(last) });
    } else {
      children.push(child);
    }
  }
  parent.children = children;
}

/**
 * The same wikilinks for sites on the unified processor, with the same rules as the Sätteri plugin:
 * `unified({ remarkPlugins: [createRemarkWikilinks(loadModel)] })`. Only text nodes are read, so code is never a link.
 */
export function createRemarkWikilinks(loadModel) {
  return () => (tree, file) => {
    const model = loadModel();
    const article = model.byPath.get(normalizePath(file?.path ?? file?.history?.[0] ?? ''));
    if (article) rewriteWikilinks(tree, article, model.targets.get(article.locale));
  };
}
