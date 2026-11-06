// Astro integration of the content tree model: what every content site needs at build time.
// It imports the plain model only, so astro.config.mjs can load it.
import { fileURLToPath } from 'node:url';
import { createContentModel, findBrokenWikilinks } from './model.mjs';

/**
 * Refuses a build with a broken wikilink on a published page: Astro only logs a Markdown render
 * error and then serves that page empty with a 200. Also makes the shared packages use the site's
 * Astro instead of the copy next to them when they are read through a link.
 */
export function shipglowsContent({ loadModel } = {}) {
  let load = loadModel;
  return {
    name: 'shipglows-content',
    hooks: {
      'astro:config:setup': ({ config, updateConfig }) => {
        load ??= createContentModel(fileURLToPath(config.root));
        updateConfig({ vite: { resolve: { dedupe: ['astro'] } } });
      },
      'astro:build:start': () => {
        const broken = findBrokenWikilinks(load());
        if (broken.length > 0) throw new Error(`Broken wikilinks on published pages: ${broken.join(', ')}`);
      },
    },
  };
}
