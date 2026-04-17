export interface BundleCache {
    beginRecording(colorFormats: GPUTextureFormat[], depthFormat?: GPUTextureFormat): GPURenderBundleEncoder;
    finishRecording(id: string, encoder: GPURenderBundleEncoder): GPURenderBundle;
    getBundle(id: string): GPURenderBundle | undefined;
}
