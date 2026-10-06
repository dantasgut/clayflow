import { describe, expect, it, vi } from 'vitest';
import { GpuEngineCore } from '../GpuEngineCore';
import type { RenderTarget } from '../../contracts/index';

/**
 * GpuEngineCore com device falso: cobre contadores por gravação, profiling
 * desligado/sem suporte e o isolamento de gravações auxiliares.
 */
function fakeDevice(features: readonly string[]) {
    const computePass = {
        setPipeline: vi.fn(),
        dispatchWorkgroups: vi.fn(),
        end: vi.fn(),
    };
    const renderPass = {
        draw: vi.fn(),
        drawIndexed: vi.fn(),
        end: vi.fn(),
    };
    const beginComputePass = vi.fn((_desc: GPUComputePassDescriptor) => computePass);
    const beginRenderPass = vi.fn((_desc: GPURenderPassDescriptor) => renderPass);
    const encoder = {
        beginComputePass,
        beginRenderPass,
        copyBufferToBuffer: vi.fn(),
        resolveQuerySet: vi.fn(),
        finish: () => ({}),
    };
    const device = {
        features: new Set(features),
        queue: { submit: vi.fn(), writeBuffer: vi.fn() },
        createCommandEncoder: vi.fn(() => encoder),
        createQuerySet: vi.fn(() => ({ destroy: vi.fn() })),
        createBuffer: vi.fn(() => ({
            destroy: vi.fn(),
            mapAsync: () => new Promise(() => undefined),
        })),
        lost: new Promise(() => undefined),
        destroy: vi.fn(),
    } as unknown as GPUDevice;
    return { device, encoder, beginComputePass, beginRenderPass };
}

class TestCore extends GpuEngineCore {
    attachFake(device: GPUDevice): void {
        const self = this as unknown as {
            context: unknown;
            profilerSystem: { attach(d: GPUDevice): void };
        };
        self.context = {
            device,
            queue: device.queue,
            canvas: null,
            canvasContext: null,
            canvasFormat: 'bgra8unorm',
        };
        self.profilerSystem.attach(device);
    }
}

const target: RenderTarget = { colorAttachments: [] };

describe('GpuEngineCore — estatísticas por quadro', () => {
    it('zeradas antes do primeiro quadro', () => {
        expect(new TestCore().lastFrameStats()).toEqual({ drawCalls: 0, dispatches: 0, passes: 0 });
    });

    it('contadores refletem a gravação submetida', () => {
        const core = new TestCore();
        const { device } = fakeDevice([]);
        core.attachFake(device);
        core.record('frame', (f) => {
            f.compute('TransformFlow', (p) => {
                p.dispatch.workgroups(4);
            });
            f.render(target, 'forward', (p) => {
                p.draw.vertices(3).vertices(3);
            });
        });
        core.submit();
        expect(core.lastFrameStats()).toEqual({ drawCalls: 2, dispatches: 1, passes: 2 });
    });

    it('cada gravação recomeça do zero', () => {
        const core = new TestCore();
        core.attachFake(fakeDevice([]).device);
        core.record('frame', (f) => {
            f.render(target, (p) => {
                p.draw.vertices(3);
            });
        });
        core.submit();
        core.record('pool_grow:x', () => undefined);
        core.submit();
        expect(core.lastFrameStats().drawCalls).toBe(0);
    });

    it('gpuTimeMs ausente com profiling desligado; passes não recebem timestamps', () => {
        const core = new TestCore();
        const { device, beginComputePass } = fakeDevice(['timestamp-query']);
        core.attachFake(device);
        core.record('frame', (f) => {
            f.compute('k', (p) => {
                p.dispatch.workgroups(1);
            });
        });
        core.submit();
        expect(core.lastFrameStats().gpuTimeMs).toBeUndefined();
        expect(beginComputePass).toHaveBeenCalledWith({ label: 'k' });
    });

    it('profiling ligado injeta timestamps em todo passe', () => {
        const core = new TestCore();
        const { device, beginComputePass, beginRenderPass, encoder } = fakeDevice([
            'timestamp-query',
        ]);
        core.attachFake(device);
        core.setFrameProfiling(true, 8);
        core.record('frame', (f) => {
            f.compute('TransformFlow', () => undefined);
            f.render(target, 'forward', () => undefined);
        });
        core.submit();
        const computeDesc = beginComputePass.mock.calls[0]![0];
        const renderDesc = beginRenderPass.mock.calls[0]![0];
        expect(computeDesc.timestampWrites?.beginningOfPassWriteIndex).toBe(64);
        expect(renderDesc.timestampWrites?.beginningOfPassWriteIndex).toBe(66);
        expect(encoder.resolveQuerySet).toHaveBeenCalledTimes(1);
    });

    it('sem timestamp-query, setFrameProfiling avisa uma vez e não injeta nada', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const core = new TestCore();
        const { device, beginComputePass } = fakeDevice([]);
        core.attachFake(device);
        core.setFrameProfiling(true);
        core.setFrameProfiling(true);
        core.record((f) => {
            f.compute('k', () => undefined);
        });
        core.submit();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(beginComputePass).toHaveBeenCalledWith({ label: 'k' });
        warn.mockRestore();
    });

    it('gravação auxiliar sem passes não resolve timestamps', () => {
        const core = new TestCore();
        const { device, encoder } = fakeDevice(['timestamp-query']);
        core.attachFake(device);
        core.setFrameProfiling(true);
        core.record('pool_grow:x', () => undefined);
        core.submit();
        expect(encoder.resolveQuerySet).not.toHaveBeenCalled();
    });
});
