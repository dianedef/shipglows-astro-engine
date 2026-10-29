# @shipglows/astro-engine

Logique partagée **sans style** pour les sites Astro ShipGlows. Chaque site garde son HTML, sa mise en page et son thème visuel. Seules exceptions, à importer au choix : les polices, les barres de défilement et les icônes de base, pour que tous les sites se ressemblent sur ces points.

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

Le HTML est rendu par le composant du kit : un `<style>` scoped du site ne l'atteint pas. Écrire ces règles en `is:global`, en ciblant les classes `sg-breadcrumbs__*` (ex. `.site-breadcrumbs.sg-breadcrumbs a.sg-breadcrumbs__link`) pour garder la priorité de l'ancien CSS scoped face aux règles globales des liens.

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

Une seule convention d'URL pour tous les sites ; un site ne règle que ses langues, sa langue par défaut et ses paires de slugs. Les traductions de contenu (textes d'interface, articles) restent dans le site.

- Langue par défaut sans préfixe, chaque autre langue sous `/<code>` (`/en/pricing`) ; `/<langue par défaut>/…` redirige en 301 vers le chemin sans préfixe.
- Slugs traduits (`/privacy` ↔ `/fr/confidentialite`), section avant le slug (`/fr/blog/…`), pas de barre finale.
- `hreflang` = code de langue seul, `x-default` = langue par défaut, seulement sur les pages réellement traduites.
- Sélecteur toujours visible : une langue sans traduction de la page mène à la page parente traduite la plus proche (`/blog/x` → `/fr/blog`), sinon à son accueil.
- `?lang=<code>` redirige en 301 vers l'URL de la langue.

```ts
// src/i18n.config.ts
import { defineI18nConfig } from "@shipglows/astro-engine/i18n";

export const i18n = defineI18nConfig({
  locales: { en: {}, fr: { intl: "fr-BE" } },  // options : label, ogLocale, intl
  defaultLocale: "en",
  routes: [
    { en: "/", fr: "/fr" },
    { en: "/privacy", fr: "/fr/confidentialite" },
    { en: "/features", fr: "/fr/fonctionnalites", legacy: { fr: ["/fr/features"] } }, // 301
    { en: "/blog", fr: "/fr/blog" },              // index de section
    { en: "/compare/*", fr: "/fr/comparatif/*" }, // section : même slug final dans les deux langues
  ],
});
```

```ts
// astro.config.mjs : 301 des URL legacy
import { astroRedirects } from "@shipglows/astro-engine/i18n";
import { i18n } from "./src/i18n.config";
export default defineConfig({ redirects: { ...astroRedirects(i18n) } });
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

Helpers (purs, `config` en premier argument) :

| Fonction | Rôle |
| --- | --- |
| `localeFromPath` / `parsePath` / `stripLocale` | Langue d'un chemin, chemin sans préfixe (suffixe `?…#…` conservé) ; `unknownLocale` signale un `/de/…` non configuré |
| `localizedPath` | Lien vers une langue : paire de `routes`, sinon préfixe ; externes, ancres et `/api` inchangés |
| `translatePath` | Équivalent déclaré de la page dans une langue, ou `null` |
| `localeLinks` | Un lien par langue publiée (`current`, `translated`, libellé, hreflang, og:locale) |
| `alternates` / `sitemapLinks` | `hreflang` + `x-default`, vide si la page n'a qu'une langue ; format `@astrojs/sitemap` |
| `localizedPaths` | Toutes les variantes de chemins (`customPages` du sitemap) |
| `astroRedirects` | 301 des URL `legacy` pour `redirects` d'`astro.config` ; section : `/old/[slug]` → `/new/[slug]` (autre paramètre : `{ params: { "/fr/comparer/*": "apps" } }`) |
| `localeRedirect` | Pour un middleware : 301 de `?lang=` et du préfixe de la langue par défaut |
| `rewritePath` | Pour un middleware qui sert une page pour toutes les langues : `/en/carte` → `/carte`, `/fr/confidentialite` → `/privacy` |
| `matchLocale` / `normalizeLocale` | `en-US`, `fr_BE`, frontmatter → langue (ou défaut) |
| `pickLocalized` | Valeur `{ fr, en }` dans la langue voulue, repli défaut puis première non vide |
| `reservedRoots` | Codes de langue et racines non localisées, à refuser comme slug |

Autres options : `published` (langues exposées, ex. `es` en préparation), `unlocalizedPaths` (défaut `/api`, `/_astro`).

