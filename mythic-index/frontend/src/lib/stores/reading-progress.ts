import { browser } from '$app/environment';
import { writable } from 'svelte/store';

/**
 * Represents the last chapter the user was reading.
 *
 * Tracks the user's position within a chapter for resuming reading
 * and showing "continue reading" features.
 */
export interface LastChapter {
  /** URL slug of the chapter */
  slug: string;
  /** Display title of the chapter */
  title: string;
  /** Vertical scroll position as percentage (0-100) */
  scrollPercent: number;
  /** Unix timestamp when this position was saved */
  timestamp: number;
}

/**
 * User's reading progress across all chapters.
 *
 * Stores the last chapter being read and a list of completed chapters
 * for tracking reading history and progress through the narrative.
 */
export interface ReadingProgress {
  /** Most recently read chapter with scroll position */
  lastChapter: LastChapter | null;
  /** Slugs of chapters marked as completed */
  readChapters: string[];
}

/** Local storage key for persisting reading progress */
const STORAGE_KEY = 'mythic-reading-progress';

/** Default reading progress state */
const defaultProgress: ReadingProgress = {
  lastChapter: null,
  readChapters: [],
};

/**
 * Loads reading progress from browser local storage.
 *
 * @returns Stored progress or default state if unavailable or invalid
 */
function loadProgress(): ReadingProgress {
  if (!browser) return defaultProgress;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultProgress, ...JSON.parse(stored) };
    }
  } catch {
    // Invalid JSON, use defaults
  }
  return defaultProgress;
}

/**
 * Persists reading progress to browser local storage.
 *
 * @param progress - The progress state to save
 */
function saveProgress(progress: ReadingProgress): void {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage full or unavailable
  }
}

/**
 * Creates the reading progress store with persistence.
 *
 * Provides a Svelte writable store that automatically persists changes
 * to local storage. Includes methods for updating progress, marking
 * chapters as read, and querying read status.
 *
 * @returns Reading progress store with helper methods
 */
function createReadingProgress() {
  const initial = loadProgress();
  const { subscribe, set, update } = writable<ReadingProgress>(initial);

  return {
    subscribe,

    /**
     * Updates reading progress for a chapter.
     *
     * Records the current scroll position and timestamp for resume functionality.
     * Should be called with debouncing to avoid excessive storage writes.
     *
     * @param slug - The chapter's URL slug
     * @param title - The chapter's display title
     * @param scrollPercent - Current vertical scroll position (0-100)
     */
    updateProgress: (slug: string, title: string, scrollPercent: number) => {
      update(state => {
        const newState = {
          ...state,
          lastChapter: {
            slug,
            title,
            scrollPercent,
            timestamp: Date.now(),
          },
        };
        saveProgress(newState);
        return newState;
      });
    },

    /**
     * Marks a chapter as fully read.
     *
     * Typically called when the user scrolls past 80% of the chapter.
     * Prevents duplicate entries if already marked.
     *
     * @param slug - The chapter's URL slug
     */
    markAsRead: (slug: string) => {
      update(state => {
        if (state.readChapters.includes(slug)) {
          return state; // Already marked
        }
        const newState = {
          ...state,
          readChapters: [...state.readChapters, slug],
        };
        saveProgress(newState);
        return newState;
      });
    },

    /**
     * Checks if a chapter has been marked as read.
     *
     * @param slug - The chapter's URL slug
     * @returns True if the chapter has been completed
     */
    isRead: (slug: string): boolean => {
      const current = loadProgress();
      return current.readChapters.includes(slug);
    },

    /**
     * Clears all reading progress data.
     *
     * Resets both the last chapter and completed chapters list.
     */
    clear: () => {
      set(defaultProgress);
      saveProgress(defaultProgress);
    },

    /**
     * Clears only the last chapter marker.
     *
     * Removes the resume reading position while preserving the
     * completed chapters list. Useful when user finishes a chapter
     * or manually resets their position.
     */
    clearLastChapter: () => {
      update(state => {
        const newState = { ...state, lastChapter: null };
        saveProgress(newState);
        return newState;
      });
    },
  };
}

/**
 * Global reading progress store instance.
 *
 * Singleton store for tracking user's reading progress across the application.
 * Automatically persists to local storage.
 */
export const readingProgress = createReadingProgress();

/**
 * Creates a debounced version of updateProgress.
 *
 * Returns a function that delays calling updateProgress until after the
 * specified delay has elapsed since the last call. Useful for throttling
 * scroll event handlers to avoid excessive storage writes.
 *
 * @param delayMs - Debounce delay in milliseconds (default: 1000)
 * @returns Debounced update function
 *
 * @example
 * ```typescript
 * const updateProgress = createDebouncedProgressUpdate(500);
 * // In scroll handler:
 * updateProgress(slug, title, scrollPercent);
 * ```
 */
export function createDebouncedProgressUpdate(delayMs: number = 1000) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (slug: string, title: string, scrollPercent: number) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      readingProgress.updateProgress(slug, title, scrollPercent);
      timeoutId = null;
    }, delayMs);
  };
}
