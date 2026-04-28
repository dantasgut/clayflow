import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';

export interface RenderTargetOptions {
    width?: number;
    height?: number;
    colorFormat?: GPUTextureFormat;
    depthFormat?: GPUTextureFormat;
    sampleCount?: 1 | 4;
    sizeFromCanvas?: boolean;
}

export class CanvasRenderTarget extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    constructor(options: RenderTargetOptions = {}) {
        super();
        this.data = {
            width: options.width ?? 0,
            height: options.height ?? 0,
            colorFormat: options.colorFormat ?? 'bgra8unorm',
            depthFormat: options.depthFormat ?? 'depth24plus',
            sampleCount: options.sampleCount ?? 1,
            sizeFromCanvas: options.sizeFromCanvas ?? true,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}

export class OffscreenRenderTarget extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    constructor(options: RenderTargetOptions) {
        super();
        this.data = {
            width: options.width ?? 1024,
            height: options.height ?? 1024,
            colorFormat: options.colorFormat ?? 'rgba16float',
            depthFormat: options.depthFormat ?? 'depth24plus',
            sampleCount: options.sampleCount ?? 1,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
