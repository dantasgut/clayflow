import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';

/**
 * Opções de configuração de um render target. `sizeFromCanvas` aplica
 * apenas a `CanvasRenderTarget` (faz a textura espelhar canvas dimensions).
 */
export interface RenderTargetOptions {
    /** Largura em pixels (ignorado se sizeFromCanvas=true). Default: 0 ou 1024. */
    width?: number;
    /** Altura em pixels. Default: 0 ou 1024. */
    height?: number;
    /** Formato do color attachment. Default: 'bgra8unorm' (canvas) ou 'rgba16float' (offscreen). */
    colorFormat?: GPUTextureFormat;
    /** Formato do depth-stencil attachment. Default: 'depth24plus'. */
    depthFormat?: GPUTextureFormat;
    /** MSAA: 1 (sem antialiasing) ou 4. Default: 1. */
    sampleCount?: 1 | 4;
    /**
     * Quando true (default em CanvasRenderTarget), as dimensões espelham
     * `canvas.width × canvas.height × DPR`. Listener de resize ajusta automaticamente.
     */
    sizeFromCanvas?: boolean;
}

/**
 * Render target que renderiza diretamente no canvas swapchain. Usado
 * pelo PostFlow no fim do chain (último effect escreve em canvasView).
 * `sizeFromCanvas: true` por default — atualiza automaticamente em resize.
 */
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

    /** Render target não declara descriptors GPU — gerenciado pelo flow consumidor. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [];
    }

    /** Sem pipelines próprios. */
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}

/**
 * Render target offscreen — texture independente do canvas swapchain.
 * Usado para passes intermediários (shadow maps, refraction texture,
 * mirror reflection) que serão sampled em passes posteriores.
 */
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

    /** Render target não declara descriptors GPU — gerenciado pelo flow consumidor. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [];
    }

    /** Sem pipelines próprios. */
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
