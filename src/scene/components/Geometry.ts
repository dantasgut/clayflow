import type { Component } from '../core/Component';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { VertexLayout } from '../data/VertexLayout';
import { ResourceState } from '../core/ResourceState';
import { ResourceType } from '../core/ResourceType';

/**
 * Componente Lógico (ECS) representando a malha matemática de um Nó.
 * Componente puro — não é um nó da cena. Deve ser adicionado a um Mesh.
 */
export abstract class Geometry implements Component {
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

    public rawVertices: Float32Array | null = null;
    public rawIndices: Uint16Array | Uint32Array | null = null;

    public markDirty(): void {
        if (this.state === ResourceState.Ready) {
            this.state = ResourceState.Dirty;
        }
    }

    public async allocateResource(resourceManager: ResourceManager): Promise<void> {
        this.state = ResourceState.Loading;

        const uploads: Promise<void>[] = [];

        if (this.rawVertices) {
            const vbo = resourceManager.buffers.createVertexBuffer('geom_vbo_' + this.uuid, this.rawVertices.byteLength);
            this.vertexBufferId = vbo.id;
            uploads.push(resourceManager.buffers.uploadStagedAsync(vbo.id, this.rawVertices));
        }

        if (this.rawIndices) {
            const ibo = resourceManager.buffers.createIndexBuffer('geom_ibo_' + this.uuid, this.rawIndices.byteLength);
            this.indexBufferId = ibo.id;
            uploads.push(resourceManager.buffers.uploadStagedAsync(ibo.id, this.rawIndices));
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

        await Promise.all(uploads);
        this.state = ResourceState.Ready;
    }

    public disposeResource(resourceManager: ResourceManager): void {
        if (this.vertexBufferId) resourceManager.buffers.destroyBuffer(this.vertexBufferId);
        if (this.indexBufferId) resourceManager.buffers.destroyBuffer(this.indexBufferId);
        this.state = ResourceState.Destroyed;
    }
}
