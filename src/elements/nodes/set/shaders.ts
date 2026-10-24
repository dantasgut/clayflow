import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { BindablePoint } from '../../../scene/shaders/bindPoints';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { POINT_PARAMS } from '../../../scene/shaders/WgslPoint';
import { wgslResource, type WgslResourceType } from '../../../scene/shaders/WgslResource';
import type { PointTarget } from '../../../scene/graph/SetNode';
import { SetCountSchema } from '../../../scene/graph/SetCountSchema';
import { MeshVertexSchema } from '../../geometry/MeshVertexSchema';
import { AtomicAllocCounterSchema } from '../../gpu/compute/schemas';
import {
    countToArgsResources,
    fixedPoint,
    setCount,
    setCountResources,
} from '../../gpu/compute/shaders';
import { SCAN_GROUP } from '../../gpu/shaders/constants';
import { noise, sampling } from '../../gpu/shaders/math';
import commonSource from '../../gpu/wgsl/nodes/set/set_common.wgsl?raw';
import gridSource from '../../gpu/wgsl/nodes/set/set_grid.wgsl?raw';
import displaceReadySource from '../../gpu/wgsl/nodes/set/set_displace_ready.wgsl?raw';
import displaceSource from '../../gpu/wgsl/nodes/set/set_displace.wgsl?raw';
import normalsSource from '../../gpu/wgsl/nodes/set/set_normals.wgsl?raw';
import densityReadySource from '../../gpu/wgsl/nodes/set/set_density_ready.wgsl?raw';
import distributeSampleSource from '../../gpu/wgsl/nodes/set/set_distribute_sample.wgsl?raw';
import distributeSource from '../../gpu/wgsl/nodes/set/set_distribute.wgsl?raw';
import distributeCountSource from '../../gpu/wgsl/nodes/set/set_distribute_count.wgsl?raw';
import distributePointsSource from '../../gpu/wgsl/nodes/set/set_distribute_points.wgsl?raw';
import acceptedSource from '../../gpu/wgsl/nodes/set/set_accepted.wgsl?raw';
import realizeCountSource from '../../gpu/wgsl/nodes/set/set_realize_count.wgsl?raw';
import realizeSource from '../../gpu/wgsl/nodes/set/set_realize.wgsl?raw';
import sequenceSource from '../../gpu/wgsl/nodes/set/set_sequence.wgsl?raw';
import compactSource from '../../gpu/wgsl/nodes/set/set_compact.wgsl?raw';
import meshOutputSource from '../../gpu/wgsl/nodes/set/set_mesh_output.wgsl?raw';
import pointsOutputSource from '../../gpu/wgsl/nodes/set/set_points_output.wgsl?raw';
import {
    DisplaceParamsSchema,
    DistributeParamsSchema,
    GridParamsSchema,
    MeshOutputParamsSchema,
    MeshTriangleSchema,
    NormalsParamsSchema,
    PointsOutputParamsSchema,
    RealizeParamsSchema,
    SequenceParamsSchema,
    SetAcceptedParamsSchema,
    SetPointSchema,
} from './schemas';

// Recursos e módulos dos nós de conjunto (spec 031, R10). Tudo privado da instância do nó e de frequência `stage`: os
// conjuntos (buffers do `GraphFlow`), os registros `SetCount` (os de leitura de `set_count`, os de escrita de
// `CountToArgs`), os uniforms dos nós (escritos em `update`) e os buffers próprios. Ligados pelo objeto do recurso.

const storage = (name: string, access: 'read' | 'read_write', type: WgslResourceType) =>
    wgslResource({
        name,
        binding: { storage: access },
        type,
        frequency: 'stage',
        provider: 'private',
    });

const params = (name: string, schema: StructSchema) =>
    wgslResource({
        name,
        binding: { uniform: true },
        type: { schema },
        frequency: 'stage',
        provider: 'private',
    });

