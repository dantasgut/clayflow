import { describe, expect, it, vi } from 'vitest';
import { createScene } from '../SceneContext';
import { Time } from '../time/Time';
import { fakeSceneCore } from './helpers/fakeSceneCore';

describe('SceneContext — Time da cena', () => {
    it('createScene cria um Time por cena', () => {
        const a = createScene({ core: fakeSceneCore().core });
        const b = createScene({ core: fakeSceneCore().core });
        expect(a.time).toBeInstanceOf(Time);
        expect(a.time).not.toBe(b.time);
    });

    it('initialize insere o Time no World uma única vez, consultável pelo schema', async () => {
        const scene = createScene({ core: fakeSceneCore().core });
        expect(scene.world.queryBySchemaName('Time')).toHaveLength(0);
        await scene.initialize();
        await scene.initialize();
        const found = scene.world.queryBySchemaName('Time');
        expect(found).toHaveLength(1);
        expect(found[0]).toBe(scene.world.entityIdOf(scene.time));
    });

    it('initialize repassa canvas, opções de canvas e de device ao core', async () => {
        const { core } = fakeSceneCore();
        const scene = createScene({ core });
        const canvas = document.createElement('canvas');
        await scene.initialize(
            canvas,
            { alphaMode: 'premultiplied' },
            { powerPreference: 'low-power' },
        );
        expect(core.initialize).toHaveBeenCalledWith(
            canvas,
            { alphaMode: 'premultiplied' },
            { powerPreference: 'low-power' },
        );
    });

    it('timeDropped do Time sai no EventBus da cena', () => {
        const scene = createScene({ core: fakeSceneCore().core });
        const handler = vi.fn();
        scene.events.on('timeDropped', handler);
        scene.time.advance(0.25);
        expect(handler).toHaveBeenCalledOnce();
    });
});
