/**
 * PhysicsShaderLibrary — registro centralizado de pipelines de compute de física.
 *
 * Responsabilidades:
 *   1. Compõe shaders WGSL completos via WgslComposer (deduplicação automática).
 *   2. Registra todos os compute pipelines no WebGPUComputeManager via Facade.
 *   3. Expõe IDs de pipeline como constantes para os estágios de dispatch.
 *
 * Uso: chamar `PhysicsShaderLibrary.ensureInitialized(core)` uma vez por sessão
 * (normalmente no primeiro execute() do GpuParticleSimPipeline).
 * Chamadas subsequentes são no-op (idempotente).
 *
 * Arquitetura: Layer 3 (elements/physics/gpu) → Facade Layer 1 via WebGPUEngineCore.
 * Não depende de Layer 4 (presentation) — shaders de física são independentes do render.
 */

import type { WebGPUEngineCore } from '../../../core/WebGPUEngineCore';
import { WgslComposer } from './WgslComposer';

// ── Structs ────────────────────────────────────────────────────────────────────
import { WGSL_STRUCT_SIM_PARAMS }           from './wgsl/structs/sim_params.wgsl';
import { WGSL_STRUCT_PARTICLE }             from './wgsl/structs/particle.wgsl';
import { WGSL_STRUCT_DISTANCE_CONSTRAINT }  from './wgsl/structs/distance_constraint.wgsl';
import { WGSL_STRUCT_COLLIDER_DESC }        from './wgsl/structs/collider_desc.wgsl';
import { WGSL_STRUCT_RIGID_BODY }           from './wgsl/structs/rigid_body.wgsl';
import { WGSL_STRUCT_RB_SIM_PARAMS }        from './wgsl/structs/rb_sim_params.wgsl';
import { WGSL_STRUCT_RB_CONTACT }           from './wgsl/structs/rb_contact.wgsl';

// ── Math modules ──────────────────────────────────────────────────────────────
import { WGSL_XPBD }         from './wgsl/math/xpbd.wgsl';
import { WGSL_SDF }          from './wgsl/math/sdf.wgsl';
import { WGSL_MAT }          from './wgsl/math/mat.wgsl';
import { WGSL_IMPULSE }      from './wgsl/math/impulse.wgsl';
import { WGSL_CONTACT_MATH } from './wgsl/math/contact_math.wgsl';

// ── Math modules (shape matching) ─────────────────────────────────────────────
import { WGSL_QUAT }           from './wgsl/math/quat.wgsl';
import { WGSL_SHAPE_MATCHING } from './wgsl/math/shape_matching.wgsl';

// ── Kernels ───────────────────────────────────────────────────────────────────
import { WGSL_KERNEL_PREDICT }                from './wgsl/kernels/predict.wgsl';
import { WGSL_KERNEL_DISTANCE_SOLVE }         from './wgsl/kernels/distance_solve.wgsl';
import { WGSL_KERNEL_COLLISION }              from './wgsl/kernels/collision.wgsl';
import { WGSL_KERNEL_VELOCITY_UPDATE }        from './wgsl/kernels/velocity_update.wgsl';
import { WGSL_KERNEL_VERTEX_WRITE }           from './wgsl/kernels/vertex_write.wgsl';
import { WGSL_KERNEL_SHAPE_MATCH_TRANSFORM }  from './wgsl/kernels/shape_match_transform.wgsl';
import { WGSL_KERNEL_SHAPE_CORRECT }          from './wgsl/kernels/shape_correct.wgsl';
import { WGSL_KERNEL_DISTANCE_SOLVE_COLOR }   from './wgsl/kernels/distance_solve_color.wgsl';
import { WGSL_KERNEL_DISTANCE_SOLVE_JACOBI }  from './wgsl/kernels/distance_solve_jacobi.wgsl';
import { WGSL_KERNEL_JACOBI_APPLY }           from './wgsl/kernels/jacobi_apply.wgsl';
import { WGSL_KERNEL_RB_PREDICT }             from './wgsl/kernels/rb_predict.wgsl';
import { WGSL_KERNEL_RB_NARROWPHASE }         from './wgsl/kernels/rb_narrowphase.wgsl';
import { WGSL_KERNEL_RB_SOLVE }               from './wgsl/kernels/rb_solve.wgsl';
import { WGSL_KERNEL_RB_VELOCITY_RECOVERY }   from './wgsl/kernels/rb_velocity_recovery.wgsl';
import { WGSL_KERNEL_RB_SYNC_TRANSFORM }     from './wgsl/kernels/rb_sync_transform.wgsl';
import { WGSL_KERNEL_RB_BUILD_LCP }          from './wgsl/kernels/rb_build_lcp.wgsl';
import { WGSL_KERNEL_RB_SOLVE_LCP }          from './wgsl/kernels/rb_solve_lcp.wgsl';
import { WGSL_KERNEL_RB_LCP_COMMIT }         from './wgsl/kernels/rb_lcp_commit.wgsl';
import { WGSL_LCP }                          from './wgsl/math/lcp.wgsl';

