---
artifact: technical_context
metadata_schema_version: "1.0"
artifact_version: "1.0.0"
project: ShipGlows Astro Engine
created: "2026-10-23"
updated: "2026-10-23"
status: active
source_skill: sg-docs
scope: module-map
owner: Diane
confidence: high
risk_level: low
security_impact: none
docs_impact: yes
linked_systems:
  - ../../README.md
  - ../../package.json
  - ../../src/
depends_on: []
supersedes: []
evidence:
  - "2026-10-23: module list from package.json exports and src/; consumers from the sites' package.json and their @shipglows/astro-engine imports."
next_review: "2027-01-23"
next_step: "Update the consumer column when a site adopts or drops a module."
---

# Astro Engine Context

Shared logic for the ShipGlows Astro sites. Each module is a sub-path export
(`@shipglows/astro-engine/<module>`) with a typed `define*()` helper for site
data and, when useful, an `.astro` component.

## Conventions

- Unstyled: components emit stable `sg-<module>__*` classes and accept site
  classes; any default rule lives in `:where()` (zero specificity).
- Data and copy stay in each site; the engine never ships a site's links,
  identity or translations.
- Sites pin a commit: `git+https://github.com/dianedef/shipglows-astro-engine.git#<commit>`
  (`link:`/`file:` only for local co-development).
- Before replacing a site's home-made code, inventory what it does, migrate
  every useful behavior, and report what is dropped and why.
- No build, lint or test pipeline in the repo; Astro `>=5` is a peer dependency.

## Modules

| Module | Exports | Role | Commit | Consumers (2026-10-23) |
| --- | --- | --- | --- | --- |
| `theme` | `theme`, `theme/client`, `theme/ThemeScript.astro`, `theme/ThemeToggle.astro` | Theme axes on `<html>` (data attributes or classes), anti-flash script, localStorage, live system preference, data-theme-* controls, ready-made toggle | 11f36f8, b2a30ef, 17938c1 | claiire (pinned 17938c1), shipglows_app (pinned c884afa), communityglows (`file:` link) |
| `breadcrumbs` | `breadcrumbs`, `breadcrumbs/Breadcrumbs.astro` | Accessible breadcrumb HTML and `BreadcrumbList` JSON-LD from one list of steps; generation from the URL | e22224a | none yet |
| `bio` | `bio`, `bio/BioPage.astro` | Standalone link-in-bio document: SEO head with `noindex, follow` default, avatar, links, social icons, copyright year | 5cdbb63 | none yet |
| `legal` | `legal`, `legal/LegalNotice.astro` | Legal notice from `defineLegalIdentity` (publisher, director, host, IP), fr/en copy, `vercelHost` preset | 7348276 | none yet |
| `i18n` | `i18n`, `i18n/LanguageSelector.astro` | Locale path conventions, translated slugs, hreflang alternates, middleware rewrite, language selector | adab840 | none yet |

## Cross-Module Contracts

- `bio` accepts `htmlAttributes={themeAttributes(config)}` and a `head` slot
  for `ThemeScript`, and `alternates` in the shape produced by `i18n`.
- `breadcrumbs` owns `BreadcrumbList` JSON-LD: a site adopting it removes its
  own, and `legal` leaves JSON-LD to it.
