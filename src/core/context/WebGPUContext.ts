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
        if (this.deviceRef) return; // já inicializado

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

    public get queue(): GPUQueue {
        return this.deviceRef.queue;
    }
}
