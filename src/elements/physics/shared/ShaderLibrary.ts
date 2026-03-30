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

import type { EngineCore } from '../../../core/interfaces/EngineCore';
import { WgslComposer } from '../gpu/WgslComposer';

// ── Structs ────────────────────────────────────────────────────────────────────
import { WGSL_STRUCT_SIM_PARAMS }           from '../gpu/wgsl/structs/sim_params.wgsl';
import { WGSL_STRUCT_PARTICLE }             from '../gpu/wgsl/structs/particle.wgsl';
import { WGSL_STRUCT_DISTANCE_CONSTRAINT }  from '../gpu/wgsl/structs/distance_constraint.wgsl';
import { WGSL_STRUCT_COLLIDER_DESC }        from '../gpu/wgsl/structs/collider_desc.wgsl';
import { WGSL_STRUCT_RIGID_BODY }           from '../gpu/wgsl/structs/rigid_body.wgsl';
import { WGSL_STRUCT_RB_SIM_PARAMS }        from '../gpu/wgsl/structs/rb_sim_params.wgsl';
import { WGSL_STRUCT_RB_CONTACT }           from '../gpu/wgsl/structs/rb_contact.wgsl';

// ── Math modules ──────────────────────────────────────────────────────────────
import { WGSL_XPBD }         from '../gpu/wgsl/math/xpbd.wgsl';
import { WGSL_SDF }          from '../gpu/wgsl/math/sdf.wgsl';
import { WGSL_MAT }          from '../gpu/wgsl/math/mat.wgsl';
import { WGSL_IMPULSE }      from '../gpu/wgsl/math/impulse.wgsl';
import { WGSL_CONTACT_MATH } from '../gpu/wgsl/math/contact_math.wgsl';

// ── Math modules (shape matching) ─────────────────────────────────────────────
import { WGSL_QUAT }           from '../gpu/wgsl/math/quat.wgsl';
import { WGSL_SHAPE_MATCHING } from '../gpu/wgsl/math/shape_matching.wgsl';

// ── Kernels ───────────────────────────────────────────────────────────────────
import { WGSL_KERNEL_PREDICT }                from '../gpu/wgsl/kernels/predict.wgsl';
import { WGSL_KERNEL_DISTANCE_SOLVE }         from '../gpu/wgsl/kernels/distance_solve.wgsl';
import { WGSL_KERNEL_COLLISION }              from '../gpu/wgsl/kernels/collision.wgsl';
import { WGSL_KERNEL_VELOCITY_UPDATE }        from '../gpu/wgsl/kernels/velocity_update.wgsl';
import { WGSL_KERNEL_VERTEX_WRITE }           from '../gpu/wgsl/kernels/vertex_write.wgsl';
import { WGSL_KERNEL_SHAPE_MATCH_TRANSFORM }  from '../gpu/wgsl/kernels/shape_match_transform.wgsl';
import { WGSL_KERNEL_SHAPE_CORRECT }          from '../gpu/wgsl/kernels/shape_correct.wgsl';
import { WGSL_KERNEL_DISTANCE_SOLVE_COLOR }   from '../gpu/wgsl/kernels/distance_solve_color.wgsl';
import { WGSL_KERNEL_DISTANCE_SOLVE_JACOBI }  from '../gpu/wgsl/kernels/distance_solve_jacobi.wgsl';
import { WGSL_KERNEL_JACOBI_APPLY }           from '../gpu/wgsl/kernels/jacobi_apply.wgsl';
import { WGSL_KERNEL_RB_PREDICT }             from '../gpu/wgsl/kernels/rb_predict.wgsl';
import { WGSL_KERNEL_RB_NARROWPHASE }         from '../gpu/wgsl/kernels/rb_narrowphase.wgsl';
import { WGSL_KERNEL_RB_SOLVE }               from '../gpu/wgsl/kernels/rb_solve.wgsl';
import { WGSL_KERNEL_RB_SOLVE_VELOCITY }      from '../gpu/wgsl/kernels/rb_solve_velocity.wgsl';
import { WGSL_KERNEL_RB_VELOCITY_RECOVERY }   from '../gpu/wgsl/kernels/rb_velocity_recovery.wgsl';
import { WGSL_KERNEL_RB_SYNC_TRANSFORM }     from '../gpu/wgsl/kernels/rb_sync_transform.wgsl';
import { WGSL_KERNEL_RB_BUILD_LCP }          from '../gpu/wgsl/kernels/rb_build_lcp.wgsl';
import { WGSL_KERNEL_RB_SOLVE_LCP }          from '../gpu/wgsl/kernels/rb_solve_lcp.wgsl';
import { WGSL_KERNEL_RB_LCP_COMMIT }         from '../gpu/wgsl/kernels/rb_lcp_commit.wgsl';
import { WGSL_KERNEL_RB_UPDATE_COLLIDERS }   from '../gpu/wgsl/kernels/rb_update_colliders.wgsl';
import { WGSL_KERNEL_RB_SUBSTEP_UPDATE }    from '../gpu/wgsl/kernels/rb_substep_update.wgsl';
import { WGSL_LCP }                          from '../gpu/wgsl/math/lcp.wgsl';

