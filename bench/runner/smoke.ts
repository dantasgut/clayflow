import { launchBrowser, EnvironmentError } from './browser';
import { startServer } from './server';

/**
 * Executa smokes de navegador pelo servidor do bench:
 *
 *   npm run smoke -- <nome>[,<nome>…] [--dist] [--headless] [--timeout <s>]
 *
 * Para cada smoke abre `smoke.html?name=<nome>` numa página nova do Chrome (WebGPU) e espera `SMOKE PASSED` ou
 * `FAIL:` no `#log`. `--dist` resolve `clayflow` para o build minificado (`dist/index.js`, gere antes com
 * `npm run build:lib`). Saída: 0 se todos passaram, 1 se algum falhou, 3 em erro de ambiente.
 */

interface SmokeArgs {
    readonly names: readonly string[];
    readonly dist: boolean;
    readonly headless: boolean;
    readonly timeoutMs: number;
}

const PORT = 5181;

function parse(argv: readonly string[]): SmokeArgs {
    const names: string[] = [];
    let dist = false;
    let headless = false;
    let timeoutMs = 120_000;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i] ?? '';
        if (a === '--dist') dist = true;
        else if (a === '--headless') headless = true;
        else if (a === '--timeout') {
            const v = Number(argv[++i]);
            if (!Number.isFinite(v) || v <= 0) throw new Error('--timeout espera segundos > 0');
            timeoutMs = v * 1000;
        } else if (a.startsWith('--')) throw new Error(`opção desconhecida: ${a}`);
        else names.push(...a.split(',').filter((n) => n.length > 0));
    }
    if (names.length === 0)
        throw new Error('informe ao menos um smoke (ex.: npm run smoke -- time)');
    return { names, dist, headless, timeoutMs };
}

async function main(): Promise<number> {
    const args = parse(process.argv.slice(2));
    let server;
    let launched;
    try {
        server = await startServer(PORT, { dist: args.dist });
        launched = await launchBrowser(args.headless);
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
            const context = await launched.browser.newContext({
                viewport: { width: 800, height: 600 },
            });
            const page = await context.newPage();
            page.on('console', (msg) => {
                if (msg.type() === 'error') console.error(`  [console] ${msg.text()}`);
            });
            page.on('pageerror', (err) => {
                console.error(`  [pageerror] ${err.message}`);
            });
            const started = Date.now();
            console.log(`▶ ${name}${args.dist ? ' (dist)' : ''}`);
            await page.goto(`${server.url}smoke.html?name=${name}`);
            let text = '';
            let outcome: 'passed' | 'failed' | 'timeout' = 'timeout';
            while (Date.now() - started < args.timeoutMs) {
                text = (await page.locator('#log').textContent()) ?? '';
                if (text.includes('FAIL:')) {
                    outcome = 'failed';
                    break;
                }
                if (text.includes('SMOKE PASSED')) {
                    outcome = 'passed';
                    break;
                }
                await page.waitForTimeout(250);
            }
            const secs = ((Date.now() - started) / 1000).toFixed(1);
            for (const line of text.split('\n')) if (line.length > 0) console.log(`  ${line}`);
            console.log(`${outcome === 'passed' ? '✔' : '✘'} ${name}: ${outcome} em ${secs} s`);
            if (outcome !== 'passed') failed.push(name);
            await context.close().catch(() => undefined);
        }
    } finally {
        await launched.shutdown();
        await server.close();
    }
    if (failed.length > 0) console.error(`Falharam: ${failed.join(', ')}`);
    return failed.length > 0 ? 1 : 0;
}

main().then(
    (code) => process.exit(code),
    (err: unknown) => {
        console.error(err instanceof Error ? err.message : err);
        process.exit(3);
    },
);