```ts
// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { localeFromPath, localeRedirect, rewritePath } from "@shipglows/astro-engine/i18n";
import { i18n } from "./i18n.config";

export const onRequest = defineMiddleware((context, next) => {
  const redirect = context.isPrerendered ? null : localeRedirect(i18n, context.url);
  if (redirect) return context.redirect(redirect, 301);
  context.locals.locale = localeFromPath(i18n, context.url.pathname);
  const target = rewritePath(i18n, context.url.pathname); // seulement si une page sert toutes les langues
  return target ? context.rewrite(new URL(`${target}${context.url.search}`, context.url)) : next();
});
```

Site statique sans adaptateur : les `redirects` d'Astro ne sont que des pages de rafraîchissement en production ; recopier les 301 `legacy` dans `vercel.json` (section : `/old/:slug` → `/new/:slug`).

Pages prérendues : le middleware ne voit pas la requête réelle ; `?lang=` se redirige alors côté hébergeur (`vercel.json`, `has: [{ type: "query", key: "lang" }]`).

### Sélecteur (`LanguageSelector.astro`)

`<nav aria-label><ul><li><a hreflang lang>` sans style, masqué seulement si le site n'a qu'une langue publiée. Props : `config`, `path` (défaut URL courante), `locale`, `translations`, `showCurrent` (`aria-current="page"`), `display` (`label` « English » ou `code` « EN »), `label` (sans lui, seule la `<ul>` est rendue), `linkLabel`, `linkTitle`, `class`, `listClass`, `itemClass`, `linkClass`. Contenu sur mesure : une fonction en enfant, `{(link) => <span>{link.label}</span>}`. Les classes passées au sélecteur doivent être globales (utilitaires Tailwind, `<style is:global>` ou `:global()`) : le style scopé d'un composant du site ne s'applique pas au HTML rendu par le module.

## Mesure d'audience (`/analytics`)

Mesure sans bandeau, dans l'exemption de consentement de la CNIL (grille d'auto-évaluation de juillet 2025), envoyée au backend ContentGlows (`POST /a/collect`). Règles détaillées : `contentglows/shipglows_data/technical/lab/audience-measurement-cnil.md`.

```astro
---
import Analytics from "@shipglows/astro-engine/analytics/Analytics.astro";
---
<body>
  <slot />
  <Analytics endpoint="https://api.contentglows.com" pageType="article" author={post.author} category={post.category} />
</body>
```

- Mesuré : pages vues (type, auteur, catégorie, langue), profondeur de lecture, temps d'attention, temps de chargement, liens sortants, téléchargements, éléments `data-sg-track="libellé"`. `trackFeature("libellé")` (depuis `analytics/tracker`) pour un bouton d'îlot.
- Visiteur reconnu 13 mois (identifiant aléatoire first-party, jamais prolongé), session de 30 minutes : nouveaux/fidèles, parcours agrégés, pages qui font revenir.
- Jamais : chaîne de requête, formulaire, texte saisi, empreinte, rejeu de session ; référent réduit au domaine ; UTM seulement avec consentement.
- Opposition obligatoire dans la politique de confidentialité : `<AnalyticsOptOut locale="fr" />` (`analytics/AnalyticsOptOut.astro`). La politique doit aussi décrire la mesure.
- Bandeau (mode consenti, finalité marketing) : appeler `setAnalyticsConsent(true|false)` de `@shipglows/astro-engine/analytics` ; les UTM partent alors avec les pages vues. Choix valable 6 mois.
- Le domaine du site doit être un domaine de travail vérifié du projet ContentGlows ; remplace le script injecté `/a/s.js`.

## Installation dans un site

Dépendance git figée sur un commit (fonctionne sur Vercel) :

```json
"@shipglows/astro-engine": "git+https://github.com/dianedef/shipglows-astro-engine.git#<commit>"
```

En développement local, `link:../../shipglows-astro-engine` permet de modifier le kit et le site en même temps.

## Polices et barres de défilement (`/fonts.css`, `/base.css`)

Polices auto-hébergées (OFL), les mêmes que les apps Flutter (`shipglows_theme`) : Inter pour l'interface, Cal Sans pour les titres, JetBrains Mono pour le code.

- `fonts.css` déclare les polices et les variables `--sg-font-sans`, `--sg-font-display`, `--sg-font-mono`, sans rien appliquer.
- `base.css` l'inclut et pose les polices (`body`, `h1`–`h3`, `code`/`pre`) et des barres de défilement fines et arrondies, tirées de la couleur du texte.

```astro
---
import "@shipglows/astro-engine/base.css";
---
```

Tout se règle par variables : `--sg-scrollbar-size`, `--sg-scrollbar-thumb`, `--sg-scrollbar-thumb-hover`, `--sg-scrollbar-track`, et les trois `--sg-font-*`.

## Icônes de base (`/icons`)

Un nom par sens (`settings`, `search`, `close`, `quit`…), dessiné par Lucide ; les mêmes noms que `shipglows_icons` côté Flutter et que le modèle de menu.

