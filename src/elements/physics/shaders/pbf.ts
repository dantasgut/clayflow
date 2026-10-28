import { poolLive } from '../../gpu/compute/shaders';
import { fieldAccelReady, fieldPointTypes } from './fields';
import { neighborParticle, sphResources } from './sph';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource, type WgslResourceType } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { colliderSet, fluidBoundary, fluidBounds, sphKernels } from '../../gpu/shaders/math';
import pbfPredictSource from '../../gpu/wgsl/kernels/pbf_predict.wgsl?raw';
import pbfDensityLambdaSource from '../../gpu/wgsl/kernels/pbf_density_lambda.wgsl?raw';
import pbfPositionCorrectSource from '../../gpu/wgsl/kernels/pbf_position_correct.wgsl?raw';
import pbfApplySource from '../../gpu/wgsl/kernels/pbf_apply.wgsl?raw';
import pbfCollisionSource from '../../gpu/wgsl/kernels/pbf_collision.wgsl?raw';
import pbfVelocityUpdateSource from '../../gpu/wgsl/kernels/pbf_velocity_update.wgsl?raw';
import pbfVorticitySource from '../../gpu/wgsl/kernels/pbf_vorticity.wgsl?raw';
import pbfXsphSource from '../../gpu/wgsl/kernels/pbf_xsph.wgsl?raw';
import pbfBoundarySource from '../../gpu/wgsl/kernels/pbf_boundary.wgsl?raw';
import { PBFSchema } from '../../physics/bodies/schemas/PBFSchema';
import { PBFSimParamsSchema } from '../../physics/schemas/simParams';

// Kernels do Position Based Fluids.
// Recursos (spec 031): parâmetros por iteração (offset dinâmico, `draw`), o pool do slot `bodies` e o bitset de vivos,
// a vizinhança (mesmas declarações do SPH), as correções e as normais privadas do `PBFFlow` (`stage`).

const vec4s: WgslResourceType = { wgsl: 'vec4f', array: true };
const privateStorage = (
    name: string,
    access: 'read' | 'read_write',
    type: WgslResourceType,
): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { storage: access },
        type,
        frequency: 'stage',
        provider: 'private',
    });

/** Recursos dos kernels do PBF. */
export const pbfResources = Object.freeze({
    params: wgslResource({
        name: 'pbf_params',
        binding: { uniform: true },
        type: { schema: PBFSimParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    particles: wgslResource({
        name: 'particles',
        binding: { storage: 'read_write' },
        type: { schema: PBFSchema, array: true },
        frequency: 'stage',
        provider: { slot: 'bodies' },
    }),
    live: sphResources.live,
    neighborList: sphResources.neighborList,
    neighborCount: sphResources.neighborCount,
    neighborOrder: sphResources.neighborOrder,
    delta: privateStorage('pbf_delta', 'read_write', vec4s),
    deltaRead: privateStorage('pbf_delta', 'read', vec4s),
    normal: privateStorage('pbf_normal', 'read_write', vec4s),
    normalRead: privateStorage('pbf_normal', 'read', vec4s),
    /** Fronteira sólida por partícula (Σ −B' n, Σ B), escrita a cada iteração do solver (spec 034). */
    boundary: privateStorage('pbf_boundary', 'read_write', vec4s),
    boundaryRead: privateStorage('pbf_boundary', 'read', vec4s),
});
const R = pbfResources;
const own = [WORKGROUP_SIZE.module, R.params, R.particles, R.live] as const;
const neighbors = [neighborParticle, R.neighborList, R.neighborCount] as const;

/** Predição. */
export const pbfPredict = wgslModule({
    name: 'pbf_predict',
    source: pbfPredictSource,
    requires: [poolLive, colliderSet, fieldPointTypes, fieldAccelReady, ...own],
    structs: [PBFSimParamsSchema, PBFSchema],
});

/** Fronteira sólida por partícula (Akinci et al. 2012; spec 034): o volume do núcleo nos sólidos e o gradiente dele. */
export const pbfBoundary = wgslModule({
    name: 'pbf_boundary_pass',
    source: pbfBoundarySource,
    requires: [poolLive, fluidBoundary, ...own, R.boundary],
    structs: [PBFSimParamsSchema, PBFSchema],
});

/** Densidade e λ (restrição unilateral), com a fronteira sólida. */
export const pbfDensityLambda = wgslModule({
    name: 'pbf_density_lambda',
    source: pbfDensityLambdaSource,
    requires: [poolLive, sphKernels, ...own, ...neighbors, R.boundaryRead],
    structs: [PBFSimParamsSchema, PBFSchema],
});

/** Correção Δp (gravada em delta). */
export const pbfPositionCorrect = wgslModule({
    name: 'pbf_position_correct',
    source: pbfPositionCorrectSource,
    requires: [poolLive, sphKernels, ...own, ...neighbors, R.delta, R.boundaryRead],
    structs: [PBFSimParamsSchema, PBFSchema],
});

/** Aplicação das correções de posição e de velocidade. */
export const pbfApply = wgslModule({
    name: 'pbf_apply',
    source: pbfApplySource,
    requires: [poolLive, ...own, R.deltaRead],
    structs: [PBFSimParamsSchema, PBFSchema],
});

/** Colisão com o domínio e os colliders. */
export const pbfCollision = wgslModule({
    name: 'pbf_collision',
    source: pbfCollisionSource,
    requires: [poolLive, colliderSet, ...own],
    structs: [PBFSimParamsSchema, PBFSchema],
});

/** Velocidade a partir das posições, com o ancoramento da gota solta (spec 034). */
export const pbfVelocityUpdate = wgslModule({
    name: 'pbf_velocity_update',
    source: pbfVelocityUpdateSource,
    requires: [poolLive, fluidBounds, ...own, neighborParticle, R.neighborCount],
    structs: [PBFSimParamsSchema, PBFSchema],
});

/** Vorticidade ω. */
export const pbfVorticity = wgslModule({
    name: 'pbf_vorticity',
    source: pbfVorticitySource,
    requires: [poolLive, sphKernels, ...own, ...neighbors, R.normal],
    structs: [PBFSimParamsSchema, PBFSchema],
});

/** XSPH + confinamento de vorticidade (gravado em delta). */
export const pbfXsph = wgslModule({
    name: 'pbf_xsph',
    source: pbfXsphSource,
    requires: [poolLive, sphKernels, ...own, ...neighbors, R.delta, R.normalRead],
    structs: [PBFSimParamsSchema, PBFSchema],
});
