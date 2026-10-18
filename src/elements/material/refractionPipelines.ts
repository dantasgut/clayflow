import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { bindPoints } from '../../scene/shaders/bindPoints';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import { composeHitMaterial } from '../raytrace/hitMaterial';
import type { RayMaterialFunction } from '../raytrace/RayScene';
import { rayHitMaterialPoint } from '../raytrace/shaders';
import { REFRACTION_ROUNDS, refractionKernels } from './shaders';

/**
 * Um despacho do traçado: o pipeline e como despachar — a tela em grupos de 8 × 8, um fio, ou indireto pela lista dos
 * pixels marcados do antisserrilhado.
 */
export interface RefractionDispatch {
    readonly id: string;
    readonly kind: 'screen' | 'single' | 'marks';
}

/** Os pipelines do traçado da refração de quem o roda e a ordem dos despachos (com repetição). */
export interface RefractionPipelineSet {
    readonly descriptors: readonly PipelineDescriptor[];
    readonly order: readonly RefractionDispatch[];
}

/**
 * Os pipelines do traçado da refração (spec 034) com a composição das funções `material` da cena nos acertos, sob o
 * prefixo de quem os prepara (o desenho dos transmissivos, a água) — e a ordem: o caminho e a luz da amostra do centro,
 * a medida de onde a imagem serrilha ou se separa em cores (e a lista dos marcados), a amostra do centro como a
 * radiância e, em rodadas sobre a lista, as amostras extras (o caminho e a luz) e a média dos marcados sobre ela.
 */
export function refractionPipelines(
    prefix: string,
    functions: readonly RayMaterialFunction[],
): RefractionPipelineSet {
    const compose = (shader: WgslModule): WgslModule =>
        functions.length === 0
            ? shader
            : bindPoints(shader, new Map([[rayHitMaterialPoint, composeHitMaterial(functions)]]));
    const compute = (id: string, shader: WgslModule, entry: string): PipelineDescriptor => ({
        id: `${prefix}:${id}`,
        role: 'compute',
        shader,
        entryPoints: [entry],
    });
    const trace = compute('trace', compose(refractionKernels.trace), 'refraction_trace_main');
    const shade = compute('shade', compose(refractionKernels.shade), 'refraction_shade_main');
    const footprint = compute(
        'footprint',
        refractionKernels.footprint,
        'refraction_footprint_main',
    );
    const args = compute('marks', refractionKernels.marksArgs, 'refraction_marks_args_main');
    const next = compute('marks_next', refractionKernels.marksArgs, 'refraction_marks_next_main');
    const traceExtra = compute(
        'trace_extra',
        compose(refractionKernels.traceExtra),
        'refraction_trace_extra_main',
    );
    const sample = compute('sample', compose(refractionKernels.sample), 'refraction_sample_main');
    const resolve = compute('resolve', refractionKernels.resolve, 'refraction_resolve_main');
    const resolveMarks = compute(
        'resolve_marks',
        refractionKernels.resolveMarks,
        'refraction_resolve_marks_main',
    );
    const order: RefractionDispatch[] = [
        { id: trace.id, kind: 'screen' },
        { id: shade.id, kind: 'screen' },
        { id: footprint.id, kind: 'screen' },
        { id: resolve.id, kind: 'screen' },
        { id: args.id, kind: 'single' },
    ];
    // As rodadas das extras (as vazias despacham zero grupos).
    for (let round = 0; round < REFRACTION_ROUNDS; round++) {
        if (round > 0) order.push({ id: next.id, kind: 'single' });
        order.push(
            { id: traceExtra.id, kind: 'marks' },
            { id: sample.id, kind: 'marks' },
            { id: resolveMarks.id, kind: 'marks' },
        );
    }
    return {
        descriptors: [
            trace,
            shade,
            footprint,
            args,
            next,
            traceExtra,
            sample,
            resolve,
            resolveMarks,
        ],
        order,
    };
}
