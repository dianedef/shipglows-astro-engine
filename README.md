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

## Installation dans un site

Dépendance git figée sur un commit (fonctionne sur Vercel) :

```json
"@shipglows/astro-engine": "git+https://github.com/dianedef/shipglows-astro-engine.git#<commit>"
```

En développement local, `link:../../shipglows-astro-engine` permet de modifier le kit et le site en même temps.
