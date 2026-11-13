/**
 * Every palette the app ships. Kept in one place so the picker, the browser chrome colour and
 * the theme family (which decides how logos are prepared) all come from the same list.
 *
 * Adding a theme means an entry here plus a matching `:root[data-theme="<id>"]` block in
 * styles.css.
 */

export type ThemeName =
  | "black"
  | "dark"
  | "graphite"
  | "slate"
  | "midnight"
  | "ocean"
  | "forest"
  | "espresso"
  | "plum"
  | "light"
  | "paper"
  | "sepia"
  | "mint"
  | "ice"
  | "blossom";

export type ThemeFamily = "Dark" | "Light";

export interface ThemeDefinition {
  id: ThemeName;
  label: string;
  family: ThemeFamily;
  /** Page colour, also used as the browser chrome colour. */
  background: string;
  /** Primary action colour, shown as a dot on the picker swatch. */
  accent: string;
}

export const THEMES: ThemeDefinition[] = [
  { id: "black", label: "Black", family: "Dark", background: "#000000", accent: "#ffffff" },
  { id: "dark", label: "Dark", family: "Dark", background: "#121214", accent: "#f2f2f4" },
  { id: "graphite", label: "Graphite", family: "Dark", background: "#161616", accent: "#d0d0d0" },
  { id: "slate", label: "Slate", family: "Dark", background: "#191d24", accent: "#9fb8e0" },
  { id: "midnight", label: "Midnight", family: "Dark", background: "#0a1020", accent: "#6b9bff" },
  { id: "ocean", label: "Ocean", family: "Dark", background: "#062229", accent: "#46d6c4" },
  { id: "forest", label: "Forest", family: "Dark", background: "#0c1a12", accent: "#6fd39a" },
  { id: "espresso", label: "Espresso", family: "Dark", background: "#1a120c", accent: "#d9a066" },
  { id: "plum", label: "Plum", family: "Dark", background: "#150f21", accent: "#b98bff" },
  { id: "light", label: "White", family: "Light", background: "#ffffff", accent: "#0a0a0a" },
  { id: "paper", label: "Paper", family: "Light", background: "#f7f5f0", accent: "#4a6b8a" },
  { id: "sepia", label: "Sepia", family: "Light", background: "#f6efe3", accent: "#a8702a" },
  { id: "mint", label: "Mint", family: "Light", background: "#eff7f2", accent: "#2f855a" },
  { id: "ice", label: "Ice", family: "Light", background: "#eef2f8", accent: "#3b6ea5" },
  { id: "blossom", label: "Blossom", family: "Light", background: "#fdf0f4", accent: "#b8477a" },
];

export const THEME_FAMILIES: ThemeFamily[] = ["Dark", "Light"];

export function themesIn(family: ThemeFamily): ThemeDefinition[] {
  return THEMES.filter((theme) => theme.family === family);
}

export function themeById(id: string): ThemeDefinition | undefined {
  return THEMES.find((theme) => theme.id === id);
}
