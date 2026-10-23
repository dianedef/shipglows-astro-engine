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

## Installation dans un site

Dépendance git figée sur un commit (fonctionne sur Vercel) :

```json
"@shipglows/astro-engine": "git+https://github.com/dianedef/shipglows-astro-engine.git#<commit>"
```

En développement local, `link:../../shipglows-astro-engine` permet de modifier le kit et le site en même temps.
