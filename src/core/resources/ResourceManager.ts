import type { IResourceManager } from '../interfaces/IResourceManager';
import type { IBufferManager } from '../interfaces/IBufferManager';
import type { ITextureManager } from '../interfaces/ITextureManager';
import type { IBindGroupManager } from '../interfaces/IBindGroupManager';
import { BufferManager } from './BufferManager';
import { TextureManager } from './TextureManager';
import { BindGroupManager } from './BindGroupManager';

/**
 * Padrão Facade (Fachada): Ponto único de contato para toda alocação na VRAM.
 * A Cena (Camada 2) não deve instanciar os gerentes individuais, mas injetar
 * esta interface central para pedir recursos.
 */
export class ResourceManager implements IResourceManager {
    public readonly buffers: IBufferManager;
    public readonly textures: ITextureManager;
    public readonly bindings: IBindGroupManager;

    constructor() {
        this.buffers = new BufferManager();
        this.textures = new TextureManager();
        this.bindings = new BindGroupManager();
    }

    /**
     * Limpeza absoluta. Essencial para quando o app reiniciar ou destruir o contexto.
     */
    public destroyAll(): void {
        console.warn("[ResourceManager] Destruindo TODOS os recursos alocados na GPU.");

        // Limparia todos os dicionários das sub-estruturas
        // Como implementamos o EngineResource, precisamos garantir que cada Manager
        // possua um método próprio para iterar e dar .destroy() nos EngineResources restantes.

        // (Nota: Adicionaremos a lógica de varredura nos Managers em seguida)
        this.bindings.clearCache();
    }
}
