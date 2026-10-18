/**
 * Preferensi tema per perangkat (Terang/Gelap).
 *
 * Aturan:
 * - Default SELALU Terang. Preferensi OS (`prefers-color-scheme`) sengaja tidak
 *   dibaca dan tidak didengarkan; hanya nilai tersimpan `"dark"` yang memilih
 *   mode gelap. Nilai lain/rusak/tidak tersedia = Terang.
 * - Disimpan di localStorage (`kalkulator-pajak.theme`), bukan data pengguna.
 * - Bila storage tidak tersedia/melempar, state tetap berlaku di tab ini
 *   (fallback memori) tanpa error.
 * - Perubahan di tab lain disinkronkan via event `storage`; `localStorage.clear()`
 *   (key `null`) mengembalikan ke Terang.
 *
 * Modul ini murni (tanpa React) agar dapat diuji di Node dengan DOM tiruan.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "kalkulator-pajak.theme";
export const DEFAULT_THEME: Theme = "light";

/** Hanya `"dark"` eksplisit yang memilih mode gelap. */
export function resolveTheme(value: unknown): Theme {
  return value === "dark" ? "dark" : DEFAULT_THEME;
}

export interface ThemeStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ThemeRootLike {
  classList: { toggle(token: string, force?: boolean): boolean };
  style: { colorScheme: string };
}

export interface ThemeStorageEventLike {
  key: string | null;
  newValue: string | null;
  storageArea?: unknown;
}

export interface ThemeEventTargetLike {
  addEventListener(type: "storage", listener: (event: ThemeStorageEventLike) => void): void;
  removeEventListener(type: "storage", listener: (event: ThemeStorageEventLike) => void): void;
}

export interface ThemeEnvironment {
  /** Dipanggil sekali; boleh melempar (mis. SecurityError) atau mengembalikan null. */
  getStorage: () => ThemeStorageLike | null;
  root: ThemeRootLike | null;
  events: ThemeEventTargetLike | null;
}

/** Terapkan kelas eksplisit `.light`/`.dark` dan `color-scheme` pada root. */
export function applyTheme(root: ThemeRootLike | null, theme: Theme): void {
  if (!root) return;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme !== "dark");
  root.style.colorScheme = theme;
}

export interface ThemeStore {
  /** Idempoten: membaca storage, menerapkan ke root, dan memasang listener sekali. */
  init(): Theme;
  getTheme(): Theme;
  setTheme(theme: Theme): void;
  subscribe(listener: () => void): () => void;
  /** Lepas listener (untuk pengujian). */
  dispose(): void;
}

export function createThemeStore(env: ThemeEnvironment): ThemeStore {
  let theme: Theme = DEFAULT_THEME;
  let initialized = false;
  let storageResolved = false;
  let storage: ThemeStorageLike | null = null;
  const listeners = new Set<() => void>();

  function getStorage(): ThemeStorageLike | null {
    if (!storageResolved) {
      storageResolved = true;
      try {
        storage = env.getStorage();
      } catch {
        storage = null;
      }
    }
    return storage;
  }

  function readStored(): Theme {
    try {
      return resolveTheme(getStorage()?.getItem(THEME_STORAGE_KEY));
    } catch {
      return DEFAULT_THEME;
    }
  }

  function commit(next: Theme) {
    const changed = next !== theme;
    theme = next;
    applyTheme(env.root, theme);
    if (changed) listeners.forEach((listener) => listener());
  }

  function handleStorage(event: ThemeStorageEventLike) {
    // key null = storage dibersihkan (clear) → kembali ke Terang.
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    const area = getStorage();
    if (area && event.storageArea !== undefined && event.storageArea !== area) return;
    commit(event.key === null ? DEFAULT_THEME : resolveTheme(event.newValue));
  }

  return {
    init() {
      if (initialized) return theme;
      initialized = true;
      theme = readStored();
      applyTheme(env.root, theme);
      env.events?.addEventListener("storage", handleStorage);
      return theme;
    },
    getTheme: () => theme,
    setTheme(next) {
      const resolved = resolveTheme(next);
      try {
        getStorage()?.setItem(THEME_STORAGE_KEY, resolved);
      } catch {
        // Kuota/mode privat: tetap berlaku di tab ini (fallback memori).
      }
      commit(resolved);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      env.events?.removeEventListener("storage", handleStorage);
      listeners.clear();
      initialized = false;
    },
  };
}

function browserEnvironment(): ThemeEnvironment {
  const win = typeof window !== "undefined" ? window : null;
  return {
    getStorage: () => win?.localStorage ?? null,
    root: typeof document !== "undefined" ? document.documentElement : null,
    events: win as ThemeEventTargetLike | null,
  };
}

/** Store tunggal aplikasi (browser). */
export const themeStore: ThemeStore = createThemeStore(browserEnvironment());

/** Bootstrap sekali sebelum React render (lihat `src/theme-init.ts`). */
export function initTheme(): Theme {
  return themeStore.init();
}
