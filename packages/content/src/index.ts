// Public API of @shipglows/astro-content. Pages import this barrel; Node tools
// (astro.config.mjs, scripts) import @shipglows/astro-content/model instead,
// which has no Astro dependency.
export {
  FORBIDDEN_FIELDS,
  articleUrl,
  buildContentGraph,
  buildLinkTargets,
  childNodes,
  createContentModel,
  createWikilinkPlugin,
  findBrokenWikilinks,
  localePrefix,
  loadRedirects,
  nodePath,
  nodeUrl,
  splitFrontmatter,
} from './model.mjs';

export {
  createContentSite,
  articleLocale,
  articleSlug,
  type ArticleEntry,
  type ContentRouteProps,
  type ContentSite,
  type ContentSiteOptions,
  type Crumb,
  type HreflangLink,
  type Locale,
} from './site.ts';
