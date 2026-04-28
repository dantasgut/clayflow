export interface BlendComponent {
    readonly operation?: GPUBlendOperation;
    readonly srcFactor?: GPUBlendFactor;
    readonly dstFactor?: GPUBlendFactor;
}
