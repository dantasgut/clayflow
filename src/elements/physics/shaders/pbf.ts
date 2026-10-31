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
/** Pool de trabalho por partícula do corpo (spec 039), pelo slot do Flow que o declara. */
const slotStorage = (
    name: string,
    access: 'read' | 'read_write',
    slot: string,
): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { storage: access },
        type: vec4s,
        frequency: 'stage',
        provider: { slot },
    });

/** Recursos dos kernels do PBF. */
export const pbfResources = Object.freeze({
    params: wgslResource({
        name: 'pbf_params',
        binding: { uniform: true },
        type: { schema: PBFSimParamsSchema },
        frequency: 'draw',
        // Uma região por iteração do uniforme por região do Resource de trabalho (offset dinâmico, spec 039).
        provider: { slot: 'work', descriptor: 'pbf_params' },
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
    delta: slotStorage('pbf_delta', 'read_write', 'delta'),
    deltaRead: slotStorage('pbf_delta', 'read', 'delta'),
    normal: slotStorage('pbf_normal', 'read_write', 'normals'),
    normalRead: slotStorage('pbf_normal', 'read', 'normals'),
    /** Fronteira sólida por partícula (Σ −B' n, Σ B), escrita a cada iteração do solver (spec 034). */
    boundary: slotStorage('pbf_boundary', 'read_write', 'boundary'),
    boundaryRead: slotStorage('pbf_boundary', 'read', 'boundary'),
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
