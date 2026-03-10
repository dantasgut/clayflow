export interface IRenderPassManager {
    createCommandEncoder(label?: string): GPUCommandEncoder;
    beginRenderPass(encoder: GPUCommandEncoder, colorView: GPUTextureView, depthView?: GPUTextureView, clearColor?: GPUColor, label?: string): GPURenderPassEncoder;
    submit(encoders: GPUCommandEncoder[]): void;
}
