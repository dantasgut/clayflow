export interface GpuContext {
    readonly device: GPUDevice;
    readonly queue: GPUQueue;
    canvas: HTMLCanvasElement | null;
    canvasContext: GPUCanvasContext | null;
    canvasFormat: GPUTextureFormat;
}

export async function createGpuContext(): Promise<{
    device: GPUDevice;
    queue: GPUQueue;
    canvasFormat: GPUTextureFormat;
}> {
    if (!('gpu' in navigator)) {
        throw new Error('WebGPU not supported in this browser.');
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('Failed to acquire GPUAdapter.');
    // Timestamps de GPU só existem com a feature pedida na criação do device; sem custo
    // quando o profiling não é usado. Configuração completa do device: spec 004.
    const requiredFeatures: GPUFeatureName[] = adapter.features.has('timestamp-query')
        ? ['timestamp-query']
        : [];
    const device = await adapter.requestDevice({ requiredFeatures });
    const queue = device.queue;
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    return { device, queue, canvasFormat };
}
