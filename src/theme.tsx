import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PREFS_EVENT, readPref, writePref } from "./lib/prefs";
import { THEMES, themeById, type ThemeName } from "./lib/themes";

/** What the user picked. "system" follows the OS. */
export type ThemeMode = "system" | ThemeName;

const THEME_KEY = "somas.theme";
const THEME_PREF = "theme";

interface ThemeValue {
  mode: ThemeMode;
  resolved: ThemeName;
  /** Only the two palettes logos are prepared for: bright or dark page. */
  family: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function systemTheme(): ThemeName {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "black";
}

function isMode(value: string | null): value is ThemeMode {
  return value === "system" || Boolean(value && themeById(value));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = readPref(THEME_PREF, THEME_KEY);
    return isMode(stored) ? stored : "system";
  });
  const [system, setSystem] = useState<ThemeName>(systemTheme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const listener = () => setSystem(media.matches ? "light" : "black");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  // Preferences belong to one Music Assistant server, so pick up the theme of whichever server
  // the store just pointed at instead of keeping the previous one's colours. Subscribed in a
  // layout effect so it is listening before the store's own connect effect changes the scope.
  useLayoutEffect(() => {
    const sync = () => {
      const stored = readPref(THEME_PREF, THEME_KEY);
      setModeState(isMode(stored) ? stored : "system");
    };
    window.addEventListener(PREFS_EVENT, sync);
    return () => window.removeEventListener(PREFS_EVENT, sync);
  }, []);

  const resolved: ThemeName = mode === "system" ? system : mode;
  const definition = themeById(resolved) ?? THEMES[0];
  const family: "light" | "dark" = definition.family === "Light" ? "light" : "dark";

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = definition.id;
    root.dataset.family = family;
    root.style.colorScheme = family;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", definition.background);
  }, [definition, family]);

  const setMode = useCallback((next: ThemeMode) => {
    writePref(THEME_PREF, next);
    setModeState(next);
  }, []);

  const value = useMemo(
    () => ({ mode, resolved: definition.id, family, setMode }),
    [mode, definition.id, family, setMode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