// ── Pipeline IDs ──────────────────────────────────────────────────────────────

/** IDs estáveis para getComputePipeline() e dispatchOnPass() — não mudam entre frames. */
export const PIPELINE_IDS = Object.freeze({
    PREDICT:                 'physics_predict',
    DISTANCE_SOLVE:          'physics_distance_solve',
    COLLISION:               'physics_collision',
    VELOCITY_UPDATE:         'physics_velocity_update',
    VERTEX_WRITE:            'physics_vertex_write',
    DISTANCE_SOLVE_COLOR:    'physics_distance_solve_color',
    DISTANCE_SOLVE_JACOBI:   'physics_distance_solve_jacobi',
    JACOBI_APPLY:            'physics_jacobi_apply',
    SHAPE_MATCH_TRANSFORM:   'physics_shape_match_transform',
    SHAPE_CORRECT:           'physics_shape_correct',
    RB_PREDICT:              'physics_rb_predict',
    RB_NARROWPHASE:          'physics_rb_narrowphase',
    RB_SOLVE:                'physics_rb_solve',
    RB_VELOCITY_RECOVERY:    'physics_rb_velocity_recovery',
    RB_SYNC_TRANSFORM:       'physics_rb_sync_transform',
    RB_BUILD_LCP:            'physics_rb_build_lcp',
    RB_SOLVE_LCP:            'physics_rb_solve_lcp',
    RB_LCP_COMMIT:           'rb_lcp_commit_pipeline',
} as const);

// ── Shaders compostos ─────────────────────────────────────────────────────────

const SHADER_PREDICT = WgslComposer.compose(
    WGSL_STRUCT_SIM_PARAMS,
    WGSL_STRUCT_PARTICLE,
    WGSL_KERNEL_PREDICT,
);

const SHADER_DISTANCE_SOLVE = WgslComposer.compose(
    WGSL_STRUCT_SIM_PARAMS,
    WGSL_STRUCT_PARTICLE,
    WGSL_STRUCT_DISTANCE_CONSTRAINT,
    WGSL_XPBD,
    WGSL_KERNEL_DISTANCE_SOLVE,
);

// Graph coloring — paralelo por cor, workgroup_size(64), group(1) = ColorRange
const SHADER_DISTANCE_SOLVE_COLOR = WgslComposer.compose(
    WGSL_STRUCT_SIM_PARAMS,
    WGSL_STRUCT_PARTICLE,
    WGSL_STRUCT_DISTANCE_CONSTRAINT,
    WGSL_XPBD,
    WGSL_KERNEL_DISTANCE_SOLVE_COLOR,
);

// Jacobi — todas constraints em paralelo, acumula em atomic<i32>[N×4] (Fase 3d)
const SHADER_DISTANCE_SOLVE_JACOBI = WgslComposer.compose(
    WGSL_STRUCT_SIM_PARAMS,
    WGSL_STRUCT_PARTICLE,
    WGSL_STRUCT_DISTANCE_CONSTRAINT,
    WGSL_KERNEL_DISTANCE_SOLVE_JACOBI,
);

