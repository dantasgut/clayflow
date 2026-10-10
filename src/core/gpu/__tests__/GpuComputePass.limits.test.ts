import { describe, expect, it, vi } from 'vitest';
import { GpuComputePass } from '../passes/GpuComputePass';
import { GpuResourceStore } from '../GpuResourceStore';
import { FrameCounters } from '../FrameCounters';

function setup(limit = 65_535) {
    const encoder = {
        dispatchWorkgroups: vi.fn(),
        dispatchWorkgroupsIndirect: vi.fn(),
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        insertDebugMarker: vi.fn(),
        end: vi.fn(),
    };
    const counters = new FrameCounters();
    const pass = new GpuComputePass(
        encoder as unknown as GPUComputePassEncoder,
        new GpuResourceStore(),
        counters,
        limit,
    );
    return { pass, encoder, counters };
}

describe('GpuComputePass — despacho linear dentro do limite por dimensão', () => {
    it('grupos ≤ limite → despacho 1D', () => {
        const { pass, encoder } = setup();
        pass.invocations(1000, 64);
        expect(encoder.dispatchWorkgroups).toHaveBeenCalledWith(16, 1, 1);
    });

    it('grupos > limite → x = limite, y = ⌈grupos / limite⌉', () => {
        const { pass, encoder } = setup();
        const count = 70_000 * 256;
        pass.invocations(count, 256);
        expect(encoder.dispatchWorkgroups).toHaveBeenCalledWith(65_535, 2, 1);
    });

    it('cobre exatamente o necessário com limite pequeno', () => {
        const { pass, encoder } = setup(10);
        pass.invocations(64 * 25, 64); // 25 grupos
        expect(encoder.dispatchWorkgroups).toHaveBeenCalledWith(10, 3, 1);
    });

    it('invocations(0) não despacha nem conta', () => {
        const { pass, encoder, counters } = setup();
        pass.invocations(0, 64);
        expect(encoder.dispatchWorkgroups).not.toHaveBeenCalled();
        expect(counters.dispatches).toBe(0);
    });

    it('workgroups acima do limite em qualquer dimensão lança RangeError nomeando o limite', () => {
        const { pass, encoder } = setup();
        expect(() => pass.workgroups(65_536)).toThrow(RangeError);
        expect(() => pass.workgroups(1, 65_536)).toThrow(/maxComputeWorkgroupsPerDimension/);
        expect(() => pass.workgroups(1, 1, 70_000)).toThrow(/maxComputeWorkgroupsPerDimension/);
        expect(encoder.dispatchWorkgroups).not.toHaveBeenCalled();
    });

    it('contador de despachos incrementa uma vez por despacho', () => {
        const { pass, counters } = setup();
        pass.invocations(70_000 * 256, 256);
        pass.workgroups(4);
        expect(counters.dispatches).toBe(2);
    });

    it('argumentos inválidos lançam', () => {
        const { pass } = setup();
        expect(() => pass.invocations(-1, 64)).toThrow(RangeError);
        expect(() => pass.invocations(10, 0)).toThrow(RangeError);
        expect(() => pass.invocations(1.5, 64)).toThrow(RangeError);
    });
});
