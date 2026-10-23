/**
 * Un axe de thème = un attribut `data-*` et/ou des classes sur <html>, mémorisé dans localStorage.
 * Exemples : la palette (green/neon/gold), le mode (light/dark), une option (glow on/off).
 */
export interface ThemeAxis {
  /** Nom de la clé `dataset` posée sur <html> (`siteTheme` → `data-site-theme`). */
  attribute?: string;
  /** Classe posée sur <html> pour chaque valeur, ex. `{ dark: "dark" }` pour Tailwind. */
  classes?: Record<string, string>;
  /** Valeurs acceptées ; toute autre valeur stockée est ignorée. */
  values: readonly string[];
  /** Valeur utilisée sans choix mémorisé. */
  default: string;
  /** Sans choix mémorisé, suivre `prefers-color-scheme` (l'axe doit contenir `light` et `dark`). */
  followSystem?: boolean;
  /** Recopier la valeur dans `color-scheme` (axe light/dark uniquement). */
  colorScheme?: boolean;
}

export interface ThemeConfig {
  /** Préfixe des clés localStorage : `<prefix>-<axe>`. */
  storagePrefix: string;
  axes: Record<string, ThemeAxis>;
}

export function defineThemeConfig<const T extends ThemeConfig>(config: T): T {
  for (const [name, axis] of Object.entries(config.axes)) {
    if (!axis.attribute && !axis.classes) {
      throw new Error(`Thème : l'axe « ${name} » doit définir attribute ou classes.`);
    }
    if (!axis.values.includes(axis.default)) {
      throw new Error(`Thème : la valeur par défaut « ${axis.default} » de l'axe « ${name} » n'est pas dans values.`);
    }
  }
  return config;
}

export function storageKey(config: ThemeConfig, axisName: string): string {
  return `${config.storagePrefix}-${axisName}`;
}

/** Attributs `data-*` initiaux à poser sur <html> côté serveur, avant le script anti-flash. */
export function themeAttributes(config: ThemeConfig): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const axis of Object.values(config.axes)) {
    if (axis.attribute) attributes[`data-${toKebab(axis.attribute)}`] = axis.default;
  }
  return attributes;
}

/** Pose la valeur d'un axe sur <html> (attribut, classes, color-scheme). */
export function applyThemeAxis(root: HTMLElement, axis: ThemeAxis, value: string): void {
  if (axis.attribute) root.dataset[axis.attribute] = value;
  for (const [axisValue, className] of Object.entries(axis.classes ?? {})) {
    root.classList.toggle(className, axisValue === value);
  }
  if (axis.colorScheme) root.style.colorScheme = value;
}

function toKebab(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
