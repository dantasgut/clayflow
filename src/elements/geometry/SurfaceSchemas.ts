import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/**
 * Geometria diferencial por vértice (spec 010): primeira forma (E, F, G e o determinante EG − F²), segunda forma
 * (L, M, N), curvaturas (gaussiana, média e principais k₁ ≥ k₂, sinal convexo positivo) e a direção principal de k₁
 * (xyz; w = 1 válida, 0 em ponto umbílico ou degenerado). Pool `SurfaceDiff`, escrito só pela GPU.
 */
export const SurfaceDiffSchema = new StructSchema('SurfaceDiff', {
    metric: FieldType.vec4f,
    second: FieldType.vec4f,
    curvature: FieldType.vec4f,
    principal: FieldType.vec4f,
});

/**
 * Parâmetros da avaliação de uma superfície (spec 009): grade, domínio, tempo, passos das diferenças centrais, slot do
 * registro da função e a superfície pronta (tipo e valores).
 */
export const SurfaceParamsSchema = new StructSchema(
    'SurfaceParams',
    {
        nu: FieldType.u32,
        nv: FieldType.u32,
        record_slot: FieldType.u32,
        preset: FieldType.u32,
        u0: FieldType.f32,
        u1: FieldType.f32,
        v0: FieldType.f32,
        v1: FieldType.f32,
        time: FieldType.f32,
        h_u: FieldType.f32,
        h_v: FieldType.f32,
        /** Primeiro slot do pool `SurfaceDiff` da superfície (spec 010; 0 sem geometria diferencial). */
        diff_first: FieldType.u32,
        preset_a: FieldType.vec4f,
    },
    { addressSpace: 'uniform' },
);

/**
 * Parâmetros da malha adaptativa (spec 010): retalhos, nível máximo, orçamento de triângulos, câmera ativa e
 * transformação (slots nos pools), início da geometria diferencial, modo sem desenho indireto (todos no nível máximo),
 * domínios periódicos, lado da grade do nível máximo (2^L + 1), tolerância de corda (m) e fração da tela por segmento.
 */
export const SurfaceAdaptParamsSchema = new StructSchema(
    'SurfaceAdaptParams',
    {
        patches_u: FieldType.u32,
        patches_v: FieldType.u32,
        max_level: FieldType.u32,
        budget: FieldType.u32,
        camera_slot: FieldType.u32,
        transform_slot: FieldType.u32,
        diff_first: FieldType.u32,
        force_max: FieldType.u32,
        periodic_u: FieldType.u32,
        periodic_v: FieldType.u32,
        side: FieldType.u32,
        _pad0: FieldType.u32,
        tolerance: FieldType.f32,
        screen: FieldType.f32,
        _pad1: FieldType.f32,
        _pad2: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);
