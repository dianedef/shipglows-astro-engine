# @shipglows/astro-engine

Logique partagée **sans style** pour les sites Astro ShipGlows. Chaque site garde son HTML, sa mise en page et son thème visuel.

## Thème (`/theme`)

Un site déclare ses axes (palette, mode clair/sombre, options), le kit gère :

- le script anti-flash dans `<head>` (`ThemeScript.astro`) ;
- la mémorisation dans localStorage ;
- le branchement de contrôles HTML via des attributs `data-theme-*` (`bindThemeControls`).

Le CSS reste dans le site : `:root[data-site-theme="gold"][data-site-mode="light"] { … }`.

```ts
// src/theme.config.ts
import { defineThemeConfig } from "@shipglows/astro-engine/theme";

export const themeConfig = defineThemeConfig({
  storagePrefix: "monsite",
  axes: {
    theme: { attribute: "siteTheme", values: ["green", "neon", "gold"], default: "green" },
    mode: { attribute: "siteMode", values: ["dark", "light"], default: "dark", colorScheme: true }
  }
});
```

```astro
---
import ThemeScript from "@shipglows/astro-engine/theme/ThemeScript.astro";
import { themeAttributes } from "@shipglows/astro-engine/theme";
import { themeConfig } from "../theme.config";
---
<html {...themeAttributes(themeConfig)}>
  <head>
    <ThemeScript config={themeConfig} />
```

```astro
<select data-theme-axis="theme">…</select>
<button type="button" data-theme-axis="mode" data-theme-toggle data-theme-pressed="light">…</button>

<script>
  import { bindThemeControls } from "@shipglows/astro-engine/theme/client";
  import { themeConfig } from "../theme.config";
  bindThemeControls(themeConfig);
</script>
```

Options d'un axe :

- `attribute` et/ou `classes` : où poser la valeur sur `<html>`. Pour Tailwind (`dark:`), `classes: { dark: "dark" }` suffit.
- `followSystem` : sans choix mémorisé, suit `prefers-color-scheme`, y compris quand le réglage système change en direct.
- `colorScheme` : recopie la valeur dans `color-scheme`.

### Bouton clair/sombre prêt à l'emploi (`ThemeToggle.astro`)

HTML accessible (`aria-pressed`, nom accessible, focus visible), icônes synchronisées sans flash au chargement, animations coupées si l'utilisateur réduit les mouvements. Le style par défaut suit `currentColor` ; chaque site l'habille par variables CSS.

```astro
---
import ThemeToggle from "@shipglows/astro-engine/theme/ThemeToggle.astro";
import { themeConfig } from "../theme.config";
---
<ThemeToggle config={themeConfig} label="Mode sombre" class="site-theme-toggle">
  <MoonIcon slot="icon-off" />   <!-- optionnel : icônes du site -->
  <SunIcon slot="icon-on" />
</ThemeToggle>

<style is:global>
  .site-theme-toggle {
    --sg-theme-toggle-size: 2.5rem;
    --sg-theme-toggle-radius: 0.75rem;
    --sg-theme-toggle-bg: var(--surface);
    --sg-theme-toggle-border: 1px solid var(--border);
  }
</style>
```

Props : `config`, `label`, `axis` (défaut `theme`), `pressedValue` (défaut `dark`), `title`, `class`.

| Variable | Défaut |
| --- | --- |
| `--sg-theme-toggle-size` | `2.75rem` (44 px) |
| `--sg-theme-toggle-icon-size` | `1.25rem` |
| `--sg-theme-toggle-radius` | `999px` |
| `--sg-theme-toggle-bg` / `-color` | `transparent` / `currentColor` |
| `--sg-theme-toggle-border` | `1px solid` currentColor à 24 % |
| `--sg-theme-toggle-shadow` | `none` |
| `--sg-theme-toggle-hover-bg` / `-hover-color` / `-hover-border-color` | repos / repos / `currentColor` |
| `--sg-theme-toggle-hover-lift` | `0` (ex. `-1px`) |
| `--sg-theme-toggle-focus-ring` / `-focus-offset` | `2px solid currentColor` / `2px` |
| `--sg-theme-toggle-duration` | `160ms` |

Les règles du kit sont dans `:where()` (spécificité nulle) : toute règle du site les remplace.

## Fil d'Ariane (`/breadcrumbs`)

Un seul tableau d'étapes produit le HTML visible et le JSON-LD `BreadcrumbList` (URL absolues depuis `Astro.site`) : les deux ne peuvent plus diverger. Aucun style : le site habille via les classes `sg-breadcrumbs*` ou ses propres classes.

```astro
---
import Breadcrumbs from "@shipglows/astro-engine/breadcrumbs/Breadcrumbs.astro";
---
<!-- Liste explicite : la dernière étape est la page courante (aria-current="page"), son href est facultatif -->
<Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Formation", href: "/formation/" }, { label: mod.title }]} />
```

Génération depuis l'URL (un segment = une étape, lien = chemin cumulé) :

```astro
---
import Breadcrumbs from "@shipglows/astro-engine/breadcrumbs/Breadcrumbs.astro";
import { breadcrumbsFromPath } from "@shipglows/astro-engine/breadcrumbs";

const items = breadcrumbsFromPath(Astro.url.pathname, {
  home: { label: "Accueil", href: localizePath("/", locale) }, // false pour ne pas l'ajouter
  labels: { ia: "Intelligence artificielle", "mentions-legales": "Mentions légales" }, // ou (segment, i, segments) => …
  currentLabel: entry.data.title,          // titre de la page au lieu du slug
  stripPrefix: (path) => stripLocalePrefix(path), // ex. retirer /en
  hrefFor: (path) => localizePath(path, locale),  // ex. remettre la locale, corriger une route
  trailingSlash: true                      // si astro.config a trailingSlash: "always"
});
---
<Breadcrumbs items={items} label="Breadcrumbs" minItems={2} class="site-breadcrumbs">
  <span slot="separator">/</span>
</Breadcrumbs>
```

