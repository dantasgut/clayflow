import type { Component } from '../core/Component';
import { Entity } from '../core/Entity';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { VertexLayout } from '../data/VertexLayout';
import { ResourceState } from '../core/ResourceState';
import { ResourceType } from '../core/ResourceType';

/**
 * Componente Lógico (ECS) representando a malha matemática de um Nó.
 * Ele guarda o crachá/ID que o WebGPUBufferManager gerará na Camada 1, e o descritor (VertexLayout) 
 * que diz a Engine como iterar esse buffer (Stride).
 * Odiado Loader processará os arrays brutos mantidos aqui.
 */
export abstract class Geometry extends Entity implements Component {
    private static _nextUuid: number = 0;
    public readonly uuid: string = `geom_${++Geometry._nextUuid}`;

    public readonly layer = ResourceType.VISUAL_COMPONENT;
    public readonly type: string = 'Geometry';

    public state: ResourceState = ResourceState.Uninitialized;
    public vertexBufferId: string = '';
    public indexBufferId?: string;
    public vertexCount: number = 0;
    public instanceCount: number = 1;
    public layout!: VertexLayout;

    // Arrays brutos (Payload) aguardando o ResourceLoader
    public rawVertices: Float32Array | null = null;
    public rawIndices: Uint16Array | Uint32Array | null = null;

    /**
     * Marca a geometria como suja para que o ResourceLoader atualize a GPU
     * no próximo ciclo, utilizando os arrays raw atualizados.
     */
    public markDirty(): void {
        if (this.state === ResourceState.Ready) {
            this.state = ResourceState.Dirty;
        }
    }

    public async allocateResource(resourceManager: ResourceManager): Promise<void> {
        this.state = ResourceState.Loading;

        const uploadPromises: Promise<void>[] = [];

        if (this.rawVertices) {
            const vbo = resourceManager.buffers.createVertexBuffer('geom_vbo_' + this.uuid, this.rawVertices.byteLength);
            this.vertexBufferId = vbo.id;
            uploadPromises.push(resourceManager.buffers.uploadStagedAsync(vbo.id, this.rawVertices));
        }

        if (this.rawIndices) {
            const ibo = resourceManager.buffers.createIndexBuffer('geom_ibo_' + this.uuid, this.rawIndices.byteLength);
            this.indexBufferId = ibo.id;
            uploadPromises.push(resourceManager.buffers.uploadStagedAsync(ibo.id, this.rawIndices));
        }

        await Promise.all(uploadPromises);
        this.state = ResourceState.Ready;
    }

    public async updateResource(resourceManager: ResourceManager): Promise<void> {
        const uploadPromises: Promise<void>[] = [];

        if (this.rawVertices && this.vertexBufferId) {
            uploadPromises.push(resourceManager.buffers.uploadStagedAsync(this.vertexBufferId, this.rawVertices));
        }
        if (this.rawIndices && this.indexBufferId) {
            uploadPromises.push(resourceManager.buffers.uploadStagedAsync(this.indexBufferId, this.rawIndices));
        }

        await Promise.all(uploadPromises);
        this.state = ResourceState.Ready;
    }

    /**
     * Sinaliza que a geometria deve ser limpa da VRAM.
     */
    public disposeResource(resourceManager: ResourceManager): void {
        if (this.vertexBufferId) resourceManager.buffers.destroyBuffer(this.vertexBufferId);
        if (this.indexBufferId) resourceManager.buffers.destroyBuffer(this.indexBufferId);
        this.state = ResourceState.Disposed;
    }
}
