import { afterEach, describe, expect, it, vi } from 'vitest';
import { DebugFlow } from '../flows/DebugFlow';
import { InteractionSystem } from '../input/InteractionSystem';
import { FpsController } from '../input/controllers/FpsController';
import { Application } from '../app/Application';
import { Camera } from '../../elements/scene/Camera';
import { DefaultEventBus } from '../../scene/events/DefaultEventBus';
import { createScene } from '../../scene/SceneContext';
import { fakeSceneCore } from '../../scene/__tests__/helpers/fakeSceneCore';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('liberação de ouvintes (R14)', () => {
    it('DebugFlow.dispose remove frameTick, frameComplete e keydown', () => {
        const events = new DefaultEventBus();
        const add = vi.spyOn(window, 'addEventListener');
        const remove = vi.spyOn(window, 'removeEventListener');
        const debug = new DebugFlow({ events });
        expect(events.listenerCount('frameTick')).toBe(1);
        expect(events.listenerCount('frameComplete')).toBe(1);
        const keydown = add.mock.calls.find((c) => c[0] === 'keydown')?.[1];
        debug.dispose();
        expect(events.listenerCount()).toBe(0);
        expect(remove).toHaveBeenCalledWith('keydown', keydown);
    });

    it('DebugFlow se inscreve uma vez, na construção', () => {
        const events = new DefaultEventBus();
        const debug = new DebugFlow({ events });
        expect(events.listenerCount()).toBe(2);
        debug.dispose();
    });

    it('InteractionSystem.detach remove frameTick; dispose também descarta os controllers', () => {
        const events = new DefaultEventBus();
        const canvas = document.createElement('canvas');
        const system = new InteractionSystem({ canvas, window }, events);
        system.attach();
        expect(events.listenerCount('frameTick')).toBe(1);
        system.detach();
        expect(events.listenerCount('frameTick')).toBe(0);
        system.attach();
        const controller = new FpsController(new Camera(), { canvas });
        const disposeController = vi.spyOn(controller, 'dispose');
        system.addController(controller);
        system.dispose();
        expect(events.listenerCount('frameTick')).toBe(0);
        expect(disposeController).toHaveBeenCalledOnce();
    });

    it('FpsController.dispose remove o clique do canvas', () => {
        const canvas = document.createElement('canvas');
        const add = vi.spyOn(canvas, 'addEventListener');
        const remove = vi.spyOn(canvas, 'removeEventListener');
        const controller = new FpsController(new Camera(), { canvas });
        const click = add.mock.calls.find((c) => c[0] === 'click')?.[1];
        expect(click).toBeDefined();
        controller.dispose();
        expect(remove).toHaveBeenCalledWith('click', click);
    });
});

describe('Application em cena compartilhada', () => {
    async function app(scene: ReturnType<typeof createScene>): Promise<Application> {
        return Application.create({
            canvas: document.createElement('canvas'),
            scene,
            autoResize: false,
        });
    }

    it('duas aplicações não duplicam estágios; a última desregistra os padrão', async () => {
        const scene = createScene({ core: fakeSceneCore().core });
        const baseline = scene.events.listenerCount();
        const a = await app(scene);
        const flowsAfterA = [...scene.flows.allFlows()].length;
        const b = await app(scene);
        expect([...scene.flows.allFlows()].length).toBe(flowsAfterA);
        expect(a.defaults).toBe(b.defaults);
        a.dispose();
        expect([...scene.flows.allFlows()].length).toBe(flowsAfterA);
        b.dispose();
        expect([...scene.flows.allFlows()]).toEqual([]);
        // A cena (passada em options.scene) foi descartada com a última aplicação: nenhum ouvinte sobra.
        expect(scene.events.listenerCount()).toBeLessThanOrEqual(baseline);
        expect(scene.events.listenerCount()).toBe(0);
    });

    it('a primeira aplicação descartada não derruba a cena da outra', async () => {
        const { core } = fakeSceneCore();
        const scene = createScene({ core });
        const a = await app(scene);
        const b = await app(scene);
        a.dispose();
        expect(core.shutdown).not.toHaveBeenCalled();
        b.dispose();
        expect(core.shutdown).toHaveBeenCalledOnce();
    });
});