/** Recursos dos nós de conjunto. */
export const setResources = Object.freeze({
    verticesIn: storage('mesh_vertices_in', 'read', { schema: MeshVertexSchema, array: true }),
    trianglesIn: storage('mesh_triangles_in', 'read', { schema: MeshTriangleSchema, array: true }),
    verticesOut: storage('mesh_vertices_out', 'read_write', {
        schema: MeshVertexSchema,
        array: true,
    }),
    trianglesOut: storage('mesh_triangles_out', 'read_write', {
        schema: MeshTriangleSchema,
        array: true,
    }),
    pointsIn: storage('set_points_in', 'read', { schema: SetPointSchema, array: true }),
    pointsOut: storage('set_points_out', 'read_write', { schema: SetPointSchema, array: true }),
    u32In: storage('set_u32_in', 'read', { wgsl: 'u32', array: true }),
    u32Out: storage('set_u32_out', 'read_write', { wgsl: 'u32', array: true }),
    /** Registros `SetCount` do grafo, em leitura (`set_count_level`, kernels despachados pelo mesmo registro). */
    countsRead: setCountResources.counts,
    /** Registros `SetCount` do grafo, em leitura e escrita (kernels de uma invocação que derivam contagens). */
    countsWrite: countToArgsResources.counts,
    grid: params('grid', GridParamsSchema),
    displace: params('displace', DisplaceParamsSchema),
    normals: params('normals', NormalsParamsSchema),
    normalsAccum: storage('normals_accum', 'read_write', { wgsl: 'atomic<i32>', array: true }),
    distribute: params('distribute', DistributeParamsSchema),
    distributeRecords: storage('distribute_records', 'read_write', {
        schema: SetCountSchema,
        array: true,
    }),
    distributeList: storage('distribute_list', 'read', { wgsl: 'u32', array: true }),
    acceptedParams: params('set_accepted_params', SetAcceptedParamsSchema),
    accepted: storage('set_accepted', 'read_write', { schema: AtomicAllocCounterSchema }),
    realize: params('realize', RealizeParamsSchema),
    realizeTable: storage('realize_table', 'read', { wgsl: 'vec2f', array: true }),
    sequence: params('sequence', SequenceParamsSchema),
    meshOutput: params('mesh_output', MeshOutputParamsSchema),
    pointsOutput: params('points_output', PointsOutputParamsSchema),
    targetVertices: storage('target_vertices', 'read_write', {
        schema: MeshVertexSchema,
        array: true,
    }),
    targetIndices: storage('target_indices', 'read_write', { wgsl: 'u32', array: true }),
    targetEdges: storage('target_edges', 'read_write', { wgsl: 'u32', array: true }),
    targetIndirect: storage('target_indirect', 'read_write', { wgsl: 'u32', array: true }),
});
const R = setResources;

/** Índice linear da invocação nos despachos de conjunto e hash → [0, 1). */
export const setCommon = wgslModule({
    name: 'set_common',
    source: commonSource,
    requires: [SCAN_GROUP.module],
});

/** `set.grid`. */
export const setGrid = wgslModule({
    name: 'set_grid',
    source: gridSource,
    requires: [setCommon, R.grid, R.verticesOut, R.trianglesOut],
    structs: [GridParamsSchema, MeshVertexSchema, MeshTriangleSchema],
});

/**
 * Alvo dos grafos de ponto de uma entrada `fn(position: vec3f, normal: vec3f, uv: vec2f) -> f32` de um nó de conjunto
 * (spec 031, FR-018): os argumentos `position`, `normal` e `uv` (nós `graphArgument`) e os parâmetros do grafo.
 */
function vertexFieldTarget(name: string, fn: string, alias: string): PointTarget {
    return Object.freeze({
        name,
        required: {
            name: fn,
            params: ['vec3f', 'vec3f', 'vec2f', POINT_PARAMS],
            returns: 'f32',
            names: ['position', 'normal', 'uv', 'data'],
        },
        context: 'compute' as const,
        paramsAlias: alias,
    });
}

/** Entrada `height` de `set.displace`: `displace_height(position, normal, uv) -> f32`, pronto = 0. */
export const displaceHeight: BindablePoint = Object.freeze({
    name: 'displace_height',
    ready: wgslModule({ name: 'displace_height_ready', source: displaceReadySource }),
});

/** Alvo do grafo de ponto da entrada `height` de `set.displace`. */
export const displaceHeightTarget = vertexFieldTarget(
    'set.displace.height',
    'displace_height_graph',
    'DisplaceHeightParams',
);

/** `set.displace`. */
export const setDisplace = wgslModule({
    name: 'set_displace',
    source: displaceSource,
    requires: [setCommon, setCount, displaceHeight.ready, R.displace, R.verticesIn, R.verticesOut],
    structs: [DisplaceParamsSchema, MeshVertexSchema],
});

