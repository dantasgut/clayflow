import { wgslModule } from '../../../scene/shaders/WgslModule';
import { lcp, lcpState, quat, sdf, xpbd } from '../../gpu/shaders/math';
import { atomicAlloc, fixedPoint } from '../../gpu/compute/shaders';
import rbPredictSource from '../../gpu/wgsl/kernels/rb_predict.wgsl?raw';
import rbNarrowphaseSource from '../../gpu/wgsl/kernels/rb_narrowphase.wgsl?raw';
import rbBuildLcpSource from '../../gpu/wgsl/kernels/rb_build_lcp.wgsl?raw';
import rbSolveLcpSource from '../../gpu/wgsl/kernels/rb_solve_lcp.wgsl?raw';
import rbContactAccumulateSource from '../../gpu/wgsl/kernels/rb_contact_accumulate.wgsl?raw';
import rbLcpCommitSource from '../../gpu/wgsl/kernels/rb_lcp_commit.wgsl?raw';
import { PlaneCollider } from '../../physics/colliders/PlaneCollider';
import { BoxCollider } from '../../physics/colliders/BoxCollider';
import { SphereCollider } from '../../physics/colliders/SphereCollider';
import { MeshCollider } from '../../physics/colliders/MeshCollider';
import { LCPSchema } from '../../physics/bodies/schemas/LCPSchema';
import { RBSimParamsSchema, NarrowphaseParamsSchema } from '../../physics/schemas/simParams';
import { RBContactSchema } from '../../physics/schemas/simState';

// Kernels do LCP de corpos rígidos (spec 004: contatos compactados, solve Jacobi paralelo, manifold de caixas).

/** Predição e gravidade por substep. */
export const rbPredict = wgslModule({
    name: 'rb_predict',
    source: rbPredictSource,
    requires: [quat, lcp],
    structs: [LCPSchema, RBSimParamsSchema],
});

/** Narrowphase contra os 4 pools de collider (uma entrada por pool). */
export const rbNarrowphase = wgslModule({
    name: 'rb_narrowphase',
    source: rbNarrowphaseSource,
    requires: [lcpState, atomicAlloc, quat, lcp, sdf],
    structs: [
        LCPSchema,
        RBSimParamsSchema,
        RBContactSchema,
        PlaneCollider.schema,
        BoxCollider.schema,
        SphereCollider.schema,
        MeshCollider.schema,
        NarrowphaseParamsSchema,
    ],
});

/** Montagem das linhas do LCP (Delassus, viés). */
export const rbBuildLcp = wgslModule({
    name: 'rb_build_lcp',
    source: rbBuildLcpSource,
    requires: [quat, lcp, xpbd],
    structs: [LCPSchema, RBSimParamsSchema, RBContactSchema],
});

/** Solve Jacobi paralelo (warm start, iteração por contato, aplicação por corpo, gravação do warm start). */
export const rbSolveLcp = wgslModule({
    name: 'rb_solve_lcp',
    source: rbSolveLcpSource,
    requires: [quat, lcp, xpbd, lcpState, fixedPoint],
    structs: [LCPSchema, RBSimParamsSchema, RBContactSchema],
});

/** Correção posicional acumulada por corpo. */
export const rbContactAccumulate = wgslModule({
    name: 'rb_contact_accumulate',
    source: rbContactAccumulateSource,
    requires: [lcpState, fixedPoint],
    structs: [RBSimParamsSchema, RBContactSchema],
});

/** Commit do passo. */
export const rbLcpCommit = wgslModule({
    name: 'rb_lcp_commit',
    source: rbLcpCommitSource,
    requires: [quat, lcp, xpbd, lcpState, fixedPoint],
    structs: [LCPSchema, RBSimParamsSchema, RBContactSchema],
});
