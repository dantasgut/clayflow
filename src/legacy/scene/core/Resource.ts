import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { ResourceState } from './ResourceState';
import type { ResourceStateHandler } from './resource/ResourceStateHandler';

/**
 * Interface mestre para qualquer nó/elemento estrutural da Engine que possua 
 * um estado de memória e possa transferir dados para a Placa de Vídeo (VRAM).
 * - "Componentes Visuais" repassam essa interface.
 * - "Corpos Lógicos Físicos" implementam isso diretamente.
 */
export interface Resource {
    readonly type: string;
    readonly uuid?: string;
    state?: ResourceState;

    /** Handler do estado atual — consulta de capacidades pelos consumidores. */
    readonly currentResourceState?: ResourceStateHandler;

    allocateResource?(resourceManager: ResourceManager): Promise<void> | void;
    updateResource?(resourceManager: ResourceManager): Promise<void> | void;
    disposeResource?(resourceManager: ResourceManager): void;
}
