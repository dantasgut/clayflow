import { describe, expect, it, vi } from 'vitest';
import { GpuProfilerSystem } from '../profiler/GpuProfilerSystem';

function fakeDevice(timestamps: () => BigInt64Array) {
    /** Mapeamentos em voo, na ordem em que foram pedidos. */
    const maps: (() => void)[] = [];
    const created: object[] = [];
    const device = {
        features: new Set(['timestamp-query']),
        createQuerySet: vi.fn(() => ({ destroy: vi.fn() })),
        createShaderModule: vi.fn(() => ({})),
        createComputePipeline: vi.fn(() => ({ label: 'profiler.marker' })),
        createBuffer: vi.fn(() => {
            // O primeiro buffer é o de resolução; os seguintes, o anel de leitura.
            const b =
                created.length === 0
                    ? { destroy: vi.fn() }
                    : {
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
        /** Conclui o mapeamento mais antigo em voo. */
        finishMap: async () => {
            maps.shift()?.();
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
            scopesNs: { TransformFlow: 1_000_000, forward: 2_000_000 },
        });
    });

    it('escopo: o caminho dos grupos entra em scopesNs; stagesNs segue pelo rótulo', async () => {
        const ns = new BigInt64Array(64 + 8);
        ns[64] = 0n;
        ns[65] = 1_000_000n;
        ns[66] = 5_000_000n;
        ns[67] = 7_000_000n;
        const { device, encoder, finishMap } = fakeDevice(() => ns);
        const p = new GpuProfilerSystem();
        p.configureFrameProfiling(true, 8);
        p.attach(device);
        p.beginFrame(0);
        p.passTimestampWrites('trace', undefined, 'compute', 'shadow/ProbeFlow');
        p.passTimestampWrites('forward', undefined, 'render', 'forward/ForwardFlow');
        p.resolveOnto(encoder);
        p.submitFrame();
        await finishMap();
        expect(p.lastFrameReading?.scopesNs).toEqual({
            'shadow/ProbeFlow/trace': 1_000_000,
            'forward/ForwardFlow/forward': 2_000_000,
        });
        expect(p.lastFrameReading?.stagesNs).toEqual({ trace: 1_000_000, forward: 2_000_000 });
    });

    it('anel de leitura: até 3 quadros em voo; o quarto fica sem amostra e conta em droppedFrames', async () => {
        const { device, encoder, finishMap } = fakeDevice(() => new BigInt64Array(72));
        const p = new GpuProfilerSystem();
        p.configureFrameProfiling(true, 8);
        p.attach(device);
        for (let i = 0; i < 4; i++) frame(p, i, encoder, ['a']);
        expect(encoder.resolveQuerySet).toHaveBeenCalledTimes(3);
        expect(p.droppedFrames).toBe(1);
        await finishMap();
        frame(p, 4, encoder, ['a']);
        expect(encoder.resolveQuerySet).toHaveBeenCalledTimes(4);
    });

    it('cada leitura é entregue uma vez, na ordem de chegada; a última é a mais nova', async () => {
        const ns = new BigInt64Array(72);
        ns[64] = 0n;
        ns[65] = 1_000_000n;
        const { device, encoder, finishMap } = fakeDevice(() => ns);
        const p = new GpuProfilerSystem();
        p.configureFrameProfiling(true, 8);
        p.attach(device);
        frame(p, 7, encoder, ['a']);
        frame(p, 8, encoder, ['a']);
        await finishMap();
        await finishMap();
        expect(p.takeFrameReadings().map((r) => r.gpuFrame)).toEqual([7, 8]);
        expect(p.takeFrameReadings()).toEqual([]);
        expect(p.lastFrameReading?.gpuFrame).toBe(8);
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
            scopesNs: { frame: 2_500_000 },
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
