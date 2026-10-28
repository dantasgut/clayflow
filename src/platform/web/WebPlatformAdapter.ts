import type { PlatformAdapter, PresentationSurface } from '../../scene/contracts/gpu';

/**
 * Adaptador de plataforma do navegador (spec 038): o adaptador da GPU pelo `navigator.gpu`, o formato preferido do
 * canvas e o contexto `webgpu` de um `<canvas>` como superfície de apresentação (o tamanho é o do backbuffer do canvas;
 * o contexto, pedido no primeiro uso).
 */
export class WebPlatformAdapter implements PlatformAdapter<HTMLCanvasElement> {
    readonly name = 'navegador';

    async requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null> {
        if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
            throw new Error('WebGPU not supported in this browser.');
        }
        return navigator.gpu.requestAdapter(options);
    }

    preferredFormat(): GPUTextureFormat {
        return navigator.gpu.getPreferredCanvasFormat();
    }

    getContext(canvas: HTMLCanvasElement): PresentationSurface {
        // O contexto `webgpu` é pedido no primeiro uso (a configuração no core), como antes da spec 038.
        let context: GPUCanvasContext | null = null;
        return {
            get width() {
                return canvas.width;
            },
            get height() {
                return canvas.height;
            },
            get context() {
                if (context === null) {
                    context = canvas.getContext('webgpu');
                    if (context === null)
                        throw new Error('GpuEngineCore: failed to get webgpu canvas context.');
                }
                return context;
            },
        };
    }
}
