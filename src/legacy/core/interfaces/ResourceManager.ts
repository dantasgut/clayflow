import type { BufferManager } from './BufferManager';
import type { TextureManager } from './TextureManager';
import type { BindGroupManager } from './BindGroupManager';

export interface ResourceManager {
    readonly buffers: BufferManager;
    readonly textures: TextureManager;
    readonly bindings: BindGroupManager;
    destroyAll(): void;
}
