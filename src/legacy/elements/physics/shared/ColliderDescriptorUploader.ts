/**
 * ColliderDescriptorUploader — empacota e envia ColliderDesc[] para a GPU cada frame.
 *
 * Responsabilidades:
 *   1. Itera context.colliders e detecta shape type via colliderShape string.
 *   2. Extrai a world matrix e inv_world_matrix do Transform da entidade.
 *   3. Empacota os parâmetros de forma em `half: vec4f` conforme shape_type:
 *      - 0 (Sphere) → half.x = radius
 *      - 1 (Box)    → half.xyz = halfExtents
 *      - 2 (Plane)  → half.xyz = normal, half.w = offset
 *   4. Escreve o buffer via writeBuffer (síncrono, CPU side-staging).
 *
 * Buffer ID: `gpu_colliders_global` — um único buffer para todos os colliders da cena.
 * Recriado se o número de colliders mudar entre frames.
 *
 * Arquitetura: Layer 3 → Facade Layer 1 (WebGPUEngineCore.getInstance()).
 * Importa apenas interfaces Layer 2 (Collider, Transform, GpuSimContext).
 */

import { mat4 }                 from 'gl-matrix';
import { WebGPUEngineCore }     from '../../../core/WebGPUEngineCore';
import type { GpuSimContext }   from '../../../scene/systems/GpuSimContext';
import type { Transform }       from '../../../scene/math/Transform';

// ColliderDesc layout: 160 bytes
//   offset   0: world_mat      (mat4x4f, 64 bytes)
//   offset  64: inv_world_mat  (mat4x4f, 64 bytes)
//   offset 128: half           (vec4f,   16 bytes)
//   offset 144: shape_type     (u32,      4 bytes)
//   offset 148: body_owner_idx (u32,      4 bytes) — índice do corpo dono no buffer global
//   offset 152: _pad2          (vec2u,    8 bytes)
const COLLIDER_STRIDE_BYTES  = 160;
const COLLIDER_STRIDE_FLOATS = 40;   // 160 / 4
const NO_OWNER = 0xFFFFFFFF;         // corpo sem dono (kinematic sem bufferIndex)

export const COLLIDERS_BUFFER_ID = 'gpu_colliders_global';

export class ColliderDescriptorUploader {
    private allocatedCount = 0;

    /** Sinaliza se o buffer foi recriado neste frame (invalida bind groups dependentes). */
    public bufferRecreated = false;

    /** Staging buffer pré-alocado — reutilizado entre frames (Otimização 1b). */
    private stagingF32 = new Float32Array(0);
    private stagingU32 = new Uint32Array(this.stagingF32.buffer);

    /** Cache do frame anterior para detecção de mudanças (Otimização 3e). */
    private prevF32 = new Float32Array(0);

    /**
     * Empacota todos os colliders do contexto e envia para o buffer GPU.
     * @returns número de colliders enviados (= collider_count para SimParams).
     */
    public upload(context: GpuSimContext): number {
        this.bufferRecreated = false;  // reset no início de cada frame

        const core      = WebGPUEngineCore.getInstance();
        const buffers   = core.resources.buffers;
        const entries   = [...context.colliders.values()];
        const count     = entries.length;

        if (count === 0) {
            // Mantém buffer mínimo para binding válido
            if (this.allocatedCount === 0) {
                buffers.createStorageBuffer(COLLIDERS_BUFFER_ID, COLLIDER_STRIDE_BYTES);
                this.allocatedCount = 1;
                this.bufferRecreated = true;
            }
            return 0;
        }

        // Recria buffer se número de colliders cresceu
        if (count > this.allocatedCount) {
            if (this.allocatedCount > 0) buffers.destroyBuffer(COLLIDERS_BUFFER_ID);
            buffers.createStorageBuffer(COLLIDERS_BUFFER_ID, count * COLLIDER_STRIDE_BYTES);
            this.allocatedCount = count;
            this.bufferRecreated = true;
        }

        // Cresce o staging buffer somente quando necessário (Otimização 1b)
        const neededFloats = count * COLLIDER_STRIDE_FLOATS;
        if (neededFloats > this.stagingF32.length) {
            const raw      = new ArrayBuffer(count * COLLIDER_STRIDE_BYTES);
            this.stagingF32 = new Float32Array(raw);
            this.stagingU32 = new Uint32Array(raw);
        } else {
            // Zera apenas a região usada (evita lixo de frames anteriores)
            this.stagingF32.fill(0, 0, neededFloats);
        }
        const f32View = this.stagingF32;
        const u32View = this.stagingU32;
        const inv     = mat4.create();

        let written = 0;
        for (const { entity, collider } of entries) {
            const transform = entity.getComponent<Transform>('Transform');
            if (!transform) continue;

            const wm = transform.worldMatrix;
            mat4.invert(inv, wm);

            const base = written * COLLIDER_STRIDE_FLOATS;  // float index

            // world_mat (mat4x4f — 16 floats, column-major, same as gl-matrix)
            for (let k = 0; k < 16; k++) f32View[base + k] = wm[k]!;
            // inv_world_mat
            for (let k = 0; k < 16; k++) f32View[base + 16 + k] = inv[k]!;

            // half + shape_type (floats 32..36 = bytes 128..144)
            const halfBase        = base + 32;  // float index for `half`
            const shapeTypeBase   = base + 36;  // float index for shape_type (u32)
            const ownerIdxBase    = base + 37;  // float index for body_owner_idx (u32)

            const desc = collider.packDescriptor();
            f32View[halfBase]      = desc.half[0];
            f32View[halfBase + 1]  = desc.half[1];
            f32View[halfBase + 2]  = desc.half[2];
            f32View[halfBase + 3]  = desc.half[3];
            u32View[shapeTypeBase] = desc.shapeType;

            // bounds (halfWidth, halfDepth) — reutiliza os bytes que eram _pad2
            // Offset 38-39 em float32 = bytes 152-159 do struct ColliderDesc
            f32View[base + 38] = desc.bounds[0];
            f32View[base + 39] = desc.bounds[1];

            // body_owner_idx — gpuRbIndex do corpo que possui este collider.
            // Evita auto-colisão no narrowphase: o CM de um corpo dinâmico está sempre
            // dentro da sua própria forma SDF (d < 0), gerando contatos falsos.
            const ownerBody = context.entityBodies.get(entity.id);
            const ownerIdx  = (ownerBody?.body as unknown as { gpuRbIndex?: number })?.gpuRbIndex ?? NO_OWNER;
            u32View[ownerIdxBase] = ownerIdx;

            written++;
        }

        if (written > 0) {
            // Otimização 3e: só envia se os dados mudaram em relação ao frame anterior
            const usedLen = written * COLLIDER_STRIDE_FLOATS;
            const cur     = f32View.subarray(0, usedLen);
            const prev    = this.prevF32.subarray(0, usedLen);

            let dirty = cur.length !== prev.length;
            if (!dirty) {
                for (let i = 0; i < usedLen; i++) {
                    if (cur[i] !== prev[i]) { dirty = true; break; }
                }
            }

            if (dirty) {
                buffers.writeBuffer(COLLIDERS_BUFFER_ID, cur);
                if (this.prevF32.length < usedLen) {
                    this.prevF32 = new Float32Array(usedLen);
                }
                this.prevF32.set(cur);
            }
        }
        return written;
    }
}
