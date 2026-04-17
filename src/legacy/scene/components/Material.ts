import type { Component } from '../core/Component';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { ResourceState } from '../core/ResourceState';
import { ResourceType } from '../core/ResourceType';
import type { ResourceStateHandler } from '../core/resource/ResourceStateHandler';
import { ResourceStateHandlerRegistry } from '../core/resource/ResourceStateHandlerRegistry';

/**
 * Componente Lógico (ECS) representando a aparência (Shader + Material Data) do Nó.
 * Componente puro — não é um nó da cena. Deve ser adicionado a um Mesh.
 */
export abstract class Material implements Component {
    private static nextUuid: number = 0;
    public readonly uuid: string = `mat_${++Material.nextUuid}`;

    public readonly layer = ResourceType.VISUAL_COMPONENT;
    public readonly type: string = 'Material';

    public state: ResourceState = ResourceState.Uninitialized;

    /** Handler do estado atual — encapsula capacidades do ciclo de vida GPU. */
    public get currentResourceState(): ResourceStateHandler {
        return ResourceStateHandlerRegistry.get(this.state);
    }
    public shaderId: string = '';
    public transparent: boolean = false;
    /** Quando true, o renderer usa vertex pulling (lê VBO/IBO como storage buffers). */
    public useVertexPulling: boolean = false;
    public bindGroupIds: string[] = [];
    public bindGroupSchema: GPUBindGroupLayoutEntry[] = [];
    public doubleSided: boolean = false;
    public topology: GPUPrimitiveTopology = 'triangle-list';
    public rawUniforms: Map<string, Float32Array> = new Map();

    public markDirty(): void {
        if (this.currentResourceState.ignoreDirtyMark()) return;
        this.state = ResourceState.Dirty;
    }

    public allocateResource(resourceManager: ResourceManager): void {
        this.state = ResourceState.Loading;

        const uniformData = this.rawUniforms.get('std_mat_buf');

        if (uniformData && this.shaderId) {
            const matUboKey = 'mat_ubo_' + this.uuid;
            resourceManager.buffers.createUniformBuffer(matUboKey, uniformData.byteLength);
            resourceManager.buffers.writeBuffer(matUboKey, uniformData);

            resourceManager.bindings.getLayout(this.shaderId, this.bindGroupSchema);

            const matBuf = resourceManager.buffers.getBuffer(matUboKey)!;
            resourceManager.bindings.getBindGroup('mat_bg_' + this.uuid, this.shaderId, [
                { binding: 0, resource: { buffer: matBuf.native } }
            ]);

            // Armazena a chave lógica (não o UUID interno) para permitir lookup e dispose corretos.
            this.bindGroupIds.push('mat_bg_' + this.uuid);
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
