import { finite, linalg, noise } from '../gpu/shaders/math';
import { wgslResource, type WgslResourceType } from '../../scene/shaders/WgslResource';
import { NONE, WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type { BindablePoint } from '../../scene/shaders/bindPoints';
import { poolArenaReader } from '../../scene/shaders/poolArena';
import { wgslModule } from '../../scene/shaders/WgslModule';
import { POINT_PARAMS, wgslPoint } from '../../scene/shaders/WgslPoint';
import surfaceFnReadySource from '../gpu/wgsl/kernels/surface_fn_ready.wgsl?raw';
import surfaceTangentsNumericSource from '../gpu/wgsl/kernels/surface_tangents_numeric.wgsl?raw';
import surfaceTangentsAnalyticSource from '../gpu/wgsl/kernels/surface_tangents_analytic.wgsl?raw';
import spaceReadySource from '../gpu/wgsl/kernels/space_ready.wgsl?raw';
import surfaceAtSource from '../gpu/wgsl/kernels/surface_at.wgsl?raw';
import surfaceDisplacedAtSource from '../gpu/wgsl/kernels/surface_displaced_at.wgsl?raw';
import displacementFnReadySource from '../gpu/wgsl/kernels/displacement_fn_ready.wgsl?raw';
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
import { surfaceSampleType } from '../material/point/types/shaders';
import { MeshVertexSchema } from './MeshVertexSchema';
import { SurfaceAdaptParamsSchema, SurfaceDiffSchema, SurfaceParamsSchema } from './SurfaceSchemas';

// Recursos da avaliação de superfícies (spec 031): todos privados do `SurfaceFlow` (por pipeline: cada superfície tem os
// seus). Os registros das funções `surface` e `space` chegam com os módulos delas (pool da forma de cada uma, R8).

const priv = (
    name: string,
    access: 'read' | 'read_write',
    type: WgslResourceType,
): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { storage: access },
        type,
        frequency: 'stage',
        provider: 'private',
    });

/** Recursos das superfícies paramétricas. */
export const surfaceResources = Object.freeze({
    params: wgslResource({
        name: 'surface_params',
        binding: { uniform: true },
        type: { schema: SurfaceParamsSchema },
        frequency: 'stage',
        provider: 'private',
    }),
    vertices: priv('surface_vertices', 'read_write', { schema: MeshVertexSchema, array: true }),
    diff: priv('surface_diff', 'read_write', { schema: SurfaceDiffSchema, array: true }),
    adapt: wgslResource({
        name: 'adapt',
        binding: { uniform: true },
        type: { schema: SurfaceAdaptParamsSchema },
        frequency: 'stage',
        provider: 'private',
    }),
    adaptPatches: priv('adapt_patches', 'read_write', { wgsl: 'vec4u', array: true }),
    adaptHist: priv('adapt_hist', 'read_write', { wgsl: 'atomic<u32>', array: true }),
    adaptVertices: priv('adapt_vertices', 'read_write', { schema: MeshVertexSchema, array: true }),
    adaptIndices: priv('adapt_indices', 'read_write', { wgsl: 'u32', array: true }),
    adaptEdges: priv('adapt_edges', 'read_write', { wgsl: 'u32', array: true }),
    adaptDraw: priv('adapt_draw', 'read_write', { wgsl: 'u32', array: true }),
    // As câmeras e as matrizes de mundo pela arena da GPU (T060i).
    adaptCameras: poolArenaReader({
        name: 'adapt_cameras',
        pool: Camera.matricesSchema.name,
        schema: Camera.matricesSchema,
        arena: 'gpu',
    }),
    adaptWorlds: poolArenaReader({
        name: 'adapt_worlds',
        pool: Transform.worldSchema.name,
        schema: Transform.worldSchema,
        arena: 'gpu',
    }),
});
const R = surfaceResources;

/** Superfícies prontas (plano, esfera, toro, terreno por ruído) — o pronto do ponto `surface`. */
export const surfaceFnReady = wgslModule({
    name: 'surface_fn_ready',
    source: surfaceFnReadySource,
    requires: [noise, R.params],
    structs: [SurfaceParamsSchema],
});

/** Tangentes por diferenças centrais (sem derivadas analíticas). */
export const surfaceTangentsNumeric = wgslModule({
    name: 'surface_tangents_numeric',
    source: surfaceTangentsNumericSource,
    requires: [R.params],
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
    requires: [surfaceFnReady, surfaceTangentsNumeric, spaceReady, finite, R.params],
});

/** Função pronta do ponto `displacement`: sem deslocamento. */
const displacementFnReady = wgslModule({
    name: 'displacement_fn_ready',
    source: displacementFnReadySource,
    requires: [surfaceSampleType],
});

/**
 * Ponto deslocado de uma superfície (spec 011): o de `surface_at` movido ao longo da normal pela altura do ponto
 * `displacement`, com o passo da malha como largura do filtro dos padrões.
 */
