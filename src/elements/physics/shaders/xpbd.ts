import { poolLive } from '../../gpu/compute/shaders';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { xpbd } from '../../gpu/shaders/math';
import predictSource from '../../gpu/wgsl/kernels/predict.wgsl?raw';
import velocityUpdateSource from '../../gpu/wgsl/kernels/velocity_update.wgsl?raw';
import distanceSolveSource from '../../gpu/wgsl/kernels/distance_solve.wgsl?raw';
import { DistanceConstraint } from '../../physics/constraints/DistanceConstraint';
import { XPBDSoftSchema } from '../../physics/bodies/schemas/XPBDSoftSchema';
import { SimParamsSchema } from '../../physics/schemas/simParams';

// Kernels do XPBD de partículas.

/** Predição (gravidade + integração explícita; partícula fixa copia `pos` para `pred`). */
export const xpbdPredict = wgslModule({
    name: 'xpbd_predict',
    source: predictSource,
    requires: [poolLive],
    structs: [SimParamsSchema, XPBDSoftSchema],
});

/** Velocidade a partir de `pred − pos` e avanço de `pos`. */
export const xpbdVelocityUpdate = wgslModule({
    name: 'xpbd_velocity_update',
    source: velocityUpdateSource,
    requires: [poolLive],
    structs: [SimParamsSchema, XPBDSoftSchema],
});

/** Restrições de distância (Gauss-Seidel serial). */
export const xpbdDistanceSolve = wgslModule({
    name: 'xpbd_distance_solve',
    source: distanceSolveSource,
    requires: [poolLive, xpbd],
    structs: [SimParamsSchema, XPBDSoftSchema, DistanceConstraint.schema],
});