// Jacobi apply — aplica correção média e limpa acum (Fase 3d)
const SHADER_JACOBI_APPLY = WgslComposer.compose(
    WGSL_STRUCT_SIM_PARAMS,
    WGSL_STRUCT_PARTICLE,
    WGSL_KERNEL_JACOBI_APPLY,
);

const SHADER_COLLISION = WgslComposer.compose(
    WGSL_STRUCT_SIM_PARAMS,
    WGSL_STRUCT_PARTICLE,
    WGSL_STRUCT_COLLIDER_DESC,
    WGSL_SDF,
    WGSL_MAT,
    WGSL_KERNEL_COLLISION,
);

const SHADER_VELOCITY_UPDATE = WgslComposer.compose(
    WGSL_STRUCT_SIM_PARAMS,
    WGSL_STRUCT_PARTICLE,
    WGSL_KERNEL_VELOCITY_UPDATE,
);

const SHADER_VERTEX_WRITE = WgslComposer.compose(
    WGSL_STRUCT_SIM_PARAMS,
    WGSL_STRUCT_PARTICLE,
    WGSL_KERNEL_VERTEX_WRITE,
);

// shape_match_transform: serial, computa CM + A_pq + polar decomp + metas
const SHADER_SHAPE_MATCH_TRANSFORM = WgslComposer.compose(
    WGSL_STRUCT_SIM_PARAMS,
    WGSL_STRUCT_PARTICLE,
    WGSL_MAT,
    WGSL_QUAT,
    WGSL_SHAPE_MATCHING,
    WGSL_KERNEL_SHAPE_MATCH_TRANSFORM,
);

// shape_correct: paralelo, aplica pred_i += alpha*(g_i - pred_i)
const SHADER_SHAPE_CORRECT = WgslComposer.compose(
    WGSL_STRUCT_SIM_PARAMS,
    WGSL_STRUCT_PARTICLE,
    WGSL_KERNEL_SHAPE_CORRECT,
);

// ── RigidBody GPU shaders ─────────────────────────────────────────────────────

const SHADER_RB_PREDICT = WgslComposer.compose(
    WGSL_STRUCT_RB_SIM_PARAMS,
    WGSL_STRUCT_RIGID_BODY,
    WGSL_IMPULSE,
    WGSL_QUAT,
    WGSL_KERNEL_RB_PREDICT,
);

const SHADER_RB_NARROWPHASE = WgslComposer.compose(
    WGSL_STRUCT_RB_SIM_PARAMS,
    WGSL_STRUCT_RIGID_BODY,
    WGSL_STRUCT_COLLIDER_DESC,
    WGSL_STRUCT_RB_CONTACT,
    WGSL_SDF,
    WGSL_MAT,
    WGSL_KERNEL_RB_NARROWPHASE,
);

const SHADER_RB_SOLVE = WgslComposer.compose(
    WGSL_STRUCT_RB_SIM_PARAMS,
    WGSL_STRUCT_RIGID_BODY,
    WGSL_STRUCT_RB_CONTACT,
    WGSL_XPBD,
    WGSL_IMPULSE,
    WGSL_QUAT,
    WGSL_KERNEL_RB_SOLVE,
);

const SHADER_RB_VELOCITY_RECOVERY = WgslComposer.compose(
    WGSL_STRUCT_RB_SIM_PARAMS,
    WGSL_STRUCT_RIGID_BODY,
    WGSL_QUAT,
    WGSL_KERNEL_RB_VELOCITY_RECOVERY,
);

// rb_sync_transform: lê pos_pred/rot_pred → escreve mat4x4f no UBO do renderer
const SHADER_RB_SYNC_TRANSFORM = WgslComposer.compose(
    WGSL_STRUCT_RB_SIM_PARAMS,
    WGSL_STRUCT_RIGID_BODY,
    WGSL_MAT,
    WGSL_KERNEL_RB_SYNC_TRANSFORM,
);

