import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

// Layouts da estrutura de raios da cena (spec 033, R1). Cada um é um pool da C2 (a `RayScene` ocupa uma faixa de
// cada, com a capacidade como contagem): os pools crescem por realocação e os estágios que os leem são religados pela
// C2. Campos em `vec4` para o layout de storage não depender do alinhamento de `vec3`.

/** Vértice copiado de uma geometria, em espaço de objeto: posição (w = u) e normal (w = v). */
export const RayVertexSchema = new StructSchema('RayVertex', {
    position: FieldType.vec4f,
    normal: FieldType.vec4f,
});

/** Triângulo: os três vértices (índices relativos ao início da faixa de vértices); w livre. */
export const RayTriangleSchema = new StructSchema('RayTriangle', {
    vertices: FieldType.vec4u,
});

/** Esfera (partícula de sprite), em mundo: centro e raio. */
export const RaySphereSchema = new StructSchema('RaySphere', {
    sphere: FieldType.vec4f,
});

/**
 * Nó da hierarquia (BLAS ou TLAS): caixa mínima (`lo.xyz`) e máxima (`hi.xyz`); `lo.w` e `hi.w` guardam, em bits, os
 * filhos esquerdo e direito (índices locais à hierarquia) — na folha, `lo.w` tem o bit `RAY_LEAF` com a posição da
 * folha e `hi.w` a primitiva (local).
 */
export const RayNodeSchema = new StructSchema('RayNode', {
    lo: FieldType.vec4f,
    hi: FieldType.vec4f,
});

/**
 * Hierarquia de baixo (uma por conteúdo de geometria, ou por corpo de partículas): `a` = (início dos nós, início das
 * primitivas, primitivas, tipo — `RAY_KIND_*`), `b` = (início dos vértices, volume, primitivas por folha, 0).
 */
export const RayBlasSchema = new StructSchema('RayBlas', {
    a: FieldType.vec4u,
    b: FieldType.vec4u,
});

/**
 * Instância da cena: as matrizes de mundo → objeto e objeto → mundo e `ids` = (hierarquia, registro `Renderable`,
 * tipo — `RAY_KIND_*`, entidade de volume).
 */
export const RayInstanceSchema = new StructSchema('RayInstance', {
    toObject: FieldType.mat4x4f,
    toWorld: FieldType.mat4x4f,
    ids: FieldType.vec4u,
});

/**
 * A estrutura de raios da cena (uniform): o início da faixa da `RayScene` em cada pool, o número de instâncias e a
 * raiz da hierarquia de cima (índice local à faixa de nós). Atualizada pelo estágio que constrói a estrutura.
 */
export const RaySceneSchema = new StructSchema(
    'RayScene',
    {
        vertexFirst: FieldType.u32,
        triangleFirst: FieldType.u32,
        sphereFirst: FieldType.u32,
        nodeFirst: FieldType.u32,
        blasFirst: FieldType.u32,
        instanceFirst: FieldType.u32,
        instanceCount: FieldType.u32,
        tlasRoot: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/**
 * Parâmetros de um passo da construção (uniform, uma região por hierarquia no quadro): onde começam as faixas da
 * `RayScene` nos pools (`*First`, absolutos) e onde começa a hierarquia dentro delas (`*Base`, relativos), mais a origem
 * das primitivas (geometria ou corpo de partículas).
 */
export const RayBuildParamsSchema = new StructSchema(
    'RayBuildParams',
    {
        /** Primitivas da hierarquia (capacidade). */
        count: FieldType.u32,
        /** Registro de construção da hierarquia (caixa do conjunto). */
        slot: FieldType.u32,
        /** Início da faixa de nós no pool. */
        nodeFirst: FieldType.u32,
        /** Início da hierarquia na faixa de nós. */
        nodeBase: FieldType.u32,
        /** Início da faixa de primitivas no pool (triângulos, esferas ou instâncias). */
        primFirst: FieldType.u32,
        /** Início das primitivas da hierarquia na faixa. */
        primBase: FieldType.u32,
        /** Início da faixa de vértices no pool. */
        vertexFirst: FieldType.u32,
        /** Início dos vértices da hierarquia na faixa. */
        vertexBase: FieldType.u32,
        /** Vértices da geometria de origem. */
        vertexCount: FieldType.u32,
        /** Partículas: início da faixa do corpo no pool, registro em `vec4` e deslocamento de `pos`. */
        first: FieldType.u32,
        strideVec4: FieldType.u32,
        posOffsetVec4: FieldType.u32,
        /** Raio das esferas (partículas). */
        radius: FieldType.f32,
        /** Tipo das primitivas (`RAY_KIND_*`). */
        kind: FieldType.u32,
        /** Bits descartados do código de Morton (a hierarquia de cima ordena chaves menores). */
        keyShift: FieldType.u32,
        /** Folhas da hierarquia (primitivas / primitivas por folha). */
        leaves: FieldType.u32,
        /** Primitivas consecutivas por folha (triângulos; 1 nas esferas e instâncias). */
        leafSize: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** Caixa de uma primitiva no temporário da construção: mínimo e máximo. */
export const RayAabbSchema = new StructSchema('RayAabb', {
    lo: FieldType.vec4f,
    hi: FieldType.vec4f,
});

/** Registro de origem de uma instância, escrito pela CPU quando o conjunto muda: hierarquia, slots e tipo. */
export const RayInstanceSourceSchema = new StructSchema('RayInstanceSource', {
    /** (hierarquia, registro `Renderable`, slot da matriz de mundo, tipo `RAY_KIND_*`). */
    ids: FieldType.vec4u,
});
