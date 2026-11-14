import { colliderSet } from '../../gpu/shaders/math';
import { poolLive } from '../../gpu/compute/shaders';
import { fieldAccelReady, fieldPointTypes } from './fields';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import femPredictSource from '../../gpu/wgsl/kernels/fem_predict.wgsl?raw';
import femCollideSource from '../../gpu/wgsl/kernels/fem_collide.wgsl?raw';
import femVelocityUpdateSource from '../../gpu/wgsl/kernels/fem_velocity_update.wgsl?raw';
import { XPBDSoftSchema } from '../../physics/bodies/schemas/XPBDSoftSchema';
import { FEMSimParamsSchema } from '../../physics/schemas/simParams';

// Kernels do FEM (por ora só integra gravidade — o solve elástico é da F5).

/**
 * Recursos do FEM (spec 031): os parâmetros da iteração (uma região por iteração, offset dinâmico), o pool de nós do
 * `bodyType` e o bitset de vivos dele (slot `bodies`).
 */
export const femResources = Object.freeze({
    params: wgslResource({
        name: 'fem_params',
        binding: { uniform: true },
        type: { schema: FEMSimParamsSchema },
        frequency: 'draw',
        // Uma região por iteração do uniforme por região do Resource de trabalho (offset dinâmico, spec 039).
        provider: { slot: 'work', descriptor: 'fem_sim_params' },
    }),
    nodes: wgslResource({
        name: 'nodes',
        binding: { storage: 'read_write' },
        type: { schema: XPBDSoftSchema, array: true },
        frequency: 'stage',
        provider: { slot: 'bodies' },
    }),
    /** Slots vivos do pool de nós (spec 008). */
    live: wgslResource({
        name: 'live',
        binding: { storage: 'read' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: 'bodies', part: 'live' },
    }),
});

const R = femResources;

/** Predição dos nós. */
export const femPredict = wgslModule({
    name: 'fem_predict',
    source: femPredictSource,
    requires: [
        poolLive,
        fieldPointTypes,
        fieldAccelReady,
        WORKGROUP_SIZE.module,
        R.params,
        R.nodes,
        R.live,
    ],
});

/** Colisão dos nós com os colliders (spec 010; só com colliders na cena). */
export const femCollide = wgslModule({
    name: 'fem_collide',
    source: femCollideSource,
    requires: [poolLive, colliderSet, WORKGROUP_SIZE.module, R.params, R.nodes, R.live],
});

/** Velocidade e avanço dos nós. */
export const femVelocityUpdate = wgslModule({
    name: 'fem_velocity_update',
    source: femVelocityUpdateSource,
    requires: [poolLive, WORKGROUP_SIZE.module, R.params, R.nodes, R.live],
});
