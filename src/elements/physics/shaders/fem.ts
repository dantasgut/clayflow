import { wgslModule } from '../../../scene/shaders/WgslModule';
import femPredictSource from '../../gpu/wgsl/kernels/fem_predict.wgsl?raw';
import femVelocityUpdateSource from '../../gpu/wgsl/kernels/fem_velocity_update.wgsl?raw';
import { XPBDSoftSchema } from '../../physics/bodies/schemas/XPBDSoftSchema';
import { FEMSimParamsSchema } from '../../physics/schemas/simParams';

// Kernels do FEM (por ora só integra gravidade — o solve elástico é da F5).

/** Predição dos nós. */
export const femPredict = wgslModule({
    name: 'fem_predict',
    source: femPredictSource,
    structs: [FEMSimParamsSchema, XPBDSoftSchema],
});

/** Velocidade e avanço dos nós. */
export const femVelocityUpdate = wgslModule({
    name: 'fem_velocity_update',
    source: femVelocityUpdateSource,
    structs: [FEMSimParamsSchema, XPBDSoftSchema],
});
