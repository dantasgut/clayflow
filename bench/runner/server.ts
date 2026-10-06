import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

/** Servidor Vite do harness (root `bench/`). */
export interface BenchServer {
    readonly url: string;
    close(): Promise<void>;
}

/** Sobe o Vite programaticamente com `bench/vite.config.ts` na porta pedida. */
export async function startServer(port: number): Promise<BenchServer> {
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