// ── FEM modules ───────────────────────────────────────────────────────────────
import { WGSL_LINALG }                       from '../gpu/wgsl/math/linalg.wgsl';
import { WGSL_FEM_KINEMATICS }               from '../gpu/wgsl/math/fem_kinematics.wgsl';
import { WGSL_FEM_XPBD }                     from '../gpu/wgsl/math/fem_xpbd.wgsl';
import { WGSL_STRUCT_FEM_SIM_PARAMS }        from '../gpu/wgsl/structs/fem_sim_params.wgsl';
import { WGSL_STRUCT_FEM_ELEMENT }           from '../gpu/wgsl/structs/fem_element.wgsl';
import { WGSL_KERNEL_FEM_PREDICT }           from '../gpu/wgsl/kernels/fem_predict.wgsl';
import { WGSL_KERNEL_FEM_SOLVE }             from '../gpu/wgsl/kernels/fem_solve.wgsl';
import { WGSL_KERNEL_FEM_COLLISION }         from '../gpu/wgsl/kernels/fem_collision.wgsl';
import { WGSL_KERNEL_FEM_VELOCITY_UPDATE }   from '../gpu/wgsl/kernels/fem_velocity_update.wgsl';
import { WGSL_KERNEL_FEM_VERTEX_WRITE }      from '../gpu/wgsl/kernels/fem_vertex_write.wgsl';

// ── MPM modules ───────────────────────────────────────────────────────────────
import { WGSL_STRUCT_MPM_SIM_PARAMS }        from '../gpu/wgsl/structs/mpm_sim_params.wgsl';
import { WGSL_STRUCT_MPM_PARTICLE }          from '../gpu/wgsl/structs/mpm_particle.wgsl';
import { WGSL_STRUCT_MPM_GRID_NODE }         from '../gpu/wgsl/structs/mpm_grid_node.wgsl';
import { WGSL_MPM_WEIGHTS }                  from '../gpu/wgsl/math/mpm_weights.wgsl';
import { WGSL_KERNEL_MPM_P2G }               from '../gpu/wgsl/kernels/mpm_p2g.wgsl';
import { WGSL_KERNEL_MPM_GRID_UPDATE }       from '../gpu/wgsl/kernels/mpm_grid_update.wgsl';
import { WGSL_KERNEL_MPM_G2P }               from '../gpu/wgsl/kernels/mpm_g2p.wgsl';
import { WGSL_KERNEL_MPM_VERTEX_WRITE }      from '../gpu/wgsl/kernels/mpm_vertex_write.wgsl';

