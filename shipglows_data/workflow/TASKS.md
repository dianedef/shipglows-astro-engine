# Astro Engine Tasks

## Open

- [ ] `email`: adopt in DreamGlows (`WaitlistForm.astro`), ReplayGlows (`FollowUpdates.astro`), ContentGlows (`holding/waitlist.js`) and JarreteLaCoke (`EmailCapture.vue`, `guideDrip.ts` onto `email/client`), dropping each local copy; wait for the engine push (operator approval) before any pin bump.
- [ ] Push `main` (operator approval), then bump the pinned commit in claiire (17938c1) and shipglows_app (c884afa) when they adopt a newer module.
- [ ] `bio`: adopt in claiire (`QuickExit` in slot `before`; replace its placeholder social URLs `linkedin.com`, `x.com`… with real accounts), gocharbon (`/fr/bio`; `Button` through slot `links` or per-link classes; duplicated « outils » link to check), notefinderz (becomes `noindex` unless `robots` is passed; anti-copy script and Google Fonts through slots `after`/`head`; `prerender` stays in the page), jarretelacoke (fr/en/es copy through `lang`; its « Accueil » link is not localized).
- [ ] `legal`: adopt in beatglows, claiire, communityglows, contentglows, gocharbon, notefinderz, replayglows, shipglows_app, bestfriedchicken, jarretelacoke; drop the home-made `LegalNotice.astro` in communityglows, replayglows, shipglows_app, contentglows. Data divergence: replayglows writes « 4 Quai Juin », the others « quai ».
- [ ] `breadcrumbs`: adopt in beatglows (per-page `BreadcrumbList` in `formation/[module]`) and jarretelacoke (`navigation/Breadcrumbs.astro` + part D of `SchemaOrg.astro`, two label tables to merge), removing each site's own `BreadcrumbList` JSON-LD. Done: gocharbon.
- [ ] `i18n`: migrate gocharbon (French back to unprefixed URLs, ~500 files incl. content links; awaiting operator go). Verify bestfriedchicken on its dev server once `site/.shipglows.backend.json` exists. After the engine push, replace the `link:`/`file:` dependency by a pinned commit in the six migrated sites.
- [ ] `base.css` / `icons`: adopt in every site, dropping each site's own Inter/Cal Sans files and `@font-face`, Google Fonts links, scrollbar CSS and direct Lucide imports for base meanings.

## Done

- [x] 2026-10-30: `i18n` single convention (0b54189…52674cd) adopted by dianedefores, replayglows, communityglows (French slugs translated, blog under /fr/blog), notefinderz (French slugs translated), jarretelacoke, bestfriedchicken (English slugs translated); hreflang, selector and 301s checked on dev servers except bestfriedchicken.

- [x] 2026-10-27: `email` module (`NewsletterSignup.astro`, `subscribe.ts`, `client.ts`), 42 `node --test` checks; no site migrated, nothing built or pushed.
- [x] 2026-10-25: `breadcrumbs` adopted by gocharbon (bc0160b1, pinned ec1669c): computed styles identical on 4 pages, JSON-LD now follows the visible trail.
- [x] 2026-10-24: `fonts.css`, `base.css`, `icons` (851e66f); no site migrated, nothing built or tested.
- [x] 2026-10-23: `bio` (5cdbb63), `legal` (7348276), `i18n` (adab840), `breadcrumbs` (e22224a) modules committed; no site migrated, nothing built or tested.
- [x] Before 2026-10-23: `theme` module with `ThemeToggle.astro` (17938c1); adopted by claiire, shipglows_app, communityglows.
