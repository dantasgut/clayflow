import { poolLive } from '../../gpu/compute/shaders';
import { FieldFnRecordSchema, fieldAccelReady, fieldPointTypes } from './fields';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { colliderSet, sphKernels } from '../../gpu/shaders/math';
import pbfPredictSource from '../../gpu/wgsl/kernels/pbf_predict.wgsl?raw';
import pbfDensityLambdaSource from '../../gpu/wgsl/kernels/pbf_density_lambda.wgsl?raw';
import pbfPositionCorrectSource from '../../gpu/wgsl/kernels/pbf_position_correct.wgsl?raw';
import pbfApplySource from '../../gpu/wgsl/kernels/pbf_apply.wgsl?raw';
import pbfCollisionSource from '../../gpu/wgsl/kernels/pbf_collision.wgsl?raw';
import pbfVelocityUpdateSource from '../../gpu/wgsl/kernels/pbf_velocity_update.wgsl?raw';
import pbfVorticitySource from '../../gpu/wgsl/kernels/pbf_vorticity.wgsl?raw';
import pbfXsphSource from '../../gpu/wgsl/kernels/pbf_xsph.wgsl?raw';
import { PBFSchema } from '../../physics/bodies/schemas/PBFSchema';
import { PBFSimParamsSchema } from '../../physics/schemas/simParams';

// Kernels do Position Based Fluids.

/** Predição. */
export const pbfPredict = wgslModule({
    name: 'pbf_predict',
    source: pbfPredictSource,
    requires: [poolLive, colliderSet, fieldPointTypes, fieldAccelReady],
    structs: [PBFSimParamsSchema, PBFSchema, FieldFnRecordSchema],
});

/** Densidade e λ (restrição unilateral). */
export const pbfDensityLambda = wgslModule({
    name: 'pbf_density_lambda',
    source: pbfDensityLambdaSource,
    requires: [poolLive, sphKernels],
    structs: [PBFSimParamsSchema, PBFSchema],
});

/** Correção Δp (gravada em delta). */
export const pbfPositionCorrect = wgslModule({
    name: 'pbf_position_correct',
    source: pbfPositionCorrectSource,
    requires: [poolLive, sphKernels],
    structs: [PBFSimParamsSchema, PBFSchema],
});

/** Aplicação das correções de posição e de velocidade. */
export const pbfApply = wgslModule({
    name: 'pbf_apply',
    source: pbfApplySource,
    requires: [poolLive],
    structs: [PBFSimParamsSchema, PBFSchema],
});

/** Colisão com o domínio e os colliders. */
export const pbfCollision = wgslModule({
    name: 'pbf_collision',
    source: pbfCollisionSource,
    requires: [poolLive, colliderSet],
    structs: [PBFSimParamsSchema, PBFSchema],
});

/** Velocidade a partir das posições. */
export const pbfVelocityUpdate = wgslModule({
    name: 'pbf_velocity_update',
    source: pbfVelocityUpdateSource,
    requires: [poolLive],
    structs: [PBFSimParamsSchema, PBFSchema],
});

/** Vorticidade ω. */
export const pbfVorticity = wgslModule({
    name: 'pbf_vorticity',
    source: pbfVorticitySource,
    requires: [poolLive, sphKernels],
    structs: [PBFSimParamsSchema, PBFSchema],
});

/** XSPH + confinamento de vorticidade (gravado em delta). */
export const pbfXsph = wgslModule({
    name: 'pbf_xsph',
    source: pbfXsphSource,
    requires: [poolLive, sphKernels],
    structs: [PBFSimParamsSchema, PBFSchema],
});
