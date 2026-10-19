import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { appendFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { launchBrowser, EnvironmentError } from './browser';
import { startServer } from './server';

/**
 * Grava as demos de `bench/demos/scenes.ts` em vídeo, com o Chrome visível:
 *
 *   npm run video -- <demo>[,<demo>…] [--mode exact|realtime|both] [--out <pasta>]
 *
 * - `exact` (imagem fiel): quadro a quadro com passo fixo de 1/60 s; a página codifica o canvas com o `VideoEncoder`
 *   (H.264) e o ffmpeg só empacota em MP4 a 60 FPS. Mostra a imagem exata do motor, não o tempo real.
 * - `realtime` (desempenho fiel): o laço normal do motor enquanto o ffmpeg captura a região do canvas na tela
 *   (`x11grab`, NVENC se houver) a 60 FPS; grava ao lado o intervalo de cada quadro (`<demo>-realtime.json`).
 *   Só X11 (Linux); a janela do Chrome precisa ficar visível, sem nada por cima.
 *
 * Saída em `bench/results/videos/` (padrão): `<demo>-exact.mp4`, `<demo>-realtime.mp4`. Exige o `ffmpeg` no PATH.
 * Saída 0 se todas gravaram, 1 se alguma falhou, 3 em erro de ambiente.
 */

type Mode = 'exact' | 'realtime';

interface VideoArgs {
    readonly names: readonly string[];
    readonly modes: readonly Mode[];
    readonly out: string;
}

const PORT = 5182;
const SIZE = { width: 1280, height: 720 } as const;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../results/videos');

function parse(argv: readonly string[]): VideoArgs {
    const names: string[] = [];
    let modes: Mode[] = ['exact', 'realtime'];
    let out = OUT;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i] ?? '';
        if (a === '--mode') {
            const m = argv[++i];
            if (m === 'both') modes = ['exact', 'realtime'];
            else if (m === 'exact' || m === 'realtime') modes = [m];
            else throw new Error('--mode espera exact, realtime ou both');
        } else if (a === '--out') out = argv[++i] ?? OUT;
        else if (a.startsWith('--')) throw new Error(`opção desconhecida: ${a}`);
        else names.push(...a.split(',').filter((n) => n.length > 0));
    }
    if (names.length === 0)
        throw new Error('informe ao menos uma demo (ex.: npm run video -- cornell)');
    return { names, modes, out };
}

function requireFfmpeg(): void {
    if (spawnSync('ffmpeg', ['-version']).status !== 0)
        throw new EnvironmentError('ffmpeg não encontrado no PATH.');
}

function ffmpeg(args: readonly string[], input?: Buffer): void {
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { input });
    if (r.status !== 0) throw new Error(`ffmpeg falhou: ${r.stderr.toString()}`);
}

/** Encoder de H.264 para a captura: NVENC se a máquina tiver, senão x264. */
function captureEncoder(): string[] {
    const list = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout;
    return list.includes('h264_nvenc')
        ? [
              '-c:v',
              'h264_nvenc',
              '-preset',
              'p7',
              '-tune',
              'hq',
              '-rc',
              'vbr',
              '-cq',
              '18',
              '-b:v',
              '0',
          ]
        : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18'];
}

/**
 * Posição do canvas na tela: a página cobre o canvas de magenta e uma captura da tela inteira acha o retângulo.
 * Devolve o canto superior esquerdo em pixels da tela.
 */
async function locateCanvas(page: Page, display: string): Promise<{ x: number; y: number }> {
    const screen = spawnSync('xdpyinfo', ['-display', display], { encoding: 'utf8' }).stdout;
    const dims = /dimensions:\s+(\d+)x(\d+)/.exec(screen);
    if (dims === null)
        throw new EnvironmentError(`não consegui ler o tamanho da tela ${display} (xdpyinfo)`);
    const [w, h] = [Number(dims[1]), Number(dims[2])];
    await page.evaluate(() => window.__demoMarker?.(true));
    await page.waitForTimeout(500);
    const grab = spawnSync(
        'ffmpeg',
        [
            '-loglevel',
            'error',
            '-f',
            'x11grab',
            '-video_size',
            `${w}x${h}`,
            '-i',
            display,
            '-frames:v',
            '1',
            '-f',
            'rawvideo',
            '-pix_fmt',
            'rgb24',
            '-',
        ],
        { maxBuffer: w * h * 3 + 1024 },
    );
    await page.evaluate(() => window.__demoMarker?.(false));
    const px = grab.stdout as Buffer;
    if (px.length < w * h * 3) throw new EnvironmentError('a captura da tela (x11grab) falhou');
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 3;
            if ((px[o] ?? 0) > 240 && (px[o + 1] ?? 255) < 16 && (px[o + 2] ?? 0) > 240) {
                x0 = Math.min(x0, x);
                y0 = Math.min(y0, y);
                x1 = Math.max(x1, x);
                y1 = Math.max(y1, y);
            }
        }
    if (x1 - x0 + 1 !== SIZE.width || y1 - y0 + 1 !== SIZE.height) {
        // A tela como estava, para ver o que cobria o canvas.
        const shot = join(OUT, 'screen-locate.png');
        await mkdir(OUT, { recursive: true });
        ffmpeg(
            ['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-video_size', `${w}x${h}`, '-i', '-', shot],
            px,
        );
        throw new EnvironmentError(
            `canvas não encontrado inteiro na tela (achei ${x1 - x0 + 1}×${y1 - y0 + 1} em ${x0},${y0}; tela salva em ${shot}): a janela do Chrome precisa estar visível, sem nada por cima e sem escala`,
        );
    }
    return { x: x0, y: y0 };
}

