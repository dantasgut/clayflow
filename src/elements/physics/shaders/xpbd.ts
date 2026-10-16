import { poolLive } from '../../gpu/compute/shaders';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { colliderSet, xpbd } from '../../gpu/shaders/math';
import predictSource from '../../gpu/wgsl/kernels/predict.wgsl?raw';
import velocityUpdateSource from '../../gpu/wgsl/kernels/velocity_update.wgsl?raw';
import distanceSolveSource from '../../gpu/wgsl/kernels/distance_solve.wgsl?raw';
import xpbdCollideSource from '../../gpu/wgsl/kernels/xpbd_collide.wgsl?raw';
import { DistanceConstraint } from '../../physics/constraints/DistanceConstraint';
import { XPBDSoftSchema } from '../../physics/bodies/schemas/XPBDSoftSchema';
import { SimParamsSchema } from '../../physics/schemas/simParams';
import { fieldAccelReady, fieldPointTypes } from './fields';

// Kernels do XPBD de partículas.

/**
 * Recursos do XPBD (spec 031): os parâmetros da iteração (uma região por iteração, offset dinâmico), o pool de
 * partículas do `bodyType` e o bitset de vivos dele (slot `bodies`) e o pool de restrições com o bitset dele (slot
 * `constraints`).
 */
export const xpbdResources = Object.freeze({
    params: wgslResource({
        name: 'params',
        binding: { uniform: true },
        type: { schema: SimParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    particles: wgslResource({
        name: 'particles',
        binding: { storage: 'read_write' },
        type: { schema: XPBDSoftSchema, array: true },
        frequency: 'stage',
        provider: { slot: 'bodies' },
    }),
    /** Slots vivos do pool de partículas (spec 008). */
    live: wgslResource({
        name: 'live',
        binding: { storage: 'read' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: 'bodies', part: 'live' },
    }),
    constraints: wgslResource({
        name: 'constraints',
        binding: { storage: 'read' },
        type: { schema: DistanceConstraint.schema, array: true },
        frequency: 'stage',
        provider: { slot: 'constraints' },
    }),
    /** Slots vivos do pool de restrições. */
    constraintLive: wgslResource({
        name: 'constraint_live',
        binding: { storage: 'read' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: 'constraints', part: 'live' },
    }),
});

const R = xpbdResources;

/** Predição (gravidade + integração explícita; partícula fixa copia `pos` para `pred`). */
export const xpbdPredict = wgslModule({
    name: 'xpbd_predict',
    source: predictSource,
    requires: [
        poolLive,
        fieldPointTypes,
        fieldAccelReady,
        WORKGROUP_SIZE.module,
        R.params,
        R.particles,
        R.live,
    ],
});

/** Colisão das partículas com os colliders (spec 010; só com colliders na cena). */
export const xpbdCollide = wgslModule({
    name: 'xpbd_collide',
    source: xpbdCollideSource,
    requires: [poolLive, colliderSet, WORKGROUP_SIZE.module, R.params, R.particles, R.live],
});

/** Velocidade a partir de `pred − pos` e avanço de `pos`. */
export const xpbdVelocityUpdate = wgslModule({
    name: 'xpbd_velocity_update',
    source: velocityUpdateSource,
    requires: [poolLive, WORKGROUP_SIZE.module, R.params, R.particles, R.live],
});

/** Restrições de distância (Gauss-Seidel serial). */
export const xpbdDistanceSolve = wgslModule({
    name: 'xpbd_distance_solve',
    source: distanceSolveSource,
    requires: [poolLive, xpbd, R.params, R.particles, R.constraints, R.live, R.constraintLive],
});
