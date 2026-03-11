import type { Component } from '../core/Component';
import { VertexLayout } from '../data/VertexLayout';
import { ResourceState } from '../core/ResourceState';

/**
 * Componente Lógico (ECS) representando a malha matemática de um Nó.
 * Ele guarda o crachá/ID que o WebGPUBufferManager gerará na Camada 1, e o descritor (VertexLayout) 
 * que diz a Engine como iterar esse buffer (Stride).
 * Odiado Loader processará os arrays brutos mantidos aqui.
 */
export abstract class Geometry implements Component {
    private static _nextUuid: number = 0;
    public readonly uuid: string = `geom_${++Geometry._nextUuid}`;

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

    /**
     * Sinaliza que a geometria deve ser limpa da VRAM.
     */
    public dispose(): void {
        this.state = ResourceState.Disposed;
    }
}
