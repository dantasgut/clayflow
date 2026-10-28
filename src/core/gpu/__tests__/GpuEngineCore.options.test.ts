import { afterEach, describe, expect, it, vi } from 'vitest';
import { GpuEngineCore } from '../GpuEngineCore';
import { WebPlatformAdapter } from '../../../platform/web/WebPlatformAdapter';

const web = new WebPlatformAdapter();

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

function fakeCanvas(extendedSupported = true) {
    let last: GPUCanvasConfiguration | undefined;
    const configure = vi.fn((c: GPUCanvasConfiguration) => {
        last = c;
    });
    // `getConfiguration` devolve o que valeu: sem suporte, o navegador descarta o `toneMapping`.
    const getConfiguration = () =>
        last === undefined
            ? null
            : extendedSupported
              ? last
              : { ...last, toneMapping: { mode: 'standard' as const } };
    const ctx = { configure, unconfigure: vi.fn(), getConfiguration };
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
        await core.initialize(
            web.getContext(canvas),
            { alphaMode: 'premultiplied', colorSpace: 'display-p3' },
            undefined,
            web,
        );
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
            web.getContext(canvas),
            { alphaMode: 'premultiplied' },
            { powerPreference: 'low-power' },
            web,
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
        await core.initialize(web.getContext(canvas), undefined, undefined, web);
        core.reconfigureCanvas({ alphaMode: 'premultiplied' });
        core.reconfigureCanvas();
        expect(configure.mock.calls.at(-1)![0]).toMatchObject({ alphaMode: 'premultiplied' });
    });

    it('saída HDR: rgba16float com toneMapping extended quando a tela suporta', async () => {
        installGpu();
        const { canvas, configure } = fakeCanvas(true);
        const core = new GpuEngineCore();
        await core.initialize(
            web.getContext(canvas),
            { toneMapping: 'extended', format: 'rgba16float' },
            undefined,
            web,
        );
        expect(configure.mock.calls.at(-1)![0]).toMatchObject({
            format: 'rgba16float',
            toneMapping: { mode: 'extended' },
        });
        expect(core.canvasFormat).toBe('rgba16float');
        expect(core.canvasOutput).toEqual({ format: 'rgba16float', toneMapping: 'extended' });
    });

    it('saída HDR sem suporte: volta ao formato preferido e a standard', async () => {
        installGpu();
        const { canvas, configure } = fakeCanvas(false);
        const core = new GpuEngineCore();
        await core.initialize(
            web.getContext(canvas),
            { toneMapping: 'extended', format: 'rgba16float' },
            undefined,
            web,
        );
        expect(configure).toHaveBeenCalledTimes(2);
        expect(configure.mock.calls[1]![0]).toMatchObject({ format: 'bgra8unorm' });
        expect(configure.mock.calls[1]![0]).not.toHaveProperty('toneMapping');
        expect(core.canvasOutput).toEqual({ format: 'bgra8unorm', toneMapping: 'standard' });
    });

    it('reconfigurar de volta ao padrão restaura o formato preferido', async () => {
        installGpu();
        const { canvas } = fakeCanvas(true);
        const core = new GpuEngineCore();
        await core.initialize(
            web.getContext(canvas),
            { toneMapping: 'extended', format: 'rgba16float' },
            undefined,
            web,
        );
        core.reconfigureCanvas({});
        expect(core.canvasOutput).toEqual({ format: 'bgra8unorm', toneMapping: 'standard' });
    });

    it('capabilities() antes de initialize lança', () => {
        expect(() => new GpuEngineCore().capabilities()).toThrow(/not initialized/);
    });
});
