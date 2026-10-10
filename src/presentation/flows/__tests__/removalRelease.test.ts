import { describe, expect, it, vi } from 'vitest';
import { ForwardFlow } from '../ForwardFlow';
import { ShadowFlow } from '../ShadowFlow';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { World } from '../../../scene/world/World';
import { discOf, renderHarness } from './helpers/renderHarness';

function entity() {
    return new BoxGeometry()
        .add(new StandardMaterial({ albedo: [1, 1, 1, 1] }))
        .add(new Transform());
}

describe('liberação de GPU na remoção de entidade (R14)', () => {
    it('ForwardFlow destrói VBO, IBO, UBOs e bind groups da entidade; o shader é liberado só como posse', () => {
        const h = renderHarness();
        const world = new World(new DefaultEventBus());
        world.insert(new Camera());
        const a = entity();
        const b = entity();
        const idA = world.insert(a);
        const idB = world.insert(b);
        h.slots.set(idA, 0);
        h.slots.set(idB, 1);
        const flow = new ForwardFlow(h.core, world, h.pools, document.createElement('canvas'));
        flow.dispatch(h.frame);
        flow.onEntitiesRemoved([idA]);
        const destroyed = vi.mocked(h.core.destroy).mock.calls.map((c) => discOf(c[0]));
        for (const prefix of [
            'forward_vbo',
            'forward_ibo',
            'forward_camera',
            'forward_camera_bg',
            'forward_material',
            'forward_material_bg',
        ]) {
            expect(destroyed).toContain(`${prefix}:${idA}`);
            expect(destroyed).not.toContain(`${prefix}:${idB}`);
        }
        // O shader do material da entidade removida é uma spec própria (posse); a da outra entidade não é tocada.
        const shaders = h.creates.filter((c) => c.kind === 'shader');
        const destroyedSpecs = vi.mocked(h.core.destroy).mock.calls.map((c) => c[0]);
        expect(destroyedSpecs.filter((d) => shaders.includes(d as never))).toHaveLength(1);
    });

    it('ShadowFlow destrói VBO e IBO da entidade removida', () => {
        const h = renderHarness();
        const world = new World(new DefaultEventBus());
        world.insert(new DirectionalLight({ castShadow: true }));
        const id = world.insert(new BoxGeometry().add(new Transform()));
        h.slots.set(id, 0);
        const flow = new ShadowFlow(h.core, world, h.pools);
        flow.dispatch(h.frame);
        flow.onEntitiesRemoved([id]);
        const destroyed = vi.mocked(h.core.destroy).mock.calls.map((c) => discOf(c[0]));
        expect(destroyed).toContain(`shadow_vbo:${id}`);
        expect(destroyed).toContain(`shadow_ibo:${id}`);
    });

    it('remover entidade sem slot criado não destrói nada', () => {
        const h = renderHarness();
        const world = new World(new DefaultEventBus());
        world.insert(new Camera());
        const id = world.insert(entity());
        const flow = new ForwardFlow(h.core, world, h.pools, document.createElement('canvas'));
        flow.onEntitiesRemoved([id]);
        expect(h.core.destroy).not.toHaveBeenCalled();
    });
});
