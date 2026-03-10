import { EngineTexture } from '../resources/EngineTexture';

export interface ITextureManager {
    createTexture(id: string, descriptor: GPUTextureDescriptor): EngineTexture;
    createDepthTexture(id: string, width: number, height: number): EngineTexture;
    getTexture(id: string): EngineTexture | undefined;
    createSampler(id: string, descriptor?: GPUSamplerDescriptor): GPUSampler;
    destroyTexture(id: string): void;
}
