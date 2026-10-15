import { colliderSet } from '../../gpu/shaders/math';
import { poolLive } from '../../gpu/compute/shaders';
import { FieldFnRecordSchema, fieldAccelReady, fieldPointTypes } from './fields';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import femPredictSource from '../../gpu/wgsl/kernels/fem_predict.wgsl?raw';
import femCollideSource from '../../gpu/wgsl/kernels/fem_collide.wgsl?raw';
import femVelocityUpdateSource from '../../gpu/wgsl/kernels/fem_velocity_update.wgsl?raw';
import { XPBDSoftSchema } from '../../physics/bodies/schemas/XPBDSoftSchema';
import { FEMSimParamsSchema } from '../../physics/schemas/simParams';

// Kernels do FEM (por ora só integra gravidade — o solve elástico é da F5).

/** Predição dos nós. */
export const femPredict = wgslModule({
    name: 'fem_predict',
    source: femPredictSource,
    requires: [poolLive, fieldPointTypes, fieldAccelReady],
    structs: [FEMSimParamsSchema, XPBDSoftSchema, FieldFnRecordSchema],
});

/** Colisão dos nós com os colliders (spec 010; só com colliders na cena). */
export const femCollide = wgslModule({
    name: 'fem_collide',
    source: femCollideSource,
    requires: [poolLive, colliderSet],
    structs: [FEMSimParamsSchema, XPBDSoftSchema],
});

/** Velocidade e avanço dos nós. */
export const femVelocityUpdate = wgslModule({
    name: 'fem_velocity_update',
    source: femVelocityUpdateSource,
    requires: [poolLive],
    structs: [FEMSimParamsSchema, XPBDSoftSchema],
});