```astro
---
import Icon from "@shipglows/astro-engine/icons/Icon.astro";
---
<Icon name="settings" />
<Icon name="help" label="Aide" size={24} />
<Icon name="settings" overrides={{ settings: "SlidersHorizontal" }} />
```

Décorative par défaut ; avec `label`, l'icône est annoncée. `shipglowsIcons` (dans `/icons`) donne la table complète nom → icône Lucide.

## Email (service central ShipGlows)

Formulaire d'inscription et client du service email central (CommandGlows). Le site ne détient aucun secret pour l'inscription publique : il poste vers le service, qui gère le double opt-in, la suppression et l'envoi. Le jeton serveur des séquences et des messages de service ne vit que dans le serveur du site.

| Import | Contenu | Où |
| --- | --- | --- |
| `@shipglows/astro-engine/email/NewsletterSignup.astro` | Formulaire d'inscription (progressive enhancement) | Rendu serveur, script navigateur inclus |
| `@shipglows/astro-engine/email` | Script navigateur : `initSubscribeForms`, `subscribeMessages`, helpers purs | Navigateur (importé par le composant) |
| `@shipglows/astro-engine/email/client` | `createCentralEmailClient` : messages de service et séquences | Serveur uniquement (porte un jeton) |

### Nouveau site : formulaire

Variables publiques du site (aucun secret) : `PUBLIC_EMAIL_SUBSCRIBE_URL` (`https://www.commandglows.com/api/v1/email/public/subscriptions`), `PUBLIC_EMAIL_BUSINESS_ID`, `PUBLIC_EMAIL_AUDIENCE_ID`. `Astro.site` doit être défini dans `astro.config`.

```astro
---
import NewsletterSignup from "@shipglows/astro-engine/email/NewsletterSignup.astro";
---
<NewsletterSignup
  endpoint={import.meta.env.PUBLIC_EMAIL_SUBSCRIBE_URL ?? ""}
  businessId={import.meta.env.PUBLIC_EMAIL_BUSINESS_ID}
  audienceId={import.meta.env.PUBLIC_EMAIL_AUDIENCE_ID}
  source="footer"
  locale="fr"
  returnTo={new URL("/merci/", Astro.site).href}
>
  <Fragment slot="consent">
    J’accepte de recevoir des e-mails de ce site. <a href="/confidentialite">Politique de confidentialité</a>.
  </Fragment>
</NewsletterSignup>
```

- `endpoint` vide : le formulaire est désactivé et affiche un message. Aucun appel n'est fait.
- `returnTo` : URL absolue sur une origine autorisée pour l'entreprise. Sans JavaScript, le service y redirige avec `?subscription=pending` ou `?subscription=error&reason=<code>`. Ce retour s'affiche avec le script, donc il n'apparaît pas sans JavaScript.
- `turnstileSiteKey` : clé publique Cloudflare, si l'entreprise exige Turnstile. Le secret reste côté CommandGlows. Turnstile exige JavaScript : sans script, le widget ne peut pas passer la vérification, donc le formulaire affiche un avertissement `<noscript>` au lieu d'un envoi qui échouerait.
- `consentLabel`, `submitLabel`, `idPrefix` (deux formulaires sur une page), `class`. Le slot `consent` accepte du HTML.
- Classes `sg-email-signup__*` ; couleurs par `--sg-email-error`, `--sg-email-success` et l'espace par `--sg-email-gap`. Sans elles, la couleur du texte.

Formulaire écrit à la main : mêmes attributs (`data-shipglows-subscribe`, `data-locale`, champs `business_id`, `audience_id`, `source`, `locale`, `email`, `consent`, `website`), un élément `[data-shipglows-status]` (`role="status"`, `tabindex="-1"`) et un `button[type="submit"]`. Puis, dans un script, `initSubscribeForms()`.

Textes : `initSubscribeForms({ messages: { fr: { pending: "…" } } })` pour un appel, ou modifier `subscribeMessages` avant l'envoi. Mapping des codes : `invalid_email`, `consent_required`, `captcha_failed`, `rate_limited` (et 429) ont leur message ; `forbidden_origin`, `public_subscribe_unavailable` et 403 disent « indisponible » ; `unavailable` et tout code inconnu disent « erreur générique » ; `invalid_input`, `unsupported_media_type`, `payload_too_large`, `method_not_allowed` disent « formulaire non envoyé » ; un échec réseau dit « serveur injoignable ».

### Serveur : client et séquences (cron)

Les séquences sont enregistrées dans la configuration centrale : le site envoie le contenu, jamais le calendrier. Une passe par jour suffit.

