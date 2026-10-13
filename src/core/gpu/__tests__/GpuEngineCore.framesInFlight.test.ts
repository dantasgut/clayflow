import { describe, expect, it, vi } from 'vitest';
import { GpuEngineCore } from '../GpuEngineCore';

/** Device falso cujas conclusões de fila são resolvidas pelo teste, na ordem que quiser. */
function fakeDevice() {
    const pending: (() => void)[] = [];
    const encoder = { finish: () => ({}), resolveQuerySet: vi.fn() };
    const device = {
        features: new Set<string>(),
        limits: { maxComputeWorkgroupsPerDimension: 65_535 },
        queue: {
            submit: vi.fn(),
            writeBuffer: vi.fn(),
            onSubmittedWorkDone: vi.fn(
                () =>
                    new Promise<void>((resolve) => {
                        pending.push(resolve);
                    }),
            ),
        },
        createCommandEncoder: vi.fn(() => encoder),
        lost: new Promise(() => undefined),
        destroy: vi.fn(),
    } as unknown as GPUDevice;
    return { device, pending };
}

class TestCore extends GpuEngineCore {
    attachFake(device: GPUDevice): void {
        (this as unknown as { context: unknown }).context = {
            device,
            queue: device.queue,
            canvas: null,
            canvasContext: null,
            canvasFormat: 'bgra8unorm',
            capabilities: {},
        };
    }
    lose(device: GPUDevice): void {
        this.handleDeviceLost(device, { reason: 'unknown', message: 'teste' });
    }
}

function frame(core: GpuEngineCore): void {
    core.record(() => undefined);
    core.submit();
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('GpuEngineCore.framesInFlight', () => {
    it('0 antes de qualquer submit; submit incrementa, conclusão decrementa (qualquer ordem)', async () => {
        const { device, pending } = fakeDevice();
        const core = new TestCore();
        core.attachFake(device);
        expect(core.framesInFlight()).toBe(0);
        frame(core);
        frame(core);
        frame(core);
        expect(core.framesInFlight()).toBe(3);
        pending[1]!();
        await flush();
        expect(core.framesInFlight()).toBe(2);
        pending[0]!();
        pending[2]!();
        await flush();
        expect(core.framesInFlight()).toBe(0);
    });

    it('device perdido zera e conclusões antigas não ficam negativas', async () => {
        const { device, pending } = fakeDevice();
        const core = new TestCore();
        core.attachFake(device);
        frame(core);
        frame(core);
        core.lose(device);
        expect(core.framesInFlight()).toBe(0);
        pending.forEach((resolve) => {
            resolve();
        });
        await flush();
        expect(core.framesInFlight()).toBe(0);
    });

    it('shutdown zera', () => {
        const { device } = fakeDevice();
        const core = new TestCore();
        core.attachFake(device);
        frame(core);
        core.shutdown();
        expect(core.framesInFlight()).toBe(0);
    });

    it('onFrameRetired avisa cada conclusão com a contagem nova; unsubscribe para de avisar', async () => {
        const { device, pending } = fakeDevice();
        const core = new TestCore();
        core.attachFake(device);
        const seen: number[] = [];
        const off = core.onFrameRetired((n) => seen.push(n));
        frame(core);
        frame(core);
        pending[0]!();
        await flush();
        expect(seen).toEqual([1]);
        off();
        pending[1]!();
        await flush();
        expect(seen).toEqual([1]);
        expect(core.framesInFlight()).toBe(0);
    });

    it('device perdido com quadros em voo avisa 0 uma vez; conclusões antigas não avisam', async () => {
        const { device, pending } = fakeDevice();
        const core = new TestCore();
        core.attachFake(device);
        const seen: number[] = [];
        core.onFrameRetired((n) => seen.push(n));
        frame(core);
        frame(core);
        core.lose(device);
        expect(seen).toEqual([0]);
        pending.forEach((resolve) => {
            resolve();
        });
        await flush();
        expect(seen).toEqual([0]);
    });

    it('shutdown sem quadros em voo não avisa', () => {
        const { device } = fakeDevice();
        const core = new TestCore();
        core.attachFake(device);
        const handler = vi.fn();
        core.onFrameRetired(handler);
        core.shutdown();
        expect(handler).not.toHaveBeenCalled();
    });
});
