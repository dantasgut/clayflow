import { describe, expect, it } from 'vitest';
import { ColliderSet, NO_OWNER } from '../colliders/ColliderSet';
import { BoxCollider } from '../colliders/BoxCollider';
import { PlaneCollider } from '../colliders/PlaneCollider';
import { SphereCollider } from '../colliders/SphereCollider';
import { SurfaceCollider } from '../colliders/SurfaceCollider';
import { SurfacePhysics } from '../wetting/SurfacePhysics';
import { RigidBody } from '../bodies/RigidBody';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import { World } from '../../../scene/world/World';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import type { StorageBufferSpec } from '../../../scene/contracts/gpu';

/** Fontes do conjunto de colliders pelo nome da variável (para conferir). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function byName(m: ReadonlyMap<{ readonly name: string }, unknown>): Record<string, any> {
    return Object.fromEntries([...m].map(([r, v]) => [r.name, v]));
}

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

    it('pools ausentes recebem buffers mínimos; fontes do grupo de colliders sempre válidas', () => {
        const s = setup();
        s.set.refresh();
        const src = byName(s.set.sources());
        expect(src.collider_counts!.subkind).toBe('uniform');
        expect(
            Object.entries(src)
                .filter(([k]) => k !== 'collider_counts')
                .every(([, v]) => v.subkind === 'storage'),
        ).toBe(true);
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
        const counts = byName(s.set.sources()).collider_counts;
        expect(lastU32(s.writes, counts as StorageBufferSpec).slice(0, 8)).toEqual([
            1, 0, 2, 0, 0, 0, 0, 0,
        ]);
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

    it('superfícies (spec 010): contagem e campo pelo pool ou substituto', () => {
        const s = setup();
        s.world.insert(new SurfaceCollider({ mode: 'height', resolution: [4, 4] }));
        s.set.refresh();
        expect(s.set.surfaceCount).toBe(1);
        const counts = byName(s.set.sources()).collider_counts;
        const words = lastU32(s.writes, counts as StorageBufferSpec);
        expect(words.slice(0, 8)).toEqual([0, 0, 0, 0, 1, 0, 0, 0]);
        // Início do campo do colisor 0 (slot do pool de campo).
        expect(words[8]).toBe(0);
        expect(byName(s.set.sources()).collider_surface_field).toBe(s.set.fieldBuffer());
    });

    it('mapa de donos comum: caixas a partir de 0, esferas a partir do total de caixas (sphere_owner_base)', () => {
        const s = setup();
        s.world.insert(new BoxCollider({ halfExtents: [1, 1, 1, 0] }));
        s.world.insert(new SphereCollider({ radius: 1 }));
        s.world.insert(new SphereCollider({ radius: 2 }));
        s.set.refresh();
        const src = byName(s.set.sources());
        expect(lastU32(s.writes, src.collider_counts as StorageBufferSpec).slice(0, 8)).toEqual([
            0, 1, 2, 0, 0, 1, 0, 0,
        ]);
        expect(lastU32(s.writes, src.collider_owners as StorageBufferSpec).slice(0, 3)).toEqual([
            NO_OWNER,
            NO_OWNER,
            NO_OWNER,
        ]);
    });

    it('superfície física de cada collider (spec 034): a entrada da SurfacePhysics da entidade, 0 sem ela', () => {
        const s = setup();
        s.world.insert(new PlaneCollider());
        s.world.insert(new BoxCollider().add(new SurfacePhysics(SurfacePhysics.CONCRETE)));
        s.world.insert(
            new SphereCollider({ radius: 1 }).add(new SurfacePhysics(SurfacePhysics.GLASS)),
        );
        s.world.insert(new SphereCollider({ radius: 2 }));
        s.set.refresh();
        const src = byName(s.set.sources());
        // Planos, caixas, esferas: o plano sem, a caixa a 1ª superfície da cena, as esferas a 2ª e sem.
        expect(lastU32(s.writes, src.collider_surfaces as StorageBufferSpec).slice(0, 4)).toEqual([
            0, 1, 2, 0,
        ]);
    });

    it('destroy libera mapas, buffers mínimos e contagens', () => {
        const s = setup();
        s.set.refresh();
        const created = Object.values(byName(s.set.sources())) as StorageBufferSpec[];
        s.set.destroy();
        for (const spec of created.filter((b) => b.discriminator?.startsWith('test_colliders'))) {
            expect(s.core.destroy).toHaveBeenCalledWith(spec);
        }
    });

    it('sources(): nomes do collider_set.wgsl, inclusive a malha (A6), com buffers mínimos para pools ausentes', () => {
        const s = setup();
        s.set.refresh();
        const src = byName(s.set.sources());
        expect(Object.keys(src).sort()).toEqual([
            'collider_bodies',
            'collider_boxes',
            'collider_counts',
            'collider_mesh_owners',
            'collider_meshes',
            'collider_owners',
            'collider_planes',
            'collider_spheres',
            'collider_surface_field',
            'collider_surfaces',
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
        expect(byName(s.set.sources()).collider_planes).toBe(
            s.resources.poolBufferSpec('PlaneCollider'),
        );
    });
});
