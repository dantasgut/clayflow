/**
 * RigidBodyLayout — contrato TypeScript do struct WGSL `RigidBody`.
 *
 * Espelha `gpu/wgsl/structs/rigid_body.wgsl.ts` (160 bytes, 10 × vec4f).
 * Centraliza strides, offsets de campo e a função de serialização CPU→GPU.
 */

import { PhysicsBodyState } from '../../../scene/core/physics/PhysicsBodyState';

// ── Dimensões ──────────────────────────────────────────────────────────────────

/** Tamanho do struct em bytes (10 × vec4f). */
export const RB_STRIDE_BYTES  = 160;

/** Tamanho do struct em f32 (160 / 4). */
export const RB_STRIDE_FLOATS = 40;

// ── Offsets de campo (índice f32 dentro de um elemento) ───────────────────────
//
//   offset   0: pos        (vec4f) — xyz=posição, w=inv_mass
//   offset   4: vel        (vec4f) — xyz=velocidade linear, w=0
//   offset   8: omega      (vec4f) — xyz=velocidade angular, w=0
//   offset  12: rot        (vec4f) — quaternion (x,y,z,w)
//   offset  16: I_inv      (vec4f) — inércia inversa diagonal, w=0
//   offset  20: pos_pred   (vec4f) — posição prevista
//   offset  24: rot_pred   (vec4f) — rotação prevista
//   offset  28: mat_props  (vec4f) — restitution, friction, lin_damping, ang_damping
//   offset  32: body_shape (vec4f) — shape_type, half_x, half_y, half_z
//   offset  36: _rb_pad    (vec4f) — reservado

export const RB_POS_X          =  0;
export const RB_POS_Y          =  1;
export const RB_POS_Z          =  2;
export const RB_INV_MASS       =  3;

export const RB_VEL_X          =  4;
export const RB_VEL_Y          =  5;
export const RB_VEL_Z          =  6;
// [7] reservado (w=0)

export const RB_OMEGA_X        =  8;
export const RB_OMEGA_Y        =  9;
export const RB_OMEGA_Z        = 10;
// [11] reservado (w=0)

export const RB_ROT_X          = 12;
export const RB_ROT_Y          = 13;
export const RB_ROT_Z          = 14;
export const RB_ROT_W          = 15;

export const RB_I_INV_X        = 16;
export const RB_I_INV_Y        = 17;
export const RB_I_INV_Z        = 18;
// [19] reservado (w=0)

export const RB_POS_PRED_X     = 20;
export const RB_POS_PRED_Y     = 21;
export const RB_POS_PRED_Z     = 22;
// [23] reservado

export const RB_ROT_PRED_X     = 24;
export const RB_ROT_PRED_Y     = 25;
export const RB_ROT_PRED_Z     = 26;
export const RB_ROT_PRED_W     = 27;

export const RB_RESTITUTION    = 28;
export const RB_FRICTION       = 29;
export const RB_LIN_DAMPING    = 30;
export const RB_ANG_DAMPING    = 31;

export const RB_SHAPE_TYPE     = 32;
export const RB_HALF_X         = 33;
export const RB_HALF_Y         = 34;
export const RB_HALF_Z         = 35;
// [36..39] reservado (_rb_pad)

// ── Shape info injetada pelo sistema ─────────────────────────────────────────

export interface RigidBodyShapeInfo {
    shapeType: number;
    he: [number, number, number];
}

// ── Tipo mínimo necessário para serialização (evita import circular) ──────────

interface RigidBodyPackable {
    material:  { mass: number; restitution: number; friction: number; linearDamping: number; angularDamping: number };
    simState?: { position: ArrayLike<number>; velocity: ArrayLike<number>; angularVelocity: ArrayLike<number>; rotation: ArrayLike<number>; inertiaTensor: ArrayLike<number> };
    bodyState: PhysicsBodyState;
}

/**
 * Serializa um RigidBody no buffer global GPU.
 *
 * @param body      corpo a serializar
 * @param f32       Float32Array do buffer global (toda a capacidade)
 * @param base      índice f32 inicial deste corpo (= gpuRbIndex × RB_STRIDE_FLOATS)
 * @param shapeInfo shape primário associado ao corpo (fornecido pelo sistema)
 */
