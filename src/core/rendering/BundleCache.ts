/**
 * Gravação de comandos geométricos invariáveis.
 */
import { WebGPUContext } from '../context/WebGPUContext';
import type { BundleCache as BundleCacheInterface } from '../interfaces/BundleCache';

export class BundleCache implements BundleCacheInterface {
    private context: WebGPUContext;
    private bundles: Map<string, GPURenderBundle>;

    constructor() {
        this.context = WebGPUContext.getInstance();
        this.bundles = new Map();
    }

    /**
     * Inicia a gravação de uma sequência de comandos que poderão ser tocados em loop infinito
     */
    public beginRecording(colorFormats: GPUTextureFormat[], depthFormat?: GPUTextureFormat): GPURenderBundleEncoder {
        const descriptor: GPURenderBundleEncoderDescriptor = {
            colorFormats: colorFormats
        };
        if (depthFormat !== undefined) {
            descriptor.depthStencilFormat = depthFormat;
        }
        return this.context.device.createRenderBundleEncoder(descriptor);
    }

    public finishRecording(id: string, encoder: GPURenderBundleEncoder): GPURenderBundle {
        const bundle = encoder.finish({ label: `RenderBundle_${id}` });
        this.bundles.set(id, bundle);
        return bundle;
    }

    public getBundle(id: string): GPURenderBundle | undefined {
        return this.bundles.get(id);
    }
}
