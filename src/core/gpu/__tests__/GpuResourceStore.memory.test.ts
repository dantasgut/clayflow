import { describe, expect, it } from 'vitest';
import { GpuResourceStore } from '../GpuResourceStore';

function fakeBuffer(): GPUBuffer {
    return { destroy: () => undefined } as unknown as GPUBuffer;
}

describe('GpuResourceStore.memoryUsage', () => {
    it('store vazio retorna zero bytes', () => {
        const store = new GpuResourceStore();
        const u = store.memoryUsage();
        expect(u.totalBytes).toBe(0);
        expect(u.bufferBytes).toBe(0);
        expect(u.textureBytes).toBe(0);
        expect(u.top).toHaveLength(0);
    });

    it('set acumula bytes por kind', () => {
        const store = new GpuResourceStore();
        store.set('h1', fakeBuffer(), 'buffer', 1024, 'a');
        store.set('h2', fakeBuffer(), 'buffer', 2048, 'b');
        store.set('h3', fakeBuffer(), 'texture', 4096, 'tex');
        const u = store.memoryUsage();
        expect(u.bufferBytes).toBe(3072);
        expect(u.textureBytes).toBe(4096);
        expect(u.totalBytes).toBe(7168);
    });

    it('top retorna allocations ordenadas decrescentes', () => {
        const store = new GpuResourceStore();
        store.set('small', fakeBuffer(), 'buffer', 100, 'small');
        store.set('big', fakeBuffer(), 'buffer', 10000, 'big');
        store.set('mid', fakeBuffer(), 'buffer', 1000, 'mid');
        const u = store.memoryUsage(2);
        expect(u.top).toHaveLength(2);
        expect(u.top[0]?.label).toBe('big');
        expect(u.top[1]?.label).toBe('mid');
    });

    it('delete decrementa bytes', () => {
        const store = new GpuResourceStore();
        store.set('h1', fakeBuffer(), 'buffer', 1024);
        store.set('h2', fakeBuffer(), 'buffer', 2048);
        expect(store.memoryUsage().bufferBytes).toBe(3072);
        store.delete('h1');
        expect(store.memoryUsage().bufferBytes).toBe(2048);
    });

    it('clear zera tudo', () => {
        const store = new GpuResourceStore();
        store.set('h1', fakeBuffer(), 'buffer', 1024);
        store.set('h2', fakeBuffer(), 'texture', 4096);
        store.clear();
        const u = store.memoryUsage();
        expect(u.totalBytes).toBe(0);
        expect(u.top).toHaveLength(0);
    });

    it('set duplo no mesmo hash não duplica bytes', () => {
        const store = new GpuResourceStore();
        store.set('h1', fakeBuffer(), 'buffer', 1024);
        store.set('h1', fakeBuffer(), 'buffer', 2048);
        expect(store.memoryUsage().bufferBytes).toBe(2048);
    });

    it('"other" kind não conta para totais (pipelines, samplers, etc.)', () => {
        const store = new GpuResourceStore();
        store.set('pipe', fakeBuffer(), 'other', 99999);
        const u = store.memoryUsage();
        expect(u.bufferBytes).toBe(0);
        expect(u.textureBytes).toBe(0);
        expect(u.totalBytes).toBe(0);
    });
});
