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

## Mentions légales (`/legal`)

Mentions obligatoires (LCEN, art. 6-III) : éditeur, direction de la publication, hébergeur, propriété intellectuelle, lien vers la politique de confidentialité. Textes fr/en fournis ; **l'identité (SIRET, adresse, téléphone) reste dans le site**, jamais dans ce repo public.

```ts
// src/config/legal.ts
import { defineLegalIdentity, telHref, vercelHost } from "@shipglows/astro-engine/legal";

export const legalIdentity = defineLegalIdentity({
  siteName: "MonSite",
  publisher: {
    name: "Camille Exemple",
    status: { fr: "Entrepreneur individuel (EI)", en: "Sole proprietor (French EI)" }, // ou une seule chaîne
    siret: "000 000 000 00000",
    address: "1 rue de l'Exemple, 75000 Paris, France", // ou un tableau de lignes
    phone: "+33 1 00 00 00 00",
    phoneHref: telHref("+33 1 00 00 00 00"), // optionnel : sans lui, numéro non cliquable
    email: "contact@monsite.fr" // optionnel : ligne « Contact » en mailto
  },
  publicationDirector: "Camille Exemple", // défaut : nom de l'éditeur
  host: vercelHost
});
```

```astro
---
import LegalNotice from "@shipglows/astro-engine/legal/LegalNotice.astro";
import { legalIdentity } from "../config/legal";
---
<LegalNotice identity={legalIdentity} locale="fr" privacyHref="/confidentialite" class="legal-content">
  <section>
    <h2>Responsabilité</h2>   <!-- sections propres au site : slot par défaut, à la fin -->
    <p>…</p>
  </section>
</LegalNotice>
```

- Champs vides ou absents non rendus ; `companyNumber`, `vatNumber`, `urlLabel` disponibles. `defineLegalIdentity` vérifie noms, SIRET à 14 chiffres et `phoneHref` en `tel:`.
- `publisher: null` (identité pas encore validée) : la section affiche `labels.publisherPending`, sans direction de la publication.
- Libellés surchargeables (`labels={{ directorHeading: "Directeur de la publication" }}`) ; une langue autre que `fr` prend l'anglais, à compléter par `labels` (ex. `es`). `legalNoticeLabels(locale)` donne aussi `title` pour le `<title>` de la page.
- Pour un rendu maison (table, liste), `legalRows(party, "publisher" | "host", locale)` donne les lignes non vides `{ key, label, lines, href, external }`.

