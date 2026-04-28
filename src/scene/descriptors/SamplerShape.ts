export interface SamplerShape {
    readonly magFilter?: GPUFilterMode;
    readonly minFilter?: GPUFilterMode;
    readonly mipmapFilter?: GPUMipmapFilterMode;
    readonly addressModeU?: GPUAddressMode;
    readonly addressModeV?: GPUAddressMode;
    readonly addressModeW?: GPUAddressMode;
    readonly compare?: GPUCompareFunction;
    readonly lodMinClamp?: number;
    readonly lodMaxClamp?: number;
    readonly maxAnisotropy?: number;
}
