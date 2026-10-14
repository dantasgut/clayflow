import { poolLive } from '../../gpu/compute/shaders';
import { wgslModule } from '../../../scene/shaders/WgslModule';
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

/** Densidade por soma dos vizinhos. */
export const sphDensity = wgslModule({
    name: 'sph_density',
    source: sphDensitySource,
    requires: [poolLive, sphKernels],
    structs: [SPHSimParamsSchema, SPHSchema],
});

/** Pressão (Tait). */
export const sphPressure = wgslModule({
    name: 'sph_pressure',
    source: sphPressureSource,
    requires: [poolLive],
    structs: [SPHSimParamsSchema, SPHSchema],
});

/** Normais de superfície da tensão superficial de Akinci (spec 030). */
export const sphNormals = wgslModule({
    name: 'sph_normals',
    source: sphNormalsSource,
    requires: [poolLive, sphKernels],
    structs: [SPHSimParamsSchema, SPHSchema],
});

/** Forças de pressão, viscosidade, tensão superficial e XSPH. */
export const sphForces = wgslModule({
    name: 'sph_forces',
    source: sphForcesSource,
    requires: [poolLive, sphKernels],
    structs: [SPHSimParamsSchema, SPHSchema],
});

/** Integração. */
export const sphIntegrate = wgslModule({
    name: 'sph_integrate',
    source: sphIntegrateSource,
    requires: [poolLive],
    structs: [SPHSimParamsSchema, SPHSchema],
});

/** Colisão com o domínio e os colliders. */
export const sphCollision = wgslModule({
    name: 'sph_collision',
    source: sphCollisionSource,
    requires: [poolLive, colliderSet],
    structs: [SPHSimParamsSchema, SPHSchema],
});
