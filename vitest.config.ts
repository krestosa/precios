import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    passWithNoTests: false,
    clearMocks: true,
    restoreMocks: true,
    include: ['tests/**/*.{test,spec}.ts'],
  },
});
