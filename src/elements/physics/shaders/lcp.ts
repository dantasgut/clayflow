import { wgslModule } from '../../../scene/shaders/WgslModule';
import { FieldFnRecordSchema, fieldAccelReady, fieldPointTypes } from './fields';
import { lcp, lcpState, quat, sdf, surfaceColliderHit, xpbd } from '../../gpu/shaders/math';
import rbPredictSource from '../../gpu/wgsl/kernels/rb_predict.wgsl?raw';
import rbNarrowphaseSource from '../../gpu/wgsl/kernels/rb_narrowphase.wgsl?raw';
import rbBuildLcpSource from '../../gpu/wgsl/kernels/rb_build_lcp.wgsl?raw';
import rbSolveLcpSource from '../../gpu/wgsl/kernels/rb_solve_lcp.wgsl?raw';
import rbContactAccumulateSource from '../../gpu/wgsl/kernels/rb_contact_accumulate.wgsl?raw';
import rbLcpCommitSource from '../../gpu/wgsl/kernels/rb_lcp_commit.wgsl?raw';
import rbPublishPoseSource from '../../gpu/wgsl/kernels/rb_publish_pose.wgsl?raw';
import rbBroadphaseSource from '../../gpu/wgsl/kernels/rb_broadphase.wgsl?raw';
import { atomicAlloc, fixedPoint, spatialHash } from '../../gpu/compute/shaders';
import {
    BroadphaseParamsSchema,
    CandidatePairCountsSchema,
    CandidatePairSchema,
    NarrowphaseDispatchSchema,
} from '../schemas/broadphase';
import { Transform } from '../../scene/Transform';
import { PosePublishParamsSchema, RigidPoseInstanceSchema, RigidPoseSchema } from '../schemas/pose';
import { PlaneCollider } from '../../physics/colliders/PlaneCollider';
import { BoxCollider } from '../../physics/colliders/BoxCollider';
import { SphereCollider } from '../../physics/colliders/SphereCollider';
import { MeshCollider } from '../../physics/colliders/MeshCollider';
import { SurfaceCollider } from '../../physics/colliders/SurfaceCollider';
import { LCPSchema } from '../../physics/bodies/schemas/LCPSchema';
import { RBSimParamsSchema, NarrowphaseParamsSchema } from '../../physics/schemas/simParams';
import { RBContactSchema } from '../../physics/schemas/simState';

// Kernels do LCP de corpos rígidos (spec 004: contatos compactados, solve Jacobi paralelo, manifold de caixas).

/** Predição e gravidade por substep. */
export const rbPredict = wgslModule({
    name: 'rb_predict',
    source: rbPredictSource,
    requires: [quat, lcp, fieldPointTypes, fieldAccelReady],
    structs: [LCPSchema, RBSimParamsSchema, FieldFnRecordSchema],
});

/** Narrowphase contra os 4 pools de collider (uma entrada por pool). */
export const rbNarrowphase = wgslModule({
    name: 'rb_narrowphase',
    source: rbNarrowphaseSource,
    requires: [lcpState, atomicAlloc, quat, lcp, sdf, surfaceColliderHit],
    structs: [
        LCPSchema,
        RBSimParamsSchema,
        RBContactSchema,
        CandidatePairSchema,
        PlaneCollider.schema,
        BoxCollider.schema,
        SphereCollider.schema,
        MeshCollider.schema,
        SurfaceCollider.schema,
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

/** Publicação da pose de cada corpo no seu `Transform` (spec 007, fim do readback). */
export const rbPublishPose = wgslModule({
    name: 'rb_publish_pose',
    source: rbPublishPoseSource,
    structs: [
        LCPSchema,
        RigidPoseSchema,
        RigidPoseInstanceSchema,
        Transform.schema,
        PosePublishParamsSchema,
    ],
});

/** Broadphase: proxies dos colliders, pares candidatos sobre a grade hash e argumentos do despacho indireto. */
export const rbBroadphase = wgslModule({
    name: 'rb_broadphase',
    source: rbBroadphaseSource,
    requires: [quat, spatialHash],
    structs: [
        LCPSchema,
        RBSimParamsSchema,
        BoxCollider.schema,
        SphereCollider.schema,
        CandidatePairSchema,
        BroadphaseParamsSchema,
        CandidatePairCountsSchema,
        NarrowphaseDispatchSchema,
    ],
});
