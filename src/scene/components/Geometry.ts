import type { IComponent } from '../core/Entity';
import { VertexLayout } from '../data/VertexLayout';

/**
 * Componente Lógico (ECS) representando a malha matemática de um Nó.
 * Não armazena Float32Arrays super pesados (que vivem na Placa de Vídeo).
 * Ele guarda apenas o crachá/ID que o BufferManager gerou na Camada 1, e o descritor (VertexLayout) 
 * que diz a Engine como iterar esse buffer (Stride).
 */
export class Geometry implements IComponent {
    public readonly type: string = 'Geometry';

    public vertexBufferId: string;
    public indexBufferId?: string | undefined;

    public vertexCount: number;
    public instanceCount: number;

    // O Schema Estrutural
    public layout: VertexLayout;

    constructor(
        vertexBufferId: string,
        layout: VertexLayout,
        vertexCount: number,
        indexBufferId?: string,
        instanceCount: number = 1
    ) {
        this.vertexBufferId = vertexBufferId;
        this.layout = layout;
        this.vertexCount = vertexCount;
        this.indexBufferId = indexBufferId;
        this.instanceCount = instanceCount;
    }
}
