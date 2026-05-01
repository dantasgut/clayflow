import { describe, expect, it, vi } from 'vitest';
import { DefaultEventBus } from '../events/DefaultEventBus';

describe('DefaultEventBus', () => {
    it('on/emit entrega payload', () => {
        const bus = new DefaultEventBus();
        const fn = vi.fn();
        bus.on('frameTick', fn);
        bus.emit('frameTick', { dt: 0.016, elapsed: 1 });
        expect(fn).toHaveBeenCalledWith({ dt: 0.016, elapsed: 1 });
    });

    it('off cancela inscrição', () => {
        const bus = new DefaultEventBus();
        const fn = vi.fn();
        bus.on('frameTick', fn);
        bus.off('frameTick', fn);
        bus.emit('frameTick', { dt: 0, elapsed: 0 });
        expect(fn).not.toHaveBeenCalled();
    });

    it('handler retornado de on cancela', () => {
        const bus = new DefaultEventBus();
        const fn = vi.fn();
        const off = bus.on('frameTick', fn);
        off();
        bus.emit('frameTick', { dt: 0, elapsed: 0 });
        expect(fn).not.toHaveBeenCalled();
    });

    it('emit sem listeners não lança', () => {
        const bus = new DefaultEventBus();
        expect(() => {
            bus.emit('frameTick', { dt: 0, elapsed: 0 });
        }).not.toThrow();
    });

    it('múltiplos handlers recebem em ordem', () => {
        const bus = new DefaultEventBus();
        const order: number[] = [];
        bus.on('frameTick', () => order.push(1));
        bus.on('frameTick', () => order.push(2));
        bus.on('frameTick', () => order.push(3));
        bus.emit('frameTick', { dt: 0, elapsed: 0 });
        expect(order).toEqual([1, 2, 3]);
    });

    it('unsubscribe durante emit não corrompe iteração', () => {
        const bus = new DefaultEventBus();
        const calls: string[] = [];
        const off2 = bus.on('frameTick', () => {
            calls.push('b');
            off2();
        });
        bus.on('frameTick', () => calls.push('a'));
        bus.on('frameTick', () => calls.push('c'));
        bus.emit('frameTick', { dt: 0, elapsed: 0 });
        expect(calls).toContain('a');
        expect(calls).toContain('b');
        expect(calls).toContain('c');
    });
});
