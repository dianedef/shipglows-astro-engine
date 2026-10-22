import { storageKey, type ThemeConfig } from "./index";

/**
 * Contrôles sans style : chaque site garde son HTML et son CSS, il ajoute seulement ces attributs.
 *
 * - `<select data-theme-axis="theme">` : choisit une valeur de l'axe.
 * - `<button data-theme-axis="mode" data-theme-toggle data-theme-pressed="light">` :
 *   passe à la valeur suivante ; `aria-pressed` vaut true quand l'axe vaut `data-theme-pressed`.
 * - `<button data-theme-axis="theme" data-theme-value="gold">` : force une valeur précise.
 *
 * Chaque changement émet `shipglows:theme-change` sur `document` (detail : { axis, value }).
 */
export function bindThemeControls(config: ThemeConfig, scope: ParentNode = document): void {
  const controls = scope.querySelectorAll<HTMLElement>("[data-theme-axis]");

  controls.forEach((control) => {
    const axisName = control.dataset.themeAxis ?? "";
    if (!config.axes[axisName]) return;

    if (control instanceof HTMLSelectElement) {
      control.addEventListener("change", () => setThemeAxis(config, axisName, control.value));
    } else {
      control.addEventListener("click", () => {
        const value = control.dataset.themeValue ?? nextValue(config, axisName);
        setThemeAxis(config, axisName, value);
      });
    }
  });

  const sync = () => syncThemeControls(config, scope);
  document.addEventListener("shipglows:theme-change", sync);
  sync();
}

export function getThemeAxis(config: ThemeConfig, axisName: string): string {
  const axis = config.axes[axisName];
  return document.documentElement.dataset[axis.attribute] ?? axis.default;
}

export function setThemeAxis(config: ThemeConfig, axisName: string, value: string): void {
  const axis = config.axes[axisName];
  const next = axis.values.includes(value) ? value : axis.default;
  const root = document.documentElement;
  root.dataset[axis.attribute] = next;
  if (axis.colorScheme) root.style.colorScheme = next;
  try {
    localStorage.setItem(storageKey(config, axisName), next);
  } catch {}
  document.dispatchEvent(new CustomEvent("shipglows:theme-change", { detail: { axis: axisName, value: next } }));
}

function nextValue(config: ThemeConfig, axisName: string): string {
  const { values } = config.axes[axisName];
  return values[(values.indexOf(getThemeAxis(config, axisName)) + 1) % values.length];
}

function syncThemeControls(config: ThemeConfig, scope: ParentNode): void {
  scope.querySelectorAll<HTMLElement>("[data-theme-axis]").forEach((control) => {
    const axisName = control.dataset.themeAxis ?? "";
    if (!config.axes[axisName]) return;
    const current = getThemeAxis(config, axisName);

    if (control instanceof HTMLSelectElement) {
      control.value = current;
    } else if (control.dataset.themeValue) {
      control.setAttribute("aria-pressed", String(control.dataset.themeValue === current));
    } else if (control.dataset.themePressed) {
      control.setAttribute("aria-pressed", String(control.dataset.themePressed === current));
    }
  });
}