export function packRigidBody(
    body:      RigidBodyPackable,
    f32:       Float32Array,
    base:      number,
    shapeInfo?: RigidBodyShapeInfo,
): void {
    const mat   = body.material;
    const sim   = body.simState;
    const isKin = body.bodyState === PhysicsBodyState.Kinematic;
    const invM  = (isKin || mat.mass <= 0) ? 0.0 : 1.0 / mat.mass;

    const pos   = sim?.position        ?? [0, 0, 0];
    const vel   = sim?.velocity        ?? [0, 0, 0];
    const omega = sim?.angularVelocity ?? [0, 0, 0];
    const rot   = sim?.rotation        ?? [0, 0, 0, 1];
    const I     = sim?.inertiaTensor   ?? [1, 1, 1];

    const Ix_inv = (I[0]! > 1e-12) ? 1.0 / I[0]! : 0.0;
    const Iy_inv = (I[1]! > 1e-12) ? 1.0 / I[1]! : 0.0;
    const Iz_inv = (I[2]! > 1e-12) ? 1.0 / I[2]! : 0.0;

    f32[base + RB_POS_X]      = pos[0] ?? 0;
    f32[base + RB_POS_Y]      = pos[1] ?? 0;
    f32[base + RB_POS_Z]      = pos[2] ?? 0;
    f32[base + RB_INV_MASS]   = invM;

    f32[base + RB_VEL_X]      = vel[0] ?? 0;
    f32[base + RB_VEL_Y]      = vel[1] ?? 0;
    f32[base + RB_VEL_Z]      = vel[2] ?? 0;
    f32[base + 7]              = 0;

    f32[base + RB_OMEGA_X]    = omega[0] ?? 0;
    f32[base + RB_OMEGA_Y]    = omega[1] ?? 0;
    f32[base + RB_OMEGA_Z]    = omega[2] ?? 0;
    f32[base + 11]             = 0;

    f32[base + RB_ROT_X]      = rot[0] ?? 0;
    f32[base + RB_ROT_Y]      = rot[1] ?? 0;
    f32[base + RB_ROT_Z]      = rot[2] ?? 0;
    f32[base + RB_ROT_W]      = rot[3] ?? 1;

    f32[base + RB_I_INV_X]    = Ix_inv;
    f32[base + RB_I_INV_Y]    = Iy_inv;
    f32[base + RB_I_INV_Z]    = Iz_inv;
    f32[base + 19]             = 0;

    f32[base + RB_POS_PRED_X] = pos[0] ?? 0;
    f32[base + RB_POS_PRED_Y] = pos[1] ?? 0;
    f32[base + RB_POS_PRED_Z] = pos[2] ?? 0;
    f32[base + 23]             = 0;

    f32[base + RB_ROT_PRED_X] = rot[0] ?? 0;
    f32[base + RB_ROT_PRED_Y] = rot[1] ?? 0;
    f32[base + RB_ROT_PRED_Z] = rot[2] ?? 0;
    f32[base + RB_ROT_PRED_W] = rot[3] ?? 1;

    f32[base + RB_RESTITUTION] = mat.restitution;
    f32[base + RB_FRICTION]    = mat.friction;
    f32[base + RB_LIN_DAMPING] = mat.linearDamping;
    f32[base + RB_ANG_DAMPING] = mat.angularDamping;

    f32[base + RB_SHAPE_TYPE]  = shapeInfo ? shapeInfo.shapeType : 0.0;
    f32[base + RB_HALF_X]      = shapeInfo ? shapeInfo.he[0]     : 0.0;
    f32[base + RB_HALF_Y]      = shapeInfo ? shapeInfo.he[1]     : 0.0;
    f32[base + RB_HALF_Z]      = shapeInfo ? shapeInfo.he[2]     : 0.0;

    f32[base + 36] = 0; f32[base + 37] = 0;
    f32[base + 38] = 0; f32[base + 39] = 0;
}
