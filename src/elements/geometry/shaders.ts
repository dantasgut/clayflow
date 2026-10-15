import { linalg, noise } from '../gpu/shaders/math';
import type { BindablePoint } from '../../scene/shaders/bindPoints';
import { wgslModule } from '../../scene/shaders/WgslModule';
import { POINT_PARAMS, wgslPoint } from '../../scene/shaders/WgslPoint';
import surfaceFnReadySource from '../gpu/wgsl/kernels/surface_fn_ready.wgsl?raw';
import surfaceTangentsNumericSource from '../gpu/wgsl/kernels/surface_tangents_numeric.wgsl?raw';
import surfaceTangentsAnalyticSource from '../gpu/wgsl/kernels/surface_tangents_analytic.wgsl?raw';
import spaceReadySource from '../gpu/wgsl/kernels/space_ready.wgsl?raw';
import surfaceEvalSource from '../gpu/wgsl/kernels/surface_eval.wgsl?raw';
import { combineSpaceFunctions } from '../extension/combineSpace';
import { SpaceFnRecordSchema, SurfaceFnRecordSchema, SurfaceParamsSchema } from './SurfaceSchemas';

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

/** Avaliação de uma superfície paramétrica na grade (posição, normal, uv), com o espaço da cena. */
export const surfaceEval = wgslModule({
    name: 'surface_eval',
    source: surfaceEvalSource,
    // `noise` e `linalg` ficam à mão das funções do usuário.
    requires: [noise, linalg, surfaceFnReady, surfaceTangentsNumeric, spaceReady],
    structs: [SurfaceParamsSchema, SurfaceFnRecordSchema, SpaceFnRecordSchema],
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
    ],
    paramsAlias: 'SurfaceFnParams',
    record: SurfaceFnRecordSchema,
    ready: surfaceFnReady,
    hosts: () => [surfaceEval],
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
