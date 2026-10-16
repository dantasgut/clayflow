import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { setType } from '../../../scene/graph/SetNode';
import { MeshVertexSchema } from '../../geometry/MeshVertexSchema';

// Elementos e tipos de porta dos nós de conjunto (spec 031, R10) e os parâmetros dos kernels deles (um uniform por
// instância de nó, escrito pela CPU em `update`, com os índices dos registros `SetCount` e os valores do nó).

/** Triângulo de uma malha de conjunto: três índices de vértice (12 B, `array<MeshTriangle>` sem offsets à mão). */
export const MeshTriangleSchema = new StructSchema('MeshTriangle', {
    a: FieldType.u32,
    b: FieldType.u32,
    c: FieldType.u32,
});

/** Ponto de um conjunto de pontos: posição e normal em `f32` escalares (24 B). */
export const SetPointSchema = new StructSchema('SetPoint', {
    px: FieldType.f32,
    py: FieldType.f32,
    pz: FieldType.f32,
    nx: FieldType.f32,
    ny: FieldType.f32,
    nz: FieldType.f32,
});

/** Elemento de um conjunto u32 (4 B — o layout de `array<u32>` das primitivas). */
export const SetU32Schema = new StructSchema('SetU32', { value: FieldType.u32 });

/** Porta de malha: vértices `MeshVertex` e triângulos `MeshTriangle`. */
export const MESH = setType('mesh', { vertices: MeshVertexSchema, triangles: MeshTriangleSchema });

/** Porta de pontos: `SetPoint` (posição e normal). */
export const POINTS = setType('points', { points: SetPointSchema });

/** Porta de conjunto u32 (entrada e saída das primitivas: soma de prefixos, ordenação, compactação, redução). */
export const U32S = setType('u32s', { values: SetU32Schema });

const uniform = { addressSpace: 'uniform' } as const;

/** Parâmetros de `set.grid`. */
export const GridParamsSchema = new StructSchema(
    'GridParams',
    { nu: FieldType.u32, nv: FieldType.u32, size_u: FieldType.f32, size_v: FieldType.f32 },
    uniform,
);

/** Parâmetros de `set.displace`. */
export const DisplaceParamsSchema = new StructSchema(
    'DisplaceParams',
    { vertices_slot: FieldType.u32, scale: FieldType.f32 },
    uniform,
);

/** Parâmetros de `set.recomputeNormals`. */
export const NormalsParamsSchema = new StructSchema(
    'NormalsParams',
    { vertices_slot: FieldType.u32, triangles_slot: FieldType.u32 },
    uniform,
);

/** Parâmetros de `set.distributeOnMesh`. */
export const DistributeParamsSchema = new StructSchema(
    'DistributeParams',
    {
        triangles_slot: FieldType.u32,
        points_slot: FieldType.u32,
        per_triangle: FieldType.u32,
        seed: FieldType.u32,
        triangle_capacity: FieldType.u32,
    },
    uniform,
);

/** Parâmetros da contagem aceita por compactação (`set_accepted`): registro de saída e capacidade. */
export const SetAcceptedParamsSchema = new StructSchema(
    'SetAcceptedParams',
    { slot: FieldType.u32, capacity: FieldType.u32 },
    uniform,
);

/** Parâmetros de `set.realizeInstances`. */
export const RealizeParamsSchema = new StructSchema(
    'RealizeParams',
    {
        points_slot: FieldType.u32,
        vertices_slot: FieldType.u32,
        triangles_slot: FieldType.u32,
        segments: FieldType.u32,
        rings: FieldType.u32,
        radius: FieldType.f32,
        vertex_capacity: FieldType.u32,
        triangle_capacity: FieldType.u32,
    },
    uniform,
);

/** Parâmetros de `set.meshOutput` (capacidades do alvo; os vértices copiados = o menor entre conjunto e alvo). */
export const MeshOutputParamsSchema = new StructSchema(
    'MeshOutputParams',
    {
        vertices_slot: FieldType.u32,
        triangles_slot: FieldType.u32,
        vertex_capacity: FieldType.u32,
        triangle_capacity: FieldType.u32,
        edge_capacity: FieldType.u32,
    },
    uniform,
);

/** Parâmetros de `set.pointsOutput`. */
export const PointsOutputParamsSchema = new StructSchema(
    'PointsOutputParams',
    { points_slot: FieldType.u32, vertex_capacity: FieldType.u32, index_capacity: FieldType.u32 },
    uniform,
);

/** Parâmetros de `set.sequence`. */
export const SequenceParamsSchema = new StructSchema(
    'SequenceParams',
    { count: FieldType.u32, start: FieldType.u32, step: FieldType.u32 },
    uniform,
);
