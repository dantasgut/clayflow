import { describe, expect, it } from 'vitest';
import { Scene } from '../scene/Scene';
import { Transform } from '../scene/Transform';
import { BoxGeometry } from '../geometry/BoxGeometry';
import { World, ReuseError } from '../../scene/world/World';
import { DefaultEventBus } from '../../scene/events/DefaultEventBus';

function setup() {
    const world = new World(new DefaultEventBus());
    return { world, scene: new Scene(world) };
}

const box = () => new BoxGeometry().add(new Transform());

describe('Scene.add (D5 item 7)', () => {
    it('insere no World, anexa como filho e devolve a cena (encadeável)', () => {
        const { world, scene } = setup();
        const a = box();
        const b = box();
        expect(scene.add(a).add(b)).toBe(scene);
        expect(world.entityIdOf(a)).toBeDefined();
        expect(world.entityIdOf(b)).toBeDefined();
        expect(scene.attached).toEqual([a, b]);
    });

    it('addEntity insere, anexa e devolve o EntityId', () => {
        const { world, scene } = setup();
        const a = box();
        const id = scene.addEntity(a);
        expect(world.entityIdOf(a)).toBe(id);
        expect(scene.attached).toEqual([a]);
    });

    it('reuso de instância lança ReuseError e não anexa de novo', () => {
        const { scene } = setup();
        const a = box();
        scene.add(a);
        expect(() => scene.add(a)).toThrow(ReuseError);
        expect(() => scene.addEntity(a)).toThrow(ReuseError);
        expect(scene.attached).toEqual([a]);
    });

    it('Entity.add de outra entidade continua só anexando (sem inserir)', () => {
        const { world } = setup();
        const parent = box();
        const child = new Transform();
        parent.add(child);
        expect(parent.attached).toContain(child);
        expect(world.entityIdOf(parent)).toBeUndefined();
    });
});
