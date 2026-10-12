import { wgslModule } from '../../../scene/shaders/WgslModule';
import { colliderSet, sphKernels } from '../../gpu/shaders/math';
import { sphParticleStructs, sphSimParamsStructs } from '../../gpu/shaders/structs';
import sphDensitySource from '../../gpu/wgsl/kernels/sph_density.wgsl?raw';
import sphPressureSource from '../../gpu/wgsl/kernels/sph_pressure.wgsl?raw';
import sphForcesSource from '../../gpu/wgsl/kernels/sph_forces.wgsl?raw';
import sphIntegrateSource from '../../gpu/wgsl/kernels/sph_integrate.wgsl?raw';
import sphCollisionSource from '../../gpu/wgsl/kernels/sph_collision.wgsl?raw';

// Kernels do SPH fracamente compressível.

const base = [sphSimParamsStructs, sphParticleStructs];

/** Densidade por soma dos vizinhos. */
export const sphDensity = wgslModule({
    name: 'sph_density',
    source: sphDensitySource,
    requires: [sphKernels, ...base],
});

/** Pressão (Tait). */
export const sphPressure = wgslModule({
    name: 'sph_pressure',
    source: sphPressureSource,
    requires: base,
});

/** Forças de pressão, viscosidade e XSPH. */
export const sphForces = wgslModule({
    name: 'sph_forces',
    source: sphForcesSource,
    requires: [sphKernels, ...base],
});

/** Integração. */
export const sphIntegrate = wgslModule({
    name: 'sph_integrate',
    source: sphIntegrateSource,
    requires: base,
});

/** Colisão com o domínio e os colliders. */
export const sphCollision = wgslModule({
    name: 'sph_collision',
    source: sphCollisionSource,
    requires: [colliderSet, ...base],
});
