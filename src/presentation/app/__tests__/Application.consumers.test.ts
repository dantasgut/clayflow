import { describe, expect, it, vi } from 'vitest';
import { createScene } from '../../../scene/SceneContext';
import { fakeSceneCore } from '../../../scene/__tests__/helpers/fakeSceneCore';
import { PoolResolver } from '../../../scene/consumers/strategies/PoolResolver';
import { SingletonResolver } from '../../../scene/consumers/strategies/SingletonResolver';
import type { ConsumerResolver } from '../../../scene/consumers/ConsumerResolver';
import type { ConsumerResolverRegistry } from '../../../scene/consumers/ConsumerResolverRegistry';
import { Camera } from '../../../elements/scene/Camera';
import { Transform } from '../../../elements/scene/Transform';
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
    it('registra os resolvers padrão da C3 (GravityField, ParticlePhysics); a câmera é pool (spec 007)', async () => {
        const { scene } = await app();
        for (const name of ['GravityField', 'ParticlePhysics']) {
            expect(scene.consumers.get(name)).toBeInstanceOf(SingletonResolver);
        }
        scene.world.insert(new Camera().add(new Transform()));
        for (const name of ['Camera', 'CameraMatrices']) {
            expect(scene.consumers.get(name)).toBeInstanceOf(PoolResolver);
            expect(
                scene.consumers.resolve(name, {
                    world: scene.world,
                    resources: scene.resourceSystem,
                }),
            ).toMatchObject({ kind: 'buffer' });
        }
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
