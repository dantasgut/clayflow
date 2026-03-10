import type { IBufferManager } from './IBufferManager';
import type { ITextureManager } from './ITextureManager';
import type { IBindGroupManager } from './IBindGroupManager';

export interface IResourceManager {
    readonly buffers: IBufferManager;
    readonly textures: ITextureManager;
    readonly bindings: IBindGroupManager;
    destroyAll(): void;
}
