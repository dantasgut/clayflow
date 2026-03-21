import { defineConfig } from 'vite';
import { resolve }      from 'path';
import dts              from 'vite-plugin-dts';

export default defineConfig({
    // ── Modo desenvolvimento (vite dev) ─────────────────────────────────────
    // Nenhuma config especial — usa index.html + src/main.ts normalmente.

    // ── Modo biblioteca (vite build) ────────────────────────────────────────
    build: {
        lib: {
            entry:    resolve(__dirname, 'src/index.ts'),
            name:     'WebGPUEngine',
            formats:  ['es'],           // ESM puro — WebGPU só roda no browser
            fileName: () => 'index.js',
        },

        rollupOptions: {
            // gl-matrix e uuid ficam como peer deps: o projeto consumidor os fornece
            external: ['gl-matrix', 'uuid'],
        },

        // Gera source maps para facilitar debug no projeto consumidor
        sourcemap: true,

        // Limpa dist/ antes de cada build
        emptyOutDir: true,
    },

    plugins: [
        dts({
            // Gera os .d.ts a partir de todo src/, exceto a demo e os exemplos
            include: ['src'],
            exclude: ['src/main.ts', 'src/examples/**'],
            // Coloca tudo em dist/
            outDir:  'dist',
        }),
    ],
});
