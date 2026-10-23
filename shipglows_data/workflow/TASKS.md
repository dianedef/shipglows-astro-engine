# Astro Engine Tasks

## Open

- [ ] Push `main` (operator approval), then bump the pinned commit in claiire (17938c1) and shipglows_app (c884afa) when they adopt a newer module.
- [ ] `bio`: adopt in claiire (`QuickExit` in slot `before`; replace its placeholder social URLs `linkedin.com`, `x.com`… with real accounts), gocharbon (`/fr/bio`; `Button` through slot `links` or per-link classes; duplicated « outils » link to check), notefinderz (becomes `noindex` unless `robots` is passed; anti-copy script and Google Fonts through slots `after`/`head`; `prerender` stays in the page), jarretelacoke (fr/en/es copy through `lang`; its « Accueil » link is not localized).
- [ ] `legal`: adopt in beatglows, claiire, communityglows, contentglows, gocharbon, notefinderz, replayglows, shipglows_app, bestfriedchicken, jarretelacoke; drop the home-made `LegalNotice.astro` in communityglows, replayglows, shipglows_app, contentglows. Data divergence: replayglows writes « 4 Quai Juin », the others « quai ».
- [ ] `breadcrumbs`: adopt site by site, removing each site's own `BreadcrumbList` JSON-LD.
- [ ] `i18n`: adopt in the multilingual sites (inventory each site's locale helpers before replacing them).

## Done

- [x] 2026-10-23: `bio` (5cdbb63), `legal` (7348276), `i18n` (adab840), `breadcrumbs` (e22224a) modules committed; no site migrated, nothing built or tested.
- [x] Before 2026-10-23: `theme` module with `ThemeToggle.astro` (17938c1); adopted by claiire, shipglows_app, communityglows.
