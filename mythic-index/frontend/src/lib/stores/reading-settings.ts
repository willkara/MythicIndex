import { browser } from '$app/environment';
import { writable } from 'svelte/store';

/** Available font size options for reading view */
export type FontSize = 'small' | 'medium' | 'large';

/** Available font family options for reading view */
export type FontFamily = 'sans' | 'serif';

/** Theme preference options */
export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * User's reading interface customization settings.
 *
 * Stores preferences for font size, font family, and color theme
 * to personalize the reading experience.
 */
export interface ReadingSettings {
  /** Text size preference */
  fontSize: FontSize;
  /** Font family preference */
  fontFamily: FontFamily;
  /** Color theme preference */
  theme: ThemePreference;
}

const STORAGE_KEY = 'mythic-reading-settings';

const defaultSettings: ReadingSettings = {
  fontSize: 'medium',
  fontFamily: 'sans',
  theme: 'system',
};

function loadSettings(): ReadingSettings {
  if (!browser) return defaultSettings;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch {
    // Invalid JSON, use defaults
  }
  return defaultSettings;
}

function saveSettings(settings: ReadingSettings): void {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or unavailable
  }
}

/**
 * Creates the reading settings store with persistence.
 *
 * @returns Reading settings store with setter methods
 */
function createReadingSettings() {
  const initial = loadSettings();
  const { subscribe, set, update } = writable<ReadingSettings>(initial);

  return {
    subscribe,

    /**
     * Sets the font size preference.
     * @param size - The desired font size
     */
    setFontSize: (size: FontSize) => {
      update(s => {
        const newSettings = { ...s, fontSize: size };
        saveSettings(newSettings);
        return newSettings;
      });
    },

    /**
     * Sets the font family preference.
     * @param family - The desired font family
     */
    setFontFamily: (family: FontFamily) => {
      update(s => {
        const newSettings = { ...s, fontFamily: family };
        saveSettings(newSettings);
        return newSettings;
      });
    },

    /**
     * Sets the color theme preference.
     * @param theme - The desired theme (light, dark, or system)
     */
    setTheme: (theme: ThemePreference) => {
      update(s => {
        const newSettings = { ...s, theme };
        saveSettings(newSettings);
        return newSettings;
      });
    },

    /**
     * Resets all settings to defaults.
     */
    reset: () => {
      set(defaultSettings);
      saveSettings(defaultSettings);
    },
  };
}

/**
 * Global reading settings store instance.
 *
 * Singleton store for tracking user's reading preferences.
 * Automatically persists to local storage.
 */
export const readingSettings = createReadingSettings();

/**
 * Maps font size preferences to Tailwind CSS classes.
 */
export const fontSizeClasses: Record<FontSize, string> = {
  small: 'text-base',
  medium: 'text-lg',
  large: 'text-xl',
};

/**
 * Gets the CSS class for a font size setting.
 *
 * @param size - The font size preference
 * @returns Tailwind CSS class name
 */
export function getFontSizeClass(size: FontSize): string {
  return fontSizeClasses[size] || fontSizeClasses.medium;
}

/**
 * Maps font family preferences to Tailwind CSS classes.
 */
export const fontFamilyClasses: Record<FontFamily, string> = {
  sans: 'font-sans',
  serif: 'font-serif',
};

/**
 * Gets the CSS class for a font family setting.
 *
 * @param family - The font family preference
 * @returns Tailwind CSS class name
 */
export function getFontFamilyClass(family: FontFamily): string {
  return fontFamilyClasses[family] || fontFamilyClasses.sans;
}
