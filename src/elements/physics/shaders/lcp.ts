import { wgslModule } from '../../../scene/shaders/WgslModule';
import {
    wgslResource,
    type ResourceProvider,
    type WgslResource,
    type WgslResourceType,
} from '../../../scene/shaders/WgslResource';
import { NONE, WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { fieldAccelReady, fieldPointTypes } from './fields';
import { lcp, lcpState, quat, sdf, surfaceColliderHit, xpbd } from '../../gpu/shaders/math';
import rbPredictSource from '../../gpu/wgsl/kernels/rb_predict.wgsl?raw';
import rbNarrowphaseSource from '../../gpu/wgsl/kernels/rb_narrowphase.wgsl?raw';
import rbBuildLcpSource from '../../gpu/wgsl/kernels/rb_build_lcp.wgsl?raw';
import rbSolveLcpSource from '../../gpu/wgsl/kernels/rb_solve_lcp.wgsl?raw';
import rbContactAccumulateSource from '../../gpu/wgsl/kernels/rb_contact_accumulate.wgsl?raw';
import rbLcpCommitSource from '../../gpu/wgsl/kernels/rb_lcp_commit.wgsl?raw';
import rbPublishPoseSource from '../../gpu/wgsl/kernels/rb_publish_pose.wgsl?raw';
import rbBroadphaseSource from '../../gpu/wgsl/kernels/rb_broadphase.wgsl?raw';
import { atomicAlloc, fixedPoint, hashGridResources, spatialHash } from '../../gpu/compute/shaders';
import { AtomicAllocCounterSchema } from '../../gpu/compute/schemas';
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
import {
    RBBodyCorrectionSchema,
    RBBodyDeltaSchema,
    RBContactSchema,
    RBWarmEntrySchema,
} from '../../physics/schemas/simState';

// Kernels do LCP de corpos rígidos (spec 004: contatos compactados, solve Jacobi paralelo, manifold de caixas).

/** Buffer de storage do estágio (privado do `LCPFlow`, salvo `provider`). */
function stageBuffer(
    name: string,
    access: 'read' | 'read_write',
    type: WgslResourceType,
    provider: ResourceProvider = 'private',
): WgslResource {
    return wgslResource({
        name,
        binding: { storage: access },
        type,
        frequency: 'stage',
        provider,
    });
}

/** Uniform fixo do estágio (privado do `LCPFlow`). */
function stageUniform(name: string, type: WgslResourceType): WgslResource {
    return wgslResource({
        name,
        binding: { uniform: true },
        type,
        frequency: 'stage',
        provider: 'private',
    });
}

const u32s = { wgsl: 'u32', array: true } as const;
const bodiesType = { schema: LCPSchema, array: true } as const;

/**
 * Recursos do LCP (spec 031). `rb_params` é a região de `RBSimParams` da iteração (offset dinâmico, `draw`); os corpos
 * vêm do slot `bodies`; poses e lista de publicação, do slot `poses`; o resto é privado do `LCPFlow` (`stage`). Mesmo
 * nome com acesso ou tipo diferente entre kernels = recursos distintos.
 */
export const lcpResources = Object.freeze({
    params: wgslResource({
        name: 'rb_params',
        binding: { uniform: true },
        type: { schema: RBSimParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    /** Corpos (pool do `bodyType`), escrita: predict, narrowphase, solve, commit. */
    bodies: stageBuffer('bodies', 'read_write', bodiesType, { slot: 'bodies' }),
    /** Corpos, leitura: broadphase, montagem, publicação da pose. */
    bodiesRead: stageBuffer('bodies', 'read', bodiesType, { slot: 'bodies' }),
    /** Lista compactada de contatos, escrita (narrowphase, montagem, solve). */
    contacts: stageBuffer('contacts', 'read_write', { schema: RBContactSchema, array: true }),
    /** Lista compactada de contatos, leitura (correção posicional). */
    contactsRead: stageBuffer('contacts', 'read', { schema: RBContactSchema, array: true }),
    /** Contador `{ count, overflow }` da lista, alocação atômica (narrowphase). */
    counterAlloc: stageBuffer('contact_counter', 'read_write', {
        schema: AtomicAllocCounterSchema,
    }),
    /** Contador da lista lido como `u32` (`[0]` = contatos reservados). */
    counter: stageBuffer('contact_counter', 'read', u32s),
    /** Tabela de warm start (duas regiões por paridade do carimbo). */
    warmTable: stageBuffer('warm_table', 'read_write', { schema: RBWarmEntrySchema, array: true }),
    /** Contatos por corpo no substep, contagem atômica (narrowphase). */
    bodySplitCount: stageBuffer('body_split', 'read_write', { wgsl: 'atomic<u32>', array: true }),
    /** Contatos por corpo no substep, leitura (montagem, solve). */
    bodySplit: stageBuffer('body_split', 'read', u32s),
    /** Viés por contato, escrita (montagem). */
    bVec: stageBuffer('b_vec', 'read_write', { wgsl: 'f32', array: true }),
    /** Viés por contato, leitura (solve). */
    bVecRead: stageBuffer('b_vec', 'read', { wgsl: 'f32', array: true }),
    /** Somas Δv/Δω por corpo do solve (ponto fixo). */
    bodyDelta: stageBuffer('body_delta', 'read_write', { schema: RBBodyDeltaSchema, array: true }),
    /** Correção posicional e contatos por corpo (ponto fixo). */
    bodyCorrection: stageBuffer('body_correction', 'read_write', {
        schema: RBBodyCorrectionSchema,
        array: true,
    }),
    /** Parâmetros da narrowphase da variante (um buffer por pipeline). */
    npParams: stageUniform('np_params', { schema: NarrowphaseParamsSchema }),
    /** Mapa collider → corpo dono da variante (um buffer por pipeline). */
    bodyOwners: stageBuffer('body_owners', 'read', u32s),
    /** Pares candidatos da variante (caixas ou esferas; um buffer por pipeline). */
    pairs: stageBuffer('pairs', 'read', { schema: CandidatePairSchema, array: true }),
    /** Contagens de pares candidatos lidas como `u32` (0 = caixas, 1 = esferas). */
    pairCountsRead: stageBuffer('pair_counts', 'read', u32s),
    /** Pools de collider da narrowphase e da broadphase (do `ColliderSet`). */
    planes: stageBuffer('planes', 'read', { schema: PlaneCollider.schema, array: true }),
    boxes: stageBuffer('boxes', 'read', { schema: BoxCollider.schema, array: true }),
    spheres: stageBuffer('spheres', 'read', { schema: SphereCollider.schema, array: true }),
    meshes: stageBuffer('meshes', 'read', { schema: MeshCollider.schema, array: true }),
    surfaces: stageBuffer('surfaces', 'read', { schema: SurfaceCollider.schema, array: true }),
    /** Broadphase: parâmetros, proxies, donos, grandes, células, pares e argumentos do despacho indireto. */
    bpParams: stageUniform('bp_params', { schema: BroadphaseParamsSchema }),
    proxies: stageBuffer('proxies', 'read_write', { wgsl: 'vec4f', array: true }),
    boxOwners: stageBuffer('box_owners', 'read', u32s),
    sphereOwners: stageBuffer('sphere_owners', 'read', u32s),
    cellStart: stageBuffer('cell_start', 'read', u32s),
    cellCount: stageBuffer('cell_count', 'read', u32s),
    cellItems: stageBuffer('cell_items', 'read', u32s),
    large: stageBuffer('large', 'read', u32s),
    pairCounts: stageBuffer('pair_counts', 'read_write', { schema: CandidatePairCountsSchema }),
    boxPairs: stageBuffer('box_pairs', 'read_write', { schema: CandidatePairSchema, array: true }),
    spherePairs: stageBuffer('sphere_pairs', 'read_write', {
        schema: CandidatePairSchema,
        array: true,
    }),
    npArgs: stageBuffer('np_args', 'read_write', { schema: NarrowphaseDispatchSchema }),
    /** Publicação da pose: registros `RigidPose` e lista dos vivos (slot `poses`), `Transform` e parâmetros. */
    poses: stageBuffer(
        'poses',
        'read',
        { schema: RigidPoseSchema, array: true },
        {
            slot: 'poses',
            part: 'records',
        },
    ),
    poseList: stageBuffer(
        'pose_list',
        'read',
        { schema: RigidPoseInstanceSchema, array: true },
        { slot: 'poses', part: 'instances' },
    ),
    transforms: stageBuffer(
        'transforms',
        'read_write',
        { schema: Transform.schema, array: true },
        { pool: Transform.schema.name },
    ),
    publish: stageUniform('publish', { schema: PosePublishParamsSchema }),
});

const R = lcpResources;

/** Predição e gravidade por substep. */
export const rbPredict = wgslModule({
    name: 'rb_predict',
    source: rbPredictSource,
    requires: [
        quat,
        lcp,
        fieldPointTypes,
        fieldAccelReady,
        WORKGROUP_SIZE.module,
        R.params,
        R.bodies,
    ],
    structs: [LCPSchema, RBSimParamsSchema],
});

/** Narrowphase contra os 5 pools de collider (uma entrada por pool). */
export const rbNarrowphase = wgslModule({
    name: 'rb_narrowphase',
    source: rbNarrowphaseSource,
    requires: [
        lcpState,
        atomicAlloc,
        quat,
        lcp,
        sdf,
        surfaceColliderHit,
        WORKGROUP_SIZE.module,
        R.params,
        R.bodies,
        R.npParams,
        R.bodyOwners,
        R.contacts,
        R.counterAlloc,
        R.warmTable,
        R.bodySplitCount,
        R.pairs,
        R.pairCountsRead,
        R.planes,
        R.boxes,
        R.spheres,
        R.meshes,
        R.surfaces,
    ],
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
    requires: [
        quat,
        lcp,
        xpbd,
        NONE.module,
        WORKGROUP_SIZE.module,
        R.params,
        R.bodiesRead,
        R.contacts,
        R.bVec,
        R.counter,
        R.bodySplit,
    ],
    structs: [LCPSchema, RBSimParamsSchema, RBContactSchema],
});

/** Solve Jacobi paralelo (warm start, iteração por contato, aplicação por corpo, gravação do warm start). */
export const rbSolveLcp = wgslModule({
    name: 'rb_solve_lcp',
    source: rbSolveLcpSource,
    requires: [
        quat,
        lcp,
        xpbd,
        lcpState,
        fixedPoint,
        NONE.module,
        WORKGROUP_SIZE.module,
        R.params,
        R.bodies,
        R.contacts,
        R.bVecRead,
        R.counter,
        R.warmTable,
        R.bodyDelta,
        R.bodySplit,
    ],
    structs: [LCPSchema, RBSimParamsSchema, RBContactSchema],
});

/** Correção posicional acumulada por corpo. */
export const rbContactAccumulate = wgslModule({
    name: 'rb_contact_accumulate',
    source: rbContactAccumulateSource,
    requires: [
        lcpState,
        fixedPoint,
        WORKGROUP_SIZE.module,
        R.params,
        R.contactsRead,
        R.counter,
        R.bodyCorrection,
    ],
    structs: [RBSimParamsSchema, RBContactSchema],
});

/** Commit do passo. */
export const rbLcpCommit = wgslModule({
    name: 'rb_lcp_commit',
    source: rbLcpCommitSource,
    requires: [
        quat,
        lcp,
        xpbd,
        lcpState,
        fixedPoint,
        WORKGROUP_SIZE.module,
        R.params,
        R.bodies,
        R.bodyCorrection,
    ],
    structs: [LCPSchema, RBSimParamsSchema, RBContactSchema],
});

/** Publicação da pose de cada corpo no seu `Transform` (spec 007, fim do readback). */
export const rbPublishPose = wgslModule({
    name: 'rb_publish_pose',
    source: rbPublishPoseSource,
    requires: [WORKGROUP_SIZE.module, R.bodiesRead, R.poses, R.poseList, R.transforms, R.publish],
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
    requires: [
        quat,
        spatialHash,
        NONE.module,
        WORKGROUP_SIZE.module,
        R.params,
        R.bodiesRead,
        R.bpParams,
        R.proxies,
        R.boxes,
        R.boxOwners,
        R.spheres,
        R.sphereOwners,
        hashGridResources.grid,
        R.cellStart,
        R.cellCount,
        R.cellItems,
        R.large,
        R.pairCounts,
        R.boxPairs,
        R.spherePairs,
        R.npArgs,
    ],
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
