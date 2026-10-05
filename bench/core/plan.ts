import { ArgsError } from './args';
import {
    isUnsupported,
    type EngineId,
    type Result,
    type RunConfig,
    type SceneDefinition,
} from './types';

/** Uma execução: uma página nova para cena × variante × engine × repetição. */
export interface RunSpec {
    readonly scene: string;
    readonly variant: string;
    readonly engine: EngineId;
    /** 0-based. */
    readonly repetition: number;
    readonly seed: number;
}

/** Plano: execuções a abrir e resultados já decididos (não suportado), sem abrir página. */
export interface RunPlan {
    readonly runs: readonly RunSpec[];
    readonly unsupported: readonly Result[];
}

/**
 * Produto cena × variante × engine × repetição respeitando os filtros do `RunConfig`.
 * Implementação `Unsupported` vira um único `Result` por cena × variante × engine. Filtro sem
 * correspondência é erro (lista os ids válidos).
 */
export function planRuns(catalog: readonly SceneDefinition[], config: RunConfig): RunPlan {
    const ids = catalog.map((s) => s.id);
    for (const id of config.scenes) {
        if (!ids.includes(id)) {
            throw new ArgsError(`cena desconhecida: '${id}' (válidas: ${ids.join(', ')}).`);
        }
    }
    const scenes =
        config.scenes.length > 0 ? catalog.filter((s) => config.scenes.includes(s.id)) : catalog;
    if (config.variants.length > 0) {
        const variantIds = new Set(scenes.flatMap((s) => s.variants.map((v) => v.id)));
        for (const v of config.variants) {
            if (!variantIds.has(v)) {
                throw new ArgsError(
                    `variante desconhecida: '${v}' (válidas: ${[...variantIds].join(', ')}).`,
                );
            }
        }
    }
    const runs: RunSpec[] = [];
    const unsupported: Result[] = [];
    for (const scene of scenes) {
        const variants =
            config.variants.length > 0
                ? scene.variants.filter((v) => config.variants.includes(v.id))
                : scene.variants;
        for (const variant of variants) {
            for (const engine of config.engines) {
                const impl = scene.implementations[engine];
                if (isUnsupported(impl)) {
                    unsupported.push({
                        scene: scene.id,
                        variant: variant.id,
                        engine,
                        status: 'unsupported',
                        reason: impl.unsupported,
                        ...(impl.until !== undefined ? { until: impl.until } : {}),
                    });
                    continue;
                }
                for (let repetition = 0; repetition < config.repetitions; repetition++) {
                    runs.push({
                        scene: scene.id,
                        variant: variant.id,
                        engine,
                        repetition,
                        seed: scene.seed,
                    });
                }
            }
        }
    }
    return { runs, unsupported };
}
