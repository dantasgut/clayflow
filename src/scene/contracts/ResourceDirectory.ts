import type {
    AnyBufferSpec,
    SamplerSpec,
    TextureSpec,
    TextureViewSpec,
} from '../../core/contracts/index';
import type { PoolDirectory } from './PoolDirectory';
import type { Resource } from './Resource';

/**
 * Localização do que a C2 alocou para cada descritor de cada recurso (`ResourceSystem`): buffers de qualquer
 * papel (uniform, storage, vértice, índice, indireto, staging), texturas, views e samplers. Estende
 * `PoolDirectory` (pools coalescidos).
 *
 * É o contrato pelo qual os estágios (Flows) de C3/C4 passam a consumir os objetos que a C2 aloca, em vez de
 * criar cópias próprias — a migração dos estágios para esse consumo é a spec 006.
 */
export interface ResourceDirectory extends PoolDirectory {
    /**
     * Buffer alocado para o descritor `descId` de `resource` (individual; para descritores em pool use
     * `poolBufferSpec`). `undefined` se o recurso não está alocado ou o descritor não é de buffer.
     */
    bufferOf(resource: Resource, descId: string): AnyBufferSpec | undefined;
    /** Textura alocada para o descritor (`texture`/`storage-texture`), ou `undefined`. */
    textureOf(resource: Resource, descId: string): TextureSpec | undefined;
    /** View da textura alocada para o descritor (`texture`/`storage-texture`), ou `undefined`. */
    textureViewOf(resource: Resource, descId: string): TextureViewSpec | undefined;
    /** Sampler alocado para o descritor `sampler`, ou `undefined`. */
    samplerOf(resource: Resource, descId: string): SamplerSpec | undefined;
}
