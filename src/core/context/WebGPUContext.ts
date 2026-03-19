export class WebGPUContext {
    private static instance: WebGPUContext;

    private _adapter!: GPUAdapter;
    private _device!: GPUDevice;
    private _context!: GPUCanvasContext;
    private _format!: GPUTextureFormat;

    private constructor() {}

    public static getInstance(): WebGPUContext {
        if (!WebGPUContext.instance) {
            WebGPUContext.instance = new WebGPUContext();
        }
        return WebGPUContext.instance;
    }

    public get adapter(): GPUAdapter { return this._adapter; }
    public get device(): GPUDevice { return this._device; }
    public get context(): GPUCanvasContext { return this._context; }
    public get format(): GPUTextureFormat { return this._format; }

    public async initialize(canvas: HTMLCanvasElement): Promise<void> {
        if (!navigator.gpu) {
            throw new Error("WebGPU is not supported on this browser.");
        }

        const adapter = await navigator.gpu.requestAdapter({
            powerPreference: "high-performance"
        });

        if (!adapter) {
            throw new Error("No appropriate GPUAdapter found.");
        }

        this._adapter = adapter;

        const requiredFeatures: GPUFeatureName[] = [];
        if (adapter.features.has('timestamp-query')) {
            requiredFeatures.push('timestamp-query');
        }

        this._device = await adapter.requestDevice({ requiredFeatures });

        this._device.lost.then((info) => {
            console.error(`[WebGPUContext] GPU device lost (${info.reason}): ${info.message}`);
            (WebGPUContext as any).instance = undefined;
        });

        this._context = canvas.getContext("webgpu") as GPUCanvasContext;
        this._format = navigator.gpu.getPreferredCanvasFormat();

        this._context.configure({
            device: this._device,
            format: this._format,
            alphaMode: "premultiplied",
        });
    }

    public get queue(): GPUQueue {
        return this._device.queue;
    }
}
