/**
 * RigidBodyBufferAllocator — alocação e upload dos buffers GPU globais para RigidBodies.
 *
 * Responsabilidades:
 *   1. Aloca um único storage buffer global `gpu_rb_bodies` (todos os corpos juntos).
 *   2. Faz upload inicial de pos, vel, omega, rot, I_inv, mat_props para cada corpo.
 *   3. Aloca o uniform buffer `gpu_rb_simparams` (RBSimParams, 64 bytes).
 *   4. Aloca o storage buffer `gpu_rb_contacts` pré-dimensionado para N×C slots.
 *   5. Registra `gpuRbIndex` em cada corpo (posição no buffer global).
 *
 * Diferença de SimBodyBufferAllocator: o buffer é GLOBAL (todos os corpos num único
 * buffer), não por corpo. Isso permite que rb_solve acesse body_a e body_b por índice.
 *
 * Property bag keys injetadas em cada RigidBody:
 *   'gpuRbIndex' — u32, posição do corpo no buffer global
 *
 * Buffer IDs globais:
 *   'gpu_rb_bodies'    — storage buffer RigidBody[]
 *   'gpu_rb_simparams' — uniform buffer RBSimParams
 *   'gpu_rb_contacts'  — storage buffer RBContact[]
 *
 * Arquitetura: Layer 3 → Facade Layer 1 (WebGPUEngineCore.getInstance()).
 */

import { WebGPUEngineCore }  from '../../../core/WebGPUEngineCore';
import type { RigidBody }    from '../RigidBody';
import type { quat, vec3 }   from 'gl-matrix';

// Tamanhos em bytes derivados dos WGSL structs
const RIGID_BODY_STRIDE  = 128;  // 8 × vec4f
const RB_SIM_PARAMS_SIZE =  64;  // 4 × vec4f (uniform)
const RB_CONTACT_STRIDE  =  64;  // 4 × vec4f

export const RB_BODIES_BUFFER_ID     = 'gpu_rb_bodies';
export const RB_SIM_PARAMS_BUFFER_ID = 'gpu_rb_simparams';
export const RB_CONTACTS_BUFFER_ID   = 'gpu_rb_contacts';
/** Mapeamento gpuRbIndex → objectUboSlot para o kernel rb_sync_transform. */
export const RB_TO_UBO_MAP_BUFFER_ID = 'gpu_rb_to_ubo_map';

export class RigidBodyBufferAllocator {

