import { WebGPUContext } from '../context/WebGPUContext';
import { EngineTexture } from './EngineTexture';
import type { TextureManager } from '../interfaces/TextureManager';

/**
 * Abstração pura para Texturas (Imagens 2D, 3D, Cube), Depth Buffers e Samplers.
 */
export class WebGPUTextureManager implements TextureManager {
    private context: WebGPUContext;
    private textures: Map<string, EngineTexture>;
    private samplers: Map<string, GPUSampler>;

    constructor() {
        this.context = WebGPUContext.getInstance();
        this.textures = new Map();
        this.samplers = new Map();
    }

    public createTexture(id: string, descriptor: GPUTextureDescriptor): EngineTexture {
        const rawTexture = this.context.device.createTexture(descriptor);

        let depth = 1;
        if (descriptor.size instanceof Array) {
            depth = (descriptor.size[2] as number) || 1;
        } else if (typeof descriptor.size === 'object' && 'depthOrArrayLayers' in descriptor.size) {
            depth = descriptor.size.depthOrArrayLayers || 1;
        }

        const width = descriptor.size instanceof Array ? (descriptor.size[0] as number) : (descriptor.size as GPUExtent3DDictStrict).width;
        const height = descriptor.size instanceof Array ? (descriptor.size[1] as number) : ((descriptor.size as GPUExtent3DDictStrict).height || 1);

        const engineTex = new EngineTexture(`Texture_${id}`, rawTexture, width, height, depth, descriptor.format);
        this.textures.set(id, engineTex);
        return engineTex;
    }

    public createDepthTexture(id: string, width: number, height: number): EngineTexture {
        return this.createTexture(id, {
            size: [width, height, 1],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
    }

    public getTexture(id: string): EngineTexture | undefined {
        return this.textures.get(id);
    }

    public createSampler(id: string, descriptor: GPUSamplerDescriptor = {}): GPUSampler {
        // Fallbacks inteligentes baseados no Módulo 04 da API
        const safeDescriptor: GPUSamplerDescriptor = {
            magFilter: descriptor.magFilter || 'linear',
            minFilter: descriptor.minFilter || 'linear',
            addressModeU: descriptor.addressModeU || 'repeat',
            addressModeV: descriptor.addressModeV || 'repeat',
            addressModeW: descriptor.addressModeW || 'repeat',
            ...descriptor
        };

        const sampler = this.context.device.createSampler(safeDescriptor);
        this.samplers.set(id, sampler);
        return sampler;
    }

    public destroyTexture(id: string): void {
        const engineTex = this.textures.get(id);
        if (engineTex) {
            engineTex.destroy();
            this.textures.delete(id);
        }
    }

    public destroyAll(): void {
        for (const engineTex of this.textures.values()) {
            engineTex.destroy();
        }
        this.textures.clear();
        this.samplers.clear();
    }
}
