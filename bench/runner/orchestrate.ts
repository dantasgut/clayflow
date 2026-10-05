import type { Browser } from 'playwright';
import type { RunPlan, RunSpec } from '../core/plan';
import { aggregateRepetitions, summarizeRepetition } from '../core/stats';
import type { PageEnvironment, PageResult, Result, RunConfig } from '../core/types';
import { EnvironmentError } from './browser';

/** Folga além do tempo-limite da execução para carregar a página e publicar o resultado. */
const PAGE_SLACK_MS = 20_000;

/** Saída da orquestração: resultados agregados e o ambiente visto pelas páginas. */
export interface Orchestration {
    readonly results: Result[];
    readonly environment: PageEnvironment | undefined;
}

function queryOf(run: RunSpec, config: RunConfig): string {
    const q = new URLSearchParams({
        scene: run.scene,
        variant: run.variant,
        engine: run.engine,
        seed: String(run.seed),
        warmup: String(config.warmupMs),
        window: String(config.windowMs),
        timeout: String(config.timeoutMs),
        profiling: config.profiling ? '1' : '0',
    });
    return `?${q.toString()}`;
}

/** Executa uma repetição numa página nova (contexto novo — sem estado da anterior, R4). */
async function runOnce(
    browser: Browser,
    baseUrl: string,
    run: RunSpec,
    config: RunConfig,
): Promise<PageResult> {
    const context = await browser.newContext({
        viewport: { width: config.resolution.width, height: config.resolution.height },
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on('console', (msg) => {
        const text = msg.text();
        if (text.startsWith('[bench]') || msg.type() === 'error') {
            console.log(`    ${run.engine}: ${text}`);
        }
    });
    try {
        await page.goto(`${baseUrl}${queryOf(run, config)}`);
        await page.waitForFunction(() => window.__benchResult !== undefined, undefined, {
            timeout: config.timeoutMs + PAGE_SLACK_MS,
            polling: 250,
        });
        return (await page.evaluate(() => window.__benchResult)) as PageResult;
    } catch (e) {
        const message = e instanceof Error ? (e.message.split('\n')[0] ?? '') : String(e);
        if (/Timeout/i.test(message)) {
            return {
                status: 'timeout',
                reason: `sem resultado em ${config.timeoutMs} ms (página travada ou lenta)`,
            };
        }
        return { status: 'failed', reason: message };
    } finally {
        await context.close().catch(() => undefined);
    }
}

function groupKey(r: RunSpec): string {
    return `${r.scene}\u0000${r.variant}\u0000${r.engine}`;
}

/**
 * Loop cena × variante × engine × repetição (página nova por execução). Uma falha vira
 * `failed`/`timeout` e o loop segue (FR-010). Repetições `ok` são agregadas pela mediana.
 */
export async function orchestrate(
    browser: Browser,
    baseUrl: string,
    plan: RunPlan,
    config: RunConfig,
): Promise<Orchestration> {
    const groups = new Map<string, { spec: RunSpec; pages: PageResult[] }>();
    let environment: PageEnvironment | undefined;
    let index = 0;
    for (const run of plan.runs) {
        index++;
        const label = `${run.scene}/${run.variant} ${run.engine} #${run.repetition + 1}`;
        // Repetição que falhou ou estourou o tempo decide a linha: as seguintes são puladas.
        if (groups.get(groupKey(run))?.pages.some((p) => p.status !== 'ok') === true) {
            console.log(
                `[${index}/${plan.runs.length}] ${label} — pulada (repetição anterior não concluiu)`,
            );
            continue;
        }
        console.log(`[${index}/${plan.runs.length}] ${label}`);
        const started = Date.now();
        const page = await runOnce(browser, baseUrl, run, config);
        console.log(
            `    → ${page.status}${page.reason !== undefined ? ` (${page.reason})` : ''} em ${((Date.now() - started) / 1000).toFixed(1)} s`,
        );
        if (page.reason === 'WebGPU indisponível neste navegador') {
            throw new EnvironmentError('WebGPU indisponível neste navegador.');
        }
        if (environment === undefined && page.environment !== undefined)
            environment = page.environment;
        const g = groups.get(groupKey(run)) ?? { spec: run, pages: [] };
        g.pages.push(page);
        groups.set(groupKey(run), g);
    }
    const results: Result[] = [...plan.unsupported];
    for (const { spec, pages } of groups.values()) {
        const id = { scene: spec.scene, variant: spec.variant, engine: spec.engine };
        const limitations = pages.find((p) => p.limitations !== undefined)?.limitations;
        const lim = limitations !== undefined ? { limitations: [...limitations] } : {};
        const broken = pages.find((p) => p.status !== 'ok');
        if (broken !== undefined || pages.some((p) => p.samples === undefined)) {
            const status = broken?.status === 'timeout' ? 'timeout' : 'failed';
            results.push({ ...id, status, reason: broken?.reason ?? 'sem amostras', ...lim });
            continue;
        }
        const reps = pages.map((p) =>
            summarizeRepetition(p.samples as NonNullable<PageResult['samples']>),
        );
        const agg = aggregateRepetitions(reps);
        results.push({
            ...id,
            status: 'ok',
            metrics: agg.metrics,
            repetitions: reps,
            unstable: agg.unstable,
            ...lim,
        });
    }
    return { results, environment };
}
