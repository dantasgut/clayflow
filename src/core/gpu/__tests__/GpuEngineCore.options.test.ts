import { afterEach, describe, expect, it, vi } from 'vitest';
import { GpuEngineCore } from '../GpuEngineCore';

const originalGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');

/** navigator.gpu falso: cada requestDevice devolve um device novo; registra os pedidos. */
function installGpu() {
    const requestAdapter = vi.fn((_opts?: GPURequestAdapterOptions) =>
        Promise.resolve({
            features: new Set(['timestamp-query']),
            limits: { maxBindGroups: 8, minUniformBufferOffsetAlignment: 256 },
            info: { vendor: 'v', architecture: 'a', device: 'd', description: 'x' },
            requestDevice: (desc: GPUDeviceDescriptor) =>
                Promise.resolve({
                    queue: {},
                    features: new Set(desc.requiredFeatures),
                    limits: { maxBindGroups: 8, minUniformBufferOffsetAlignment: 256 },
                    lost: new Promise(() => undefined),
                    destroy: vi.fn(),
                    createQuerySet: vi.fn(() => ({ destroy: vi.fn() })),
                    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
                }),
        }),
    );
    Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: { requestAdapter, getPreferredCanvasFormat: () => 'bgra8unorm' },
    });
    return { requestAdapter };
}

function fakeCanvas() {
    const configure = vi.fn();
    const ctx = { configure, unconfigure: vi.fn() };
    const canvas = document.createElement('canvas');
    canvas.getContext = vi.fn(() => ctx) as unknown as typeof canvas.getContext;
    return { canvas, configure };
}

afterEach(() => {
    if (originalGpu !== undefined) Object.defineProperty(navigator, 'gpu', originalGpu);
    else Reflect.deleteProperty(navigator, 'gpu');
});

describe('GpuEngineCore — opções de canvas e de device preservadas', () => {
    it('reconfigureCanvas() sem opções reaplica alphaMode/colorSpace de initialize', async () => {
        installGpu();
        const { canvas, configure } = fakeCanvas();
        const core = new GpuEngineCore();
        await core.initialize(canvas, { alphaMode: 'premultiplied', colorSpace: 'display-p3' });
        core.reconfigureCanvas();
        expect(configure).toHaveBeenCalledTimes(2);
        expect(configure.mock.calls[1]![0]).toMatchObject({
            alphaMode: 'premultiplied',
            colorSpace: 'display-p3',
        });
    });

    it('requestRecover cria device novo com as mesmas DeviceOptions e CanvasOptions', async () => {
        const { requestAdapter } = installGpu();
        const { canvas, configure } = fakeCanvas();
        const core = new GpuEngineCore();
        await core.initialize(
            canvas,
            { alphaMode: 'premultiplied' },
            { powerPreference: 'low-power' },
        );
        await core.requestRecover();
        expect(requestAdapter).toHaveBeenCalledTimes(2);
        expect(requestAdapter.mock.calls[1]![0]).toEqual({ powerPreference: 'low-power' });
        expect(configure.mock.calls.at(-1)![0]).toMatchObject({ alphaMode: 'premultiplied' });
        expect(core.capabilities().powerPreference).toBe('low-power');
    });

    it('opções passadas a reconfigureCanvas passam a ser as guardadas', async () => {
        installGpu();
        const { canvas, configure } = fakeCanvas();
        const core = new GpuEngineCore();
        await core.initialize(canvas);
        core.reconfigureCanvas({ alphaMode: 'premultiplied' });
        core.reconfigureCanvas();
        expect(configure.mock.calls.at(-1)![0]).toMatchObject({ alphaMode: 'premultiplied' });
    });

    it('capabilities() antes de initialize lança', () => {
        expect(() => new GpuEngineCore().capabilities()).toThrow(/not initialized/);
    });
});
