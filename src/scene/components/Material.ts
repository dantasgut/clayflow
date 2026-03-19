import type { Component } from '../core/Component';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { ResourceState } from '../core/ResourceState';
import { ResourceType } from '../core/ResourceType';

/**
 * Componente Lógico (ECS) representando a aparência (Shader + Material Data) do Nó.
 * Componente puro — não é um nó da cena. Deve ser adicionado a um Mesh.
 */
export abstract class Material implements Component {
    private static _nextUuid: number = 0;
    public readonly uuid: string = `mat_${++Material._nextUuid}`;

    public readonly layer = ResourceType.VISUAL_COMPONENT;
    public readonly type: string = 'Material';

    public state: ResourceState = ResourceState.Uninitialized;
    public shaderId: string = '';
    public transparent: boolean = false;
    public bindGroupIds: string[] = [];
    public bindGroupSchema: GPUBindGroupLayoutEntry[] = [];
    public doubleSided: boolean = false;
    public topology: GPUPrimitiveTopology = 'triangle-list';
    public rawUniforms: Map<string, Float32Array> = new Map();

    public markDirty(): void {
        if (this.state === ResourceState.Ready) {
            this.state = ResourceState.Dirty;
        }
    }

    public allocateResource(resourceManager: ResourceManager): void {
        this.state = ResourceState.Loading;

        const uniformData = this.rawUniforms.get('std_mat_buf');

        if (uniformData && this.shaderId) {
            const uniformBuffer = resourceManager.buffers.createUniformBuffer('mat_ubo_' + this.uuid, uniformData.byteLength);
            resourceManager.buffers.writeBuffer(uniformBuffer.id, uniformData);

            resourceManager.bindings.getLayout(this.shaderId, this.bindGroupSchema);

            const bindGroup = resourceManager.bindings.getBindGroup('mat_bg_' + this.uuid, this.shaderId, [
                { binding: 0, resource: { buffer: uniformBuffer.native } }
            ]);

            this.bindGroupIds.push(bindGroup.id);
        }

        this.state = ResourceState.Ready;
    }

    public updateResource(resourceManager: ResourceManager): void {
        const uniformData = this.rawUniforms.get('std_mat_buf');
        if (uniformData && this.shaderId) {
            resourceManager.buffers.writeBuffer('mat_ubo_' + this.uuid, uniformData);
        }
        this.state = ResourceState.Ready;
    }

    public disposeResource(resourceManager: ResourceManager): void {
        for (const id of this.bindGroupIds) {
            resourceManager.bindings.destroyBindGroup(id, this.shaderId);
        }
        this.bindGroupIds = [];
        this.state = ResourceState.Destroyed;
    }
}
