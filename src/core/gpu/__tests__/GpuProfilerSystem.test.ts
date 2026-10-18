import { describe, expect, it, vi } from 'vitest';
import { GpuProfilerSystem, STAGING_RING } from '../profiler/GpuProfilerSystem';

/**
 * Device falso: cada buffer com `MAP_READ` é um staging com o seu mapeamento pendente; `finishMap` conclui os
 * mapeamentos pendentes na ordem em que foram pedidos.
 */
function fakeDevice(timestamps: () => BigInt64Array) {
    const maps: (() => void)[] = [];
    const stagings: object[] = [];
    const device = {
        features: new Set(['timestamp-query']),
        createQuerySet: vi.fn(() => ({ destroy: vi.fn() })),
        createShaderModule: vi.fn(() => ({})),
        createComputePipeline: vi.fn(() => ({ label: 'profiler.marker' })),
        createBuffer: vi.fn((d: GPUBufferDescriptor) => {
            if ((d.usage & GPUBufferUsage.MAP_READ) === 0) return { destroy: vi.fn() };
            const staging = {
                destroy: vi.fn(),
                mapAsync: vi.fn(
                    () =>
                        new Promise<void>((r) => {
                            maps.push(r);
                        }),
                ),
                getMappedRange: () => timestamps().buffer,
                unmap: vi.fn(),
            };
            stagings.push(staging);
            return staging;
        }),
    } as unknown as GPUDevice;
    const encoder = {
        resolveQuerySet: vi.fn(),
        copyBufferToBuffer: vi.fn(),
    } as unknown as GPUCommandEncoder;
    return {
        device,
        encoder,
        stagings,
        finishMap: async () => {
            for (const r of maps.splice(0)) r();
            for (let i = 0; i < 4; i++) await Promise.resolve();
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

    it('anel de stagings: quadros seguidos resolvem sem pular enquanto há staging livre; cheio, o descarte é contado', async () => {
        const { device, encoder, stagings, finishMap } = fakeDevice(() => new BigInt64Array(72));
        const p = new GpuProfilerSystem();
        p.configureFrameProfiling(true, 8);
        p.attach(device);
        expect(stagings).toHaveLength(STAGING_RING);
        for (let i = 0; i < STAGING_RING; i++) frame(p, i, encoder, ['a']);
        expect(encoder.resolveQuerySet).toHaveBeenCalledTimes(STAGING_RING);
        expect(p.droppedFrames).toBe(0);
        frame(p, STAGING_RING, encoder, ['a']);
        expect(encoder.resolveQuerySet).toHaveBeenCalledTimes(STAGING_RING);
        expect(p.droppedFrames).toBe(1);
        await finishMap();
        frame(p, STAGING_RING + 1, encoder, ['a']);
        expect(encoder.resolveQuerySet).toHaveBeenCalledTimes(STAGING_RING + 1);
    });

    it('cada quadro do anel vira a sua leitura, na ordem; uma leitura velha não substitui uma nova', async () => {
        let value = 0n;
        const { device, encoder, finishMap } = fakeDevice(() => {
            const ns = new BigInt64Array(72);
            ns[65] = value;
            return ns;
        });
        const p = new GpuProfilerSystem();
        p.configureFrameProfiling(true, 8);
        p.attach(device);
        frame(p, 7, encoder, ['a']);
        frame(p, 8, encoder, ['a']);
        value = 4_000_000n;
        await finishMap();
        expect(p.lastFrameReading?.gpuFrame).toBe(8);
        expect(p.lastFrameReading?.gpuTimeMs).toBe(4);
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

describe('GpuProfilerSystem — granularidade por quadro total', () => {
    it('início no primeiro passe, fim nos passes de render; compute seguinte sem timestamp', async () => {
        const ns = new BigInt64Array(64 + 8);
        ns[64] = 1_000_000n;
        ns[65] = 3_500_000n;
        const { device, encoder, finishMap } = fakeDevice(() => ns);
        const p = new GpuProfilerSystem();
        p.configureFrameProfiling(true, 8, 'frame');
        p.attach(device);
        p.beginFrame(4);
        const writes = [
            p.passTimestampWrites('LCPFlow.step', undefined, 'compute'),
            p.passTimestampWrites('LCPFlow.solve', undefined, 'compute'),
            p.passTimestampWrites('ForwardFlow', undefined, 'render'),
            p.passTimestampWrites('PostFlow', undefined, 'render'),
        ].map((w) =>
            w === undefined
                ? undefined
                : { begin: w.beginningOfPassWriteIndex, end: w.endOfPassWriteIndex },
        );
        expect(writes).toEqual([
            { begin: 64, end: undefined },
            undefined,
            { begin: undefined, end: 65 },
            { begin: undefined, end: 65 },
        ]);
        p.resolveOnto(encoder);
        p.submitFrame();
        await finishMap();
        expect(p.lastFrameReading).toEqual({
            gpuTimeMs: 2.5,
            gpuFrame: 4,
            stagesNs: { frame: 2_500_000 },
        });
    });

    it('cada gravação abre o seu par', () => {
        const { device } = fakeDevice(() => new BigInt64Array(72));
        const p = new GpuProfilerSystem();
        p.configureFrameProfiling(true, 8, 'frame');
        p.attach(device);
        p.beginFrame(0);
        expect(p.passTimestampWrites('a')?.beginningOfPassWriteIndex).toBe(64);
        p.beginFrame(1);
        expect(p.passTimestampWrites('b')?.beginningOfPassWriteIndex).toBe(64);
    });
});
