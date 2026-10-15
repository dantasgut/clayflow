import { linalg, noise } from '../gpu/shaders/math';
import type { BindablePoint } from '../../scene/shaders/bindPoints';
import { wgslModule } from '../../scene/shaders/WgslModule';
import { POINT_PARAMS, wgslPoint } from '../../scene/shaders/WgslPoint';
import surfaceFnReadySource from '../gpu/wgsl/kernels/surface_fn_ready.wgsl?raw';
import surfaceTangentsNumericSource from '../gpu/wgsl/kernels/surface_tangents_numeric.wgsl?raw';
import surfaceTangentsAnalyticSource from '../gpu/wgsl/kernels/surface_tangents_analytic.wgsl?raw';
import spaceReadySource from '../gpu/wgsl/kernels/space_ready.wgsl?raw';
import surfaceAtSource from '../gpu/wgsl/kernels/surface_at.wgsl?raw';
import surfaceEvalSource from '../gpu/wgsl/kernels/surface_eval.wgsl?raw';
import surfaceEvalDiffSource from '../gpu/wgsl/kernels/surface_eval_diff.wgsl?raw';
import surfaceAdaptSource from '../gpu/wgsl/kernels/surface_adapt.wgsl?raw';
import { Camera } from '../scene/Camera';
import { Transform } from '../scene/Transform';
import surfaceFormsSource from '../gpu/wgsl/kernels/surface_forms.wgsl?raw';
import surfaceJetAnalyticSource from '../gpu/wgsl/kernels/surface_jet_analytic.wgsl?raw';
import surfaceJetCommonSource from '../gpu/wgsl/kernels/surface_jet_common.wgsl?raw';
import surfaceJetMappedSource from '../gpu/wgsl/kernels/surface_jet_mapped.wgsl?raw';
import surfaceJetNumericSource from '../gpu/wgsl/kernels/surface_jet_numeric.wgsl?raw';
import surfaceJetPresetSource from '../gpu/wgsl/kernels/surface_jet_preset.wgsl?raw';
import { combineSpaceFunctions } from '../extension/combineSpace';
import {
    SpaceFnRecordSchema,
    SurfaceAdaptParamsSchema,
    SurfaceDiffSchema,
    SurfaceFnRecordSchema,
    SurfaceParamsSchema,
} from './SurfaceSchemas';

/** Superfícies prontas (plano, esfera, toro, terreno por ruído) — o pronto do ponto `surface`. */
export const surfaceFnReady = wgslModule({
    name: 'surface_fn_ready',
    source: surfaceFnReadySource,
    requires: [noise],
    structs: [SurfaceParamsSchema, SurfaceFnRecordSchema],
});

/** Tangentes por diferenças centrais (sem derivadas analíticas). */
export const surfaceTangentsNumeric = wgslModule({
    name: 'surface_tangents_numeric',
    source: surfaceTangentsNumericSource,
});

/** Lugar das tangentes no `surface_eval`: numéricas (pronto) ou as derivadas analíticas da função. */
export const surfaceTangents: BindablePoint = {
    name: 'surface_tangents',
    ready: surfaceTangentsNumeric,
};

/** Tangentes pelas derivadas analíticas (`surface_du`/`surface_dv`) da função. */
export const surfaceTangentsAnalytic = wgslModule({
    name: 'surface_tangents_analytic',
    source: surfaceTangentsAnalyticSource,
});

/** Espaço pronto: identidade (sem custo). */
export const spaceReady = wgslModule({ name: 'space_ready', source: spaceReadySource });

/**
 * Ponto da superfície em (u, v) — posição e normal com o espaço da cena (spec 010): o único código de avaliação, usado
 * pela malha uniforme, pela adaptativa e pelo colisor.
 */
export const surfaceAt = wgslModule({
    name: 'surface_at',
    source: surfaceAtSource,
    requires: [surfaceFnReady, surfaceTangentsNumeric, spaceReady],
});

/** Avaliação de uma superfície paramétrica na grade (posição, normal, uv), com o espaço da cena. */
export const surfaceEval = wgslModule({
    name: 'surface_eval',
    source: surfaceEvalSource,
    // `noise` e `linalg` ficam à mão das funções do usuário.
    requires: [noise, linalg, surfaceAt],
    structs: [SurfaceParamsSchema, SurfaceFnRecordSchema, SpaceFnRecordSchema],
});

/** Jato (derivadas até a segunda ordem) e os jatos por diferenças da função e do mapa composto com o espaço (spec 010). */
export const surfaceJetCommon = wgslModule({
    name: 'surface_jet_common',
    source: surfaceJetCommonSource,
    requires: [surfaceFnReady, surfaceTangentsNumeric, spaceReady],
});

/** Jato pronto: primeiras pelo lugar das tangentes, segundas por diferenças. */
export const surfaceJetNumeric = wgslModule({
    name: 'surface_jet_numeric',
    source: surfaceJetNumericSource,
    requires: [surfaceJetCommon],
});

