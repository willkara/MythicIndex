/**
 * Intersection Observer utilities for lazy loading and visibility detection.
 *
 * Provides efficient element visibility detection using a shared
 * IntersectionObserver instance to minimize performance overhead.
 * Includes both direct observation API and Svelte action.
 */

/** Callback function invoked when element intersection state changes */
type IntersectionCallback = (isIntersecting: boolean) => void;

/** Internal tracking structure for observed elements */
interface ObserverEntry {
  callback: IntersectionCallback;
}

/** Shared IntersectionObserver instance for all lazy-loaded elements */
let sharedObserver: IntersectionObserver | null = null;

/** Map tracking all currently observed elements and their callbacks */
const observedElements = new Map<Element, ObserverEntry>();

/**
 * Gets or creates the shared IntersectionObserver instance.
 *
 * Lazily creates a singleton observer configured for lazy loading:
 * - 100px rootMargin: Start loading before element enters viewport
 * - threshold 0: Trigger as soon as any part becomes visible
 *
 * @returns The shared IntersectionObserver instance
 */
function getSharedObserver(): IntersectionObserver {
  if (sharedObserver) return sharedObserver;

  sharedObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        const observed = observedElements.get(entry.target);
        if (observed) {
          observed.callback(entry.isIntersecting);
        }
      }
    },
    {
      // Start loading when element is 100px from viewport
      rootMargin: '100px',
      threshold: 0,
    }
  );

  return sharedObserver;
}

/**
 * Observes an element for intersection with the viewport.
 *
 * Starts observing the element using the shared IntersectionObserver.
 * The callback is invoked whenever the element's visibility changes.
 * Returns a cleanup function that should be called when observation
 * is no longer needed.
 *
 * @param element - The DOM element to observe
 * @param callback - Function called when intersection state changes
 * @returns Cleanup function to stop observing and free resources
 *
 * @example
 * ```typescript
 * const cleanup = observeIntersection(imageElement, (isVisible) => {
 *   if (isVisible) loadImage();
 * });
 * // Later: cleanup();
 * ```
 */
export function observeIntersection(element: Element, callback: IntersectionCallback): () => void {
  const observer = getSharedObserver();

  observedElements.set(element, { callback });
  observer.observe(element);

  return () => {
    observer.unobserve(element);
    observedElements.delete(element);

    // Clean up shared observer if no more elements
    if (observedElements.size === 0 && sharedObserver) {
      sharedObserver.disconnect();
      sharedObserver = null;
    }
  };
}

/**
 * Svelte action for lazy loading with intersection observer.
 *
 * Automatically observes an element and calls the provided callback
 * when it becomes visible. Automatically unobserves after first
 * visibility to optimize performance for lazy loading scenarios.
 *
 * Integrates with Svelte's action system for declarative usage.
 *
 * @param node - The HTML element to observe
 * @param onIntersect - Optional callback invoked when element becomes visible
 * @returns Svelte action lifecycle methods (update, destroy)
 *
 * @example
 * ```svelte
 * <script>
 *   import { lazyLoad } from '$lib/utils/use-intersection-observer';
 *   function loadContent() {
 *     console.log('Element is visible!');
 *   }
 * </script>
 *
 * <div use:lazyLoad={loadContent}>
 *   Content to lazy load
 * </div>
 * ```
 */
export function lazyLoad(
  node: HTMLElement,
  onIntersect?: () => void
): { destroy: () => void; update: (newCallback?: () => void) => void } {
  let callback = onIntersect;

  const unobserve = observeIntersection(node, isIntersecting => {
    if (isIntersecting) {
      callback?.();
      // Once visible, stop observing
      unobserve();
    }
  });

  return {
    update(newCallback?: () => void) {
      callback = newCallback;
    },
    destroy: unobserve,
  };
}
