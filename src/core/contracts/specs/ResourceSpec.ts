import type { BindGroupSpec } from './BindGroupSpec';
import type { BundleSpec } from './BundleSpec';
import type { ComputePipelineSpec } from './ComputePipelineSpec';
import type { IndexBufferSpec } from './IndexBufferSpec';
import type { IndirectBufferSpec } from './IndirectBufferSpec';
import type { LayoutSpec } from './LayoutSpec';
import type { RenderPipelineSpec } from './RenderPipelineSpec';
import type { SamplerSpec } from './SamplerSpec';
import type { ShaderModuleSpec } from './ShaderModuleSpec';
import type { StagingBufferSpec } from './StagingBufferSpec';
import type { StorageBufferSpec } from './StorageBufferSpec';
import type { TextureSpec } from './TextureSpec';
import type { TextureViewSpec } from './TextureViewSpec';
import type { UniformBufferSpec } from './UniformBufferSpec';
import type { VertexBufferSpec } from './VertexBufferSpec';

export type AnyBufferSpec =
    | VertexBufferSpec
    | IndexBufferSpec
    | UniformBufferSpec
    | StorageBufferSpec
    | IndirectBufferSpec
    | StagingBufferSpec;

export type AnyPipelineSpec = ComputePipelineSpec | RenderPipelineSpec;

export type ResourceSpec =
    | AnyBufferSpec
    | TextureSpec
    | TextureViewSpec
    | SamplerSpec
    | ShaderModuleSpec
    | LayoutSpec
    | AnyPipelineSpec
    | BindGroupSpec
    | BundleSpec;
