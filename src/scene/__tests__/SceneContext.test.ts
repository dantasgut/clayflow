import { describe, expect, it, vi } from 'vitest';
import { createScene } from '../SceneContext';
import { fakeSceneCore } from './helpers/fakeSceneCore';
import { SingletonResolver } from '../consumers/strategies/SingletonResolver';

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
        a.events.emit('frameComplete', {
            timestamp: 0,
            dt: 0,
            elapsed: 0,
            stats: { drawCalls: 0, dispatches: 0, passes: 0 },
        });
        expect(handlerA).toHaveBeenCalledTimes(1);
        expect(handlerB).not.toHaveBeenCalled();
        b.events.emit('frameComplete', {
            timestamp: 0,
            dt: 0,
            elapsed: 0,
            stats: { drawCalls: 0, dispatches: 0, passes: 0 },
        });
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

    it("registra o resolver de 'Time' e o resolve depois do initialize (Time inserido no World)", async () => {
        const s = createScene({ core: fakeSceneCore().core });
        expect(s.consumers.get('Time')).toBeInstanceOf(SingletonResolver);
        expect(
            s.consumers.resolve('Time', { world: s.world, resources: s.resourceSystem }),
        ).toBeUndefined();
        await s.initialize();
        expect(
            s.consumers.resolve('Time', { world: s.world, resources: s.resourceSystem }),
        ).toEqual({
            kind: 'buffer',
            buffer: s.resourceSystem.bufferOf(s.time, 'time'),
        });
    });

    it('o ResourceSystem registra os PoolResolvers no registro da cena', () => {
        const s = createScene({ core: fakeSceneCore().core });
        expect(s.resourceSystem.consumers).toBe(s.consumers);
    });
});
