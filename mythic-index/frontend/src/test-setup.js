// Global test setup for Karma/Jasmine
// Polyfill window.matchMedia.addListener/removeListener for Angular CDK
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: function (query) {
    var mql = {
      matches: false,
      media: query,
      onchange: null,
      addListener: function (fn) {
        try {
          mql.addEventListener('change', fn);
        } catch (e) {}
      },
      removeListener: function (fn) {
        try {
          mql.removeEventListener('change', fn);
        } catch (e) {}
      },
      addEventListener: function () {},
      removeEventListener: function () {},
      dispatchEvent: function () {
        return false;
      },
    };
    return mql;
  },
});

// Silence specific noisy warnings during tests
var originalWarn = console.warn.bind(console);
console.warn = function () {
  if (
    arguments.length &&
    typeof arguments[0] === 'string' &&
    arguments[0].indexOf('Falling back to legacy API') !== -1
  ) {
    return;
  }
  originalWarn.apply(null, arguments);
};
