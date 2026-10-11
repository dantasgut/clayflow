import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { EnvironmentError } from './browser';

/** Servidor Vite do harness (root `bench/`). */
export interface BenchServer {
    readonly url: string;
    close(): Promise<void>;
}

/** Opções do servidor do harness. */
export interface ServerOptions {
    /**
     * Resolve `clayflow` para o build minificado (`dist/index.js`) em vez do código-fonte. A escolha chega ao
     * `bench/vite.config.ts` pela variável de ambiente `CLAYFLOW_DIST`.
     */
    readonly dist?: boolean;
}

/** Sobe o Vite programaticamente com `bench/vite.config.ts` na porta pedida. */
export async function startServer(port: number, options: ServerOptions = {}): Promise<BenchServer> {
    if (options.dist === true) {
        const dist = fileURLToPath(new URL('../../dist/index.js', import.meta.url));
        if (!existsSync(dist)) {
            throw new EnvironmentError(
                'build minificado ausente (dist/index.js) — rode `npm run build:lib` antes de usar --dist.',
            );
        }
        process.env.CLAYFLOW_DIST = '1';
    } else {
        delete process.env.CLAYFLOW_DIST;
    }
    const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url));
    const server: ViteDevServer = await createServer({
        configFile,
        server: { port, strictPort: true },
    });
    await server.listen();
    return {
        url: `http://localhost:${port}/`,
        close: () => server.close(),
    };
}
