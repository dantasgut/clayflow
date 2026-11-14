import { afterEach, describe, expect, it, vi } from 'vitest';
import { DebugFlow } from '../flows/DebugFlow';
import { InteractionSystem } from '../input/InteractionSystem';
import { FpsController } from '../../platform/web/input/FpsController';
import { Application } from '../../platform/web/Application';
import { Camera } from '../../elements/scene/Camera';
import { Transform } from '../../elements/scene/Transform';
import { Input } from '../input/Input';
import { World } from '../../scene/world/World';
import { DefaultEventBus } from '../../scene/events/DefaultEventBus';
import { createScene } from '../../scene/SceneContext';
import { fakeSceneCore } from '../../scene/__tests__/helpers/fakeSceneCore';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('liberação de ouvintes (R14)', () => {
    it('DebugFlow.dispose remove frameTick, frameComplete e a tecla (keyDown do barramento, sem o DOM — spec 038)', () => {
        const events = new DefaultEventBus();
        const add = vi.spyOn(window, 'addEventListener');
        const debug = new DebugFlow({ events });
        expect(events.listenerCount('frameTick')).toBe(1);
        expect(events.listenerCount('frameComplete')).toBe(1);
        expect(events.listenerCount('keyDown')).toBe(1);
        expect(add).not.toHaveBeenCalled();
        expect(debug.isEnabled()).toBe(false);
        events.emit('keyDown', { code: 'F1' });
        expect(debug.isEnabled()).toBe(true);
        debug.dispose();
        expect(events.listenerCount()).toBe(0);
    });

    it('DebugFlow se inscreve uma vez, na construção', () => {
        const events = new DefaultEventBus();
        const debug = new DebugFlow({ events });
        // frameTick, frameComplete, gpuFrameTimed (spec 034) e keyDown (spec 038).
        expect(events.listenerCount()).toBe(4);
        debug.dispose();
        expect(events.listenerCount()).toBe(0);
    });

    it('InteractionSystem.detach remove frameTick; dispose também descarta os controllers da cena', () => {
        const events = new DefaultEventBus();
        const world = new World(events);
        const canvas = document.createElement('canvas');
        const input = new Input();
        world.insert(input);
        const system = new InteractionSystem([], events, world, input);
        system.attach();
        expect(events.listenerCount('frameTick')).toBe(1);
        system.detach();
        expect(events.listenerCount('frameTick')).toBe(0);
        system.attach();
        const controller = new FpsController({ canvas });
        const disposeController = vi.spyOn(controller, 'dispose');
        world.insert(new Camera().add(new Transform()).add(controller));
        system.dispose();
        expect(events.listenerCount('frameTick')).toBe(0);
        expect(disposeController).toHaveBeenCalledOnce();
    });

    it('FpsController.dispose remove o clique do canvas', () => {
        const canvas = document.createElement('canvas');
        const add = vi.spyOn(canvas, 'addEventListener');
        const remove = vi.spyOn(canvas, 'removeEventListener');
        const controller = new FpsController({ canvas });
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