// rb_build_lcp: pré-computa bias b[i] + diagonais de Delassus por contato ativo
const SHADER_RB_BUILD_LCP = WgslComposer.compose(
    WGSL_STRUCT_RB_SIM_PARAMS,
    WGSL_STRUCT_RIGID_BODY,
    WGSL_STRUCT_RB_CONTACT,
    WGSL_XPBD,
    WGSL_IMPULSE,
    WGSL_LCP,
    WGSL_CONTACT_MATH,
    WGSL_KERNEL_RB_BUILD_LCP,
);

// rb_solve_lcp: PGS-LCP serial com warm start — pipeline LCP separado do SI
const SHADER_RB_SOLVE_LCP = WgslComposer.compose(
    WGSL_STRUCT_RB_SIM_PARAMS,
    WGSL_STRUCT_RIGID_BODY,
    WGSL_STRUCT_RB_CONTACT,
    WGSL_XPBD,
    WGSL_IMPULSE,
    WGSL_LCP,
    WGSL_CONTACT_MATH,
    WGSL_KERNEL_RB_SOLVE_LCP,
);

// rb_lcp_commit: avança pos pela vel corrigida pelo LCP solver (substitui rb_velocity_recovery no pipeline LCP)
const SHADER_RB_LCP_COMMIT = WgslComposer.compose(
    WGSL_STRUCT_RB_SIM_PARAMS,
    WGSL_STRUCT_RIGID_BODY,
    WGSL_QUAT,
    WGSL_KERNEL_RB_LCP_COMMIT,
);

// ── Registro de pipelines ─────────────────────────────────────────────────────

let _initPromise: Promise<void> | null = null;

/**
 * Registra todos os compute pipelines de física no ComputeManager.
 * Idempotente — chamadas repetidas retornam a mesma Promise já resolvida.
 */
export async function ensurePhysicsPipelinesInitialized(core: WebGPUEngineCore): Promise<void> {
    if (_initPromise) return _initPromise;

    _initPromise = Promise.all([
        core.compute.createComputePipeline(PIPELINE_IDS.PREDICT,               SHADER_PREDICT,               'predict_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.DISTANCE_SOLVE,        SHADER_DISTANCE_SOLVE,              'distance_solve_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.DISTANCE_SOLVE_COLOR,  SHADER_DISTANCE_SOLVE_COLOR,        'distance_solve_color_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.COLLISION,             SHADER_COLLISION,             'collision_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.VELOCITY_UPDATE,       SHADER_VELOCITY_UPDATE,       'velocity_update_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.VERTEX_WRITE,          SHADER_VERTEX_WRITE,          'vertex_write_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.DISTANCE_SOLVE_JACOBI,  SHADER_DISTANCE_SOLVE_JACOBI,  'distance_solve_jacobi_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.JACOBI_APPLY,           SHADER_JACOBI_APPLY,           'jacobi_apply_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.SHAPE_MATCH_TRANSFORM, SHADER_SHAPE_MATCH_TRANSFORM, 'shape_match_transform_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.SHAPE_CORRECT,         SHADER_SHAPE_CORRECT,         'shape_correct_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.RB_PREDICT,            SHADER_RB_PREDICT,            'rb_predict_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.RB_NARROWPHASE,        SHADER_RB_NARROWPHASE,        'rb_narrowphase_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.RB_SOLVE,              SHADER_RB_SOLVE,              'rb_solve_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.RB_VELOCITY_RECOVERY,  SHADER_RB_VELOCITY_RECOVERY,  'rb_velocity_recovery_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.RB_SYNC_TRANSFORM,     SHADER_RB_SYNC_TRANSFORM,     'rb_sync_transform_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.RB_BUILD_LCP,          SHADER_RB_BUILD_LCP,          'rb_build_lcp'),
        core.compute.createComputePipeline(PIPELINE_IDS.RB_SOLVE_LCP,          SHADER_RB_SOLVE_LCP,          'rb_solve_lcp_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.RB_LCP_COMMIT,         SHADER_RB_LCP_COMMIT,         'rb_lcp_commit_main'),
    ])
        .then(() => undefined)
        .catch((err) => {
            console.error('[PhysicsShaderLibrary] falha na compilação de pipeline:', err);
            _initPromise = null;  // permite retry no próximo frame
            throw err;
        });

    return _initPromise;
}
