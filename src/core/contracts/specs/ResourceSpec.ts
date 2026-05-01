import type { AnyBufferSpec } from './AnyBufferSpec';
import type { BindGroupSpec } from './BindGroupSpec';
import type { BundleSpec } from './BundleSpec';
import type { ComputePipelineSpec } from './ComputePipelineSpec';
import type { LayoutSpec } from './LayoutSpec';
import type { RenderPipelineSpec } from './RenderPipelineSpec';
import type { SamplerSpec } from './SamplerSpec';
import type { ShaderModuleSpec } from './ShaderModuleSpec';
import type { TextureSpec } from './TextureSpec';
import type { TextureViewSpec } from './TextureViewSpec';

export type { AnyBufferSpec } from './AnyBufferSpec';

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
