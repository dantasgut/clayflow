import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScene } from '../../../scene/SceneContext';
import { fakeSceneCore } from '../../../scene/__tests__/helpers/fakeSceneCore';
import type { FrameTickEvent } from '../../../scene/events/FrameTickEvent';
import { Application } from '../../../platform/web/Application';

vi.mock('../../flows/defaults', () => ({
    registerPresentationDefaults: () => ({}),
    releasePresentationDefaults: () => true,
}));

function scene() {
    return createScene({ core: fakeSceneCore().core });
}

async function app(s = scene()): Promise<Application> {
    return Application.create({
        canvas: document.createElement('canvas'),
        scene: s,
        autoResize: false,
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Application — tempo da cena e step()', () => {
    it('app.time é o Time da cena, inserido uma vez no World', async () => {
        const s = scene();
        const a = await app(s);
        expect(a.time).toBe(s.time);
        expect(s.world.queryBySchemaName('Time')).toHaveLength(1);
    });

    it('duas Applications na mesma cena compartilham o Time (sem segundo Time no World)', async () => {
        const s = scene();
        const a = await app(s);
        const b = await app(s);
        expect(a.time).toBe(b.time);
        expect(s.world.queryBySchemaName('Time')).toHaveLength(1);
    });

    it('step(1/60, 3) emite 3 frameTick com frame 1..3 e elapsed 0,05', async () => {
        const a = await app();
        const ticks: FrameTickEvent[] = [];
        a.events.on('frameTick', (e) => ticks.push(e));
        a.step(1 / 60, 3);
        expect(ticks.map((t) => t.frame)).toEqual([1, 2, 3]);
        expect(ticks[2]!.elapsed).toBeCloseTo(0.05, 12);
        expect(ticks[0]!.dt).toBeCloseTo(1 / 60, 12);
        expect(ticks[0]!.realDt).toBeCloseTo(1 / 60, 12);
        expect(a.time.steps).toBe(1);
    });

    it('step() sem argumentos avança fixedDt', async () => {
        const a = await app();
        a.time.fixedDt = 1 / 120;
        a.step();
        expect(a.time.elapsed).toBeCloseTo(1 / 120, 12);
    });

    it('frames inválido lança RangeError', async () => {
        const a = await app();
        expect(() => {
            a.step(1 / 60, 0);
        }).toThrow(RangeError);
        expect(() => {
            a.step(1 / 60, 1.5);
        }).toThrow(RangeError);
    });

    it('step() com o laço rodando lança', async () => {
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn(() => 1),
        );
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        const a = await app();
        a.start();
        expect(() => {
            a.step();
        }).toThrow(/laço/);
        a.stop();
        expect(() => {
            a.step();
        }).not.toThrow();
    });

    it('GameLoop avança com o dt medido, sem teto de 1/30', async () => {
        let rafCallback: FrameRequestCallback | null = null;
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn((cb: FrameRequestCallback) => {
                rafCallback = cb;
                return 1;
            }),
        );
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        const now = vi.spyOn(performance, 'now');
        now.mockReturnValue(1000);
        const a = await app();
        const ticks: FrameTickEvent[] = [];
        a.events.on('frameTick', (e) => ticks.push(e));
        a.start();
        now.mockReturnValue(1100); // quadro de 100 ms
        (rafCallback as unknown as FrameRequestCallback)(1100);
        a.stop();
        expect(ticks).toHaveLength(1);
        expect(ticks[0]!.realDt).toBeCloseTo(0.1, 9);
        expect(a.time.steps).toBe(4); // teto de passos — não o antigo teto de 1/30 no dt
        now.mockRestore();
    });
});
