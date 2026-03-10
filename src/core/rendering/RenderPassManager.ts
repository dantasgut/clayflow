import { WebGPUContext } from '../context/WebGPUContext';
import type { IRenderPassManager } from '../interfaces/IRenderPassManager';

/**
 * Encapsulamento de Comandos e Passes Gráficos da GPU.
 */
export class RenderPassManager implements IRenderPassManager {
    private context: WebGPUContext;

    constructor() {
        this.context = WebGPUContext.getInstance();
    }

    /**
     * Inicia a gravação de comandos mestres para o frame.
     */
    public createCommandEncoder(label?: string): GPUCommandEncoder {
        return this.context.device.createCommandEncoder(label !== undefined ? { label } : undefined);
    }

    /**
     * Configura o passe geométrico principal (ex: desenhar na tela + Depth Test).
     */
    public beginRenderPass(
        encoder: GPUCommandEncoder,
        colorView: GPUTextureView, // Pode ser do Canvas ou de uma textura offscreen
        depthView?: GPUTextureView,
        clearColor: GPUColor = { r: 0.1, g: 0.1, b: 0.12, a: 1.0 },
        label?: string
    ): GPURenderPassEncoder {

        const colorAttachment: GPURenderPassColorAttachment = {
            view: colorView,
            clearValue: clearColor,
            loadOp: 'clear',
            storeOp: 'store',
        };

        const descriptor: GPURenderPassDescriptor = {
            colorAttachments: [colorAttachment],
        };
        if (label !== undefined) descriptor.label = label;

        if (depthView) {
            descriptor.depthStencilAttachment = {
                view: depthView,
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            };
        }

        return encoder.beginRenderPass(descriptor);
    }

    /**
     * Submete todos os encoders mastigados para a Queue da API.
     */
    public submit(encoders: GPUCommandEncoder[]): void {
        const commandBuffers = encoders.map(e => e.finish());
        this.context.queue.submit(commandBuffers);
    }
}
