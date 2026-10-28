import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
    // ── Modo desenvolvimento (vite dev) ─────────────────────────────────────
    // Nenhuma config especial — usa index.html + src/main.ts normalmente.

    // ── Modo biblioteca (vite build) ────────────────────────────────────────
    build: {
        // Três entradas (spec 038): o núcleo e os pontos de entrada do navegador e do Deno; o código comum vai em
        // pedaços compartilhados. Os shaders `?raw` saem embutidos (o Deno usa o `dist/` como está).
        lib: {
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                web: resolve(__dirname, 'src/platform/web/index.ts'),
                deno: resolve(__dirname, 'src/platform/deno/index.ts'),
            },
            formats: ['es'],
            fileName: (_format, name) => `${name}.js`,
        },

        rollupOptions: {
            // gl-matrix e uuid ficam como peer deps: o projeto consumidor os fornece
            external: ['gl-matrix', 'uuid'],
            // O código comum às três entradas num pedaço só, com nome de motor (não o do primeiro módulo dele).
            output: { chunkFileNames: 'clayflow-[hash].js' },
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
            outDir: 'dist',
        }),
    ],
});
