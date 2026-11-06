import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  buildContentGraph,
  createContentModel,
  createContentStructure,
  createRemarkWikilinks,
  createWikilinkPlugin,
  extractWikilinks,
  findBrokenWikilinks,
  rejectForbiddenFields,
} from '../src/model.mjs';

const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

const label = (slug) => `{ slug: ${slug}, title: T-${slug}, description: D }`;
const TAXONOMY = `
- { id: guides, labels: { fr: ${label('guides')}, en: ${label('guides-en')} } }
- { id: deep, parent: guides, labels: { fr: ${label('profond')}, en: ${label('deep')} } }
- { id: intro-only, labels: { fr: ${label('intro-seule')}, en: ${label('intro-only')} } }
- { id: empty, labels: { fr: ${label('vide')}, en: ${label('empty')} } }
`;

function article(frontmatter, body = '') {
  const lines = Object.entries({ title: 'Titre', translationKey: 'k', publishDate: '2026-01-01', ...frontmatter }).map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join('\n')}\n---\n${body}\n`;
}

function site(articles, { manifest = {}, taxonomy = TAXONOMY } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'content-model-'));
  roots.push(root);
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write('.shipglows.content.json', JSON.stringify({ schema: 'shipglows-content/v1', locales: ['fr', 'en'], defaultLocale: 'fr', prefixDefaultLocale: false, ...manifest }));
  write('src/content/taxonomy.yaml', taxonomy);
  mkdirSync(join(root, 'src/content/articles/fr'), { recursive: true });
  for (const [path, text] of Object.entries(articles)) write(`src/content/articles/${path}.md`, text);
  return root;
}

const load = (...args) => createContentModel(site(...args))();

test('URLs: pillar and leaf, locale prefix, trailing slash', () => {
  const model = load({ 'fr/a': article({ topic: 'deep' }), 'en/a-en': article({ topic: 'deep' }) });
  assert.equal(model.articles.find((a) => a.id === 'fr/a').url, '/guides/a');
  assert.equal(model.articles.find((a) => a.id === 'en/a-en').url, '/en/guides-en/a-en');
  assert.equal(model.targets.get('fr').get('profond').url, '/guides/profond');
  const slashed = load({ 'fr/a': article({ topic: 'deep' }) }, { manifest: { trailingSlash: 'always' } });
  assert.equal(slashed.articles[0].url, '/guides/a/');
});

test('a topic has a page through an article below it or its own hub introduction, per locale', () => {
  const model = load({
    'fr/a': article({ topic: 'deep' }),
    'fr/intro-seule': article({ hubFor: 'intro-only' }),
    'fr/brouillon': article({ topic: 'empty', draft: true }),
  });
  const fr = model.targets.get('fr');
  assert.equal(fr.get('guides').draft, false);
  assert.equal(fr.get('profond').draft, false);
  assert.equal(fr.get('intro-seule').draft, false);
  assert.equal(fr.get('vide').draft, true);
  assert.equal(model.targets.get('en').get('guides-en').draft, true);
});

test('the graph lists only topics with a page and no link to a pageless topic', () => {
  const graph = buildContentGraph(load({
    'fr/a': article({ topic: 'deep' }, '[[vide]] [[intro-seule]]'),
    'fr/intro-seule': article({ hubFor: 'intro-only' }),
  }));
  const ids = graph.nodes.map((node) => node.id);
  assert.ok(ids.includes('fr/topic:guides') && ids.includes('fr/topic:intro-only'));
  assert.ok(!ids.some((id) => id.startsWith('en/') || id.endsWith(':empty')));
  const links = graph.edges.filter((edge) => edge.kind === 'link');
  assert.deepEqual(links, [{ from: 'fr/a', to: 'fr/topic:intro-only', kind: 'link' }]);
});

test('two taxonomy nodes cannot share a slug in a locale', () => {
  const taxonomy = `${TAXONOMY}- { id: twin, parent: guides, labels: { fr: ${label('profond')}, en: ${label('twin')} } }\n`;
  assert.throws(() => load({}, { taxonomy }), /share the fr slug profond/);
});

test('an article cannot use the slug of a node, and a hub introduction must', () => {
  assert.throws(() => load({ 'fr/profond': article({ topic: 'deep' }) }), /slug already used/);
  assert.throws(() => load({ 'fr/autre-nom': article({ hubFor: 'deep' }) }), /must be named after/);
});

test('wikilink extraction: alias, anchor, escaped pipe of a table, code is skipped', () => {
  assert.deepEqual(extractWikilinks('[[a]] [[b|Texte]] [[c#ancre]] [[d\\|Tableau]] [[e#f\\|G]] `[[code]]`\n```\n[[fence]]\n```\n'), [
    { slug: 'a', anchor: '', alias: null },
    { slug: 'b', anchor: '', alias: 'Texte' },
    { slug: 'c', anchor: '#ancre', alias: null },
    { slug: 'd', anchor: '', alias: 'Tableau' },
    { slug: 'e', anchor: '#f', alias: 'G' },
  ]);
});

test('broken wikilinks: published pages only', () => {
  const model = load({ 'fr/a': article({ topic: 'deep' }, '[[nope]] [[b\\|ok]]'), 'fr/b': article({ topic: 'deep', draft: true }, '[[nope-too]]') });
  assert.deepEqual(findBrokenWikilinks(model), ['fr/a: [[nope]]']);
});

test('the model is read again only when a content file changed', () => {
  const root = site({ 'fr/a': article({ topic: 'deep' }) });
  const reload = createContentModel(root, { ttlMs: 0 });
  const first = reload();
  assert.equal(reload(), first);
  const path = join(root, 'src/content/articles/fr/a.md');
  writeFileSync(path, article({ topic: 'deep', title: 'Nouveau' }));
  utimesSync(path, new Date(), new Date(Date.now() + 5000));
  const second = reload();
  assert.notEqual(second, first);
  assert.equal(second.articles[0].title, 'Nouveau');
  writeFileSync(join(root, 'src/content/articles/fr/b.md'), article({ topic: 'deep' }));
  assert.equal(reload().articles.length, 2);
});

test('the structure needs no article folder', () => {
  const root = site({});
  rmSync(join(root, 'src/content/articles'), { recursive: true });
  const { manifest, taxonomy } = createContentStructure(root)();
  assert.equal(manifest.defaultLocale, 'fr');
  assert.equal(taxonomy.nodes.length, 4);
});

function remark(model, id, children) {
  const tree = { type: 'root', children: [{ type: 'paragraph', children }] };
  const file = { path: model.articles.find((a) => a.id === id).path };
  createRemarkWikilinks(() => model)()(tree, file);
  return tree.children[0].children;
}
const text = (value) => ({ type: 'text', value });

test('remark plugin: returns an attacher and resolves, keeping the surrounding text', () => {
  const model = load({ 'fr/a': article({ topic: 'deep' }), 'fr/b': article({ topic: 'deep', title: 'Bé' }) });
  assert.deepEqual(remark(model, 'fr/a', [text('voir [[b#x]] et [[profond|ici]].')]), [
    text('voir '),
    { type: 'link', url: '/guides/b#x', title: null, children: [text('Bé')] },
    text(' et '),
    { type: 'link', url: '/guides/profond', title: null, children: [text('ici')] },
    text('.'),
  ]);
  const code = { type: 'inlineCode', value: '[[b]]' };
  assert.deepEqual(remark(model, 'fr/a', [code]), [code]);
});

test('remark plugin: unknown slug fails a published page, warns in a draft; draft target is plain text', (t) => {
  t.mock.method(console, 'warn', () => {});
  const model = load({
    'fr/a': article({ topic: 'deep' }),
    'fr/b': article({ topic: 'deep', draft: true, title: 'Bé' }),
  });
  assert.throws(() => remark(model, 'fr/a', [text('[[nope]]')]), /fr\/a: wikilink \[\[nope\]\]/);
  assert.deepEqual(remark(model, 'fr/b', [text('[[nope]]')]), [text('[[nope]]')]);
  assert.deepEqual(remark(model, 'fr/a', [text('[[b]]')]), [text('Bé')]);
  assert.deepEqual(remark(model, 'fr/a', [text('[[vide|Plus tard]]')]), [text('Plus tard')]);
});

test('Sätteri plugin: escaped pipe of a table and pageless topic', () => {
  const model = load({ 'fr/a': article({ topic: 'deep' }), 'fr/b': article({ topic: 'deep' }) });
  const path = model.articles.find((a) => a.id === 'fr/a').path;
  const plugin = createWikilinkPlugin(() => model);
  const run = (source) => {
    const calls = { set: [], replace: [] };
    plugin.link({ position: { start: { offset: 0 }, end: { offset: source.length } } }, {
      source,
      fileURL: pathToFileURL(path),
      setProperty: (...args) => calls.set.push(args.slice(1)),
      replaceNode: (_, node) => calls.replace.push(node),
      report: () => {},
    });
    return calls;
  };
  assert.deepEqual(run('[[b\\|Tableau]]').set, [['url', '/guides/b']]);
  assert.deepEqual(run('[[vide]]').replace, [{ type: 'text', value: 'T-vide' }]);
  assert.throws(() => run('[[nope]]'), /does not resolve/);
});

test('forbidden frontmatter fields become schema issues', () => {
  const issues = [];
  rejectForbiddenFields({ title: 'x', slug: 'y', date: 'z' }, { addIssue: (issue) => issues.push(issue.path[0]) });
  assert.deepEqual(issues, ['slug', 'date']);
});
