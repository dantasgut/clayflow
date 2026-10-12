import { describe, expect, it, vi } from 'vitest';
import { createScene } from '../../../scene/SceneContext';
import { fakeSceneCore } from '../../../scene/__tests__/helpers/fakeSceneCore';
import { SingletonResolver } from '../../../scene/consumers/strategies/SingletonResolver';
import type { ConsumerResolver } from '../../../scene/consumers/ConsumerResolver';
import type { ConsumerResolverRegistry } from '../../../scene/consumers/ConsumerResolverRegistry';
import { Camera } from '../../../elements/scene/Camera';
import { GravityField } from '../../../elements/physics/forcefields/GravityField';
import { Application } from '../Application';

vi.mock('../../flows/defaults', () => ({
    registerPresentationDefaults: () => ({}),
    releasePresentationDefaults: () => true,
}));

async function app(consumers?: (r: ConsumerResolverRegistry) => void) {
    const scene = createScene({ core: fakeSceneCore().core });
    const a = await Application.create({
        canvas: document.createElement('canvas'),
        scene,
        autoResize: false,
        ...(consumers !== undefined ? { consumers } : {}),
    });
    return { a, scene };
}

describe('Application — resolvers de consumes', () => {
    it('registra os resolvers padrão da C3 (Camera, GravityField, ParticleMaterial)', async () => {
        const { scene } = await app();
        for (const name of ['Camera', 'GravityField', 'ParticleMaterial']) {
            expect(scene.consumers.get(name)).toBeInstanceOf(SingletonResolver);
        }
        scene.world.insert(new Camera());
        expect(
            scene.consumers.resolve('Camera', {
                world: scene.world,
                resources: scene.resourceSystem,
            }),
        ).toMatchObject({
            kind: 'buffer',
        });
    });

    it('options.consumers registra resolvers da aplicação, inclusive substituindo um padrão', async () => {
        const custom: ConsumerResolver = {
            name: 'GravityField',
            typeName: 'GravityField',
            resolve: () => undefined,
        };
        const wind: ConsumerResolver = { name: 'Wind', typeName: 'Wind', resolve: () => undefined };
        const { scene } = await app((r) => {
            r.register(custom);
            r.register(wind);
        });
        expect(scene.consumers.get('GravityField')).toBe(custom);
        expect(scene.consumers.get('Wind')).toBe(wind);
        void GravityField;
    });

    it('uma segunda Application na mesma cena não substitui o resolver da aplicação', async () => {
        const custom: ConsumerResolver = {
            name: 'Camera',
            typeName: 'Camera',
            resolve: () => undefined,
        };
        const { scene } = await app((r) => {
            r.register(custom);
        });
        await Application.create({
            canvas: document.createElement('canvas'),
            scene,
            autoResize: false,
        });
        expect(scene.consumers.get('Camera')).toBe(custom);
    });
});
