import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGpuContext } from '../GpuContext';
import { WebPlatformAdapter } from '../../../platform/web/WebPlatformAdapter';

const web = new WebPlatformAdapter();

const originalGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');

function installGpu(features: readonly string[]): ReturnType<typeof vi.fn> {
    const requestDevice = vi.fn((desc: GPUDeviceDescriptor) =>
        Promise.resolve({ queue: {}, features: new Set(desc.requiredFeatures), limits: {} }),
    );
    const adapter = { features: new Set(features), limits: {}, requestDevice };
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
    it('solicita timestamp-query e float32-filterable quando o adaptador oferece', async () => {
        const requestDevice = installGpu(['timestamp-query', 'float32-filterable']);
        await createGpuContext(web);
        expect(requestDevice).toHaveBeenCalledWith({
            requiredFeatures: ['timestamp-query', 'float32-filterable'],
            requiredLimits: {},
        });
    });

    it('sem a feature, não pede nada além do padrão', async () => {
        const requestDevice = installGpu([]);
        await createGpuContext(web);
        expect(requestDevice).toHaveBeenCalledWith({ requiredFeatures: [], requiredLimits: {} });
    });

    it('sem navigator.gpu, mantém o erro atual', async () => {
        Reflect.deleteProperty(navigator, 'gpu');
        await expect(createGpuContext(web)).rejects.toThrow(
            'WebGPU not supported in this browser.',
        );
    });
});
