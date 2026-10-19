import { spawn } from 'node:child_process';
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
    // No Linux o Chrome cai no SwiftShader (WebGPU por software) sem Vulkan e com a GPU na lista de bloqueio.
    ...(process.platform === 'linux' ? ['--enable-features=Vulkan', '--ignore-gpu-blocklist'] : []),
] as const;

/**
 * Vigia destacado: se este processo morrer sem fechar o navegador (SIGKILL, tempo esgotado do terminal — nenhum
 * handler roda), mata o Chrome; o crashpad e os auxiliares saem com ele. Termina sozinho quando o Chrome fecha.
 * Sem isso, cada execução interrompida deixava um Chrome inteiro órfão segurando memória e GPU.
 */
function watchOwner(chromePid: number | undefined): void {
    if (chromePid === undefined || process.platform === 'win32') return;
    const owner = process.pid;
    const script =
        `while kill -0 ${owner} 2>/dev/null && kill -0 ${chromePid} 2>/dev/null; do sleep 1; done; `
        + `kill -0 ${owner} 2>/dev/null || kill -9 ${chromePid} 2>/dev/null`;
    spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' }).unref();
}

/** Navegador conectado + encerramento garantido do processo. */
export interface LaunchedBrowser {
    readonly browser: Browser;
    /**
     * Fecha o navegador; se não fechar em `ms` (ex.: aba que caiu por falta de memória), mata a
     * árvore de processos — nenhum Chrome órfão segura memória para a execução seguinte.
     */
    shutdown(ms?: number): Promise<void>;
}

/** Flags que tiram a sincronia com a tela (só para medir; a imagem na tela deixa de acompanhar os quadros). */
const UNSYNCED = new Set(['--disable-gpu-vsync', '--disable-frame-rate-limit']);

/**
 * Abre o Chrome instalado na máquina (Playwright não baixa navegadores). `extraArgs` acrescenta argumentos (ex.: os
 * smokes expõem `gc()` para medir memória retida). `vsync` mantém a sincronia com a tela, como num navegador comum:
 * sem ela o motor roda acima da taxa da tela e o compositor atualiza a janela só de vez em quando (a captura de tela
 * dos vídeos via ~12 imagens novas por segundo).
 */
export async function launchBrowser(
    headless: boolean,
    extraArgs: readonly string[] = [],
    vsync = false,
): Promise<LaunchedBrowser> {
    let server: Awaited<ReturnType<typeof chromium.launchServer>>;
    try {
        server = await chromium.launchServer({
            channel: 'chrome',
            headless,
            args: [...CHROME_ARGS.filter((a) => !vsync || !UNSYNCED.has(a)), ...extraArgs],
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new EnvironmentError(
            `Chrome não encontrado ou não pôde ser aberto (${message.split('\n')[0] ?? ''}). `
                + 'Instale o Google Chrome estável — o harness usa o Chrome da máquina (channel: chrome).',
        );
    }
    watchOwner(server.process().pid);
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