async function recordExact(page: Page, name: string, out: string): Promise<string> {
    const raw = join(out, `${name}-exact.h264`);
    await rm(raw, { force: true });
    const frames = await page.evaluate(() => {
        const run = window.__demoExact;
        if (run === undefined) throw new Error('demo sem __demoExact');
        return run();
    });
    const mp4 = join(out, `${name}-exact.mp4`);
    ffmpeg([
        '-fflags',
        '+genpts',
        '-r',
        '60',
        '-f',
        'h264',
        '-i',
        raw,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        mp4,
    ]);
    await rm(raw, { force: true });
    return `${mp4} (${frames} quadros, 60 FPS)`;
}

async function recordRealtime(page: Page, name: string, out: string): Promise<string> {
    if (process.platform !== 'linux' || process.env.DISPLAY === undefined)
        throw new EnvironmentError('o modo realtime captura a tela pelo x11grab (Linux com X11)');
    const display = process.env.DISPLAY;
    const at = await locateCanvas(page, display);
    const mp4 = join(out, `${name}-realtime.mp4`);
    const capture: ChildProcess = spawn(
        'ffmpeg',
        [
            '-y',
            '-loglevel',
            'error',
            '-f',
            'x11grab',
            '-draw_mouse',
            '0',
            '-framerate',
            '60',
            '-video_size',
            `${SIZE.width}x${SIZE.height}`,
            '-i',
            `${display}+${at.x},${at.y}`,
            ...captureEncoder(),
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
            mp4,
        ],
        { stdio: ['pipe', 'ignore', 'inherit'] },
    );
    const ended = new Promise<number | null>((r) => {
        capture.on('exit', r);
    });
    let intervals: number[];
    try {
        await page.waitForTimeout(500);
        intervals = await page.evaluate(() => {
            const run = window.__demoRealtime;
            if (run === undefined) throw new Error('demo sem __demoRealtime');
            return run();
        });
        await page.waitForTimeout(300);
    } finally {
        // A captura para mesmo se a demo falhar: o ffmpeg não fica gravando a tela solto.
        capture.stdin?.write('q');
    }
    if ((await ended) !== 0) throw new Error('a captura do ffmpeg terminou com erro');
    const sorted = [...intervals].sort((a, b) => a - b);
    const q = (p: number): number =>
        sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
    const mean = intervals.reduce((s, v) => s + v, 0) / Math.max(1, intervals.length);
    const stats = {
        frames: intervals.length,
        meanMs: mean,
        fps: 1000 / mean,
        p95Ms: q(0.95),
        p99Ms: q(0.99),
        maxMs: q(1),
    };
    await writeFile(
        join(out, `${name}-realtime.json`),
        `${JSON.stringify({ ...stats, intervals }, null, 2)}\n`,
    );
    return `${mp4} (${stats.fps.toFixed(1)} FPS médios, p99 ${stats.p99Ms.toFixed(1)} ms, pior ${stats.maxMs.toFixed(1)} ms)`;
}

async function main(): Promise<number> {
    const args = parse(process.argv.slice(2));
    let server;
    let launched;
    try {
        requireFfmpeg();
        await mkdir(args.out, { recursive: true });
        server = await startServer(PORT);
        // Janela maior que o canvas: a captura da tela precisa dele inteiro (sem emulação de viewport, abaixo). Com
        // vsync: o tempo real é o de um navegador comum e a tela recebe todo quadro.
        launched = await launchBrowser(false, ['--window-size=1400,1000'], true);
    } catch (e) {
        await server?.close();
        if (e instanceof EnvironmentError) {
            console.error(e.message);
            return 3;
        }
        throw e;
    }
    const failed: string[] = [];
    try {
        for (const name of args.names) {
            for (const mode of args.modes) {
                const context = await launched.browser.newContext({ viewport: null });
                const raw = join(args.out, `${name}-exact.h264`);
                await context.exposeFunction('__demoChunk', (b64: string) =>
                    appendFile(raw, Buffer.from(b64, 'base64')),
                );
                const page = await context.newPage();
                page.on('pageerror', (err) => {
                    console.error(`  [pageerror] ${err.message}`);
                });
                console.log(`▶ ${name} (${mode})`);
                try {
                    await page.goto(`${server.url}demo.html?case=${name}`);
                    await page.waitForFunction(() => window.__demoReady !== undefined, undefined, {
                        timeout: 180_000,
                    });
                    const ready = await page.evaluate(() => window.__demoReady);
                    if (ready === undefined) throw new Error('demo não ficou pronta');
                    if ('error' in ready) throw new Error(ready.error);
                    const result =
                        mode === 'exact'
                            ? await recordExact(page, name, args.out)
                            : await recordRealtime(page, name, args.out);
                    console.log(`✔ ${result}`);
                } catch (e) {
                    if (e instanceof EnvironmentError) throw e;
                    console.log(
                        `✘ ${name} (${mode}): ${e instanceof Error ? e.message : String(e)}`,
                    );
                    failed.push(`${name}/${mode}`);
                } finally {
                    await context.close().catch(() => undefined);
                }
            }
        }
    } catch (e) {
        if (e instanceof EnvironmentError) {
            console.error(e.message);
            return 3;
        }
        throw e;
    } finally {
        await launched.shutdown();
        await server.close();
    }
    if (failed.length > 0) console.log(`Falharam: ${failed.join(', ')}`);
    return failed.length > 0 ? 1 : 0;
}

main().then(
    (code) => process.exit(code),
    (e: unknown) => {
        console.error(e);
        process.exit(1);
    },
);
