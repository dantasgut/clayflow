import { defineSetNode } from '../../../scene/graph/SetNode';
import { MeshVertexSchema } from '../../geometry/MeshVertexSchema';
import { MESH, MeshOutputParamsSchema, POINTS, PointsOutputParamsSchema } from './schemas';
import { setMeshOutput, setPointsOutput, setResources as R } from './shaders';
import { SetNodeKernels } from './SetNodeKernels';

// Nós de saída (spec 031, R10): escrevem o conjunto no Resource alvo do grafo — a `GraphGeometry` da entidade, cujos
// descritores o `GraphFlow` possui — e o desenho segue pelo caminho existente (forward e sombra, registro indireto).

/** Índice `uint32` dos descritores `indices` e `wireEdges` (uma aresta = dois índices). */
const index = Uint32Array.BYTES_PER_ELEMENT;

/**
 * `set.meshOutput`: a malha na `GraphGeometry` alvo — vértices copiados (até a capacidade do alvo), índices dos
 * triângulos (os além da contagem, ou com vértice além dos copiados, degenerados (0, 0, 0): sem
 * `indirect-first-instance` o desenho é direto pela capacidade), arestas de arame (a, b), (b, c), (c, a) por triângulo
 * quando o alvo tem `wireEdges` (zeradas além da contagem) e o registro indireto: byte 0, triângulos · 3 índices;
 * byte 20, arestas · 6 vértices. Sem alvo (entidade sem `GraphGeometry`), não grava nada.
 */
export const meshOutput = defineSetNode({
    name: 'set.meshOutput',
    inputs: { mesh: MESH },
    create: (c) => {
        const k = new SetNodeKernels(c, MeshOutputParamsSchema);
        const vin = c.input('mesh', 'vertices');
        const tin = c.input('mesh', 'triangles');
        const vertices = c.target('vertices');
        const indices = c.target('indices');
        const indirect = c.target('indirect');
        const edges = c.target('wireEdges') ?? k.storage('no_edges', 16);
        const vertexCapacity =
            vertices === undefined ? 0 : Math.floor(vertices.byteSize / MeshVertexSchema.stride);
        const triangleCapacity =
            indices === undefined ? 0 : Math.floor(indices.byteSize / (3 * index));
        const edgeCapacity =
            c.target('wireEdges') === undefined ? 0 : Math.floor(edges.byteSize / (2 * index));
        const ready = vertices !== undefined && indices !== undefined && indirect !== undefined;
        if (ready) {
            k.kernel('output', setMeshOutput, 'mesh_output_main', [
                [R.meshOutput, k.params],
                [R.countsRead, c.counts],
                [R.trianglesIn, tin.buffer],
                [R.targetIndices, indices],
                [R.targetEdges, edges],
                [R.targetIndirect, indirect],
            ]);
        }
        const copied = Math.min(vin.capacity, vertexCapacity);
        return {
            update: () => {
                k.write({
                    vertices_slot: vin.slot,
                    triangles_slot: tin.slot,
                    vertex_capacity: copied,
                    triangle_capacity: triangleCapacity,
                    edge_capacity: edgeCapacity,
                });
            },
            record: (frame) => {
                if (!ready) return;
                frame.copy(vin.buffer, vertices, copied * MeshVertexSchema.stride);
                k.direct(
                    frame,
                    'set.meshOutput',
                    'output',
                    Math.max(1, triangleCapacity, Math.ceil(edgeCapacity / 3)),
                );
            },
            dispose: () => {
                k.dispose();
            },
        };
    },
});

/**
 * `set.pointsOutput`: os pontos como vértices da `GraphGeometry` alvo (posição, normal, uv 0) para o desenho por
 * sprites (`PointSpriteMaterial`: um quad por vértice da capacidade). Os vértices além da contagem vão para fora do
 * volume desenhável (|p| ≥ 1e30, descartados pelo sprite); índices zerados e registro indireto vazio.
 */
export const pointsOutput = defineSetNode({
    name: 'set.pointsOutput',
    inputs: { points: POINTS },
    create: (c) => {
        const k = new SetNodeKernels(c, PointsOutputParamsSchema);
        const pin = c.input('points', 'points');
        const vertices = c.target('vertices');
        const indices = c.target('indices');
        const indirect = c.target('indirect');
        const vertexCapacity =
            vertices === undefined ? 0 : Math.floor(vertices.byteSize / MeshVertexSchema.stride);
        const indexCapacity = indices === undefined ? 0 : Math.floor(indices.byteSize / index);
        const ready = vertices !== undefined && indices !== undefined && indirect !== undefined;
        if (ready) {
            k.kernel('output', setPointsOutput, 'points_output_main', [
                [R.pointsOutput, k.params],
                [R.countsRead, c.counts],
                [R.pointsIn, pin.buffer],
                [R.targetVertices, vertices],
                [R.targetIndices, indices],
                [R.targetIndirect, indirect],
            ]);
        }
        return {
            update: () => {
                k.write({
                    points_slot: pin.slot,
                    vertex_capacity: vertexCapacity,
                    index_capacity: indexCapacity,
                });
            },
            record: (frame) => {
                if (!ready) return;
                k.direct(
                    frame,
                    'set.pointsOutput',
                    'output',
                    Math.max(1, vertexCapacity, indexCapacity),
                );
            },
            dispose: () => {
                k.dispose();
            },
        };
    },
});
