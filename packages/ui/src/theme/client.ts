import { applyThemeAxis, storageKey, type ThemeConfig } from "./index";

/**
 * Contrôles sans style : chaque site garde son HTML et son CSS, il ajoute seulement ces attributs.
 *
 * - `<select data-theme-axis="theme">` : choisit une valeur de l'axe.
 * - `<button data-theme-axis="mode" data-theme-pressed="light">` :
 *   passe à la valeur suivante ; `aria-pressed` vaut true quand l'axe vaut `data-theme-pressed`.
 * - `<button data-theme-axis="theme" data-theme-value="gold">` : force une valeur précise.
 *
 * Chaque changement émet `shipglows:theme-change` sur `document` (detail : { axis, value, source }).
 */
export function bindThemeControls(config: ThemeConfig, scope: ParentNode = document): void {
  scope.querySelectorAll<HTMLElement>("[data-theme-axis]").forEach((control) => bindThemeControl(config, control));
}

const boundControls = new WeakSet<HTMLElement>();

/** Branche un seul contrôle ; sans effet s'il est déjà branché. */
export function bindThemeControl(config: ThemeConfig, control: HTMLElement): void {
  const axisName = control.dataset.themeAxis ?? "";
  if (!config.axes[axisName] || boundControls.has(control)) return;
  boundControls.add(control);

  if (control instanceof HTMLSelectElement) {
    control.addEventListener("change", () => setThemeAxis(config, axisName, control.value));
  } else {
    control.addEventListener("click", () => {
      const value = control.dataset.themeValue ?? nextValue(config, axisName);
      setThemeAxis(config, axisName, value);
    });
  }

  const sync = () => syncThemeControl(config, control);
  document.addEventListener("shipglows:theme-change", sync);
  watchSystemScheme(config);
  sync();
}

export function getThemeAxis(config: ThemeConfig, axisName: string): string {
  const axis = config.axes[axisName];
  const root = document.documentElement;
  if (axis.attribute) return root.dataset[axis.attribute] ?? axis.default;

  const classes = axis.classes ?? {};
  const active = Object.keys(classes).find((value) => root.classList.contains(classes[value]));
  return active ?? axis.values.find((value) => !(value in classes)) ?? axis.default;
}

export function setThemeAxis(config: ThemeConfig, axisName: string, value: string): void {
  const axis = config.axes[axisName];
  const next = axis.values.includes(value) ? value : axis.default;
  applyThemeAxis(document.documentElement, axis, next);
  try {
    localStorage.setItem(storageKey(config, axisName), next);
  } catch {}
  dispatchThemeChange(axisName, next, "user");
}

function dispatchThemeChange(axis: string, value: string, source: "user" | "system"): void {
  document.dispatchEvent(new CustomEvent("shipglows:theme-change", { detail: { axis, value, source } }));
}

const watchedConfigs = new Set<string>();

/** Sans choix mémorisé, un axe `followSystem` suit les changements du réglage système en direct. */
function watchSystemScheme(config: ThemeConfig): void {
  if (watchedConfigs.has(config.storagePrefix)) return;
  watchedConfigs.add(config.storagePrefix);

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
    for (const [name, axis] of Object.entries(config.axes)) {
      if (!axis.followSystem) continue;
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(storageKey(config, name));
      } catch {}
      if (saved && axis.values.includes(saved)) continue;
      const value = event.matches ? "dark" : "light";
      applyThemeAxis(document.documentElement, axis, value);
      dispatchThemeChange(name, value, "system");
    }
  });
}

function nextValue(config: ThemeConfig, axisName: string): string {
  const { values } = config.axes[axisName];
  return values[(values.indexOf(getThemeAxis(config, axisName)) + 1) % values.length];
}

function syncThemeControl(config: ThemeConfig, control: HTMLElement): void {
  const current = getThemeAxis(config, control.dataset.themeAxis ?? "");

  if (control instanceof HTMLSelectElement) {
    control.value = current;
  } else if (control.dataset.themeValue) {
    control.setAttribute("aria-pressed", String(control.dataset.themeValue === current));
  } else if (control.dataset.themePressed) {
    control.setAttribute("aria-pressed", String(control.dataset.themePressed === current));
  }
}