// ── NeighborSearch modules ────────────────────────────────────────────────────
import { WGSL_STRUCT_NS_SIM_PARAMS }         from '../gpu/wgsl/structs/ns_sim_params.wgsl';
import { WGSL_KERNEL_NS_ASSIGN_COUNT }       from '../gpu/wgsl/kernels/ns_assign_count.wgsl';
import { WGSL_KERNEL_NS_SCAN_LOCAL }         from '../gpu/wgsl/kernels/ns_scan_local.wgsl';
import { WGSL_KERNEL_NS_SCAN_GROUPS }        from '../gpu/wgsl/kernels/ns_scan_groups.wgsl';
import { WGSL_KERNEL_NS_SCAN_COMBINE }       from '../gpu/wgsl/kernels/ns_scan_combine.wgsl';
import { WGSL_KERNEL_NS_SCATTER }            from '../gpu/wgsl/kernels/ns_scatter.wgsl';
import { WGSL_KERNEL_NS_FIND }               from '../gpu/wgsl/kernels/ns_find.wgsl';

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
    RB_SOLVE_VELOCITY:       'physics_rb_solve_velocity',
    RB_VELOCITY_RECOVERY:    'physics_rb_velocity_recovery',
    RB_SYNC_TRANSFORM:       'physics_rb_sync_transform',
    RB_BUILD_LCP:            'physics_rb_build_lcp',
    RB_SOLVE_LCP:            'physics_rb_solve_lcp',
    RB_LCP_COMMIT:           'rb_lcp_commit_pipeline',
    RB_UPDATE_COLLIDERS:     'physics_rb_update_colliders',
    RB_SUBSTEP_UPDATE:       'physics_rb_substep_update',
    FEM_PREDICT:             'physics_fem_predict',
    FEM_SOLVE:               'physics_fem_solve',
    FEM_COLLISION:           'physics_fem_collision',
    FEM_VELOCITY_UPDATE:     'physics_fem_velocity_update',
    FEM_VERTEX_WRITE:        'physics_fem_vertex_write',
    MPM_P2G:                 'physics_mpm_p2g',
    MPM_GRID_UPDATE:         'physics_mpm_grid_update',
    MPM_G2P:                 'physics_mpm_g2p',
    MPM_VERTEX_WRITE:        'physics_mpm_vertex_write',
    NS_ASSIGN_COUNT:         'physics_ns_assign_count',
    NS_SCAN_LOCAL:           'physics_ns_scan_local',
    NS_SCAN_GROUPS:          'physics_ns_scan_groups',
    NS_SCAN_COMBINE:         'physics_ns_scan_combine',
    NS_SCATTER:              'physics_ns_scatter',
    NS_FIND:                 'physics_ns_find',
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
    WGSL_QUAT,
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

