export class WebGPUContext {
    private static instance: WebGPUContext;
    public adapter!: GPUAdapter;
    public device!: GPUDevice;
    public context!: GPUCanvasContext;
    public format!: GPUTextureFormat;

    private constructor() {}

    public static getInstance(): WebGPUContext {
        if (!WebGPUContext.instance) {
            WebGPUContext.instance = new WebGPUContext();
        }
        return WebGPUContext.instance;
    }

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

        this.adapter = adapter;
        this.device = await adapter.requestDevice();
        this.context = canvas.getContext("webgpu") as GPUCanvasContext;
        this.format = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: "premultiplied",
        });
    }

    public get queue(): GPUQueue {
        return this.device.queue;
    }
}
