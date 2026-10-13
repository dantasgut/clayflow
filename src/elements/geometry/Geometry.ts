import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { contentKeyOf } from './geometryContent';

/** Maior contagem de vértices endereçável por índices `uint16` (spec 004, R12). */
const MAX_UINT16_VERTICES = 65_535;

/**
 * Base das geometrias (C3): vértices intercalados em `data.vertices` e índices em `data.indices`, declarados como
 * descritores `vertex`/`index` que a C2 aloca. Também é o critério de reconhecimento de geometria pelos estágios
 * (`instanceof Geometry`, que sobrevive à minificação).
 */
export abstract class Geometry extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    abstract getDescriptors(): readonly GPUDescriptor[];

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
