import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));

/**
 * Servidor do harness: root em `bench/`, alias `clayflow` → barrel público da lib
 * (o harness mede o que o usuário obtém — FR-016). Porta fixa para o runner.
 */
export default defineConfig({
    root: here,
    resolve: { alias: { clayflow: resolve(here, '../src/index.ts') } },
    server: { port: 5180, strictPort: true, fs: { allow: [resolve(here, '..')] } },
    optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
    logLevel: 'warn',
});
