import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
import {playwright} from '@vitest/browser-playwright';

export default defineConfig({
  server: {host: '127.0.0.1'},
  plugins: [react()],
  optimizeDeps: {include: ['react', 'react-dom/client', 'react-icons/fa6', '@clerk/react']},
  define: {__APP_RELEASE__: JSON.stringify('browser-coverage'), __APP_ENVIRONMENT__: JSON.stringify('test')},
  test: {
    include: ['tests/browser/**/*.test.jsx'],
    browser: {enabled: true, headless: true, provider: playwright({
      launchOptions: process.env.DBM_CHROMIUM_EXECUTABLE ? {executablePath: process.env.DBM_CHROMIUM_EXECUTABLE} : undefined,
    }), instances: [{browser: 'chromium'}]},
    coverage: {
      enabled: true, provider: 'v8', include: ['src/**/*.{js,jsx}'], exclude: [],
      reporter: ['json', 'json-summary', 'text'], reportsDirectory: 'test-results/coverage-browser',
    },
  },
});
