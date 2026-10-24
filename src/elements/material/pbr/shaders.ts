import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import closureSource from '../../gpu/wgsl/math/closure.wgsl?raw';
import closureEvalSource from '../../gpu/wgsl/math/closure_eval.wgsl?raw';
import pbrDfgBuildSource from '../../gpu/wgsl/kernels/pbr_dfg_build.wgsl?raw';
import { basis, bsdf, finite } from '../../gpu/shaders/math';
import { materialPointTypes } from '../point/types/shaders';

/**
 * Fechamento de espalhamento (spec 011): o struct `Closure`, os construtores dos lobos, a composição (`closure_add`,
 * `closure_mix`, `closure_layer`, filme fino, opacidade, normal), o adaptador da 009 (`closure_from_params`) e o
 * saneamento. Sem recursos: os nós de material o exigem.
 */
export const closure = wgslModule({
    name: 'closure',
    source: closureSource,
    requires: [materialPointTypes, finite],
});

/** A tabela DFG do `PbrTables` (resolver `PbrTables.dfg`), lida pelo avaliador do fechamento. */
export const pbrDfgResource = wgslResource({
    name: 'pbr_dfg',
    binding: { texture: { sample: 'f32' } },
    frequency: 'frame',
    provider: { consumer: 'PbrTables.dfg' },
});

/** Amostrador linear da tabela (resolver `PbrTables.sampler`). */
export const pbrSamplerResource = wgslResource({
    name: 'pbr_sampler',
    binding: { sampler: 'filtering' },
    frequency: 'frame',
    provider: { consumer: 'PbrTables.sampler' },
});

/**
 * Avaliação do fechamento (spec 011): `closure_eval` (luz de direção), `closure_ambient` (hemisfério), `closure_emitted`
 * e o controle de serrilhado especular, especializáveis pela constante `CLOSURE_LOBES`.
 */
export const closureEval = wgslModule({
    name: 'closure_eval',
    source: closureEvalSource,
    requires: [closure, bsdf, basis, pbrDfgResource, pbrSamplerResource],
});

/** Saída do kernel da tabela DFG (a textura do `PbrTables`), privada do `PbrTablesFlow`. */
export const pbrDfgOutResource = wgslResource({
    name: 'pbr_dfg_out',
    binding: { storageTexture: { format: 'rgba16float', access: 'write' } },
    frequency: 'stage',
    provider: 'private',
});

/** Kernel que integra a tabela DFG uma vez. */
export const pbrDfgBuild = wgslModule({
    name: 'pbr_dfg_build',
    source: pbrDfgBuildSource,
    requires: [bsdf, WORKGROUP_SIZE.module, pbrDfgOutResource],
});
