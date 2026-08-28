import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      name: 'preserve-test-import-meta-url',
      enforce: 'pre',
      transform(code, id) {
        const normalizedId = id.replaceAll('\\', '/');
        if (!normalizedId.includes('/tests/') || !/\.(?:test|spec)\.ts(?:\?.*)?$/u.test(normalizedId)) {
          return null;
        }

        // Evita que el entorno jsdom reescriba import.meta.url como una URL HTTP.
        return code.replace(/\bimport\.meta\.url\b/gu, 'String(import.meta.url)');
      },
    },
  ],
  test: {
    environment: 'jsdom',
    globals: false,
    passWithNoTests: false,
    clearMocks: true,
    restoreMocks: true,
    include: ['tests/**/*.{test,spec}.ts'],
  },
});
