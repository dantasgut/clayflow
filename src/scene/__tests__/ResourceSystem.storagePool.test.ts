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
    const frame = (): void => {
        events.emit('frameRecording', { elapsed: 0 });
    };
    return { events, world, system, frame, ...fake };
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

    it('cada recurso no seu slot: faixa contígua escrita de uma vez no offset slot × stride; slots estáveis na remoção', () => {
        const { world, system, writes, frame } = setup();
        const a = new TintResource(1);
        const b = new TintResource(2);
        world.insert(a);
        const bId = world.insert(b);
        frame();
        const pool = system.poolInfo('PoolTint')!;
        const toPool = writes.filter((w) => w.spec === pool.buffer);
        expect(toPool).toHaveLength(1);
        expect(toPool[0]!.offset).toBe(0);
        expect(toPool[0]!.bytes.byteLength).toBe(2 * Tint.stride);
        expect(f32At(toPool[0]!, Tint.stride / 4 + 4)).toBe(2);
        world.remove(a);
        expect(system.poolSlotOf('PoolTint', bId)).toBe(1);
    });

    it('crescimento preserva os dados por cópia na GPU (sem reempacotar da CPU) e destrói o buffer anterior', () => {
        const { world, system, writes, core, copies, frame } = setup();
        for (let i = 0; i < 16; i++) world.insert(new TintResource(i));
        frame();
        const first = system.poolInfo('PoolTint')!.buffer;
        writes.length = 0;
        world.insert(new TintResource(99));
        const grown = system.poolInfo('PoolTint')!;
        expect(grown.buffer).not.toBe(first);
        expect(grown.buffer.byteSize).toBe(Tint.stride * 32);
        expect(grown.generation).toBe(1);
        expect(copies).toEqual([{ src: first, dst: grown.buffer, size: first.byteSize }]);
        expect(core.destroy).toHaveBeenCalledWith(first);
        frame();
        // Só o membro novo é escrito da CPU.
        const rewritten = writes.filter((w) => w.spec === grown.buffer);
        expect(rewritten).toHaveLength(1);
        expect(rewritten[0]!.offset).toBe(16 * Tint.stride);
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
