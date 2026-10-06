import { chromium, type Browser } from 'playwright';

/** Erro de ambiente: o runner termina cedo com exit 3 (`contracts/cli.md`). */
export class EnvironmentError extends Error {
    override readonly name = 'EnvironmentError';
}

/**
 * Flags do Chrome: WebGPU, sem vsync nem limite de quadros (FPS comparável — R3) e sem
 * estrangular a página em segundo plano (rAF continua com a janela atrás de outras).
 */
export const CHROME_ARGS = [
    '--enable-unsafe-webgpu',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
] as const;

/** Navegador conectado + encerramento garantido do processo. */
export interface LaunchedBrowser {
    readonly browser: Browser;
    /**
     * Fecha o navegador; se não fechar em `ms` (ex.: aba que caiu por falta de memória), mata a
     * árvore de processos — nenhum Chrome órfão segura memória para a execução seguinte.
     */
    shutdown(ms?: number): Promise<void>;
}

/** Abre o Chrome instalado na máquina (Playwright não baixa navegadores). */
export async function launchBrowser(headless: boolean): Promise<LaunchedBrowser> {
    let server: Awaited<ReturnType<typeof chromium.launchServer>>;
    try {
        server = await chromium.launchServer({
            channel: 'chrome',
            headless,
            args: [...CHROME_ARGS],
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new EnvironmentError(
            `Chrome não encontrado ou não pôde ser aberto (${message.split('\n')[0] ?? ''}). `
                + 'Instale o Google Chrome estável — o harness usa o Chrome da máquina (channel: chrome).',
        );
    }
    const browser = await chromium.connect(server.wsEndpoint());
    return {
        browser,
        async shutdown(ms = 10_000) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const closed = await Promise.race([
                browser.close().then(
                    () => server.close().then(() => true),
                    () => false,
                ),
                new Promise<boolean>((resolve) => {
                    timer = setTimeout(() => {
                        resolve(false);
                    }, ms);
                }),
            ]);
            clearTimeout(timer);
            if (!closed) {
                console.warn('AVISO: navegador não fechou — encerrando o processo.');
                // `server.kill()` também pendura com a aba caída: SIGKILL direto no processo.
                server.process().kill('SIGKILL');
            }
        },
    };
}