const surfaceDisplacedAt = wgslModule({
    name: 'surface_displaced_at',
    source: surfaceDisplacedAtSource,
    requires: [surfaceAt, surfaceSampleType, displacementFnReady, R.params],
});

/** Avaliação de uma superfície paramétrica na grade (posição, normal, uv), com o espaço da cena. */
export const surfaceEval = wgslModule({
    name: 'surface_eval',
    source: surfaceEvalSource,
    // `noise` e `linalg` ficam à mão das funções do usuário.
    requires: [noise, linalg, surfaceDisplacedAt, WORKGROUP_SIZE.module, R.params, R.vertices],
    structs: [SurfaceParamsSchema],
});

/** Jato (derivadas até a segunda ordem) e os jatos por diferenças da função e do mapa composto com o espaço (spec 010). */
export const surfaceJetCommon = wgslModule({
    name: 'surface_jet_common',
    source: surfaceJetCommonSource,
    requires: [surfaceFnReady, surfaceTangentsNumeric, spaceReady, R.params],
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
    requires: [surfaceJetCommon, R.params],
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
    requires: [surfaceJetCommon, finite],
    structs: [SurfaceDiffSchema],
});

/** Avaliação na grade com a geometria diferencial no pool `SurfaceDiff` (spec 010). */
export const surfaceEvalDiff = wgslModule({
    name: 'surface_eval_diff',
    source: surfaceEvalDiffSource,
    requires: [
        noise,
        linalg,
        surfaceDisplacedAt,
        surfaceJetNumeric,
        surfaceForms,
        WORKGROUP_SIZE.module,
        R.params,
        R.vertices,
        R.diff,
    ],
    structs: [SurfaceParamsSchema, SurfaceDiffSchema],
});

/** Malha adaptativa (spec 010): níveis por retalho, orçamento, prefixos e emissão sem frestas. */
export const surfaceAdapt = wgslModule({
    name: 'surface_adapt',
    source: surfaceAdaptSource,
    requires: [
        noise,
        linalg,
        surfaceDisplacedAt,
        surfaceJetNumeric,
        surfaceForms,
        NONE.module,
        WORKGROUP_SIZE.module,
        R.params,
        R.adapt,
        R.adaptPatches,
        R.adaptHist,
        R.adaptVertices,
        R.adaptIndices,
        R.adaptEdges,
        R.adaptDraw,
        R.diff,
        R.adaptCameras,
        R.adaptWorlds,
    ],
    structs: [
        SurfaceParamsSchema,
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
        names: ['u', 'v', 'time', 'data'],
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
    ready: surfaceFnReady,
    hosts: () => [surfaceEval, surfaceEvalDiff, surfaceAdapt],
});

/**
 * Ponto `displacement` (spec 011): `fn displacement_fn(s: SurfaceSample, data: DisplacementFnParams) -> f32` — a altura
 * (nas unidades da superfície) que desloca cada vértice de uma `ParametricSurface` ao longo da normal. `s` é a amostra
 * de superfície do ponto `material` preenchida para o vértice: uv, posição e normal locais, tangentes do uv e, como
 * derivadas do uv, o passo da malha — os padrões (`pattern.*` sobre `surface.uvSpace`) filtram o que a malha não
 * resolve. Pronto: zero (sem deslocamento).
 */
export const displacementPoint = wgslPoint({
    name: 'displacement',
    required: {
        name: 'displacement_fn',
        params: ['SurfaceSample', POINT_PARAMS],
        returns: 'f32',
        names: ['s', 'data'],
    },
    paramsAlias: 'DisplacementFnParams',
    ready: displacementFnReady,
    hosts: () => [surfaceEval, surfaceEvalDiff, surfaceAdapt],
});

/**
 * Ponto `space` (spec 009) — de cena: `fn space_fn(x: vec3f, time: f32, data: SpaceFnParams) -> vec3f` e, opcional, a
 * Jacobiana `fn space_jacobian(x: vec3f, time: f32, data: SpaceFnParams) -> mat3x3f`. Nesta spec deforma as
 * superfícies paramétricas (coordenadas locais); a aplicação à cena inteira é da 019.
 */
export const spacePoint = wgslPoint({
    name: 'space',
    required: {
        name: 'space_fn',
        params: ['vec3f', 'f32', POINT_PARAMS],
        returns: 'vec3f',
        names: ['x', 'time', 'data'],
    },
    optional: [
        { name: 'space_jacobian', params: ['vec3f', 'f32', POINT_PARAMS], returns: 'mat3x3f' },
    ],
    paramsAlias: 'SpaceFnParams',
    ready: spaceReady,
    hosts: () => [surfaceEval],
    scene: {
        globals: {},
        combine: (entries) => combineSpaceFunctions(entries, [linalg]),
    },
});
