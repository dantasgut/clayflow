import type { BaselineFile, RunFile } from './types';

/** Erro de leitura de baseline (mensagem legível). */
export class BaselineError extends Error {
    override readonly name = 'BaselineError';
}

/** Caminho versionado do baseline de um perfil. */
export function baselinePath(profileId: string): string {
    return `bench/baselines/${profileId}.json`;
}

/** Baseline a partir de uma execução: só os resultados do clayflow (FR-013). */
export function toBaseline(run: RunFile, tolerance: number, createdAt = new Date()): BaselineFile {
    return {
        schemaVersion: 1,
        profileId: run.profile.profileId,
        createdAt: createdAt.toISOString(),
        commit: run.profile.commit,
        tolerance,
        results: run.results.filter((r) => r.engine === 'clayflow'),
    };
}

/** Lê e valida um baseline (JSON). */
export function parseBaseline(json: string): BaselineFile {
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch (e) {
        throw new BaselineError(
            `baseline não é JSON válido: ${e instanceof Error ? e.message : String(e)}`,
        );
    }
    const b = raw as Partial<BaselineFile> | null;
    if (b === null || typeof b !== 'object') throw new BaselineError('baseline vazio ou inválido.');
    if (b.schemaVersion !== 1) {
        throw new BaselineError(
            `schemaVersion não suportada: ${String(b.schemaVersion)} (esperado 1).`,
        );
    }
    if (typeof b.profileId !== 'string' || !Array.isArray(b.results)) {
        throw new BaselineError('baseline sem profileId ou results.');
    }
    return b as BaselineFile;
}

/** Lê e valida um arquivo de execução (JSON) — usado por `bench:check --from`. */
export function parseRunFile(json: string): RunFile {
    const r = JSON.parse(json) as Partial<RunFile> | null;
    if (r?.schemaVersion !== 1 || r.profile === undefined || !Array.isArray(r.results)) {
        throw new BaselineError(
            'arquivo de execução inválido (schemaVersion 1 com profile e results).',
        );
    }
    return r as RunFile;
}
