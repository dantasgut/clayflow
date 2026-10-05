import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArgsError, parseArgs, parseCommand, type Command } from '../core/args';
import {
    BaselineError,
    baselinePath,
    parseBaseline,
    parseRunFile,
    toBaseline,
} from '../core/baseline';
import { CATALOG } from '../core/catalog';
import { compare } from '../core/compare';
import { planRuns } from '../core/plan';
import { buildProfile } from '../core/profile';
import { regressionToMarkdown, toMarkdown, toRunFile } from '../core/report';
import {
    ENGINES,
    type PageEnvironment,
    type Result,
    type RunConfig,
    type RunFile,
} from '../core/types';
import { EnvironmentError, launchBrowser } from './browser';
import { orchestrate } from './orchestrate';
import { startServer } from './server';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RESULTS_DIR = join(ROOT, 'bench/results');

/** Códigos de saída (`contracts/cli.md`). */
const EXIT = { ok: 0, regression: 1, noBaseline: 2, environment: 3 } as const;

function readJson(path: string): Record<string, unknown> {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function versions(): { clayflow: string; three: string; rapier: string } {
    const pkg = (p: string): string => {
        try {
            return String(readJson(join(ROOT, p)).version);
        } catch {
            return 'desconhecida';
        }
    };
    return {
        clayflow: pkg('package.json'),
        three: pkg('node_modules/three/package.json'),
        rapier: pkg('node_modules/@dimforge/rapier3d-compat/package.json'),
    };
}

function commit(): string {
    try {
        return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {
        return 'desconhecido';
    }
}

/** Ordena resultados na ordem do catálogo (cena, variante, engine). */
function sortResults(results: readonly Result[]): Result[] {
    const rank = (r: Result): [number, number, number] => {
        const si = CATALOG.findIndex((s) => s.id === r.scene);
        const vi = CATALOG[si]?.variants.findIndex((v) => v.id === r.variant) ?? 0;
        return [si, vi, ENGINES.indexOf(r.engine)];
    };
    return [...results].sort((a, b) => {
        const [a1, a2, a3] = rank(a);
        const [b1, b2, b3] = rank(b);
        return a1 - b1 || a2 - b2 || a3 - b3;
    });
}

function placeholderEnvironment(): PageEnvironment {
    return {
        gpu: { vendor: 'desconhecido', architecture: '', device: '', description: '' },
        userAgent: '',
        devicePixelRatio: 1,
        timestampQuery: false,
        isFallbackAdapter: false,
    };
}

/** Executa o plano no navegador e grava `bench/results/`. */
async function execute(config: RunConfig, strict: boolean): Promise<RunFile> {
    const plan = planRuns(CATALOG, config);
    console.log(
        `clayflow bench — ${plan.runs.length} execuções (${plan.unsupported.length} não suportadas)`,
    );
    const startedAt = new Date();
    const server = await startServer(config.port);
    const browser = await launchBrowser(config.headless).catch(async (e: unknown) => {
        await server.close();
        throw e;
    });
    try {
        const { results, environment } = await orchestrate(browser, server.url, plan, config);
        if (environment?.isFallbackAdapter === true) {
            const msg = `adaptador de software detectado (${environment.gpu.description || 'fallback'}) — números não representativos.`;
            if (strict) throw new EnvironmentError(msg);
            console.warn(`AVISO: ${msg}`);
        }
        const profile = buildProfile({
            environment: environment ?? placeholderEnvironment(),
            resolution: config.resolution,
            versions: versions(),
            commit: commit(),
            date: startedAt.toISOString().slice(0, 10),
        });
        const run = toRunFile(
            profile,
            config,
            startedAt,
            Date.now() - startedAt.getTime(),
            sortResults(results),
        );
        mkdirSync(RESULTS_DIR, { recursive: true });
        const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
        const json = `${JSON.stringify(run, null, 2)}\n`;
        writeFileSync(join(RESULTS_DIR, `${stamp}-${profile.profileId}.json`), json);
        writeFileSync(join(RESULTS_DIR, 'latest.json'), json);
        const md = toMarkdown(run);
        writeFileSync(join(RESULTS_DIR, 'latest.md'), md);
        console.log(`\n${md}`);
        console.log(
            `Resultados: bench/results/latest.json · latest.md (${(run.durationMs / 60000).toFixed(1)} min)`,
        );
        return run;
    } finally {
        // Uma aba que caiu (ex.: falta de memória) pode deixar o fechamento pendurado.
        await closeWithin(() => browser.close(), 'navegador');
        await closeWithin(() => server.close(), 'servidor');
    }
}

/** Fecha um recurso com tempo-limite: o runner nunca fica pendurado no encerramento. */
async function closeWithin(close: () => Promise<void>, what: string, ms = 10_000): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
            console.warn(`AVISO: ${what} não fechou em ${ms / 1000} s — seguindo.`);
            resolve();
        }, ms);
    });
    await Promise.race([close().catch(() => undefined), timeout]);
    clearTimeout(timer);
}

function listBaselines(): string[] {
    const dir = join(ROOT, 'bench/baselines');
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => f.endsWith('.json'));
}

async function main(argv: readonly string[]): Promise<number> {
    const { command, rest }: { command: Command; rest: string[] } = parseCommand(argv);
    const config = parseArgs(rest);
    if (command === 'run') {
        await execute(config, false);
        return EXIT.ok;
    }
    if (command === 'baseline') {
        const run = await execute(config, true);
        const baseline = toBaseline(run, config.tolerance);
        const path = join(ROOT, baselinePath(run.profile.profileId));
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
        console.log(
            `Baseline gravado: ${baselinePath(run.profile.profileId)} (${baseline.results.length} resultados do clayflow)`,
        );
        return EXIT.ok;
    }
    const run =
        config.from !== undefined
            ? parseRunFile(readFileSync(resolve(config.from), 'utf8'))
            : await execute(config, true);
    const path = join(ROOT, baselinePath(run.profile.profileId));
    if (!existsSync(path)) {
        const existing = listBaselines();
        console.error(
            `Sem baseline para o perfil '${run.profile.profileId}' — números de máquinas diferentes não são comparados.\n`
                + `Grave um com: npm run bench:baseline\n`
                + `Perfis com baseline: ${existing.length > 0 ? existing.map((f) => f.replace(/\.json$/, '')).join(', ') : '(nenhum)'}`,
        );
        return EXIT.noBaseline;
    }
    const baseline = parseBaseline(readFileSync(path, 'utf8'));
    const report = compare(baseline, run, config.tolerance);
    console.log(regressionToMarkdown(report));
    return report.passed ? EXIT.ok : EXIT.regression;
}

main(process.argv.slice(2))
    .then((code) => {
        process.exit(code);
    })
    .catch((e: unknown) => {
        if (e instanceof ArgsError || e instanceof BaselineError) {
            console.error(`erro: ${e.message}`);
            process.exit(EXIT.noBaseline);
        }
        if (e instanceof EnvironmentError) {
            console.error(`erro de ambiente: ${e.message}`);
            process.exit(EXIT.environment);
        }
        console.error(e);
        process.exit(EXIT.environment);
    });
