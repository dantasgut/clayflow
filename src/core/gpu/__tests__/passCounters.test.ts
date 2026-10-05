import { describe, expect, it, vi } from 'vitest';
import { FrameCounters } from '../FrameCounters';
import { GpuResourceStore } from '../GpuResourceStore';
import { GpuBundleRenderPass } from '../passes/GpuBundleRenderPass';
import { GpuComputePass } from '../passes/GpuComputePass';
import { GpuRenderPass } from '../passes/GpuRenderPass';
import { specHash } from '../specHash';
import type { BundleSpec, IndirectBufferSpec } from '../../contracts/index';

const indirect: IndirectBufferSpec = {
    kind: 'buffer',
    subkind: 'indirect',
    discriminator: 'ind',
    byteSize: 20,
};

function storeWith(entries: readonly [object, unknown][]): GpuResourceStore {
    const store = new GpuResourceStore();
    for (const [spec, obj] of entries) {
        store.set(specHash(spec as never), obj as never, 'other', 0);
    }
    return store;
}

function renderEncoder(): GPURenderPassEncoder {
    return {
        draw: vi.fn(),
        drawIndexed: vi.fn(),
        drawIndirect: vi.fn(),
        drawIndexedIndirect: vi.fn(),
        executeBundles: vi.fn(),
        end: vi.fn(),
    } as unknown as GPURenderPassEncoder;
}

describe('contadores de quadro nos passes', () => {
    it('draw, drawIndexed, drawIndirect e drawIndexedIndirect incrementam drawCalls', () => {
        const counters = new FrameCounters();
        const pass = new GpuRenderPass(renderEncoder(), storeWith([[indirect, {}]]), counters);
        pass.draw.vertices(3).indexed(6).indirect(indirect).indexedIndirect(indirect);
        expect(counters.drawCalls).toBe(4);
        expect(counters.dispatches).toBe(0);
    });

    it('executeBundles soma os draws gravados em cada bundle', () => {
        const counters = new FrameCounters();
        const bundleEncoder = {
            draw: vi.fn(),
            drawIndexed: vi.fn(),
            finish: vi.fn(),
        } as unknown as GPURenderBundleEncoder;
        const recording = new GpuBundleRenderPass(bundleEncoder, new GpuResourceStore());
        recording.draw.vertices(3).indexed(6).indexed(6);
        expect(recording.recordedDraws).toBe(3);
        const bundleA = {} as GPURenderBundle;
        const bundleB = {} as GPURenderBundle;
        counters.bundleDraws.set(bundleA, recording.recordedDraws);
        counters.bundleDraws.set(bundleB, 2);
        const specA = { kind: 'bundle', discriminator: 'a' } as unknown as BundleSpec;
        const specB = { kind: 'bundle', discriminator: 'b' } as unknown as BundleSpec;
        const store = storeWith([
            [specA, bundleA],
            [specB, bundleB],
        ]);
        new GpuRenderPass(renderEncoder(), store, counters).bundles.execute([specA, specB]);
        expect(counters.drawCalls).toBe(5);
    });

    it('dispatchWorkgroups e dispatchWorkgroupsIndirect incrementam dispatches', () => {
        const counters = new FrameCounters();
        const encoder = {
            dispatchWorkgroups: vi.fn(),
            dispatchWorkgroupsIndirect: vi.fn(),
            end: vi.fn(),
        } as unknown as GPUComputePassEncoder;
        const pass = new GpuComputePass(encoder, storeWith([[indirect, {}]]), counters);
        pass.dispatch.workgroups(4).workgroups(1, 1, 1).workgroupsIndirect(indirect);
        expect(counters.dispatches).toBe(3);
        expect(counters.drawCalls).toBe(0);
    });

    it('reset zera os totais e preserva o registro de bundles', () => {
        const counters = new FrameCounters();
        const bundle = {};
        counters.bundleDraws.set(bundle, 4);
        counters.drawCalls = 3;
        counters.dispatches = 2;
        counters.passes = 1;
        counters.reset();
        expect([counters.drawCalls, counters.dispatches, counters.passes]).toEqual([0, 0, 0]);
        expect(counters.bundleDraws.get(bundle)).toBe(4);
    });

    it('passes sem contador continuam funcionando', () => {
        const pass = new GpuRenderPass(renderEncoder(), new GpuResourceStore());
        expect(() => pass.draw.vertices(3)).not.toThrow();
    });
});
