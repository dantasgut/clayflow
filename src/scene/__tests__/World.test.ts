import { describe, expect, it } from 'vitest';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import { StructSchema } from '../descriptors/StructSchema';
import { FieldType } from '../descriptors/FieldType';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { World } from '../world/World';

class TestEntity extends Entity implements Resource {
    static readonly schema = new StructSchema('TestEntity', { value: FieldType.f32 });
    state = ResourceState.Uninitialized;
    data: Record<string, unknown> = { value: 0 };
    getDescriptors() {
        return [{ id: 't', role: 'uniform' as const, schema: TestEntity.schema }];
    }
    getPipelineDescriptors() {
        return [];
    }
}

describe('World', () => {
    it('insert atribui EntityId crescente', () => {
        const bus = new DefaultEventBus();
        const w = new World(bus);
        const a = w.insert(new TestEntity());
        const b = w.insert(new TestEntity());
        expect(b > a).toBe(true);
    });

    it('insert idempotente para mesma entidade', () => {
        const bus = new DefaultEventBus();
        const w = new World(bus);
        const e = new TestEntity();
        const id1 = w.insert(e);
        const id2 = w.insert(e);
        expect(id1).toBe(id2);
    });

    it('queryBySchemaName encontra entidade', () => {
        const bus = new DefaultEventBus();
        const w = new World(bus);
        const e = new TestEntity();
        const id = w.insert(e);
        expect(w.queryBySchemaName('TestEntity')).toContain(id);
    });

    it('queryBySchema (via Schema) equivale a queryBySchemaName', () => {
        const bus = new DefaultEventBus();
        const w = new World(bus);
        const e = new TestEntity();
        const id = w.insert(e);
        expect(w.queryBySchema(TestEntity.schema)).toContain(id);
    });

    it('addTag + queryByTag', () => {
        const bus = new DefaultEventBus();
        const w = new World(bus);
        const id = w.insert(new TestEntity());
        w.addTag(id, 'enemy');
        expect(w.queryByTag('enemy')).toContain(id);
    });

    it('remove emite resourcesChanged + entitiesRemoved', () => {
        const bus = new DefaultEventBus();
        const w = new World(bus);
        const e = new TestEntity();
        const id = w.insert(e);
        let resourcesRemoved = 0;
        let entitiesRemoved = 0;
        bus.on('resourcesChanged', (ev) => {
            if (ev.removed.length > 0) resourcesRemoved++;
        });
        bus.on('entitiesRemoved', (ev) => {
            if (ev.entityIds.includes(id)) entitiesRemoved++;
        });
        w.remove(e);
        expect(resourcesRemoved).toBe(1);
        expect(entitiesRemoved).toBe(1);
    });

    it('remove limpa indices', () => {
        const bus = new DefaultEventBus();
        const w = new World(bus);
        const e = new TestEntity();
        const id = w.insert(e);
        w.addTag(id, 'foo');
        w.remove(e);
        expect(w.queryBySchemaName('TestEntity')).not.toContain(id);
        expect(w.queryByTag('foo')).not.toContain(id);
        expect(w.entityIdOf(e)).toBeUndefined();
    });

    it('entityIdOfResource resolve resource→entityId', () => {
        const bus = new DefaultEventBus();
        const w = new World(bus);
        const e = new TestEntity();
        const id = w.insert(e);
        expect(w.entityIdOfResource(e)).toBe(id);
    });

    it('resources colocados como `parts` mapeiam para o root', () => {
        const bus = new DefaultEventBus();
        const w = new World(bus);
        const root = new TestEntity();
        const child = new TestEntity();
        root.add(child);
        const rootId = w.insert(root);
        expect(w.entityIdOfResource(child)).toBe(rootId);
        expect(w.resourcesOf(rootId)).toContain(root);
        expect(w.resourcesOf(rootId)).toContain(child);
    });
});
