import { describe, expect, it, vi } from 'vitest';
import { GpuResourceStore } from '../GpuResourceStore';

function fakeBuffer(): { obj: GPUBuffer; destroy: ReturnType<typeof vi.fn> } {
    const destroy = vi.fn();
    return { obj: { destroy } as unknown as GPUBuffer, destroy };
}

describe('GpuResourceStore — posse por spec', () => {
    it('duas specs de conteúdo igual criam uma entrada com dois donos', () => {
        const store = new GpuResourceStore();
        const a = { kind: 'buffer' };
        const b = { kind: 'buffer' };
        store.set('h', a, fakeBuffer().obj, 'buffer', 64);
        expect(store.retain('h', b)).toBe(true);
        expect(store.ownerCount('h')).toBe(2);
        expect(store.memoryUsage().bufferBytes).toBe(64);
    });

    it('release da primeira não destrói; da segunda destrói', () => {
        const store = new GpuResourceStore();
        const a = {};
        const b = {};
        const buf = fakeBuffer();
        store.set('h', a, buf.obj, 'buffer', 64);
        store.retain('h', b);
        expect(store.release('h', a)).toBe(false);
        expect(buf.destroy).not.toHaveBeenCalled();
        expect(store.has('h')).toBe(true);
        expect(store.release('h', b)).toBe(true);
        expect(buf.destroy).toHaveBeenCalledOnce();
        expect(store.has('h')).toBe(false);
        expect(store.memoryUsage().bufferBytes).toBe(0);
    });

    it('retain repetido com o mesmo objeto não duplica posse', () => {
        const store = new GpuResourceStore();
        const a = {};
        store.set('h', a, fakeBuffer().obj);
        store.retain('h', a);
        store.retain('h', a);
        expect(store.ownerCount('h')).toBe(1);
        expect(store.release('h', a)).toBe(true);
    });

    it('release de quem não é dono não altera nada', () => {
        const store = new GpuResourceStore();
        const buf = fakeBuffer();
        store.set('h', {}, buf.obj);
        expect(store.release('h', {})).toBe(false);
        expect(store.has('h')).toBe(true);
        expect(buf.destroy).not.toHaveBeenCalled();
    });

    it('retain sem entrada devolve false', () => {
        expect(new GpuResourceStore().retain('nada', {})).toBe(false);
    });

    it('clear destrói tudo, independentemente dos donos', () => {
        const store = new GpuResourceStore();
        const x = fakeBuffer();
        const y = fakeBuffer();
        store.set('x', {}, x.obj);
        store.retain('x', {});
        store.set('y', {}, y.obj);
        store.clear();
        expect(x.destroy).toHaveBeenCalledOnce();
        expect(y.destroy).toHaveBeenCalledOnce();
        expect(store.has('x')).toBe(false);
        expect(store.ownerCount('x')).toBe(0);
    });
});
