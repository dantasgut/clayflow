import type { IndexBufferSpec } from './IndexBufferSpec';
import type { IndirectBufferSpec } from './IndirectBufferSpec';
import type { StagingBufferSpec } from './StagingBufferSpec';
import type { StorageBufferSpec } from './StorageBufferSpec';
import type { UniformBufferSpec } from './UniformBufferSpec';
import type { VertexBufferSpec } from './VertexBufferSpec';

export type AnyBufferSpec =
    | VertexBufferSpec
    | IndexBufferSpec
    | UniformBufferSpec
    | StorageBufferSpec
    | IndirectBufferSpec
    | StagingBufferSpec;
