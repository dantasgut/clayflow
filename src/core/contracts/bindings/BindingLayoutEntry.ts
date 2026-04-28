import type { BufferBindingLayoutEntry } from './BufferBindingLayoutEntry';
import type { ExternalTextureBindingLayoutEntry } from './ExternalTextureBindingLayoutEntry';
import type { SamplerBindingLayoutEntry } from './SamplerBindingLayoutEntry';
import type { StorageTextureBindingLayoutEntry } from './StorageTextureBindingLayoutEntry';
import type { TextureBindingLayoutEntry } from './TextureBindingLayoutEntry';

export interface BaseBindingLayoutEntry {
    readonly binding: number;
    readonly visibility: number;
}

export type BindingLayoutEntry =
    | BufferBindingLayoutEntry
    | SamplerBindingLayoutEntry
    | TextureBindingLayoutEntry
    | StorageTextureBindingLayoutEntry
    | ExternalTextureBindingLayoutEntry;
