import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        globals: false,
        setupFiles: ['src/__tests__/setup.ts'],
        include: ['src/**/__tests__/**/*.test.ts'],
        exclude: ['src/legacy/**', 'src/**/__tests__/browser/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json'],
            include: ['src/core/**/*.ts', 'src/scene/**/*.ts'],
            exclude: ['src/**/__tests__/**', 'src/**/index.ts'],
            thresholds: {
                lines: 60,
                functions: 60,
                branches: 50,
                statements: 60,
            },
        },
    },
});
