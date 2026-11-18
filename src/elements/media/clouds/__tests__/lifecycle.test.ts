import { describe, expect, it } from 'vitest';
import { renderScene } from '../../../../presentation/flows/__tests__/helpers/renderHarness';
import { registerPresentationDefaults } from '../../../../presentation/flows/defaults';
import { BoxGeometry } from '../../../geometry/BoxGeometry';
import { StandardMaterial } from '../../../material/StandardMaterial';
import { Camera } from '../../../scene/Camera';
import { DirectionalLight } from '../../../scene/DirectionalLight';
import { Transform } from '../../../scene/Transform';
import { Sky } from '../../../scene/sky/Sky';
import { CloudLayer } from '../CloudLayer';

// Ciclo de vida do céu e das nuvens (spec 041): tirar o `Sky` ou a `CloudLayer` da cena (e pôr de volta) não deixa
// nenhum estágio esperando um recurso que saiu — o motor volta a ficar pronto (`whenReady`).

async function scene() {
    const s = await renderScene();
    registerPresentationDefaults(s.scene.flows, { world: s.scene.world, events: s.scene.events });
    const world = s.scene.world;
    world.insert(new Camera().add(new Transform({ position: [0, 2, 10, 1] })));
    const sun = new DirectionalLight({ direction: [-0.3, -0.6, -0.7, 0], intensity: 100000 });
    world.insert(sun);
    world.insert(
        new BoxGeometry({ size: [1, 1, 1] })
            .add(new StandardMaterial({ albedo: [1, 1, 1, 1] }))
            .add(new Transform()),
    );
    const settle = async (): Promise<void> => {
        for (let i = 0; i < 12; i++) {
            s.step();
            for (let k = 0; k < 30; k++) await Promise.resolve();
        }
    };
    const pending = (): string[] =>
        s.scene.resourceSystem.readiness.pending.map(
            (p) =>
                `${p.flow}/${p.pipeline} (${p.reason}${p.name !== undefined ? `: ${p.name}` : ''})`,
        );
    return { s, world, sun, settle, pending };
}

describe('ciclo de vida do céu e das nuvens (spec 041)', () => {
    it('tirar o Sky com a CloudLayer na cena: o motor volta a ficar pronto; pôr de volta, de novo', async () => {
        const { world, sun, settle, pending } = await scene();
        const sky = new Sky({ sun });
        world.insert(sky);
        world.insert(new CloudLayer());
        await settle();
        expect(pending()).toEqual([]);
        world.remove(sky);
        await settle();
        expect(pending()).toEqual([]);
        world.insert(new Sky({ sun }));
        await settle();
        expect(pending()).toEqual([]);
    });

    it('tirar a CloudLayer e depois o Sky: pronto em cada passo', async () => {
        const { world, sun, settle, pending } = await scene();
        const sky = new Sky({ sun });
        const clouds = new CloudLayer();
        world.insert(sky);
        world.insert(clouds);
        await settle();
        expect(pending()).toEqual([]);
        world.remove(clouds);
        await settle();
        expect(pending()).toEqual([]);
        world.remove(sky);
        await settle();
        expect(pending()).toEqual([]);
    });

    it('só o Sky, tirado: pronto', async () => {
        const { world, sun, settle, pending } = await scene();
        const sky = new Sky({ sun });
        world.insert(sky);
        await settle();
        expect(pending()).toEqual([]);
        world.remove(sky);
        await settle();
        expect(pending()).toEqual([]);
    });
});
