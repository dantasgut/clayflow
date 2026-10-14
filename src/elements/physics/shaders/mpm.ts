import { poolLive } from '../../gpu/compute/shaders';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { colliderSet, mat, mpmMaterial, mpmWeights } from '../../gpu/shaders/math';
import mpmClearGridSource from '../../gpu/wgsl/kernels/mpm_clear_grid.wgsl?raw';
import mpmP2GSource from '../../gpu/wgsl/kernels/mpm_p2g.wgsl?raw';
import mpmGridUpdateSource from '../../gpu/wgsl/kernels/mpm_grid_update.wgsl?raw';
import mpmG2PSource from '../../gpu/wgsl/kernels/mpm_g2p.wgsl?raw';
import mpmParticleCollisionSource from '../../gpu/wgsl/kernels/mpm_particle_collision.wgsl?raw';
import { MPMFluidSchema } from '../../physics/bodies/schemas/MPMFluidSchema';
import { MPMSimParamsSchema } from '../../physics/schemas/simParams';
import { MPMGridNodeSchema } from '../../physics/schemas/simState';

// Kernels do MLS-MPM.

/** Zera a grade. */
export const mpmClearGrid = wgslModule({
    name: 'mpm_clear_grid',
    source: mpmClearGridSource,
    requires: [mpmMaterial],
    structs: [MPMSimParamsSchema, MPMGridNodeSchema],
});

/** Partícula → grade (massa, momento, tensão). */
export const mpmP2G = wgslModule({
    name: 'mpm_p2g',
    source: mpmP2GSource,
    requires: [poolLive, mat, mpmWeights, mpmMaterial],
    structs: [MPMSimParamsSchema, MPMGridNodeSchema, MPMFluidSchema],
});

/** Atualização da grade (gravidade, contorno do domínio, colliders na faixa de uma célula). */
export const mpmGridUpdate = wgslModule({
    name: 'mpm_grid_update',
    source: mpmGridUpdateSource,
    requires: [colliderSet, mpmMaterial],
    structs: [MPMSimParamsSchema, MPMGridNodeSchema],
});

/** Grade → partícula (velocidade, APIC, F; reinício de F no fluido). */
export const mpmG2P = wgslModule({
    name: 'mpm_g2p',
    source: mpmG2PSource,
    requires: [poolLive, mat, mpmWeights, mpmMaterial],
    structs: [MPMSimParamsSchema, MPMGridNodeSchema, MPMFluidSchema],
});

/** Salvaguarda das partículas contra penetração em colliders. */
export const mpmParticleCollision = wgslModule({
    name: 'mpm_particle_collision',
    source: mpmParticleCollisionSource,
    requires: [poolLive, colliderSet, mpmMaterial],
    structs: [MPMSimParamsSchema, MPMFluidSchema],
});
