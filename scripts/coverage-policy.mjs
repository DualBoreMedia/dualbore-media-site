// Keep every application module in the denominator, including files not imported
// by Node tests. Browser and provider evidence is reported separately; it must
// never be represented as unit coverage without collected instrumentation.
export const coveragePolicy = Object.freeze({
  all: true,
  include: ['netlify/**/*.{js,mjs}', 'src/**/*.{js,jsx}', 'worker/**/*.js', 'scripts/*.mjs'],
  exclude: ['scripts/coverage-policy.mjs', 'scripts/run-coverage.mjs', 'scripts/test-inventory.mjs', 'scripts/run-browser-qa.mjs', 'scripts/mutation-loader.mjs', 'scripts/run-mutation-checks.mjs'],
  extension: ['.js', '.mjs', '.jsx'],
  reporter: ['text', 'html', 'lcov', 'json', 'json-summary'],
  'reports-dir': 'test-results/coverage',
  'check-coverage': true,
  lines: 90,
  statements: 90,
  functions: 90,
  branches: 85,
});
