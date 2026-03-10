import type { Component } from '../core/Component';
import { VertexLayout } from '../data/VertexLayout';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';

/**
 * Componente Lógico (ECS) representando a malha matemática de um Nó.
 * Não armazena Float32Arrays super pesados (que vivem na Placa de Vídeo).
 * Ele guarda apenas o crachá/ID que o WebGPUBufferManager gerou na Camada 1, e o descritor (VertexLayout) 
 * que diz a Engine como iterar esse buffer (Stride).
 */
export abstract class Geometry implements Component {
    public readonly type: string = 'Geometry';

    public isCompiled: boolean = false;
    public vertexBufferId: string = '';
    public indexBufferId?: string;
    public vertexCount: number = 0;
    public instanceCount: number = 1;
    public layout!: VertexLayout;

    /**
     * Avaliação Tardia (Lazy Evaluation).
     * Compila os vértices para a Camada 1 somente no primeiro ciclo de renderização,
     * escondendo a complexidade do ResourceManager do Desenvolvedor Final.
     */
    public abstract compile(resourceManager: ResourceManager): void;
}
