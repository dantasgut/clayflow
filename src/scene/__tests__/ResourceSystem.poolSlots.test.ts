import { describe, expect, it } from 'vitest';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { PoolDirectory } from '../contracts/PoolDirectory';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { ResourceSystem } from '../systems/ResourceSystem';
import { World } from '../world/World';
import type { EntityId } from '../world/EntityId';
import { fakeResourceCore } from './helpers/fakeResourceCore';

const A = new StructSchema('SlotA', { v: FieldType.vec4f });
const B = new StructSchema('SlotB', { m: FieldType.mat4x4f });

class Paired extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    data: Record<string, unknown> = { v: [1, 2, 3, 4] };
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'a', role: 'storage-ro', storage: 'pool', schema: A },
            { id: 'b', role: 'storage-rw', storage: 'pool', schema: B, upload: 'never' },
        ];
    }
    getPipelineDescriptors() {
        return [];
    }
}

class OnlyA extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    data: Record<string, unknown> = { v: [0, 0, 0, 0] };
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'a', role: 'storage-ro', storage: 'pool', schema: A }];
    }
    getPipelineDescriptors() {
        return [];
    }
}

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core, writes } = fakeResourceCore();
    const resources = new ResourceSystem(core, events, world);
    const reallocs: string[] = [];
    events.on('poolReallocated', (e) => reallocs.push(e.poolKey));
    return { world, writes, resources, reallocs };
}

function expectSameSlot(resources: ResourceSystem, id: EntityId): void {
    const a = resources.poolSlotOf('SlotA', id);
    const b = resources.poolSlotOf('SlotB', id);
    expect(a).toBeDefined();
    expect(a).toBe(b);
}

describe('ResourceSystem — slot por recurso entre pools', () => {
    it('o mesmo slot em todos os pools do recurso, com recursos de um pool só intercalados', () => {
        const { world, resources } = setup();
        world.insert(new OnlyA());
        const p1 = world.insert(new Paired());
        world.insert(new OnlyA());
        const p2 = world.insert(new Paired());
        expectSameSlot(resources, p1);
        expectSameSlot(resources, p2);
        expect(resources.poolSlotOf('SlotA', p1)).not.toBe(resources.poolSlotOf('SlotA', p2));
    });

    it('remoção e reinserção reaproveitam slots mantendo a correspondência', () => {
        const { world, resources } = setup();
        const items = Array.from({ length: 6 }, () => new Paired());
        const ids = items.map((r) => world.insert(r));
        world.remove(items[1]!);
        world.remove(items[3]!);
        const fresh = [new Paired(), new OnlyA(), new Paired()];
        const freshIds = fresh.map((r) => world.insert(r));
        for (const id of [
            ...ids.filter((_, i) => i !== 1 && i !== 3),
            freshIds[0]!,
            freshIds[2]!,
        ]) {
            expectSameSlot(resources, id);
        }
    });

    it('crescimento além de 16 mantém a correspondência e não escreve dados no pool "never"', () => {
        const { world, resources, writes, reallocs } = setup();
        const ids: EntityId[] = [];
        for (let i = 0; i < 40; i++) {
            if (i % 3 === 0) world.insert(new OnlyA());
            ids.push(world.insert(new Paired()));
        }
        for (const id of ids) expectSameSlot(resources, id);
        expect(reallocs).toContain('SlotA');
        expect(reallocs).toContain('SlotB');
        const bBuffer = resources.poolBufferSpec('SlotB');
        expect(writes.some((w) => w.spec === bBuffer)).toBe(false);
        expect(resources.poolCount('SlotB')).toBeGreaterThanOrEqual(ids.length);
    });

    it('ResourceSystem satisfaz o contrato PoolDirectory', () => {
        const { resources } = setup();
        const dir: PoolDirectory = resources;
        expect(dir.poolCount('inexistente')).toBe(0);
    });
});
