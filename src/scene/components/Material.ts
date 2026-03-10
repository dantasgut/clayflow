import type { Component } from '../core/Component';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';

/**
 * Componente Lógico (ECS) representando a aparência (Shader + Material Data) do Nó.
 * Guarda a Hash pro WebGPUPipelineManager (Camada 1) e Dicionário de Cores para o Extrator montar o GPUBindGroup.
 */
export abstract class Material implements Component {
    public readonly type: string = 'Material';
    
    public isCompiled: boolean = false;
    public shaderId: string = '';
    public transparent: boolean = false;
    public bindGroupIds: string[] = [];
    public doubleSided: boolean = false;
    public topology: GPUPrimitiveTopology = 'triangle-list';

    /**
     * Compila buffers uniformes e descritores de Pipeline na Camada 1 preguiçosamente.
     */
    public abstract compile(resourceManager: ResourceManager): void;
}
