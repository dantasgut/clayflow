import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGpuContext } from '../GpuContext';

const originalGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');

function installGpu(features: readonly string[]): ReturnType<typeof vi.fn> {
    const requestDevice = vi.fn(() => Promise.resolve({ queue: {} }));
    const adapter = { features: new Set(features), requestDevice };
    Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: {
            requestAdapter: () => Promise.resolve(adapter),
            getPreferredCanvasFormat: () => 'bgra8unorm',
        },
    });
    return requestDevice;
}

afterEach(() => {
    if (originalGpu !== undefined) Object.defineProperty(navigator, 'gpu', originalGpu);
    else Reflect.deleteProperty(navigator, 'gpu');
});

describe('createGpuContext', () => {
    it('solicita timestamp-query quando o adaptador oferece', async () => {
        const requestDevice = installGpu(['timestamp-query', 'float32-filterable']);
        await createGpuContext();
        expect(requestDevice).toHaveBeenCalledWith({ requiredFeatures: ['timestamp-query'] });
    });

    it('sem a feature, não pede nada além do padrão', async () => {
        const requestDevice = installGpu([]);
        await createGpuContext();
        expect(requestDevice).toHaveBeenCalledWith({ requiredFeatures: [] });
    });

    it('sem navigator.gpu, mantém o erro atual', async () => {
        Reflect.deleteProperty(navigator, 'gpu');
        await expect(createGpuContext()).rejects.toThrow('WebGPU not supported in this browser.');
    });
});
