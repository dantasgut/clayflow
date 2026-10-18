import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

// Layouts da estrutura de raios da cena (spec 033, R1). Dois pools da C2 de palavras `vec4u` (a `RayScene` ocupa uma
// faixa de cada, com a capacidade como contagem; os pools crescem por realocação e os estágios que os leem são
// religados pela C2): a geometria (vértices, triângulos, esferas) e a hierarquia (nós, hierarquias de baixo,
// instâncias). Dois buffers só — a consulta cabe no limite de buffers de storage por estágio (10 no Metal) com folga para
// quem a usa. Floats guardados pelos bits (`bitcast`): nenhum padrão de bits passa por memória `f32`.
//
// Palavras por elemento (as constantes `RAY_*_WORDS` do WGSL):
//   - vértice (2): posição (w = u), normal (w = v), em espaço de objeto;
//   - triângulo (1): os três vértices (índices relativos ao início da faixa de vértices), w livre;
//   - esfera (1): centro e raio, em mundo;
//   - nó (2): caixa mínima com o filho esquerdo em `w`, caixa máxima com o direito (índices locais à hierarquia; na
//     folha, o esquerdo tem o bit `RAY_LEAF` com a posição da folha e o direito a primeira primitiva);
//   - hierarquia de baixo (2): (início dos nós, início das primitivas, primitivas, tipo `RAY_KIND_*`) e (início dos
//     vértices, volume, primitivas por folha, 0);
//   - instância (11): mundo → objeto (4), objeto → mundo (4), (hierarquia, registro `Renderable`, tipo, material: bit 31
//     = `StandardMaterial`, bits baixos = índice da função `material` + 1), o material — (albedo, rugosidade) e
//     (metalicidade, slot da função, 0, 0).

/** Pool da geometria da estrutura (vértices, triângulos, esferas), em palavras `vec4u`. */
export const RayGeometrySchema = new StructSchema('RayGeometry', { word: FieldType.vec4u });

/** Pool da hierarquia da estrutura (nós, hierarquias de baixo, instâncias), em palavras `vec4u`. */
export const RayBvhSchema = new StructSchema('RayBvh', { word: FieldType.vec4u });

/** Palavras por elemento (as mesmas do WGSL). */
export const RAY_WORDS = Object.freeze({
    vertex: 2,
    triangle: 1,
    sphere: 1,
    node: 2,
    blas: 2,
    instance: 11,
});

/**
 * A estrutura de raios da cena (uniform): a palavra em que começa cada região da `RayScene` nos dois pools
 * (vértices, triângulos e esferas na geometria; nós, hierarquias e instâncias na hierarquia), o número de instâncias e
 * a raiz da hierarquia de cima (nó local à região de nós). Atualizada pelo estágio que constrói a estrutura.
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

/** Registro de origem de uma instância, escrito pela CPU quando o conjunto muda: hierarquia, slots, tipo e material. */
export const RayInstanceSourceSchema = new StructSchema('RayInstanceSource', {
    /** (hierarquia, registro `Renderable`, slot da matriz de mundo, tipo `RAY_KIND_*`). */
    ids: FieldType.vec4u,
    /** (material: bit 31 = `StandardMaterial`, bits baixos = índice da função `material` + 1; 0, 0, 0). */
    material: FieldType.vec4u,
});
