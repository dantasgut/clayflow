import { wgslModule } from '../../../scene/shaders/WgslModule';
import { colliderSet } from '../../gpu/shaders/math';
import { pbfParticleStructs, pbfSimParamsStructs } from '../../gpu/shaders/structs';
import pbfPredictSource from '../../gpu/wgsl/kernels/pbf_predict.wgsl?raw';
import pbfDensityLambdaSource from '../../gpu/wgsl/kernels/pbf_density_lambda.wgsl?raw';
import pbfPositionCorrectSource from '../../gpu/wgsl/kernels/pbf_position_correct.wgsl?raw';
import pbfApplySource from '../../gpu/wgsl/kernels/pbf_apply.wgsl?raw';
import pbfCollisionSource from '../../gpu/wgsl/kernels/pbf_collision.wgsl?raw';
import pbfVelocityUpdateSource from '../../gpu/wgsl/kernels/pbf_velocity_update.wgsl?raw';
import pbfVorticitySource from '../../gpu/wgsl/kernels/pbf_vorticity.wgsl?raw';
import pbfXsphSource from '../../gpu/wgsl/kernels/pbf_xsph.wgsl?raw';

// Kernels do Position Based Fluids.

const base = [pbfSimParamsStructs, pbfParticleStructs];

/** Predição. */
export const pbfPredict = wgslModule({
    name: 'pbf_predict',
    source: pbfPredictSource,
    requires: base,
});

/** Densidade e λ (restrição unilateral). */
export const pbfDensityLambda = wgslModule({
    name: 'pbf_density_lambda',
    source: pbfDensityLambdaSource,
    requires: base,
});

/** Correção Δp (gravada em delta). */
export const pbfPositionCorrect = wgslModule({
    name: 'pbf_position_correct',
    source: pbfPositionCorrectSource,
    requires: base,
});

/** Aplicação das correções de posição e de velocidade. */
export const pbfApply = wgslModule({ name: 'pbf_apply', source: pbfApplySource, requires: base });

/** Colisão com o domínio e os colliders. */
export const pbfCollision = wgslModule({
    name: 'pbf_collision',
    source: pbfCollisionSource,
    requires: [colliderSet, ...base],
});

/** Velocidade a partir das posições. */
export const pbfVelocityUpdate = wgslModule({
    name: 'pbf_velocity_update',
    source: pbfVelocityUpdateSource,
    requires: base,
});

/** Vorticidade ω. */
export const pbfVorticity = wgslModule({
    name: 'pbf_vorticity',
    source: pbfVorticitySource,
    requires: base,
});

/** XSPH + confinamento de vorticidade (gravado em delta). */
export const pbfXsph = wgslModule({ name: 'pbf_xsph', source: pbfXsphSource, requires: base });
