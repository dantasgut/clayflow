import type { Component } from '../core/Component';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { VertexLayout } from '../data/VertexLayout';
import { ResourceState } from '../core/ResourceState';
import { ResourceType } from '../core/ResourceType';
import type { ResourceStateHandler } from '../core/resource/ResourceStateHandler';
import { ResourceStateHandlerRegistry } from '../core/resource/ResourceStateHandlerRegistry';

/**
 * Componente Lógico (ECS) representando a malha matemática de um Nó.
 * Componente puro — não é um nó da cena. Deve ser adicionado a um Mesh.
 */
export abstract class Geometry implements Component {
    private static nextUuid: number = 0;
    public readonly uuid: string = `geom_${++Geometry.nextUuid}`;

    public readonly layer = ResourceType.VISUAL_COMPONENT;
    public readonly type: string = 'Geometry';

    public state: ResourceState = ResourceState.Uninitialized;

    /** Handler do estado atual — encapsula capacidades do ciclo de vida GPU. */
    public get currentResourceState(): ResourceStateHandler {
        return ResourceStateHandlerRegistry.get(this.state);
    }
    public vertexBufferId: string = '';
    public indexBufferId?: string;
    public vertexCount: number = 0;
    public instanceCount: number = 1;
    public layout!: VertexLayout;

    public rawVertices: Float32Array | null = null;
    public rawIndices: Uint16Array | Uint32Array | null = null;

    /**
     * Lista explícita de posições de vértice para wireframe (3 floats por vértice).
     * Separada do VBO principal para ser independente de stride/normal/uv.
     * Definida pelo autor da geometria — nunca derivada da triangulação.
     */
    public rawWireframePositions: Float32Array | null = null;

    /**
     * Lista explícita de arestas para wireframe (2 u32 por aresta: índices em rawWireframePositions).
     * Definida pelo autor da geometria — contém apenas as arestas reais da malha,
     * sem diagonais de triangulação.
     */
    public rawWireframeEdges: Uint32Array | null = null;

    /** ID do storage buffer de posições de wireframe. */
    public wireframePositionsBufferId?: string;
    /** ID do storage buffer de arestas de wireframe. */
    public wireframeEdgesBufferId?: string;
    /** Número de arestas wireframe (rawWireframeEdges.length / 2). */
    public wireframeEdgeCount: number = 0;

    // ── Contrato de escrita de vértice GPU ──────────────────────────────────
    //
    // Caminho CPU: rawVertices → markDirty() → ResourceLoader → vertexBufferId
    // Caminho GPU: compute shader escreve diretamente em vertexBufferId
    //
    // Ambos os caminhos usam o mesmo vertexBufferId como destino — o estado
    // determina qual caminho está ativo. wireframePositionsBufferId segue a
    // mesma regra: compute shader também pode escrever nele diretamente.

    /**
     * Retorna true quando o compute shader é o escritor ativo do vertex buffer.
     * Enquanto true, markDirty() é no-op e o ResourceLoader suprime uploads.
     */
    public get isGpuManaged(): boolean {
        return this.state === ResourceState.GpuManaged;
    }

    /**
     * Transfere a propriedade do vertex buffer para o pipeline GPU.
     * Pré-condição: state === Ready (geometry já alocada na VRAM).
     * Após a chamada, markDirty() é ignorado até exitGpuManagedMode().
     */
    public enterGpuManagedMode(): void {
        if (this.state !== ResourceState.Ready) return;
        this.state = ResourceState.GpuManaged;
    }

    /**
     * Devolve a propriedade do vertex buffer ao pipeline CPU.
     * Transiciona para Dirty, forçando re-upload de rawVertices no próximo frame.
     */
    public exitGpuManagedMode(): void {
        if (this.state !== ResourceState.GpuManaged) return;
        this.state = ResourceState.Dirty;
    }

    public markDirty(): void {
        if (this.currentResourceState.ignoreDirtyMark()) return;
        this.state = ResourceState.Dirty;
    }

    public async allocateResource(resourceManager: ResourceManager): Promise<void> {
        this.state = ResourceState.Loading;

        const uploads: Promise<void>[] = [];

        if (this.rawVertices) {
            const vboKey = 'geom_vbo_' + this.uuid;
            resourceManager.buffers.createVertexBuffer(vboKey, this.rawVertices.byteLength);
            this.vertexBufferId = vboKey;
            uploads.push(resourceManager.buffers.uploadStagedAsync(vboKey, this.rawVertices));
        }

        if (this.rawIndices) {
            const iboKey = 'geom_ibo_' + this.uuid;
            resourceManager.buffers.createIndexBuffer(iboKey, this.rawIndices.byteLength);
            this.indexBufferId = iboKey;
            uploads.push(resourceManager.buffers.uploadStagedAsync(iboKey, this.rawIndices));
        }

        if (this.rawWireframePositions) {
            const wpKey = 'geom_wfpos_' + this.uuid;
            resourceManager.buffers.createStorageBuffer(wpKey, this.rawWireframePositions.byteLength);
            this.wireframePositionsBufferId = wpKey;
            uploads.push(resourceManager.buffers.uploadStagedAsync(wpKey, this.rawWireframePositions));
        }

        if (this.rawWireframeEdges) {
            const weKey = 'geom_wfedge_' + this.uuid;
            resourceManager.buffers.createStorageBuffer(weKey, this.rawWireframeEdges.byteLength);
            this.wireframeEdgesBufferId = weKey;
            this.wireframeEdgeCount    = this.rawWireframeEdges.length / 2;
            uploads.push(resourceManager.buffers.uploadStagedAsync(weKey, this.rawWireframeEdges));
        }

        await Promise.all(uploads);
        this.state = ResourceState.Ready;
    }

    public async updateResource(resourceManager: ResourceManager): Promise<void> {
        const uploads: Promise<void>[] = [];

        if (this.rawVertices && this.vertexBufferId) {
            uploads.push(resourceManager.buffers.uploadStagedAsync(this.vertexBufferId, this.rawVertices));
        }
        if (this.rawIndices && this.indexBufferId) {
            uploads.push(resourceManager.buffers.uploadStagedAsync(this.indexBufferId, this.rawIndices));
        }
        if (this.rawWireframePositions && this.wireframePositionsBufferId) {
            uploads.push(resourceManager.buffers.uploadStagedAsync(this.wireframePositionsBufferId, this.rawWireframePositions));
        }

        await Promise.all(uploads);
        this.state = ResourceState.Ready;
    }

    public disposeResource(resourceManager: ResourceManager): void {
        if (this.vertexBufferId)           resourceManager.buffers.destroyBuffer(this.vertexBufferId);
        if (this.indexBufferId)            resourceManager.buffers.destroyBuffer(this.indexBufferId);
        if (this.wireframePositionsBufferId) resourceManager.buffers.destroyBuffer(this.wireframePositionsBufferId);
        if (this.wireframeEdgesBufferId)     resourceManager.buffers.destroyBuffer(this.wireframeEdgesBufferId);
        this.state = ResourceState.Destroyed;
    }
}