Props : `identity`, `locale` (défaut `fr`), `labels`, `privacyHref` (sans lui ni slot, pas de section « Données personnelles »), `title` (`true` ou texte : rend un `<h1>`), `headingLevel` (défaut `2`), `newTab` (site de l'hébergeur), `class`, `classes` (`section`, `heading`, `list`, `row`, `term`, `value`, `text`, `link`, ex. utilitaires Tailwind).

Slots : `intro`, `publisher` et `host` (fin de leur section), `intellectual-property` et `personal-data` (remplacent le texte par défaut), défaut (sections du site, à la fin). Classes posées : `sg-legal`, `__title`, `__section` (+ `--publisher`, `--host`, `--director`, `--intellectual-property`, `--personal-data`), `__heading`, `__list`, `__row` (+ `--name`, `--siret`…), `__term`, `__value`, `__link`, `__text`. Chaque ligne est un `<div>` dans le `<dl>` : pour une grille `dt`/`dd` sur le `<dl>`, donner `display: contents` aux lignes. Aucun style fourni.

## i18n (`/i18n`)

Langue courante, chemins par langue, alternates hreflang et sélecteur de langue. Les traductions de contenu (textes d'interface, articles) restent dans le site. Aucune convention d'URL imposée : préfixe ou non de la langue par défaut, slugs traduits, sections partagées, `x-default`.

```ts
// src/i18n.config.ts
import { defineI18nConfig } from "@shipglows/astro-engine/i18n";

export const i18n = defineI18nConfig({
  locales: { en: {}, fr: { hreflang: "fr", intl: "fr-BE" } },
  defaultLocale: "en",              // en sans préfixe, fr sous /fr
  routes: [                         // slugs traduits, chemins complets
    { en: "/", fr: "/fr" },
    { en: "/privacy", fr: "/fr/confidentialite" },
    { en: "/blog", fr: "/blog/fr" },
  ],
  sharedPaths: ["/features", "/pricing"], // même slug dans toutes les langues ; défaut : tous
});
```

```astro
---
import LanguageSelector from "@shipglows/astro-engine/i18n/LanguageSelector.astro";
import { alternates, localeFromPath, localeInfo, localeLinks } from "@shipglows/astro-engine/i18n";
import { i18n } from "../i18n.config";

const locale = localeFromPath(i18n, Astro.url.pathname);
const others = localeLinks(i18n, Astro.url.pathname).filter((link) => link.translated && !link.current);
---
<html lang={localeInfo(i18n, locale).lang}>
  <head>
    {alternates(i18n, Astro.url.pathname, { site: Astro.site }).map(({ hreflang, href }) => (
      <link rel="alternate" hreflang={hreflang} href={href} />
    ))}
    <meta property="og:locale" content={localeInfo(i18n, locale).ogLocale} />
    {others.map((link) => <meta property="og:locale:alternate" content={link.ogLocale} />)}
  </head>
  …
  <LanguageSelector config={i18n} label="Langue" display="code" linkClass="site-lang-link" />
```

Articles dont la traduction vient du frontmatter (`alternateSlug`, `contentId`) : passer `locale` et `translations`, qui font alors foi.

```ts
alternates(i18n, Astro.url.pathname, { locale: "fr", translations: { en: "/blog/my-post" }, site: Astro.site });
```

Helpers (tous purs, `config` en premier argument) :

| Fonction | Rôle |
| --- | --- |
| `localeFromPath` / `localeFromUrl` | Langue d'un chemin (paire `routes`, puis préfixe, sinon défaut) ; `localeFromUrl` lit aussi `?<queryParam>=` |
| `parsePath` / `stripLocale` | Chemin sans préfixe, suffixe `?…#…` conservé ; `unknownLocale` signale un `/de/…` non configuré |
| `localizedPath` | Lien vers une langue (paire, sinon préfixe) ; externes, ancres et `/api` inchangés |
| `translatePath` | Équivalent réel de la page dans une langue, ou `null` |
| `localeLinks` | Un lien par langue publiée (`current`, `translated`, libellé, hreflang, og:locale) |
| `alternates` / `sitemapLinks` | `hreflang` + `x-default`, vide si la page n'a qu'une langue ; format `@astrojs/sitemap` |
| `localizedPaths` | Toutes les variantes de chemins (`customPages` du sitemap) |
| `rewritePath` | Pour un middleware qui sert `/en/carte` avec la page `/carte` : cible de `context.rewrite()` ou `null` |
| `matchLocale` / `normalizeLocale` | `en-US`, `fr_BE`, frontmatter → langue (ou défaut) |
| `pickLocalized` | Valeur `{ fr, en }` dans la langue voulue, repli défaut puis première non vide |
| `reservedRoots` | Préfixes de langue et racines non localisées, à refuser comme slug |

Options de config : `prefixDefaultLocale` (langue par défaut aussi préfixée, les chemins sans préfixe lui restent attribués), `published` (langues exposées), `xDefault` (langue ou `false`), `trailingSlash` (`never` par défaut, `always`), `unlocalizedPaths` (défaut `/api`, `/_astro`), `queryParam`, `notLocales`. Par langue : `prefix`, `hreflang`, `lang`, `ogLocale`, `label`, `intl` (défauts tirés du code).

Middleware de réécriture (une page pour toutes les langues) :

```ts
import { defineMiddleware } from "astro:middleware";
import { localeFromPath, rewritePath } from "@shipglows/astro-engine/i18n";
import { i18n } from "./i18n.config";

export const onRequest = defineMiddleware((context, next) => {
  context.locals.locale = localeFromPath(i18n, context.url.pathname);
  const target = rewritePath(i18n, context.url.pathname, { paths: ["/", "/parcours/*"] });
  return target ? context.rewrite(new URL(`${target}${context.url.search}`, context.url)) : next();
});
```

### Sélecteur (`LanguageSelector.astro`)

`<nav aria-label><ul><li><a hreflang lang>` sans style ; masqué s'il n'y a pas d'autre langue. Props : `config`, `path` (défaut URL courante), `locale`, `translations`, `fallback` (`home` : lien vers l'accueil de la langue sans traduction, défaut ; `hide`), `showCurrent` (`aria-current="page"`), `display` (`label` « English » ou `code` « EN »), `label` (sans lui, seule la `<ul>` est rendue), `linkLabel`, `linkTitle`, `class`, `listClass`, `itemClass`, `linkClass`. Contenu sur mesure : une fonction en enfant, `{(link) => <span>{link.label}</span>}`.

## Installation dans un site

Dépendance git figée sur un commit (fonctionne sur Vercel) :

```json
"@shipglows/astro-engine": "git+https://github.com/dianedef/shipglows-astro-engine.git#<commit>"
```

En développement local, `link:../../shipglows-astro-engine` permet de modifier le kit et le site en même temps.
