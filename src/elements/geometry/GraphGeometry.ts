import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { Geometry, type GeometryData } from './Geometry';
import { SurfaceGeometry } from './SurfaceGeometry';

/** Opções de `GraphGeometry`. */
export interface GraphGeometryOptions {
    /** Vértices no máximo. */
    readonly vertexCapacity: number;
    /** Índices de triângulo no máximo (múltiplo de 3). */
    readonly indexCapacity: number;
    /** Arestas de arame no máximo (0 = sem arame). Padrão 0. */
    readonly edgeCapacity?: number;
}

/** Dado de uma `GraphGeometry`: as capacidades (os vértices e índices vivem só na GPU). */
export interface GraphGeometryData extends GeometryData {
    vertexCapacity: number;
    indexCapacity: number;
    edgeCapacity: number;
}

/**
 * Malha escrita por um grafo de nós de conjunto (spec 031, R10): vértices (`SurfaceVertex` no desenho, `MeshVertex`
 * em compute — o mesmo layout de 32 B), índices `uint32`, arestas de arame e o registro indireto, todos com a
 * capacidade declarada e escritos só pela GPU (`upload: 'never'`; o `GraphFlow` declara a posse). O registro indireto
 * tem o layout da malha adaptativa da `ParametricSurface` — byte 0: desenho indexado; byte 20: vértices do arame —, e
 * o forward e a sombra a desenham pelo mesmo caminho, sem estágio por origem. Sem `indirect-first-instance` o desenho é
 * direto pela capacidade: o grafo zera os índices além da contagem (triângulos degenerados).
 */
export class GraphGeometry extends Geometry<GraphGeometryData> {
    /** Layout de vértice do desenho (o de `SurfaceGeometry`). */
    static readonly vertexStruct = SurfaceGeometry.vertexStruct;

    constructor(options: GraphGeometryOptions) {
        super();
        const edgeCapacity = options.edgeCapacity ?? 0;
        for (const [name, v, min] of [
            ['vertexCapacity', options.vertexCapacity, 1],
            ['indexCapacity', options.indexCapacity, 3],
            ['edgeCapacity', edgeCapacity, 0],
        ] as const) {
            if (!Number.isInteger(v) || v < min)
                throw new RangeError(`GraphGeometry: ${name} ${v} inválido (inteiro ≥ ${min}).`);
        }
        if (options.indexCapacity % 3 !== 0)
            throw new RangeError(
                `GraphGeometry: indexCapacity ${options.indexCapacity} não é múltiplo de 3.`,
            );
        this.data = {
            vertexCapacity: options.vertexCapacity,
            indexCapacity: options.indexCapacity,
            edgeCapacity,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const d = this.data;
        return [
            {
                id: 'vertices',
                role: 'vertex',
                schema: GraphGeometry.vertexStruct,
                count: d.vertexCapacity,
                upload: 'never',
            },
            {
                id: 'indices',
                role: 'index',
                count: d.indexCapacity,
                upload: 'never',
                indexFormat: 'uint32',
            },
            ...(d.edgeCapacity > 0
                ? [
                      {
                          id: 'wireEdges',
                          role: 'index' as const,
                          count: d.edgeCapacity * 2,
                          upload: 'never' as const,
                          indexFormat: 'uint32' as const,
                      },
                  ]
                : []),
            // Registro 0: desenho indexado; registro 1 (byte 20): arame (6 vértices por aresta).
            { id: 'indirect', role: 'indirect', count: 2, upload: 'never' },
        ];
    }

    get vertexCount(): number {
        return this.data.vertexCapacity;
    }

    get indexCount(): number {
        return this.data.indexCapacity;
    }

    override get indexFormat(): GPUIndexFormat {
        return 'uint32';
    }

    /** Escrita na GPU, própria de cada grafo: sem deduplicação por conteúdo. */
    override get contentKey(): string | undefined {
        return undefined;
    }
}
