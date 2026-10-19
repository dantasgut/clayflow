import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { contentKeyOf } from './geometryContent';

/** Maior contagem de vértices endereçável por índices `uint16` (spec 004, R12). */
const MAX_UINT16_VERTICES = 65_535;

/**
 * O que a base lê do `data` de uma geometria: vértices intercalados e índices (ausentes quando produzidos na GPU). As
 * subclasses estendem com os próprios campos.
 */
export interface GeometryData {
    /** Vértices intercalados (posição, normal, uv). */
    vertices?: Float32Array;
    /** Índices de triângulo. */
    indices?: Uint16Array | Uint32Array;
    /**
     * Arestas de arame (spec 008): pares de índices de vértice em espaço de objeto — o que o `WireframeMaterial` desenha
     * (de feição nas geometrias estáticas: sem as diagonais de faces planas).
     */
    wireEdges?: Uint32Array;
}

/**
 * Base das geometrias (C3): vértices intercalados em `data.vertices` e índices em `data.indices`, declarados como
 * descritores `vertex`/`index` que a C2 aloca. Também é o critério de reconhecimento de geometria pelos estágios
 * (`instanceof Geometry`, que sobrevive à minificação).
 */
export abstract class Geometry<TData extends GeometryData = GeometryData>
    extends Entity<TData>
    implements Resource
{
    state: ResourceState = ResourceState.Uninitialized;

    abstract getDescriptors(): readonly GPUDescriptor[];

    /** Caixa de objeto calculada (cache; `null` = desconhecida). */
    private objectBounds:
        | { readonly min: readonly number[]; readonly max: readonly number[] }
        | null
        | undefined;

    /**
     * Caixa em espaço de objeto (spec 034: a caixa da luz da sombra se ajusta à cena), dos vértices em `data` (posição
     * nos 3 primeiros de cada 8 floats), calculada uma vez; `undefined` quando a CPU não a conhece — vértices escritos
     * ou deformados na GPU.
     */
    get bounds(): { readonly min: readonly number[]; readonly max: readonly number[] } | undefined {
        if (this.objectBounds === undefined) {
            const v = this.data.vertices;
            if (v === undefined || v.length < 8 || this.gpuVertices) this.objectBounds = null;
            else {
                const min = [Infinity, Infinity, Infinity];
                const max = [-Infinity, -Infinity, -Infinity];
                for (let i = 0; i + 2 < v.length; i += 8)
                    for (let k = 0; k < 3; k++) {
                        min[k] = Math.min(min[k]!, v[i + k]!);
                        max[k] = Math.max(max[k]!, v[i + k]!);
                    }
                this.objectBounds = { min, max };
            }
        }
        return this.objectBounds ?? undefined;
    }

    /** Os vértices em `data` são só o estado inicial (a GPU os deforma): a caixa deles não vale. */
    protected get gpuVertices(): boolean {
        return false;
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /**
     * Chave de conteúdo (spec 007): geometrias com a mesma chave compartilham os buffers de vértice e índice na GPU (a
     * Camada 2 deduplica). Paramétricas: a dos parâmetros; arrays próprios: a do hash dos bytes. `undefined` sem
     * vértices e índices em `data` (ex.: nuvem de pontos produzida na GPU, que é sempre própria).
     */
    get contentKey(): string | undefined {
        const vertices = this.data.vertices;
        const indices = this.data.indices;
        if (!(vertices instanceof Float32Array)) return undefined;
        if (!(indices instanceof Uint16Array || indices instanceof Uint32Array)) return undefined;
        return contentKeyOf(vertices, indices);
    }

    /**
     * Descritor das arestas de arame (`data.wireEdges`, índices `uint32` aos pares; spec 008): alocado e deduplicado pela
     * C2 como os índices. Vazio sem arestas. Subclasses o acrescentam aos seus descritores.
     */
    protected wireDescriptors(): GPUDescriptor[] {
        const edges = this.data.wireEdges;
        if (edges === undefined || edges.length === 0) return [];
        // Só quem desenha o arame pede o buffer (`ensureAllocated`): geometria sem arame não aloca nada.
        return [
            {
                id: 'wireEdges',
                role: 'index',
                count: edges.length,
                indexFormat: 'uint32',
                allocation: 'onDemand',
            },
        ];
    }

    /** Número de vértices na geometria — usado para `pass.draw(count)`. */
    abstract get vertexCount(): number;
    /** Número de índices (0 = sem index buffer, draw não-indexed). */
    abstract get indexCount(): number;

    /** Formato do index buffer, derivado do array de índices (`Uint32Array` → `'uint32'`). */
    get indexFormat(): GPUIndexFormat {
        return this.data.indices instanceof Uint32Array ? 'uint32' : 'uint16';
    }

    /**
     * Array de índices no menor formato que endereça `vertexCount` vértices: `Uint16Array` até 65 535 vértices,
     * `Uint32Array` acima.
     */
    protected static indexArray(
        indices: readonly number[],
        vertexCount: number,
    ): Uint16Array | Uint32Array {
        return vertexCount > MAX_UINT16_VERTICES
            ? new Uint32Array(indices)
            : new Uint16Array(indices);
    }
}
