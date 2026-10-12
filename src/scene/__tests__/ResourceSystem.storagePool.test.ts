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

/** 32 bytes (vec4f + f32, alinhado a 16). */
const Tint = new StructSchema('PoolTint', { color: FieldType.vec4f, gain: FieldType.f32 });

class TintResource extends Entity implements Resource {
    static readonly schema = Tint;
    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown>;
    constructor(gain: number) {
        super();
        this.data = { color: [1, 0, 0, 1], gain };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'tint', role: 'storage-ro', schema: Tint, storage: 'pool' }];
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

describe('ResourceSystem — pool de storage (Emenda 1 da 006)', () => {
    it('buffer STORAGE com o stride do struct (o do array<T> no WGSL)', () => {
        const { world, system } = setup();
        world.insert(new TintResource(1));
        const pool = system.poolInfo('PoolTint')!;
        expect(pool.stride).toBe(Tint.stride);
        expect(pool.buffer.subkind).toBe('storage');
        expect(pool.buffer.byteSize).toBe(Tint.stride * 16);
        expect(system.poolBufferSpec('PoolTint')).toBe(pool.buffer);
    });

    it('stride que não é múltiplo de 16 não é arredondado (struct de 8 bytes ⇒ stride 8)', () => {
        const { world, system } = setup();
        const Pair = new StructSchema('PoolPair', { a: FieldType.u32, b: FieldType.u32 });
        world.insert(
            new (class extends TintResource {
                override getDescriptors(): readonly GPUDescriptor[] {
                    return [{ id: 'p', role: 'storage-ro', schema: Pair, storage: 'pool' }];
                }
            })(0),
        );
        expect(Pair.stride).toBe(8);
        expect(system.poolInfo('PoolPair')!.stride).toBe(8);
    });

    it('cada recurso no seu slot: escrita no offset slot × stride; slots estáveis na remoção', () => {
        const { world, system, writes } = setup();
        const a = new TintResource(1);
        const b = new TintResource(2);
        world.insert(a);
        const bId = world.insert(b);
        const pool = system.poolInfo('PoolTint')!;
        const toB = writes.filter((w) => w.spec === pool.buffer && w.offset === Tint.stride);
        expect(toB).toHaveLength(1);
        expect(f32At(toB[0]!, 4)).toBe(2);
        world.remove(a);
        expect(system.poolSlotOf('PoolTint', bId)).toBe(1);
    });

    it('crescimento preserva os dados (reempacota da CPU) e destrói o buffer anterior', () => {
        const { world, system, writes, core } = setup();
        for (let i = 0; i < 16; i++) world.insert(new TintResource(i));
        const first = system.poolInfo('PoolTint')!.buffer;
        writes.length = 0;
        world.insert(new TintResource(99));
        const grown = system.poolInfo('PoolTint')!;
        expect(grown.buffer).not.toBe(first);
        expect(grown.buffer.byteSize).toBe(Tint.stride * 32);
        expect(grown.generation).toBe(1);
        const rewritten = writes.filter((w) => w.spec === grown.buffer);
        expect(rewritten).toHaveLength(17);
        expect(f32At(rewritten.find((w) => w.offset === 5 * Tint.stride)!, 4)).toBe(5);
        expect(core.destroy).toHaveBeenCalledWith(first);
    });

    it("descritor 'uniform' em pool é rejeitado com erro claro", () => {
        const { world } = setup();
        expect(() =>
            world.insert(
                new (class extends TintResource {
                    override getDescriptors(): readonly GPUDescriptor[] {
                        return [{ id: 'u', role: 'uniform', schema: Tint, storage: 'pool' }];
                    }
                })(0),
            ),
        ).toThrow(/'uniform' em pool/);
    });
});
