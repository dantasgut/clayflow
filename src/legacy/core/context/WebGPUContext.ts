import { Loggable } from '../debug/Loggable';
import { Logger }   from '../debug/Logger';

@Loggable('WebGPUContext')
export class WebGPUContext {
    declare private readonly log: Logger;
    private static instance: WebGPUContext;

    private adapterRef!: GPUAdapter;
    private deviceRef!: GPUDevice;
    private contextRef!: GPUCanvasContext;
    private formatRef!: GPUTextureFormat;

    /** Promise de inicialização — garante idempotência mesmo sob chamadas concorrentes. */
    private initPromise: Promise<void> | null = null;

    private constructor() {}

    public static getInstance(): WebGPUContext {
        if (!WebGPUContext.instance) {
            WebGPUContext.instance = new WebGPUContext();
        }
        return WebGPUContext.instance;
    }

    public get adapter(): GPUAdapter { return this.adapterRef; }
    public get device(): GPUDevice { return this.deviceRef; }
    public get context(): GPUCanvasContext { return this.contextRef; }
    public get format(): GPUTextureFormat { return this.formatRef; }

    public async initialize(canvas: HTMLCanvasElement): Promise<void> {
        if (this.initPromise) return this.initPromise;
        this.initPromise = this.doInitialize(canvas);
        return this.initPromise;
    }

    private async doInitialize(canvas: HTMLCanvasElement): Promise<void> {

        if (!navigator.gpu) {
            throw new Error("WebGPU is not supported on this browser.");
        }

        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });

        if (!adapter) {
            throw new Error("No appropriate GPUAdapter found.");
        }

        this.log.info(`Adapter adquirido — vendor: ${adapter.info?.vendor ?? 'desconhecido'}`);
        this.adapterRef = adapter;

        const requiredFeatures: GPUFeatureName[] = [];
        if (adapter.features.has('timestamp-query')) {
            requiredFeatures.push('timestamp-query');
        }

        this.deviceRef = await adapter.requestDevice({ requiredFeatures });

        this.deviceRef.addEventListener('uncapturederror', (event: GPUUncapturedErrorEvent) => {
            this.log.error(`GPU uncaptured error: ${event.error.message}`);
        });

        this.log.info('Device criado');

        this.deviceRef.lost.then((info) => {
            this.log.error(`Device perdido (${info.reason}): ${info.message}`);
            (WebGPUContext as any).instance = undefined;
        });

        this.contextRef = canvas.getContext('webgpu') as GPUCanvasContext;
        this.formatRef  = navigator.gpu.getPreferredCanvasFormat();

        this.contextRef.configure({
            device: this.deviceRef,
            format: this.formatRef,
            alphaMode: "premultiplied",
        });
    }

    /** Reseta a instância singleton e a promise de init (usado em testes/destroy). */
    public static reset(): void {
        (WebGPUContext as any).instance = undefined;
    }

    public get queue(): GPUQueue {
        return this.deviceRef.queue;
    }
}
