import { describe, expect, it, vi } from 'vitest';
import { GpuProfilerSystem } from '../profiler/GpuProfilerSystem';

function fakeDevice(timestamps: () => BigInt64Array) {
    let resolveMap: (() => void) | null = null;
    const staging = {
        destroy: vi.fn(),
        mapAsync: vi.fn(
            () =>
                new Promise<void>((r) => {
                    resolveMap = r;
                }),
        ),
        getMappedRange: () => timestamps().buffer,
        unmap: vi.fn(),
    };
    const created: object[] = [];
    const device = {
        features: new Set(['timestamp-query']),
        createQuerySet: vi.fn(() => ({ destroy: vi.fn() })),
        createBuffer: vi.fn(() => {
            const b = created.length % 2 === 0 ? { destroy: vi.fn() } : staging;
            created.push(b);
            return b;
        }),
    } as unknown as GPUDevice;
    const encoder = {
        resolveQuerySet: vi.fn(),
        copyBufferToBuffer: vi.fn(),
    } as unknown as GPUCommandEncoder;
    return {
        device,
        encoder,
        finishMap: async () => {
            resolveMap?.();
            await Promise.resolve();
            await Promise.resolve();
        },
    };
}

function frame(p: GpuProfilerSystem, index: number, encoder: GPUCommandEncoder, passes: string[]) {
    p.beginFrame(index);
    for (const label of passes) p.passTimestampWrites(label);
    p.resolveOnto(encoder);
    p.submitFrame();
}

describe('GpuProfilerSystem — profiling por quadro', () => {
    it('soma os intervalos do quadro e guarda os rótulos', async () => {
        const ns = new BigInt64Array(64 + 8);
        ns[64] = 0n;
        ns[65] = 1_000_000n;
        ns[66] = 5_000_000n;
        ns[67] = 7_000_000n;
        const { device, encoder, finishMap } = fakeDevice(() => ns);
        const p = new GpuProfilerSystem();
        p.configureFrameProfiling(true, 8);
        p.attach(device);
        frame(p, 3, encoder, ['TransformFlow', 'forward']);
        expect(p.lastFrameReading).toBeUndefined();
        await finishMap();
        expect(p.lastFrameReading).toEqual({
            gpuTimeMs: 3,
            gpuFrame: 3,
            stagesNs: { TransformFlow: 1_000_000, forward: 2_000_000 },
        });
    });

    it('pula o resolve enquanto o staging anterior ainda está mapeando', async () => {
        const { device, encoder, finishMap } = fakeDevice(() => new BigInt64Array(72));
        const p = new GpuProfilerSystem();
        p.configureFrameProfiling(true, 8);
        p.attach(device);
        frame(p, 0, encoder, ['a']);
        frame(p, 1, encoder, ['a']);
        expect(encoder.resolveQuerySet).toHaveBeenCalledTimes(1);
        await finishMap();
        frame(p, 2, encoder, ['a']);
        expect(encoder.resolveQuerySet).toHaveBeenCalledTimes(2);
    });

    it('estouro: passes excedentes sem timestamp, leitura descartada e aviso único', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { device, encoder, finishMap } = fakeDevice(() => new BigInt64Array(68));
        const p = new GpuProfilerSystem();
        p.configureFrameProfiling(true, 4);
        p.attach(device);
        p.beginFrame(0);
        expect(p.passTimestampWrites('a')).toBeDefined();
        expect(p.passTimestampWrites('b')).toBeDefined();
        expect(p.passTimestampWrites('c')).toBeUndefined();
        expect(p.passTimestampWrites('d')).toBeUndefined();
        p.resolveOnto(encoder);
        p.submitFrame();
        await finishMap();
        expect(p.lastFrameReading).toBeUndefined();
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('timestamps explícitos da região manual são respeitados e somados', async () => {
        const ns = new BigInt64Array(72);
        ns[0] = 10n;
        ns[1] = 2_000_010n;
        const { device, encoder, finishMap } = fakeDevice(() => ns);
        const p = new GpuProfilerSystem();
        p.configureFrameProfiling(true, 8);
        p.attach(device);
        p.beginFrame(0);
        const explicit = p.timestampWritesFor(0, 1)!;
        expect(p.passTimestampWrites('forward', explicit)).toBe(explicit);
        p.resolveOnto(encoder);
        p.submitFrame();
        await finishMap();
        expect(p.lastFrameReading?.gpuTimeMs).toBe(2);
    });

    it('profiling desligado: passes sem timestamps e nada é resolvido', () => {
        const { device, encoder } = fakeDevice(() => new BigInt64Array(64));
        const p = new GpuProfilerSystem();
        p.attach(device);
        frame(p, 0, encoder, ['a']);
        expect(p.passTimestampWrites('a')).toBeUndefined();
        expect(encoder.resolveQuerySet).not.toHaveBeenCalled();
    });
});
