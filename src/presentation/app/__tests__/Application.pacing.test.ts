import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScene } from '../../../scene/SceneContext';
import { fakeSceneCore } from '../../../scene/__tests__/helpers/fakeSceneCore';
import type { FrameTickEvent } from '../../../scene/events/FrameTickEvent';
import { Application } from '../Application';

vi.mock('../../flows/defaults', () => ({
    registerPresentationDefaults: () => ({}),
    releasePresentationDefaults: () => true,
}));

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function setup(maxFramesInFlight?: number) {
    const { core } = fakeSceneCore();
    let inFlight = 0;
    vi.mocked(core.framesInFlight).mockImplementation(() => inFlight);
    let raf: FrameRequestCallback | null = null;
    vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((cb: FrameRequestCallback) => {
            raf = cb;
            return 1;
        }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    const app = await Application.create({
        canvas: document.createElement('canvas'),
        scene: createScene({ core }),
        autoResize: false,
        ...(maxFramesInFlight !== undefined ? { maxFramesInFlight } : {}),
    });
    const ticks: FrameTickEvent[] = [];
    app.events.on('frameTick', (e) => ticks.push(e));
    return {
        app,
        ticks,
        setInFlight: (n: number) => {
            inFlight = n;
        },
        tickAt: (ms: number) => {
            now.mockReturnValue(ms);
            (raf as unknown as FrameRequestCallback)(ms);
        },
    };
}

describe('Application — ritmo de quadros (R18)', () => {
    it('com a GPU no limite o tick não avança; com espaço avança incluindo a espera no realDt', async () => {
        const s = await setup(2);
        s.app.start();
        s.setInFlight(2);
        s.tickAt(16);
        s.tickAt(32);
        expect(s.ticks).toHaveLength(0);
        s.setInFlight(1);
        s.tickAt(48);
        expect(s.ticks).toHaveLength(1);
        expect(s.ticks[0]!.realDt).toBeCloseTo(0.048, 9);
        s.app.stop();
    });

    it('readyForFrame reflete o limite (padrão 2)', async () => {
        const s = await setup();
        s.setInFlight(1);
        expect(s.app.readyForFrame()).toBe(true);
        s.setInFlight(2);
        expect(s.app.readyForFrame()).toBe(false);
    });

    it('app.step avança mesmo sem espaço na GPU', async () => {
        const s = await setup(1);
        s.setInFlight(5);
        s.app.step(1 / 60);
        expect(s.ticks).toHaveLength(1);
    });

    it('maxFramesInFlight inválido lança', async () => {
        await expect(setup(0)).rejects.toThrow(RangeError);
        await expect(setup(1.5)).rejects.toThrow(RangeError);
    });
});
