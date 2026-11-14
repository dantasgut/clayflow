import { describe, expect, it, vi } from 'vitest';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { Time } from '../../../scene/time/Time';
import { GameLoop } from '../GameLoop';
import type { FrameScheduler } from '../FrameScheduler';

/** Agendador manual: guarda os callbacks e os executa a pedido. */
function manualScheduler() {
    const pending = new Map<number, () => void>();
    let next = 1;
    const scheduler: FrameScheduler = {
        request: vi.fn((cb: () => void) => {
            const id = next++;
            pending.set(id, cb);
            return id;
        }),
        cancel: vi.fn((id: unknown) => {
            pending.delete(id as number);
        }),
    };
    const flush = () => {
        const cbs = [...pending.values()];
        pending.clear();
        for (const cb of cbs) cb();
    };
    return { scheduler, pending, flush };
}

describe('GameLoop — agendador do ambiente (spec 038)', () => {
    it('start agenda pelo agendador; cada quadro emite frameTick e agenda o seguinte; stop cancela', () => {
        const events = new DefaultEventBus();
        const ticks = vi.fn();
        events.on('frameTick', ticks);
        const { scheduler, pending, flush } = manualScheduler();
        const loop = new GameLoop(events, new Time(), () => true, scheduler);
        loop.start();
        expect(scheduler.request).toHaveBeenCalledOnce();
        flush();
        expect(ticks).toHaveBeenCalledOnce();
        expect(pending.size).toBe(1);
        loop.stop();
        expect(scheduler.cancel).toHaveBeenCalledOnce();
        expect(pending.size).toBe(0);
    });

    it('com o motor preparando (holdsTime), o quadro sai com tempo zero; pronto, o tempo anda', async () => {
        const events = new DefaultEventBus();
        const dts: number[] = [];
        events.on('frameTick', (e) => dts.push(e.dt));
        const { scheduler, flush } = manualScheduler();
        let held = true;
        const time = new Time();
        const loop = new GameLoop(
            events,
            time,
            () => true,
            scheduler,
            () => held,
        );
        loop.start();
        await new Promise((r) => setTimeout(r, 20));
        flush();
        expect(dts).toEqual([0]);
        expect(time.simulated).toBe(0);
        held = false;
        await new Promise((r) => setTimeout(r, 20));
        flush();
        expect(dts[1]).toBeGreaterThan(0);
        loop.stop();
    });

    it('sem agendador: start lança nomeando os pontos de entrada; advance (o step) funciona', () => {
        const events = new DefaultEventBus();
        const ticks = vi.fn();
        events.on('frameTick', ticks);
        const loop = new GameLoop(events, new Time());
        expect(() => {
            loop.start();
        }).toThrow(/clayflow\/web/);
        loop.advance(1 / 60);
        expect(ticks).toHaveBeenCalledOnce();
    });
});
