import { poolLive } from '../../gpu/compute/shaders';
import { fieldAccelReady, fieldPointTypes } from './fields';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { NONE, WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { colliderSet, fluidBounds, mat, mpmMaterial, mpmWeights } from '../../gpu/shaders/math';
import mpmClearGridSource from '../../gpu/wgsl/kernels/mpm_clear_grid.wgsl?raw';
import mpmP2GSource from '../../gpu/wgsl/kernels/mpm_p2g.wgsl?raw';
import mpmGridUpdateSource from '../../gpu/wgsl/kernels/mpm_grid_update.wgsl?raw';
import mpmG2PSource from '../../gpu/wgsl/kernels/mpm_g2p.wgsl?raw';
import mpmParticleCollisionSource from '../../gpu/wgsl/kernels/mpm_particle_collision.wgsl?raw';
import { MPMFluidSchema } from '../../physics/bodies/schemas/MPMFluidSchema';
import { MPMSimParamsSchema } from '../../physics/schemas/simParams';
import { MPMGridNodeSchema } from '../../physics/schemas/simState';

// Kernels do MLS-MPM. Recursos (spec 031): os parâmetros de cada iteração têm frequência `draw` (região própria,
// offset dinâmico); a grade e o pool de partículas (com o bitset de vivos), `stage`. Colliders e campos vêm dos
// módulos `collider_set` e `field_accel_ready`, que já requerem os seus recursos.

/** Recursos do MPM. */
export const mpmResources = Object.freeze({
    /** `MPMSimParams` da iteração (região por iteração, offset dinâmico). */
    params: wgslResource({
        name: 'mpm_params',
        binding: { uniform: true },
        type: { schema: MPMSimParamsSchema },
        frequency: 'draw',
        provider: { slot: 'work', descriptor: 'mpm_params' },
    }),
    /** Grade euleriana (somas atômicas em ponto fixo no P2G). */
    grid: wgslResource({
        name: 'grid',
        binding: { storage: 'read_write' },
        type: { schema: MPMGridNodeSchema, array: true },
        frequency: 'stage',
        // A grade do domínio no Resource de trabalho (spec 039): a C2 a realoca quando a grade da física muda.
        provider: { slot: 'work', descriptor: 'mpm_grid' },
    }),
    /** Pool de partículas do `bodyType` (fluido ou sólido; mesmo struct `MPMParticle`). */
    particles: wgslResource({
        name: 'particles',
        binding: { storage: 'read_write' },
        type: { schema: MPMFluidSchema, array: true },
        frequency: 'stage',
        provider: { slot: 'bodies' },
    }),
    /** Bitset de slots vivos do pool de partículas (spec 008). */
    live: wgslResource({
        name: 'live',
        binding: { storage: 'read' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: 'bodies', part: 'live' },
    }),
});

const R = mpmResources;

/** Zera a grade. */
export const mpmClearGrid = wgslModule({
    name: 'mpm_clear_grid',
    source: mpmClearGridSource,
    requires: [WORKGROUP_SIZE.module, mpmMaterial, R.params, R.grid],
    structs: [MPMSimParamsSchema, MPMGridNodeSchema],
});

/** Partícula → grade (massa, momento, tensão). */
export const mpmP2G = wgslModule({
    name: 'mpm_p2g',
    source: mpmP2GSource,
    requires: [
        NONE.module,
        WORKGROUP_SIZE.module,
        poolLive,
        mat,
        mpmWeights,
        mpmMaterial,
        fluidBounds,
        R.params,
        R.grid,
        R.particles,
        R.live,
    ],
    structs: [MPMSimParamsSchema, MPMGridNodeSchema, MPMFluidSchema],
});

/** Atualização da grade (gravidade, contorno do domínio, colliders na faixa de uma célula). */
export const mpmGridUpdate = wgslModule({
    name: 'mpm_grid_update',
    source: mpmGridUpdateSource,
    requires: [
        WORKGROUP_SIZE.module,
        colliderSet,
        mpmMaterial,
        fieldPointTypes,
        fieldAccelReady,
        R.params,
        R.grid,
    ],
    structs: [MPMSimParamsSchema, MPMGridNodeSchema],
});

/** Grade → partícula (velocidade, APIC, F; reinício de F no fluido). */
export const mpmG2P = wgslModule({
    name: 'mpm_g2p',
    source: mpmG2PSource,
    requires: [
        NONE.module,
        WORKGROUP_SIZE.module,
        poolLive,
        mat,
        mpmWeights,
        mpmMaterial,
        fluidBounds,
        R.params,
        R.grid,
        R.particles,
        R.live,
    ],
    structs: [MPMSimParamsSchema, MPMGridNodeSchema, MPMFluidSchema],
});

/** Salvaguarda das partículas contra penetração em colliders. */
export const mpmParticleCollision = wgslModule({
    name: 'mpm_particle_collision',
    source: mpmParticleCollisionSource,
    requires: [
        WORKGROUP_SIZE.module,
        poolLive,
        colliderSet,
        mpmMaterial,
        R.params,
        R.particles,
        R.live,
    ],
    structs: [MPMSimParamsSchema, MPMFluidSchema],
});