const SHADER_RB_SOLVE_VELOCITY = WgslComposer.compose(
    WGSL_STRUCT_RB_SIM_PARAMS,
    WGSL_STRUCT_RIGID_BODY,
    WGSL_STRUCT_RB_CONTACT,
    WGSL_XPBD,
    WGSL_IMPULSE,
    WGSL_KERNEL_RB_SOLVE_VELOCITY,
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

// rb_lcp_commit: avança pos pela vel corrigida + correção posicional direta para penetrações reais
const SHADER_RB_LCP_COMMIT = WgslComposer.compose(
    WGSL_STRUCT_RB_SIM_PARAMS,
    WGSL_STRUCT_RIGID_BODY,
    WGSL_STRUCT_RB_CONTACT,
    WGSL_QUAT,
    WGSL_KERNEL_RB_LCP_COMMIT,
);

// rb_update_colliders: sincroniza world_mat/inv_world_mat dos colliders dinâmicos com pos_pred/rot_pred
const SHADER_RB_SUBSTEP_UPDATE = WgslComposer.compose(
    WGSL_STRUCT_RB_SIM_PARAMS,
    WGSL_STRUCT_RIGID_BODY,
    WGSL_QUAT,
    WGSL_KERNEL_RB_SUBSTEP_UPDATE,
);

const SHADER_RB_UPDATE_COLLIDERS = WgslComposer.compose(
    WGSL_STRUCT_RB_SIM_PARAMS,
    WGSL_STRUCT_RIGID_BODY,
    WGSL_STRUCT_COLLIDER_DESC,
    WGSL_MAT,
    WGSL_KERNEL_RB_UPDATE_COLLIDERS,
);

// ── FEM shaders ───────────────────────────────────────────────────────────────

// fem_predict: integração explícita vel+gravity, projeta pred = pos + vel*dt
const SHADER_FEM_PREDICT = WgslComposer.compose(
    WGSL_STRUCT_FEM_SIM_PARAMS,
    WGSL_STRUCT_PARTICLE,
    WGSL_KERNEL_FEM_PREDICT,
);

// fem_solve: resolve C_h + C_d por elemento (1 workgroup = 1 elemento)
const SHADER_FEM_SOLVE = WgslComposer.compose(
    WGSL_STRUCT_FEM_SIM_PARAMS,
    WGSL_STRUCT_PARTICLE,
    WGSL_STRUCT_FEM_ELEMENT,
    WGSL_LINALG,
    WGSL_FEM_KINEMATICS,
    WGSL_FEM_XPBD,
    WGSL_KERNEL_FEM_SOLVE,
);

// fem_collision: colisão nó × collider SDF estático + corpos rígidos dinâmicos
const SHADER_FEM_COLLISION = WgslComposer.compose(
    WGSL_STRUCT_FEM_SIM_PARAMS,
    WGSL_STRUCT_PARTICLE,
    WGSL_STRUCT_COLLIDER_DESC,
    WGSL_STRUCT_RIGID_BODY,
    WGSL_QUAT,
    WGSL_SDF,
    WGSL_MAT,
    WGSL_KERNEL_FEM_COLLISION,
);

// fem_velocity_update: vel = (pred - pos) / dt; pos = pred
const SHADER_FEM_VELOCITY_UPDATE = WgslComposer.compose(
    WGSL_STRUCT_FEM_SIM_PARAMS,
    WGSL_STRUCT_PARTICLE,
    WGSL_KERNEL_FEM_VELOCITY_UPDATE,
);

// fem_vertex_write: escreve xyz no vertex buffer (stride 8 floats)
const SHADER_FEM_VERTEX_WRITE = WgslComposer.compose(
    WGSL_STRUCT_FEM_SIM_PARAMS,
    WGSL_STRUCT_PARTICLE,
    WGSL_KERNEL_FEM_VERTEX_WRITE,
);

// ── NeighborSearch shaders ────────────────────────────────────────────────────

// ns_assign_count: atribui célula flat + atomicAdd(cell_count[cell], 1) por partícula
const SHADER_NS_ASSIGN_COUNT = WgslComposer.compose(
    WGSL_STRUCT_NS_SIM_PARAMS,
    WGSL_KERNEL_NS_ASSIGN_COUNT,
);

// ns_scan_local: Hillis-Steele scan em workgroup de 256 → prefix exclusivo por bloco
const SHADER_NS_SCAN_LOCAL = WgslComposer.compose(
    WGSL_STRUCT_NS_SIM_PARAMS,
    WGSL_KERNEL_NS_SCAN_LOCAL,
);

// ns_scan_groups: scan das somas de grupo (1 workgroup, ≤ 256 grupos)
const SHADER_NS_SCAN_GROUPS = WgslComposer.compose(
    WGSL_STRUCT_NS_SIM_PARAMS,
    WGSL_KERNEL_NS_SCAN_GROUPS,
);

// ns_scan_combine: adiciona offset de grupo ao prefix local → cell_start final
const SHADER_NS_SCAN_COMBINE = WgslComposer.compose(
    WGSL_STRUCT_NS_SIM_PARAMS,
    WGSL_KERNEL_NS_SCAN_COMBINE,
);

// ns_scatter: atomicAdd(&cell_cursor[cell], 1) → sorted_particles[slot] = i
const SHADER_NS_SCATTER = WgslComposer.compose(
    WGSL_STRUCT_NS_SIM_PARAMS,
    WGSL_KERNEL_NS_SCATTER,
);

// ns_find: stencil 3×3×3 → neighbor_list + neighbor_count por partícula
const SHADER_NS_FIND = WgslComposer.compose(
    WGSL_STRUCT_NS_SIM_PARAMS,
    WGSL_KERNEL_NS_FIND,
);

// ── MPM shaders ───────────────────────────────────────────────────────────────

// mpm_p2g: P2G com Neo-Hookean stress + APIC affine momentum (atomic i32)
const SHADER_MPM_P2G = WgslComposer.compose(
    WGSL_STRUCT_MPM_SIM_PARAMS,
    WGSL_STRUCT_MPM_PARTICLE,
    WGSL_STRUCT_MPM_GRID_NODE,
    WGSL_LINALG,
    WGSL_MPM_WEIGHTS,
    WGSL_KERNEL_MPM_P2G,
);

// mpm_grid_update: normaliza momentum → vel, aplica gravidade + BC + SDF collision
const SHADER_MPM_GRID_UPDATE = WgslComposer.compose(
    WGSL_STRUCT_MPM_SIM_PARAMS,
    WGSL_STRUCT_MPM_GRID_NODE,
    WGSL_STRUCT_COLLIDER_DESC,
    WGSL_SDF,
    WGSL_MAT,
    WGSL_KERNEL_MPM_GRID_UPDATE,
);

// mpm_g2p: G2P com APIC — interpola vel, acumula B_p, atualiza C e F, avança pos
const SHADER_MPM_G2P = WgslComposer.compose(
    WGSL_STRUCT_MPM_SIM_PARAMS,
    WGSL_STRUCT_MPM_PARTICLE,
    WGSL_STRUCT_MPM_GRID_NODE,
    WGSL_LINALG,
    WGSL_MPM_WEIGHTS,
    WGSL_KERNEL_MPM_G2P,
);

// mpm_vertex_write: copia pos.xyz das partículas para o vertex buffer do renderer
const SHADER_MPM_VERTEX_WRITE = WgslComposer.compose(
    WGSL_STRUCT_MPM_SIM_PARAMS,
    WGSL_STRUCT_MPM_PARTICLE,
    WGSL_KERNEL_MPM_VERTEX_WRITE,
);

// ── Registro de pipelines ─────────────────────────────────────────────────────

let _initPromise: Promise<void> | null = null;

/**
 * Registra todos os compute pipelines de física no ComputeManager.
 * Idempotente — chamadas repetidas retornam a mesma Promise já resolvida.
 */
export async function ensurePhysicsPipelinesInitialized(core: EngineCore): Promise<void> {
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
        core.compute.createComputePipeline(PIPELINE_IDS.RB_SOLVE_VELOCITY,     SHADER_RB_SOLVE_VELOCITY,     'rb_solve_velocity_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.RB_SYNC_TRANSFORM,     SHADER_RB_SYNC_TRANSFORM,     'rb_sync_transform_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.RB_BUILD_LCP,          SHADER_RB_BUILD_LCP,          'rb_build_lcp'),
        core.compute.createComputePipeline(PIPELINE_IDS.RB_SOLVE_LCP,          SHADER_RB_SOLVE_LCP,          'rb_solve_lcp_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.RB_LCP_COMMIT,         SHADER_RB_LCP_COMMIT,         'rb_lcp_commit_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.RB_UPDATE_COLLIDERS,   SHADER_RB_UPDATE_COLLIDERS,   'rb_update_colliders'),
        core.compute.createComputePipeline(PIPELINE_IDS.RB_SUBSTEP_UPDATE,    SHADER_RB_SUBSTEP_UPDATE,    'rb_substep_update_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.FEM_PREDICT,          SHADER_FEM_PREDICT,          'fem_predict_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.FEM_SOLVE,            SHADER_FEM_SOLVE,            'fem_solve_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.FEM_COLLISION,        SHADER_FEM_COLLISION,        'fem_collision_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.FEM_VELOCITY_UPDATE,  SHADER_FEM_VELOCITY_UPDATE,  'fem_velocity_update_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.FEM_VERTEX_WRITE,     SHADER_FEM_VERTEX_WRITE,     'fem_vertex_write_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.MPM_P2G,              SHADER_MPM_P2G,              'mpm_p2g_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.MPM_GRID_UPDATE,      SHADER_MPM_GRID_UPDATE,      'mpm_grid_update_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.MPM_G2P,              SHADER_MPM_G2P,              'mpm_g2p_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.MPM_VERTEX_WRITE,     SHADER_MPM_VERTEX_WRITE,     'mpm_vertex_write_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.NS_ASSIGN_COUNT,      SHADER_NS_ASSIGN_COUNT,      'ns_assign_count_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.NS_SCAN_LOCAL,        SHADER_NS_SCAN_LOCAL,        'ns_scan_local_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.NS_SCAN_GROUPS,       SHADER_NS_SCAN_GROUPS,       'ns_scan_groups_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.NS_SCAN_COMBINE,      SHADER_NS_SCAN_COMBINE,      'ns_scan_combine_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.NS_SCATTER,           SHADER_NS_SCATTER,           'ns_scatter_main'),
        core.compute.createComputePipeline(PIPELINE_IDS.NS_FIND,              SHADER_NS_FIND,              'ns_find_main'),
    ])
        .then(() => undefined)
        .catch((err) => {
            console.error('[PhysicsShaderLibrary] falha na compilação de pipeline:', err);
            _initPromise = null;  // permite retry no próximo frame
            throw err;
        });

    return _initPromise;
}