Sans libellé fourni, un segment est humanisé (`mentions-legales` → « Mentions legales », segments encodés décodés). Deux étapes consécutives au même lien (route redirigée par `hrefFor`) sont fusionnées.

Props : `items`, `label` (défaut « Fil d'Ariane »), `separator` (texte) ou slot `separator`, `minItems` (défaut 1 ; en dessous, rien n'est rendu), `jsonLd` (défaut `true`, jamais sous 2 étapes), `site` (défaut `Astro.site`), `class`, `listClass`, `itemClass`, `linkClass`, `currentClass`, `separatorClass`.

Sans séparateur, rien n'est inséré : le site le dessine en CSS (`.sg-breadcrumbs__item + .sg-breadcrumbs__item::before`). Classes posées : `sg-breadcrumbs`, `__list`, `__item`, `__link`, `__current`, `__text` (étape intermédiaire sans lien), `__separator`.

Pour un JSON-LD regroupé ailleurs (ex. dans `<head>`), passer `jsonLd={false}` et utiliser les helpers :

```ts
import { breadcrumbJsonLd, serializeJsonLd } from "@shipglows/astro-engine/breadcrumbs";

const schema = breadcrumbJsonLd(items, { site: Astro.site, currentUrl: Astro.url });
// <script type="application/ld+json" set:html={serializeJsonLd(schema)} />
```

Un site doit retirer son ancien `BreadcrumbList` en l'adoptant, sinon Google en voit deux.

## Page bio (`/bio`)

Page « link-in-bio » autonome (document HTML complet, sans le layout du site) : `<head>` SEO (canonical, hreflang, Open Graph, Twitter), `robots` à `noindex, follow` par défaut, avatar, titre, accroche, liens, icônes de réseaux, pied de page « © année ». Les liens et textes restent dans le site ; aucun style.

```ts
// src/data/bio.ts
import { defineBioLinks } from "@shipglows/astro-engine/bio";

export const bio = defineBioLinks({
  links: [
    { label: "Accueil", href: "https://www.monsite.fr", class: "bio-link" },
    { label: "Découvre les parcours", href: "https://www.monsite.fr/parcours", class: "bio-link cta", featured: true }
  ],
  socials: [
    { label: "Twitter / X", href: "https://x.com/monsite", icon: "x" },
    { label: "Mastodon", href: "https://mastodon.social/@monsite", iconPath: "M…" } // tracé SVG 24×24
  ]
});
```

```astro
---
// src/pages/bio.astro
import BioPage from "@shipglows/astro-engine/bio/BioPage.astro";
import { bio } from "../data/bio";
---
<BioPage
  title="MonSite | Liens"
  description="…"
  name="MonSite"
  tagline="…"
  data={bio}
  siteName="MonSite"
  image={{ src: "https://www.monsite.fr/og-image.png", width: 1200, height: 630 }}
  avatar={{ src: "/logo.webp", alt: "MonSite", width: 80, height: 80 }}
  copyright="MonSite"
  classes={{ body: "bio-page", main: "bio-container", avatar: "bio-avatar", name: "bio-name", tagline: "bio-tagline", links: "bio-links", socials: "bio-socials", footer: "bio-footer" }}
>
  <Fragment slot="head"><link rel="stylesheet" href="…" /></Fragment>
  <QuickExit slot="before" />
</BioPage>
<style is:global>/* le CSS bio du site, inchangé */</style>
```

`defineBioLinks` vérifie libellés, URL et icônes. Icônes fournies (`icon`) : `x`, `linkedin`, `instagram`, `youtube`, `github`. Les liens restent dans le même onglet sauf `newTab: true` ; les réseaux s'ouvrent toujours dans un nouvel onglet ; tout nouvel onglet reçoit `rel="noopener noreferrer"`.

Props : `title`, `description`, `name`, `data`, `tagline`, `eyebrow`, `lang` (défaut `fr`), `ogLocale` (déduite de `lang`), `siteName`, `author`, `canonical` (défaut `Astro.site` + chemin), `alternates` (`[{ hreflang, href }]`), `image` (`{ src, width, height, alt }` ; sans image, carte Twitter `summary`), `avatar`, `copyright`, `robots` (défaut `noindex, follow`), `linksLabel`, `socialsLabel`, `classes`, `htmlAttributes` (ex. `themeAttributes(config)`), `bodyAttributes` (ex. `style`).

Slots : `head`, `before`, `avatar`, `eyebrow`, défaut (texte après l'accroche), `links` et `socials` (remplacent le rendu fourni, ex. avec le composant bouton du site et `bioLinkAttributes(link)`), `footer`, `after` (scripts). Classes posées : `sg-bio`, `__main`, `__avatar`, `__eyebrow`, `__name`, `__tagline`, `__links`, `__link`, `__link--featured` (+ `data-featured`), `__socials`, `__social`, `__footer`. Seule règle du kit : listes sans puces, dans `:where()`.

Pour un site multilingue, passer `lang`, les textes traduits et `alternates` ; `export const prerender = true` reste dans la page du site.

## Installation dans un site

Dépendance git figée sur un commit (fonctionne sur Vercel) :

```json
"@shipglows/astro-engine": "git+https://github.com/dianedef/shipglows-astro-engine.git#<commit>"
```

En développement local, `link:../../shipglows-astro-engine` permet de modifier le kit et le site en même temps.