/** Lugar do jato na geometria diferencial: numérico (pronto), analítico, das prontas ou do mapa com o espaço. */
export const surfaceJet: BindablePoint = { name: 'surface_jet', ready: surfaceJetNumeric };

/** Jato pelas cinco derivadas analíticas da função (`surface_du` … `surface_dvv`). */
export const surfaceJetAnalytic = wgslModule({
    name: 'surface_jet_analytic',
    source: surfaceJetAnalyticSource,
    requires: [surfaceJetCommon],
});

/** Jato das superfícies prontas (plano, esfera e toro analíticos; terreno por diferenças). */
export const surfaceJetPreset = wgslModule({
    name: 'surface_jet_preset',
    source: surfaceJetPresetSource,
    requires: [surfaceJetCommon],
});

/** Jato do mapa composto `space_map ∘ surface_fn` (espaço na cena), todo por diferenças. */
export const surfaceJetMapped = wgslModule({
    name: 'surface_jet_mapped',
    source: surfaceJetMappedSource,
    requires: [surfaceJetCommon],
});

/** Formas fundamentais, curvaturas e direção principal a partir do jato. */
export const surfaceForms = wgslModule({
    name: 'surface_forms',
    source: surfaceFormsSource,
    requires: [surfaceJetCommon],
    structs: [SurfaceDiffSchema],
});

/** Avaliação na grade com a geometria diferencial no pool `SurfaceDiff` (spec 010). */
export const surfaceEvalDiff = wgslModule({
    name: 'surface_eval_diff',
    source: surfaceEvalDiffSource,
    requires: [noise, linalg, surfaceAt, surfaceJetNumeric, surfaceForms],
    structs: [SurfaceParamsSchema, SurfaceFnRecordSchema, SpaceFnRecordSchema, SurfaceDiffSchema],
});

/** Malha adaptativa (spec 010): níveis por retalho, orçamento, prefixos e emissão sem frestas. */
export const surfaceAdapt = wgslModule({
    name: 'surface_adapt',
    source: surfaceAdaptSource,
    requires: [noise, linalg, surfaceAt, surfaceJetNumeric, surfaceForms],
    structs: [
        SurfaceParamsSchema,
        SurfaceFnRecordSchema,
        SpaceFnRecordSchema,
        SurfaceDiffSchema,
        SurfaceAdaptParamsSchema,
        Camera.matricesSchema,
        Transform.worldSchema,
    ],
});

/**
 * Ponto `surface` (spec 009): `fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f` e, opcionais,
 * as derivadas `surface_du`/`surface_dv` (mesma assinatura). Pronto: plano, esfera, toro, terreno por ruído.
 * Disponíveis para a função: `noise`, `linalg`.
 */
export const surfacePoint = wgslPoint({
    name: 'surface',
    required: {
        name: 'surface_fn',
        params: ['f32', 'f32', 'f32', POINT_PARAMS],
        returns: 'vec3f',
    },
    optional: [
        { name: 'surface_du', params: ['f32', 'f32', 'f32', POINT_PARAMS], returns: 'vec3f' },
        { name: 'surface_dv', params: ['f32', 'f32', 'f32', POINT_PARAMS], returns: 'vec3f' },
        // Segundas derivadas (spec 010), para a geometria diferencial analítica: as três ou nenhuma.
        { name: 'surface_duu', params: ['f32', 'f32', 'f32', POINT_PARAMS], returns: 'vec3f' },
        { name: 'surface_duv', params: ['f32', 'f32', 'f32', POINT_PARAMS], returns: 'vec3f' },
        { name: 'surface_dvv', params: ['f32', 'f32', 'f32', POINT_PARAMS], returns: 'vec3f' },
    ],
    paramsAlias: 'SurfaceFnParams',
    record: SurfaceFnRecordSchema,
    ready: surfaceFnReady,
    hosts: () => [surfaceEval, surfaceEvalDiff, surfaceAdapt],
});

/**
 * Ponto `space` (spec 009) — de cena: `fn space_fn(x: vec3f, time: f32, data: SpaceFnParams) -> vec3f` e, opcional, a
 * Jacobiana `fn space_jacobian(x: vec3f, time: f32, data: SpaceFnParams) -> mat3x3f`. Nesta spec deforma as
 * superfícies paramétricas (coordenadas locais); a aplicação à cena inteira é da 019.
 */
export const spacePoint = wgslPoint({
    name: 'space',
    required: { name: 'space_fn', params: ['vec3f', 'f32', POINT_PARAMS], returns: 'vec3f' },
    optional: [
        { name: 'space_jacobian', params: ['vec3f', 'f32', POINT_PARAMS], returns: 'mat3x3f' },
    ],
    paramsAlias: 'SpaceFnParams',
    record: SpaceFnRecordSchema,
    ready: spaceReady,
    hosts: () => [surfaceEval],
    scene: {
        globals: { space_records: { pool: SpaceFnRecordSchema } },
        combine: (entries) => combineSpaceFunctions(entries, [linalg]),
    },
});
