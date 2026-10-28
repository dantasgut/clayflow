import { describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter, PresentationSurface } from '../contracts/gpu';
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

    it('initialize repassa a superfície, as opções e o adaptador de plataforma ao core', async () => {
        const { core } = fakeSceneCore();
        const scene = createScene({ core });
        const surface = { width: 1, height: 1, context: {} } as unknown as PresentationSurface;
        const platform = { name: 'teste' } as unknown as PlatformAdapter;
        await scene.initialize(
            surface,
            { alphaMode: 'premultiplied' },
            { powerPreference: 'low-power' },
            platform,
        );
        expect(core.initialize).toHaveBeenCalledWith(
            surface,
            { alphaMode: 'premultiplied' },
            { powerPreference: 'low-power' },
            platform,
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
