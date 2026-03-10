import type { ResourceManager } from '../interfaces/ResourceManager';
import type { BufferManager } from '../interfaces/BufferManager';
import type { TextureManager } from '../interfaces/TextureManager';
import type { BindGroupManager } from '../interfaces/BindGroupManager';
import { WebGPUBufferManager } from './WebGPUBufferManager';
import { WebGPUTextureManager } from './WebGPUTextureManager';
import { WebGPUBindGroupManager } from './WebGPUBindGroupManager';

/**
 * Padrão Facade (Fachada): Ponto único de contato para toda alocação na VRAM.
 * A Cena (Camada 2) não deve instanciar os gerentes individuais, mas injetar
 * esta interface central para pedir recursos.
 */
export class WebGPUResourceManager implements ResourceManager {
    public readonly buffers: BufferManager;
    public readonly textures: TextureManager;
    public readonly bindings: BindGroupManager;

    constructor() {
        this.buffers = new WebGPUBufferManager();
        this.textures = new WebGPUTextureManager();
        this.bindings = new WebGPUBindGroupManager();
    }

    /**
     * Limpeza absoluta. Essencial para quando o app reiniciar ou destruir o contexto.
     */
    public destroyAll(): void {
        console.warn("[WebGPUResourceManager] Destruindo TODOS os recursos alocados na GPU.");

        // Limparia todos os dicionários das sub-estruturas
        // Como implementamos o EngineResource, precisamos garantir que cada Manager
        // possua um método próprio para iterar e dar .destroy() nos EngineResources restantes.

        // (Nota: Adicionaremos a lógica de varredura nos Managers em seguida)
        this.bindings.clearCache();
    }
}
