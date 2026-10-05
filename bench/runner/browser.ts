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

/** Abre o Chrome instalado na máquina (Playwright não baixa navegadores). */
export async function launchBrowser(headless: boolean): Promise<Browser> {
    try {
        return await chromium.launch({ channel: 'chrome', headless, args: [...CHROME_ARGS] });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new EnvironmentError(
            `Chrome não encontrado ou não pôde ser aberto (${message.split('\n')[0] ?? ''}). `
                + 'Instale o Google Chrome estável — o harness usa o Chrome da máquina (channel: chrome).',
        );
    }
}
