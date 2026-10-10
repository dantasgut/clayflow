import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));

/**
 * Alvo do alias `clayflow`: o barrel público do código-fonte ou, com `CLAYFLOW_DIST=1` (flag `--dist` do bench e
 * dos smokes), o build minificado publicado (`dist/index.js`).
 */
const clayflowEntry =
    process.env['CLAYFLOW_DIST'] === '1'
        ? resolve(here, '../dist/index.js')
        : resolve(here, '../src/index.ts');

/**
 * Servidor do harness: root em `bench/`, alias `clayflow` → barrel público da lib
 * (o harness mede o que o usuário obtém — FR-016). Porta fixa para o runner.
 */
export default defineConfig({
    root: here,
    resolve: { alias: { clayflow: clayflowEntry } },
    server: {
        port: 5180,
        strictPort: true,
        fs: { allow: [resolve(here, '..')] },
        // Isolamento cross-origin: `performance.now()` com resolução de µs em vez de 100 µs.
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        },
    },
    optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
    logLevel: 'warn',
});
