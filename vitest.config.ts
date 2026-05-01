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
            // Thresholds globais conservadores (GPU code requer device real para testar).
            // Para áreas de lógica pura (scene/world, scene/lifecycle, scene/flows),
            // aplicamos thresholds maiores via globs específicos.
            thresholds: {
                lines: 35,
                functions: 30,
                branches: 15,
                statements: 35,
                // Áreas com alta cobertura de tests unitários — manter acima.
                'src/scene/world/**': {
                    lines: 85,
                    functions: 85,
                    branches: 60,
                    statements: 85,
                },
                'src/scene/lifecycle/**': {
                    lines: 85,
                    functions: 90,
                    branches: 45,
                    statements: 85,
                },
                'src/scene/flows/**': {
                    lines: 70,
                    functions: 60,
                    branches: 60,
                    statements: 70,
                },
            },
        },
    },
});
