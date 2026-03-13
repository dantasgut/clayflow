import type { Component } from '../core/Component';
import { ResourceState } from '../core/ResourceState';

/**
 * Componente Lógico (ECS) representando a aparência (Shader + Material Data) do Nó.
 * Guarda a Hash pro WebGPUPipelineManager (Camada 1) e referencias de texturas/uniformes.
 * Será processado pelo ResourceLoader.
 */
export abstract class Material implements Component {
    private static _nextUuid: number = 0;
    public readonly uuid: string = `mat_${++Material._nextUuid}`;

    public readonly type: string = 'Material';
    
    public state: ResourceState = ResourceState.Uninitialized;
    public shaderId: string = '';
    public transparent: boolean = false;
    public bindGroupIds: string[] = [];
    
    /** Layout Schema Declarativo que dita à Camada 1 como alocar este material */
    public bindGroupSchema: GPUBindGroupLayoutEntry[] = [];

    public doubleSided: boolean = false;
    public topology: GPUPrimitiveTopology = 'triangle-list';



    // Para uso do ResourceLoader e Builders: Definição dos buffers uniformes e dados cru de inicialização
    // ex: color array temporario, referências a texturas
    public rawUniforms: Map<string, Float32Array> = new Map();

    /**
     * Marca o material como sujo (seja por textura alterada ou cor) 
     * para que o ResourceLoader atualize o uniform buffer/bindgroup associado.
     */
    public markDirty(): void {
        if (this.state === ResourceState.Ready) {
            this.state = ResourceState.Dirty;
        }
    }

    /**
     * Sinaliza desalocação do bind group e material associado da GPU.
     */
    public dispose(): void {
        this.state = ResourceState.Disposed;
    }
}
