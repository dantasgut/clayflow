import { describe, expect, it, vi } from 'vitest';
import { GpuResourceStore } from '../GpuResourceStore';

describe('GpuResourceStore', () => {
    it('has/get retornam falsy quando vazio', () => {
        const s = new GpuResourceStore();
        expect(s.has('x')).toBe(false);
        expect(s.get('x')).toBeUndefined();
    });

    it('set + has + get reflectem CRUD', () => {
        const s = new GpuResourceStore();
        const fakeBuf = { destroy: () => {} } as unknown as GPUBuffer;
        s.set('h1', fakeBuf);
        expect(s.has('h1')).toBe(true);
        expect(s.get<GPUBuffer>('h1')).toBe(fakeBuf);
    });

    it('require lança quando ausente', () => {
        const s = new GpuResourceStore();
        expect(() => s.require('h1', 'buffer')).toThrow(/missing buffer/);
    });

    it('delete remove e devolve true só na primeira', () => {
        const s = new GpuResourceStore();
        const fake = { destroy: () => {} } as unknown as GPUBuffer;
        s.set('h1', fake);
        expect(s.delete('h1')).toBe(true);
        expect(s.delete('h1')).toBe(false);
    });

    it('clear destrói objetos com .destroy()', () => {
        const s = new GpuResourceStore();
        const destroy1 = vi.fn();
        const destroy2 = vi.fn();
        s.set('a', { destroy: destroy1 } as unknown as GPUBuffer);
        s.set('b', { destroy: destroy2 } as unknown as GPUBuffer);
        s.clear();
        expect(destroy1).toHaveBeenCalledOnce();
        expect(destroy2).toHaveBeenCalledOnce();
        expect(s.has('a')).toBe(false);
    });

    it('clear ignora exceptions de destroy (best-effort)', () => {
        const s = new GpuResourceStore();
        s.set('bad', {
            destroy: () => {
                throw new Error('boom');
            },
        } as unknown as GPUBuffer);
        expect(() => {
            s.clear();
        }).not.toThrow();
    });
});
