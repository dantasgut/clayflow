import type { SamplerShape } from './SamplerShape';
import type { Schema } from './Schema';
import type { TextureShape } from './TextureShape';

export type GPUDescriptorRole =
    | 'uniform'
    | 'storage-rw'
    | 'storage-ro'
    | 'vertex'
    | 'index'
    | 'indirect'
    | 'staging'
    | 'texture'
    | 'storage-texture'
    | 'sampler';

export interface GPUDescriptor {
    readonly id: string;
    readonly role: GPUDescriptorRole;
    readonly schema?: Schema;
    readonly count?: number;
    readonly storage?: 'individual' | 'pool';
    readonly textureShape?: TextureShape;
    readonly samplerShape?: SamplerShape;
    readonly binding?: number;
    readonly group?: number;
    readonly visibility?: number;
}
