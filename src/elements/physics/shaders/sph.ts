import { poolLive } from '../../gpu/compute/shaders';
import { FieldFnRecordSchema, fieldAccelReady, fieldPointTypes } from './fields';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource, type WgslResourceType } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { colliderSet, sphKernels } from '../../gpu/shaders/math';
import sphDensitySource from '../../gpu/wgsl/kernels/sph_density.wgsl?raw';
import sphPressureSource from '../../gpu/wgsl/kernels/sph_pressure.wgsl?raw';
import sphNormalsSource from '../../gpu/wgsl/kernels/sph_normals.wgsl?raw';
import sphForcesSource from '../../gpu/wgsl/kernels/sph_forces.wgsl?raw';
import sphIntegrateSource from '../../gpu/wgsl/kernels/sph_integrate.wgsl?raw';
import sphCollisionSource from '../../gpu/wgsl/kernels/sph_collision.wgsl?raw';
import { SPHSchema } from '../../physics/bodies/schemas/SPHSchema';
import { SPHSimParamsSchema } from '../../physics/schemas/simParams';

// Kernels do SPH fracamente compressível.
// Recursos (spec 031): parâmetros por iteração (offset dinâmico, `draw`), o pool do slot `bodies` e o bitset de vivos,
// a vizinhança e as normais privadas do `SPHFlow` (`stage`).

const u32s: WgslResourceType = { wgsl: 'u32', array: true };
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

/** Recursos dos kernels do SPH. */
export const sphResources = Object.freeze({
    params: wgslResource({
        name: 'sph_params',
        binding: { uniform: true },
        type: { schema: SPHSimParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    particles: wgslResource({
        name: 'particles',
        binding: { storage: 'read_write' },
        type: { schema: SPHSchema, array: true },
        frequency: 'stage',
        provider: { slot: 'bodies' },
    }),
    live: wgslResource({
        name: 'live',
        binding: { storage: 'read' },
        type: u32s,
        frequency: 'stage',
        provider: { slot: 'bodies', part: 'live' },
    }),
    neighborList: privateStorage('neighbor_list', 'read', u32s),
    neighborCount: privateStorage('neighbor_count', 'read', u32s),
    normal: privateStorage('sph_normal', 'read_write', vec4s),
    normalRead: privateStorage('sph_normal', 'read', vec4s),
});
const R = sphResources;
const own = [WORKGROUP_SIZE.module, R.params, R.particles, R.live] as const;
const neighbors = [R.neighborList, R.neighborCount] as const;

/** Densidade por soma dos vizinhos. */
export const sphDensity = wgslModule({
    name: 'sph_density',
    source: sphDensitySource,
    requires: [poolLive, sphKernels, ...own, ...neighbors],
    structs: [SPHSimParamsSchema, SPHSchema],
});

/** Pressão (Tait). */
export const sphPressure = wgslModule({
    name: 'sph_pressure',
    source: sphPressureSource,
    requires: [poolLive, ...own],
    structs: [SPHSimParamsSchema, SPHSchema],
});

/** Normais de superfície da tensão superficial de Akinci (spec 030). */
export const sphNormals = wgslModule({
    name: 'sph_normals',
    source: sphNormalsSource,
    requires: [poolLive, sphKernels, ...own, ...neighbors, R.normal],
    structs: [SPHSimParamsSchema, SPHSchema],
});

/** Forças de pressão, viscosidade, tensão superficial e XSPH. */
export const sphForces = wgslModule({
    name: 'sph_forces',
    source: sphForcesSource,
    requires: [
        poolLive,
        sphKernels,
        fieldPointTypes,
        fieldAccelReady,
        ...own,
        ...neighbors,
        R.normalRead,
    ],
    structs: [SPHSimParamsSchema, SPHSchema, FieldFnRecordSchema],
});

/** Integração. */
export const sphIntegrate = wgslModule({
    name: 'sph_integrate',
    source: sphIntegrateSource,
    requires: [poolLive, ...own],
    structs: [SPHSimParamsSchema, SPHSchema],
});

/** Colisão com o domínio e os colliders. */
export const sphCollision = wgslModule({
    name: 'sph_collision',
    source: sphCollisionSource,
    requires: [poolLive, colliderSet, ...own],
    structs: [SPHSimParamsSchema, SPHSchema],
});
