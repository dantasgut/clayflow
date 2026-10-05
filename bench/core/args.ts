import { ENGINES, type EngineId, type RunConfig } from './types';

/** Subcomandos do runner (`contracts/cli.md`). */
export type Command = 'run' | 'check' | 'baseline';

/** Protocolo padrão (R5). */
export const DEFAULTS = {
    warmupMs: 3000,
    windowMs: 10_000,
    repetitions: 3,
    timeoutMs: 60_000,
    tolerance: 0.1,
    port: 5180,
    resolution: { width: 1280, height: 720 },
} as const;

/** Preset `--quick`: 1 s de aquecimento, 3 s de janela, 1 repetição. */
export const QUICK = { warmupMs: 1000, windowMs: 3000, repetitions: 1 } as const;

const VALUE_FLAGS = new Set([
    '--scene',
    '--variant',
    '--engine',
    '--warmup',
    '--window',
    '--reps',
    '--timeout',
    '--tolerance',
    '--from',
    '--port',
]);
const BOOL_FLAGS = new Set(['--quick', '--headless', '--no-profiling']);

/** Erro de uso da CLI (mensagem legível, exit 2/3 decidido pelo chamador). */
export class ArgsError extends Error {
    override readonly name = 'ArgsError';
}

function list(value: string): string[] {
    return value
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
}

function positiveInt(flag: string, value: string): number {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
        throw new ArgsError(`${flag} espera um inteiro positivo (recebido: '${value}').`);
    }
    return n;
}

/** Converte `argv` (sem o subcomando) em `RunConfig`, aplicando defaults e `--quick`. */
export function parseArgs(argv: readonly string[]): RunConfig {
    const values = new Map<string, string>();
    const flags = new Set<string>();
    for (let i = 0; i < argv.length; i++) {
        const raw = argv[i] ?? '';
        const [flag, inline] = raw.includes('=') ? raw.split('=', 2) : [raw, undefined];
        if (BOOL_FLAGS.has(flag)) {
            flags.add(flag);
            continue;
        }
        if (!VALUE_FLAGS.has(flag)) throw new ArgsError(`flag desconhecida: '${raw}'.`);
        const value = inline ?? argv[++i];
        if (value === undefined || value.startsWith('--')) {
            throw new ArgsError(`${flag} espera um valor.`);
        }
        values.set(flag, value);
    }
    const quick = flags.has('--quick');
    const base = quick ? QUICK : DEFAULTS;
    const engines = values.has('--engine') ? list(values.get('--engine') ?? '') : [...ENGINES];
    for (const e of engines) {
        if (!ENGINES.includes(e as EngineId)) {
            throw new ArgsError(`engine desconhecida: '${e}' (válidas: ${ENGINES.join(', ')}).`);
        }
    }
    let tolerance: number = DEFAULTS.tolerance;
    const tol = values.get('--tolerance');
    if (tol !== undefined) {
        tolerance = Number(tol);
        if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance >= 1) {
            throw new ArgsError(`--tolerance espera um número em (0, 1) (recebido: '${tol}').`);
        }
    }
    const num = (flag: string, fallback: number): number => {
        const v = values.get(flag);
        return v === undefined ? fallback : positiveInt(flag, v);
    };
    const from = values.get('--from');
    return {
        warmupMs: num('--warmup', base.warmupMs),
        windowMs: num('--window', base.windowMs),
        repetitions: num('--reps', base.repetitions),
        timeoutMs: num('--timeout', DEFAULTS.timeoutMs),
        resolution: { ...DEFAULTS.resolution },
        scenes: values.has('--scene') ? list(values.get('--scene') ?? '') : [],
        variants: values.has('--variant') ? list(values.get('--variant') ?? '') : [],
        engines: engines as EngineId[],
        quick,
        headless: flags.has('--headless'),
        tolerance,
        port: num('--port', DEFAULTS.port),
        profiling: !flags.has('--no-profiling'),
        ...(from !== undefined ? { from } : {}),
    };
}

/** Separa o subcomando do restante de `argv`. */
export function parseCommand(argv: readonly string[]): { command: Command; rest: string[] } {
    const [first, ...rest] = argv;
    if (first === 'run' || first === 'check' || first === 'baseline')
        return { command: first, rest };
    throw new ArgsError(`subcomando inválido: '${first ?? ''}' (use run, check ou baseline).`);
}
