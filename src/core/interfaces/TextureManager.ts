import { EngineTexture } from '../resources/EngineTexture';

export interface TextureManager {
    createTexture(id: string, descriptor: GPUTextureDescriptor): EngineTexture;
    createDepthTexture(id: string, width: number, height: number): EngineTexture;
    getTexture(id: string): EngineTexture | undefined;
    createSampler(id: string, descriptor?: GPUSamplerDescriptor): GPUSampler;
    destroyTexture(id: string): void;
}
