import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

// Estado interno dos estágios de física em buffers de storage (spec 005, R5).

/** Contato compactado do LCP (spec 004, R19): par, normal, ponto, multiplicadores e diagonais de Delassus. */
export const RBContactSchema = new StructSchema('RBContact', {
    normal: FieldType.vec4f,
    point: FieldType.vec4f,
    rb_idx: FieldType.u32,
    col_idx: FieldType.u32,
    is_active: FieldType.u32,
    rb_idx_b: FieldType.u32,
    lambda_tx: FieldType.f32,
    lambda_ty: FieldType.f32,
    diagonal_n: FieldType.f32,
    diagonal_t1: FieldType.f32,
    restitution: FieldType.f32,
    diagonal_t2: FieldType.f32,
    _pad3: FieldType.f32,
    weight: FieldType.f32,
    rolling: FieldType.vec3f,
    feature: FieldType.u32,
});

/** Contador da lista de contatos e excedente. */
export const RBContactCounterSchema = new StructSchema('RBContactCounter', {
    count: FieldType.atomicU32,
    overflow: FieldType.atomicU32,
    _pad0: FieldType.u32,
    _pad1: FieldType.u32,
});

/** Entrada da tabela de warm start (chave por CAS + multiplicadores). */
export const RBWarmEntrySchema = new StructSchema('RBWarmEntry', {
    key: FieldType.atomicU32,
    lambda_n: FieldType.f32,
    lambda_tx: FieldType.f32,
    lambda_ty: FieldType.f32,
});

/** Somas do solve Jacobi por corpo (ponto fixo). */
export const RBBodyDeltaSchema = new StructSchema('RBBodyDelta', {
    dv_x: FieldType.atomicI32,
    dv_y: FieldType.atomicI32,
    dv_z: FieldType.atomicI32,
    _pad0: FieldType.i32,
    dw_x: FieldType.atomicI32,
    dw_y: FieldType.atomicI32,
    dw_z: FieldType.atomicI32,
    _pad1: FieldType.i32,
});

/** Correção posicional acumulada por corpo (ponto fixo) e número de contatos. */
export const RBBodyCorrectionSchema = new StructSchema('RBBodyCorrection', {
    c_x: FieldType.atomicI32,
    c_y: FieldType.atomicI32,
    c_z: FieldType.atomicI32,
    contacts: FieldType.atomicI32,
});

/** Nó da grade do MPM: massa e momento em ponto fixo (somas atômicas), velocidade resolvida. */
export const MPMGridNodeSchema = new StructSchema('MPMGridNode', {
    mass_i32: FieldType.atomicI32,
    mom_x_i32: FieldType.atomicI32,
    mom_y_i32: FieldType.atomicI32,
    mom_z_i32: FieldType.atomicI32,
    vel: FieldType.vec3f,
    _pad: FieldType.f32,
});
