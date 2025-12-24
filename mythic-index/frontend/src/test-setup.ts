/**
 * Global test setup for Karma/Jasmine test framework
 * Provides polyfills and mocks for browser APIs needed in test environment
 */

/**
 * Polyfill window.matchMedia with addListener/removeListener for compatibility
 * with Angular CDK BreakpointObserver which still uses the legacy API in some environments
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => {
    const mql = {
      matches: false,
      media: query,
      onchange: null as any,
      addListener: (fn: EventListenerOrEventListenerObject) => {
        // Legacy API: alias to addEventListener
        try {
          (mql as any).addEventListener('change', fn as any);
        } catch (e) {
          // ignore
        }
      },
      removeListener: (fn: EventListenerOrEventListenerObject) => {
        try {
          (mql as any).removeEventListener('change', fn as any);
        } catch (e) {
          // ignore
        }
      },
      addEventListener: (_: string, __: EventListenerOrEventListenerObject) => {},
      removeEventListener: (_: string, __: EventListenerOrEventListenerObject) => {},
      dispatchEvent: (_: Event) => false,
    };

    return mql;
  },
});

/**
 * Optional console filtering to silence noisy test warnings
 * Suppresses "Falling back to legacy API" warnings from test output
 */
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].includes('Falling back to legacy API')) {
    return;
  }
  originalWarn.apply(console, args as any);
};
