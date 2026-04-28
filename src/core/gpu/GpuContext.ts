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
    const device = await adapter.requestDevice();
    const queue = device.queue;
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    return { device, queue, canvasFormat };
}
