import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, themeStore, type Theme } from "@/lib/theme";

const getServerSnapshot = (): Theme => DEFAULT_THEME;

/** Tema aktif + setter; tersinkron antar-komponen dan antar-tab. */
export function useTheme(): readonly [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getTheme,
    getServerSnapshot,
  );
  return [theme, themeStore.setTheme] as const;
}
