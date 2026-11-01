// Public API of @shipglows/astro-engine/content. Pages import this barrel; Node tools
// (astro.config.mjs, scripts) import @shipglows/astro-engine/content/model instead,
// which has no Astro dependency.
export {
  FORBIDDEN_FIELDS,
  articleUrl,
  buildContentGraph,
  childNodes,
  createContentModel,
  createWikilinkPlugin,
  localePrefix,
  loadRedirects,
  nodePath,
  nodeUrl,
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
