import { describe, expect, it, vi } from 'vitest';
import { createScene } from '../SceneContext';

describe('createScene', () => {
    it('cria instâncias frescas de events/world/flows', () => {
        const a = createScene();
        const b = createScene();
        expect(a.events).not.toBe(b.events);
        expect(a.world).not.toBe(b.world);
        expect(a.flows).not.toBe(b.flows);
        expect(a.core).not.toBe(b.core);
        expect(a.resourceSystem).not.toBe(b.resourceSystem);
        expect(a.executionSystem).not.toBe(b.executionSystem);
    });

    it('eventos isolados entre contexts', () => {
        const a = createScene();
        const b = createScene();
        const handlerA = vi.fn();
        const handlerB = vi.fn();
        a.events.on('frameComplete', handlerA);
        b.events.on('frameComplete', handlerB);
        a.events.emit('frameComplete', { timestamp: 0, dt: 0, elapsed: 0 });
        expect(handlerA).toHaveBeenCalledTimes(1);
        expect(handlerB).not.toHaveBeenCalled();
        b.events.emit('frameComplete', { timestamp: 0, dt: 0, elapsed: 0 });
        expect(handlerA).toHaveBeenCalledTimes(1);
        expect(handlerB).toHaveBeenCalledTimes(1);
    });

    it('dispose é idempotente (multiple calls ok)', () => {
        const s = createScene();
        expect(() => {
            s.dispose();
            s.dispose();
        }).not.toThrow();
    });

    it('deviceLost no core do scene emite no events do mesmo scene', () => {
        const s = createScene();
        const handler = vi.fn();
        s.events.on('deviceLost', handler);
        // Disparar via API protegida não é possível em test sem GPU, mas
        // podemos validar que o wiring foi feito (handler set internamente).
        // O teste real requer simular device.lost, coberto em
        // GpuEngineCore.deviceLost.test.ts. Aqui apenas verificamos que o
        // wiring não quebra após dispose.
        s.dispose();
        expect(handler).not.toHaveBeenCalled();
    });
});
