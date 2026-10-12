import { describe, expect, it } from 'vitest';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { ResourceSystem } from '../systems/ResourceSystem';
import { World } from '../world/World';
import { f32At, fakeResourceCore } from './helpers/fakeResourceCore';

const Tint = new StructSchema(
    'PoolTint',
    { color: FieldType.vec4f, gain: FieldType.f32 },
    { addressSpace: 'uniform' },
);

class TintResource extends Entity implements Resource {
    static readonly schema = Tint;
    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown>;
    constructor(gain: number) {
        super();
        this.data = { color: [1, 0, 0, 1], gain };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'tint', role: 'uniform', schema: Tint, storage: 'pool' }];
    }
    getPipelineDescriptors() {
        return [];
    }
}

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const fake = fakeResourceCore();
    const system = new ResourceSystem(fake.core, events, world);
    return { events, world, system, ...fake };
}

describe('ResourceSystem — pool uniforme (R8)', () => {
    it("role 'uniform' + storage 'pool' cria buffer UNIFORM com stride alinhado a minUniformBufferOffsetAlignment", () => {
        const { world, system } = setup();
        world.insert(new TintResource(1));
        const pool = system.poolInfo('PoolTint')!;
        expect(pool.addressSpace).toBe('uniform');
        expect(pool.stride).toBe(256);
        expect(pool.buffer.subkind).toBe('uniform');
        expect(pool.buffer.byteSize).toBe(256 * 16);
        expect(system.poolBufferSpec('PoolTint')).toBe(pool.buffer);
    });

    it('cada recurso no seu slot: escrita no offset slot × stride; slots estáveis na remoção', () => {
        const { world, system, writes } = setup();
        const a = new TintResource(1);
        const b = new TintResource(2);
        world.insert(a);
        const bId = world.insert(b);
        const pool = system.poolInfo('PoolTint')!;
        const toB = writes.filter((w) => w.spec === pool.buffer && w.offset === 256);
        expect(toB).toHaveLength(1);
        expect(f32At(toB[0]!, 4)).toBe(2);
        world.remove(a);
        expect(system.poolSlotOf('PoolTint', bId)).toBe(1);
    });

    it('fonte dinâmica: o slot da entidade dá o offset do bind group (slot × stride)', () => {
        const { world, system } = setup();
        world.insert(new TintResource(1));
        const id = world.insert(new TintResource(2));
        const pool = system.poolInfo('PoolTint')!;
        expect(system.poolSlotOf('PoolTint', id)! * pool.stride).toBe(256);
    });

    it('crescimento preserva os dados (reempacota da CPU) e destrói o buffer anterior', () => {
        const { world, system, writes, core } = setup();
        for (let i = 0; i < 16; i++) world.insert(new TintResource(i));
        const first = system.poolInfo('PoolTint')!.buffer;
        writes.length = 0;
        world.insert(new TintResource(99));
        const grown = system.poolInfo('PoolTint')!;
        expect(grown.buffer).not.toBe(first);
        expect(grown.buffer.subkind).toBe('uniform');
        expect(grown.buffer.byteSize).toBe(256 * 32);
        expect(grown.generation).toBe(1);
        const rewritten = writes.filter((w) => w.spec === grown.buffer);
        expect(rewritten).toHaveLength(17);
        expect(f32At(rewritten.find((w) => w.offset === 5 * 256)!, 4)).toBe(5);
        expect(core.destroy).toHaveBeenCalledWith(first);
    });

    it('pool de storage continua com stride alinhado a 16', () => {
        const { world, system } = setup();
        const S = new StructSchema('PoolStorageItem', { v: FieldType.vec4f, w: FieldType.f32 });
        world.insert(
            new (class extends TintResource {
                override getDescriptors(): readonly GPUDescriptor[] {
                    return [{ id: 's', role: 'storage-rw', schema: S, storage: 'pool' }];
                }
            })(0),
        );
        const pool = system.poolInfo('PoolStorageItem')!;
        expect(pool.addressSpace).toBe('storage');
        expect(pool.stride).toBe(32);
        expect(pool.buffer.subkind).toBe('storage');
    });
});