```ts
// src/pages/api/cron/sequences.ts (serveur uniquement)
import { createCentralEmailClient, CentralEmailError } from "@shipglows/astro-engine/email/client";

const client = createCentralEmailClient({
  baseUrl: process.env.CENTRAL_EMAIL_API_URL!, // https://www.commandglows.com
  token: process.env.CENTRAL_EMAIL_SEQUENCE_TOKEN!, // jeton serveur, jamais dans le navigateur
});

for (const step of STEPS) {
  const result = await client.runSequenceStep({
    businessId: "monsite",
    audienceId: "newsletter",
    sequenceId: "welcome",
    step: step.step,
    content: { fr: { subject: step.subject, blocks: step.blocks } },
  });
  // result : { step, pages, queued, skipped, complete, error? }. `error` est un code, jamais un détail.
}

// Message de service (compte, produit) : une clé stable par message, rejouée telle quelle en cas de retry.
try {
  const receipt = await client.sendServiceMessage(input, `export-${jobId}-v1`);
} catch (error) {
  if (error instanceof CentralEmailError) console.warn("service email", error.code);
}
```

- Chaque page est un appel ; `runSequenceStep` enchaîne les pages jusqu'à `complete`, avec une clé par page `<séquence>:<étape>:<AAAA-MM-JJ>:<first|hash>`. Rejouer le même jour renvoie les reçus d'origine.
- Budgets : 50 s par opération (`budgetMs`), 15 s par appel (`timeoutMs`), 100 pages par étape (`maxPages`), deux nouvelles tentatives sur 429 en respectant `Retry-After`.
- Erreurs : `CentralEmailError` porte un `code` (`invalid_config`, `invalid_input`, `timeout`, `network`, `rate_limited`, `invalid_receipt`, `cursor_stalled`, `budget_exhausted`, `http_error`, ou un code du service comme `unknown_sequence_step`). Le message est le code seul : ni adresse, ni identifiant de membre, ni jeton. `runSequenceStep` rend l'erreur dans `error` ; seule une entrée invalide lève une exception.
- Contenu vérifié avant tout envoi : sujet et préheader sur une ligne (200 et 300 caractères UTF-16), pas de `{{` ni `}}`, pas de contrôle ni de caractère bidi, 1 à 60 blocs à identifiants uniques, 4 000 caractères par bloc (20 000 pour `rich_text`).
- Environnement : `fetch` et Web Crypto seulement, donc Node, Vercel, edge ou action Convex. `fetch`, `now` et `sleep` sont injectables pour les tests.

### Prérequis opérateur (configuration centrale)

À déclarer dans `EMAIL_CONTROL_CONFIG` côté CommandGlows, avant toute inscription :

1. Entreprise `businesses[]` : identifiant, audiences (`purpose`, `noticeVersions`, `sources`).
2. Bloc `publicSubscribe` : `allowedOrigins` exacts (y compris l'origine de `returnTo`), `audiences`, `sources` si elles diffèrent de celles de l'audience, `turnstile: true` si exigé (avec `EMAIL_TURNSTILE_SECRET_KEY`, côté CommandGlows seulement).
3. Séquences `sequences[]` : `id` (`^[a-z0-9][a-z0-9_-]{0,63}$`), `maxLagDays` de 1 à 7, `steps` avec `dayOffset` strictement croissants.
4. Client `clients[]` : `businessIds`, `operations` (`subscribe`, `sequence_send`, `service_message` selon l'usage), `credentialEnv` désignant une variable d'au moins 32 caractères, présente côté serveur du site.
5. `EMAIL_SUPPRESSION_HASH_KEY` configurée côté CommandGlows : requise pour la pagination des séquences.

Détail : `shipglows_data/technical/central-email-api-contract.md` (sections « Public subscription », « Service messages » et « Sequence steps » du dépôt CommandGlows).

### Adoption optionnelle

Ces sites postent déjà vers le service central avec leurs formulaires locaux. Ils peuvent adopter ce module au prochain bump d'épingle du moteur :

- DreamGlows : `website/src/components/WaitlistForm.astro` ;
- ReplayGlows : `site/src/components/FollowUpdates.astro` ;
- ContentGlows : `site/holding/waitlist.js` ;
- JarreteLaCoke : `src/components/EmailCapture.vue`, `src/lib/guideDrip.ts` (séquence du guide).

### Tests

Node 24 (ou 22.18+) lit les `.ts` nativement ; aucun outil de build :

```
node --test tests/email/client.test.ts tests/email/subscribe.test.ts
```

Couvert : pagination et curseur, clés d'idempotence, 429 et `Retry-After`, budgets et délais, erreurs typées, validation du contenu avant envoi, absence d'adresse et de jeton dans les erreurs, mapping des codes publics, lecture du retour sans JavaScript. Non couvert : le comportement DOM du script et du composant, à vérifier dans un site réel.
