import type { PlatformAdapter, PresentationSurface } from '../../scene/contracts/gpu';
import { deno, type SdlWindow } from './sdl';

/** O pedaço da API do Deno que a janela usa (tipado aqui: o motor é compilado sem os tipos do Deno). */
type UnsafeWindowSurfaceCtor = new (options: {
    system: 'cocoa' | 'win32' | 'x11' | 'wayland';
    windowHandle: unknown;
    displayHandle: unknown;
    width: number;
    height: number;
}) => {
    getContext(kind: 'webgpu'): GPUCanvasContext;
    present(): void;
    resize(width: number, height: number): void;
};

/**
 * Adaptador de plataforma do Deno (spec 038): o adaptador da GPU pelo `navigator.gpu` do Deno (wgpu), o formato
 * preferido dele e, de uma janela SDL, a superfície de apresentação sobre `Deno.UnsafeWindowSurface` — o tamanho em
 * pixels da janela, o contexto `webgpu` e a apresentação explícita depois de cada quadro.
 */
export class DenoPlatformAdapter implements PlatformAdapter<SdlWindow> {
    readonly name = 'Deno';

    private gpu(): GPU {
        const nav = (globalThis as unknown as { navigator?: { gpu?: GPU } }).navigator;
        if (nav?.gpu === undefined)
            throw new Error(
                'clayflow/deno: WebGPU indisponível — rode com `deno run --unstable-webgpu`.',
            );
        return nav.gpu;
    }

    requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null> {
        return this.gpu().requestAdapter(options);
    }

    preferredFormat(): GPUTextureFormat {
        return this.gpu().getPreferredCanvasFormat();
    }

    getContext(window: SdlWindow): PresentationSurface & { resized(): void } {
        const Surface = (deno() as unknown as { UnsafeWindowSurface: UnsafeWindowSurfaceCtor })
            .UnsafeWindowSurface;
        let { width, height } = window.pixelSize();
        // A superfície do Deno só existe depois do pedido do adaptador: criada no primeiro uso do contexto (a
        // configuração no core), como o contexto do canvas no navegador.
        let surface: InstanceType<UnsafeWindowSurfaceCtor> | undefined;
        let context: GPUCanvasContext | undefined;
        const create = (): InstanceType<UnsafeWindowSurfaceCtor> => {
            surface ??= new Surface({ ...window.nativeHandles(), width, height });
            return surface;
        };
        return {
            get width() {
                return width;
            },
            get height() {
                return height;
            },
            get context() {
                context ??= create().getContext('webgpu');
                return context;
            },
            present: () => {
                surface?.present();
            },
            /** A janela mudou de tamanho: o tamanho novo em pixels na superfície do Deno. */
            resized: () => {
                ({ width, height } = window.pixelSize());
                surface?.resize(width, height);
            },
        };
    }
}