/** `set.recomputeNormals` (acumulação em ponto fixo e normalização). */
export const setNormals = wgslModule({
    name: 'set_normals',
    source: normalsSource,
    requires: [
        setCommon,
        setCount,
        fixedPoint,
        R.normals,
        R.verticesIn,
        R.trianglesIn,
        R.verticesOut,
        R.normalsAccum,
    ],
    structs: [NormalsParamsSchema, MeshVertexSchema, MeshTriangleSchema],
});

/** Entrada `density` de `set.distributeOnMesh`: `distribute_density(position, normal, uv) -> f32`, pronto = 1. */
export const distributeDensity: BindablePoint = Object.freeze({
    name: 'distribute_density',
    ready: wgslModule({ name: 'distribute_density_ready', source: densityReadySource }),
});

/** Alvo do grafo de ponto da entrada `density` de `set.distributeOnMesh`. */
export const distributeDensityTarget = vertexFieldTarget(
    'set.distributeOnMesh.density',
    'distribute_density_graph',
    'DistributeDensityParams',
);

/** Candidato (t, k) de `set.distributeOnMesh`. */
export const setDistributeSample = wgslModule({
    name: 'set_distribute_sample',
    source: distributeSampleSource,
    requires: [setCommon, noise, sampling, R.distribute, R.verticesIn, R.trianglesIn],
    structs: [DistributeParamsSchema, MeshVertexSchema, MeshTriangleSchema],
});

/** Predicado da compactação de `set.distributeOnMesh` (aceite por densidade). */
export const setDistributePredicate = wgslModule({
    name: 'set_distribute',
    source: distributeSource,
    requires: [setDistributeSample, distributeDensity.ready],
});

/** Candidatos de `set.distributeOnMesh` no registro próprio do nó. */
export const setDistributeCount = wgslModule({
    name: 'set_distribute_count',
    source: distributeCountSource,
    requires: [R.distribute, R.countsWrite, R.distributeRecords],
    structs: [DistributeParamsSchema, SetCountSchema],
});

/** Pontos aceitos de `set.distributeOnMesh`. */
export const setDistributePoints = wgslModule({
    name: 'set_distribute_points',
    source: distributePointsSource,
    requires: [setCommon, setCount, setDistributeSample, R.distributeList, R.pointsOut],
    structs: [SetPointSchema],
});

/** Total aceito de uma compactação → contagem do registro de saída. */
export const setAccepted = wgslModule({
    name: 'set_accepted_count',
    source: acceptedSource,
    requires: [R.acceptedParams, R.accepted, R.countsWrite],
    structs: [SetAcceptedParamsSchema, AtomicAllocCounterSchema, SetCountSchema],
});

/** Contagens de `set.realizeInstances`. */
export const setRealizeCount = wgslModule({
    name: 'set_realize_count',
    source: realizeCountSource,
    requires: [R.realize, R.countsWrite],
    structs: [RealizeParamsSchema, SetCountSchema],
});

/** `set.realizeInstances` (vértices e triângulos). */
export const setRealize = wgslModule({
    name: 'set_realize',
    source: realizeSource,
    requires: [
        setCommon,
        setCount,
        R.realize,
        R.realizeTable,
        R.pointsIn,
        R.verticesOut,
        R.trianglesOut,
    ],
    structs: [RealizeParamsSchema, SetPointSchema, MeshVertexSchema, MeshTriangleSchema],
});

/** `set.sequence`. */
export const setSequence = wgslModule({
    name: 'set_sequence',
    source: sequenceSource,
    requires: [setCommon, R.sequence, R.u32Out],
    structs: [SequenceParamsSchema],
});

/** Predicado da compactação de `set.compact` (não nulos). */
export const setCompactPredicate = wgslModule({
    name: 'set_compact',
    source: compactSource,
    requires: [R.u32In],
});

/** `set.meshOutput`. */
export const setMeshOutput = wgslModule({
    name: 'set_mesh_output',
    source: meshOutputSource,
    requires: [
        setCommon,
        setCount,
        R.meshOutput,
        R.trianglesIn,
        R.targetIndices,
        R.targetEdges,
        R.targetIndirect,
    ],
    structs: [MeshOutputParamsSchema, MeshTriangleSchema],
});

/** `set.pointsOutput`. */
export const setPointsOutput = wgslModule({
    name: 'set_points_output',
    source: pointsOutputSource,
    requires: [
        setCommon,
        setCount,
        R.pointsOutput,
        R.pointsIn,
        R.targetVertices,
        R.targetIndices,
        R.targetIndirect,
    ],
    structs: [PointsOutputParamsSchema, SetPointSchema, MeshVertexSchema],
});