    /**
     * Cria/recria os buffers globais para o conjunto de corpos fornecido.
     * Deve ser chamado quando um novo corpo é registrado ou o conjunto muda.
     *
     * @param bodies - Lista ordenada de todos os RigidBodies GPU-simulados.
     * @param colliderCount - Número de colliders no buffer global (para dimensionar contacts).
     */
    public allocate(bodies: RigidBody[], colliderCount: number): void {
        const core    = WebGPUEngineCore.getInstance();
        const buffers = core.resources.buffers;
        const n       = bodies.length;

        // Garante ao menos 1 elemento para binding válido
        const rbCount      = Math.max(n, 1);
        const contactSlots = Math.max(n * Math.max(colliderCount, 1), 1);

        // ── Destroi buffers existentes ──────────────────────────────────────
        if (buffers.getBuffer(RB_BODIES_BUFFER_ID))    buffers.destroyBuffer(RB_BODIES_BUFFER_ID);
        if (buffers.getBuffer(RB_CONTACTS_BUFFER_ID))  buffers.destroyBuffer(RB_CONTACTS_BUFFER_ID);
        if (buffers.getBuffer(RB_TO_UBO_MAP_BUFFER_ID)) buffers.destroyBuffer(RB_TO_UBO_MAP_BUFFER_ID);
        if (!buffers.getBuffer(RB_SIM_PARAMS_BUFFER_ID)) {
            buffers.createUniformBuffer(RB_SIM_PARAMS_BUFFER_ID, RB_SIM_PARAMS_SIZE);
        }

        // ── Cria buffers ────────────────────────────────────────────────────
        buffers.createStorageBuffer(RB_BODIES_BUFFER_ID,   rbCount      * RIGID_BODY_STRIDE);
        buffers.createStorageBuffer(RB_CONTACTS_BUFFER_ID, contactSlots * RB_CONTACT_STRIDE);
        // Mapeamento gpuRbIndex → objectUboSlot (u32 por corpo). Inicializado com zeros;
        // atualizado pelo renderer antes de cada dispatch de rb_sync_transform.
        buffers.createStorageBuffer(RB_TO_UBO_MAP_BUFFER_ID, Math.max(rbCount, 1) * 4);

        if (n === 0) return;

        // ── Upload inicial dos corpos ───────────────────────────────────────
        // Layout por corpo (32 floats = 128 bytes):
        //   [0..3]   pos.xyz, pos.w=inv_mass
        //   [4..7]   vel.xyz, vel.w=0
        //   [8..11]  omega.xyz, omega.w=0
        //   [12..15] rot.xyzw
        //   [16..19] I_inv.xyz, I_inv.w=0
        //   [20..23] pos_pred.xyzw (cópia inicial de pos)
        //   [24..27] rot_pred.xyzw (cópia inicial de rot)
        //   [28..31] mat_props: restitution, friction, lin_damping, ang_damping
        const rawBuffer = new ArrayBuffer(n * RIGID_BODY_STRIDE);
        const f32       = new Float32Array(rawBuffer);

        for (let i = 0; i < n; i++) {
            const body   = bodies[i]!;
            const base   = i * 32;  // 32 floats por corpo
            const mass   = body.get<number>('mass') ?? 1.0;
            const isKin  = body.get<boolean>('isKinematic') ?? false;
            const invM   = (isKin || mass <= 0) ? 0.0 : 1.0 / mass;

            const pos    = body.get<vec3>('position') ?? [0, 0, 0];
            const vel    = body.get<vec3>('velocity')  ?? [0, 0, 0];
            const omega  = body.get<vec3>('angularVelocity') ?? [0, 0, 0];
            const rot    = body.get<quat>('rotation')  ?? [0, 0, 0, 1];
            const I      = body.get<vec3>('inertiaTensor') ?? [1, 1, 1];

            const Ix_inv = I[0]! > 1e-12 ? 1.0 / I[0]! : 0.0;
            const Iy_inv = I[1]! > 1e-12 ? 1.0 / I[1]! : 0.0;
            const Iz_inv = I[2]! > 1e-12 ? 1.0 / I[2]! : 0.0;

            const restitution   = body.get<number>('restitution')   ?? 0.0;
            const friction      = body.get<number>('friction')      ?? 0.3;
            const linDamping    = body.get<number>('linearDamping')  ?? 0.05;
            const angDamping    = body.get<number>('angularDamping') ?? 0.1;

            // pos (xyz) + inv_mass (w)
            f32[base]      = pos[0] ?? 0;
            f32[base + 1]  = pos[1] ?? 0;
            f32[base + 2]  = pos[2] ?? 0;
            f32[base + 3]  = invM;
            // vel
            f32[base + 4]  = vel[0] ?? 0;
            f32[base + 5]  = vel[1] ?? 0;
            f32[base + 6]  = vel[2] ?? 0;
            f32[base + 7]  = 0;
            // omega
            f32[base + 8]  = omega[0] ?? 0;
            f32[base + 9]  = omega[1] ?? 0;
            f32[base + 10] = omega[2] ?? 0;
            f32[base + 11] = 0;
            // rot (quaternion xyzw)
            f32[base + 12] = rot[0] ?? 0;
            f32[base + 13] = rot[1] ?? 0;
            f32[base + 14] = rot[2] ?? 0;
            f32[base + 15] = rot[3] ?? 1;
            // I_inv
            f32[base + 16] = Ix_inv;
            f32[base + 17] = Iy_inv;
            f32[base + 18] = Iz_inv;
            f32[base + 19] = 0;
            // pos_pred (cópia inicial de pos)
            f32[base + 20] = pos[0] ?? 0;
            f32[base + 21] = pos[1] ?? 0;
            f32[base + 22] = pos[2] ?? 0;
            f32[base + 23] = 0;
            // rot_pred (cópia inicial de rot)
            f32[base + 24] = rot[0] ?? 0;
            f32[base + 25] = rot[1] ?? 0;
            f32[base + 26] = rot[2] ?? 0;
            f32[base + 27] = rot[3] ?? 1;
            // mat_props
            f32[base + 28] = restitution;
            f32[base + 29] = friction;
            f32[base + 30] = linDamping;
            f32[base + 31] = angDamping;

            // Registra o índice GPU no property bag do corpo
            body.set('gpuRbIndex', i);
        }

        buffers.writeBuffer(RB_BODIES_BUFFER_ID, f32);
    }
}
