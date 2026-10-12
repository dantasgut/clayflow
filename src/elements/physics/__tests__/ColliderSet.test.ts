import { describe, expect, it } from 'vitest';
import { ColliderSet, NO_OWNER } from '../colliders/ColliderSet';
import { PlaneCollider } from '../colliders/PlaneCollider';
import { SphereCollider } from '../colliders/SphereCollider';
import { RigidBody } from '../bodies/RigidBody';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import { World } from '../../../scene/world/World';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import type { StorageBufferSpec } from '../../../core/contracts/index';

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const fake = fakeResourceCore();
    const resources = new ResourceSystem(fake.core, events, world);
    const set = new ColliderSet(fake.core, world, resources, { discriminator: 'test_colliders' });
    return { ...fake, world, resources, set };
}

/** Último conteúdo escrito num buffer, como u32. */
function lastU32(
    writes: ReturnType<typeof fakeResourceCore>['writes'],
    spec: StorageBufferSpec,
): number[] {
    const w = [...writes].reverse().find((x) => x.spec === spec);
    if (w === undefined) throw new Error('buffer nunca escrito');
    return Array.from(new Uint32Array(w.bytes.buffer, w.bytes.byteOffset, w.bytes.byteLength / 4));
}

describe('ColliderSet', () => {
    it('mapa de dono: collider de corpo → slot do corpo; collider sem corpo → NO_OWNER', () => {
        const s = setup();
        s.world.insert(new RigidBody({ shape: 'box', mass: 0, halfExtents: [5, 0.5, 5] }));
        s.world.insert(
            new RigidBody({ shape: 'sphere', radius: 0.3, mass: 1, position: [0, 2, 0] }),
        );
        s.world.insert(new SphereCollider({ radius: 1, center: [3, 0, 0, 1] }));
        s.set.refresh();

        const box = s.set.pool('BoxCollider');
        expect(box.count).toBe(1);
        expect(lastU32(s.writes, box.owners)[0]).toBe(0); // corpo do chão no slot 0 do LCPSchema

        const sphere = s.set.pool('SphereCollider');
        expect(sphere.count).toBe(2);
        const owners = lastU32(s.writes, sphere.owners);
        expect(owners[0]).toBe(1); // esfera dinâmica (slot 1 do LCPSchema)
        expect(owners[1]).toBe(NO_OWNER); // collider solto, estático
        expect(s.set.totalCount).toBe(3);
    });

    it('pools ausentes recebem buffers mínimos; bindings do grupo 2 sempre válidos', () => {
        const s = setup();
        s.set.refresh();
        const b = s.set.bindings();
        expect(b.map((x) => x.binding)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(b[0]!.type).toBe('uniform');
        expect(b.slice(1).every((x) => x.type === 'read-only-storage')).toBe(true);
        expect(s.set.pool('PlaneCollider').count).toBe(0);
        expect(s.set.pool('PlaneCollider').buffer.byteSize).toBeGreaterThanOrEqual(
            PlaneCollider.schema.stride,
        );
        expect(s.set.bodiesBuffer().discriminator).toBe('test_colliders_empty_LCPSchema');
    });

    it('contagens escritas pelo schema ColliderSetCounts', () => {
        const s = setup();
        s.world.insert(new PlaneCollider({ normal: [0, 1, 0, 0], offset: 0 }));
        s.world.insert(new SphereCollider({ radius: 1 }));
        s.world.insert(new SphereCollider({ radius: 2 }));
        s.set.refresh();
        const counts = s.set.bindings()[0]!.buffer;
        expect(lastU32(s.writes, counts as StorageBufferSpec)).toEqual([1, 0, 2, 0]);
    });

    it('só reconstrói quando sujo; generation muda quando buffers mudam', () => {
        const s = setup();
        s.world.insert(new SphereCollider({ radius: 1 }));
        s.set.refresh();
        const g0 = s.set.generation;
        const writesBefore = s.writes.length;
        s.set.refresh();
        expect(s.writes.length).toBe(writesBefore); // nada sujo: sem reescrita
        expect(s.set.generation).toBe(g0);

        // Inserir mais colliders além da capacidade do mapa (4) recria o buffer de dono.
        for (let i = 0; i < 4; i++) s.world.insert(new SphereCollider({ radius: 1 }));
        s.set.markDirty();
        s.set.refresh();
        expect(s.set.pool('SphereCollider').count).toBe(5);
        expect(s.set.generation).toBeGreaterThan(g0);
    });

    it('realocação de pool de collider ou de corpos marca sujo; outros pools não', () => {
        const s = setup();
        s.world.insert(new SphereCollider({ radius: 1 }));
        s.set.refresh();
        const writes = s.writes.length;
        s.set.onPoolReallocated('XPBDSoftSchema');
        s.set.refresh();
        expect(s.writes.length).toBe(writes);
        s.set.onPoolReallocated('SphereCollider');
        s.set.refresh();
        expect(s.writes.length).toBeGreaterThan(writes);
    });

    it('destroy libera mapas, buffers mínimos e contagens', () => {
        const s = setup();
        s.set.refresh();
        const created = s.set.bindings().map((b) => b.buffer);
        s.set.destroy();
        for (const spec of created.filter((b) => b.discriminator?.startsWith('test_colliders'))) {
            expect(s.core.destroy).toHaveBeenCalledWith(spec);
        }
    });

    it('sources(): nomes do collider_set.wgsl, inclusive a malha (A6), com buffers mínimos para pools ausentes', () => {
        const s = setup();
        s.set.refresh();
        const src = s.set.sources();
        expect(Object.keys(src).sort()).toEqual([
            'collider_bodies',
            'collider_box_owners',
            'collider_boxes',
            'collider_counts',
            'collider_mesh_owners',
            'collider_meshes',
            'collider_plane_owners',
            'collider_planes',
            'collider_sphere_owners',
            'collider_spheres',
        ]);
        expect(src.collider_meshes).toBe(s.set.pool('MeshCollider').buffer);
    });

    it('refresh() devolve se alguma fonte mudou: primeira vez sim; sem mudança não; pool novo sim', () => {
        const s = setup();
        expect(s.set.refresh()).toBe(true);
        expect(s.set.refresh()).toBe(false);
        s.world.insert(new PlaneCollider({}));
        s.set.markDirty();
        expect(s.set.refresh()).toBe(true);
        expect(s.set.sources().collider_planes).toBe(s.resources.poolBufferSpec('PlaneCollider'));
    });
});
