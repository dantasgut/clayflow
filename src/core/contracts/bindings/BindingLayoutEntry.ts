import type { BufferBindingLayoutEntry } from './BufferBindingLayoutEntry';
import type { ExternalTextureBindingLayoutEntry } from './ExternalTextureBindingLayoutEntry';
import type { SamplerBindingLayoutEntry } from './SamplerBindingLayoutEntry';
import type { StorageTextureBindingLayoutEntry } from './StorageTextureBindingLayoutEntry';
import type { TextureBindingLayoutEntry } from './TextureBindingLayoutEntry';

export type { BaseBindingLayoutEntry } from './BaseBindingLayoutEntry';

export type BindingLayoutEntry =
    | BufferBindingLayoutEntry
    | SamplerBindingLayoutEntry
    | TextureBindingLayoutEntry
    | StorageTextureBindingLayoutEntry
    | ExternalTextureBindingLayoutEntry;
