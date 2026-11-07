import { describe, expect, it } from 'vitest';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { DefaultEventBus } from '../events/DefaultEventBus';
import {
    POOL_ARENA_HEADER_WORDS,
    POOL_ARENA_SLOTS,
    poolArenaLiveReader,
    poolArenaReader,
    poolArenaSlotOf,
} from '../shaders/poolArena';
import { ResourceSystem } from '../systems/ResourceSystem';
import { World } from '../world/World';
import { fakeResourceCore } from './helpers/fakeResourceCore';

const Lamp = new StructSchema('ArenaLamp', { color: FieldType.vec4f });
const Other = new StructSchema('ArenaOther', { v: FieldType.vec4f });
// Os leitores pela arena põem os pools nela (T060i).
poolArenaReader({ name: 'arena_lamps', pool: Lamp.name, schema: Lamp });
poolArenaLiveReader({ name: 'arena_lamp_live', pool: Lamp.name });
poolArenaReader({ name: 'arena_others', pool: Other.name, schema: Other });

class Pooled extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    constructor(
        private readonly schema: StructSchema,
        v: number,
    ) {
        super();
        this.data = { [schema === Lamp ? 'color' : 'v']: [v, 0, 0, 0] };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'p', role: 'storage-ro', storage: 'pool', schema: this.schema }];
    }
    getPipelineDescriptors() {
        return [];
    }
}

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core, writes, copies } = fakeResourceCore();
    const resources = new ResourceSystem(core, events, world);
    const reallocs: string[] = [];
    events.on('poolReallocated', (e) => reallocs.push(e.poolKey));
    const frame = (): void => {
        events.emit('frameRecording', { elapsed: 0 });
    };
    return { world, writes, copies, resources, reallocs, frame };
}

describe('ResourceSystem — arena de pools (T060i)', () => {
    it('o pool lido pela arena mora numa região dela; o envio escreve na posição da região', () => {
        const { world, writes, resources, frame } = setup();
        world.insert(new Pooled(Lamp, 7));
        frame();
        const info = resources.poolInfo(Lamp.name)!;
        expect(info.buffer.discriminator).toMatch(/^pool_arena/);
        expect(info.offset % 256).toBe(0);
        expect(info.offset).toBeGreaterThanOrEqual(POOL_ARENA_HEADER_WORDS * 4);
        expect(info.size).toBeGreaterThanOrEqual(16 * Lamp.stride);
        const record = writes.find((w) => w.spec === info.buffer && w.offset === info.offset);
        expect(record).toBeDefined();
        expect(new Float32Array(record!.bytes.buffer, record!.bytes.byteOffset, 1)[0]).toBe(7);
        // O cabeçalho: a base (em palavras) e a capacidade da região.
        const k = poolArenaSlotOf(`pool:${Lamp.name}`)!;
        const header = [...writes].reverse().find((w) => w.spec === info.buffer && w.offset === 0)!;
        const words = new Uint32Array(
            header.bytes.buffer,
            header.bytes.byteOffset,
            POOL_ARENA_HEADER_WORDS,
        );
        expect(words[k]).toBe(info.offset / 4);
        expect(words[POOL_ARENA_SLOTS + k]).toBe(info.capacity);
    });

    it('os vivos: a região deles nasce com o pool (sem pedido) e é ligada pela faixa', () => {
        const { world, writes, resources, frame } = setup();
        world.insert(new Pooled(Lamp, 1));
        frame();
        // O bit do slot 0 escrito na região dos vivos, sem ninguém pedir o bitset.
        const k = poolArenaSlotOf(`live:${Lamp.name}`)!;
        const buffer = resources.poolInfo(Lamp.name)!.buffer;
        const header = [...writes].reverse().find((w) => w.spec === buffer && w.offset === 0)!;
        const base =
            new Uint32Array(header.bytes.buffer, header.bytes.byteOffset, POOL_ARENA_HEADER_WORDS)[
                k
            ]! * 4;
        const bits = writes.filter((w) => w.spec === buffer && w.offset === base);
        expect(
            bits.some(
                (w) => (new Uint32Array(w.bytes.buffer, w.bytes.byteOffset, 1)[0]! & 1) === 1,
            ),
        ).toBe(true);
        const live = resources.poolLiveSource(Lamp.name)!;
        expect(live.kind === 'buffer' && live.buffer).toBe(resources.poolInfo(Lamp.name)!.buffer);
        expect(live.kind === 'buffer' && (live.offset ?? 0) % 256).toBe(0);
    });

    it('crescer realoca a arena inteira: as regiões copiadas na GPU, todos os pools dela avisam', () => {
        const { world, copies, resources, reallocs, frame } = setup();
        world.insert(new Pooled(Other, 3));
        world.insert(new Pooled(Lamp, 1));
        frame();
        const before = resources.poolInfo(Lamp.name)!.buffer;
        reallocs.length = 0;
        copies.length = 0;
        for (let i = 0; i < 20; i++) world.insert(new Pooled(Lamp, i));
        frame();
        const after = resources.poolInfo(Lamp.name)!;
        expect(after.buffer).not.toBe(before);
        expect(resources.poolInfo(Other.name)!.buffer).toBe(after.buffer);
        expect(after.capacity).toBe(32);
        expect(reallocs).toEqual(expect.arrayContaining([Lamp.name, Other.name]));
        expect(copies.some((c) => c.src === before && c.dst === after.buffer)).toBe(true);
    });

    it('pool produzido pela GPU não entra na arena', () => {
        const Gpu = new StructSchema('ArenaGpu', { v: FieldType.vec4f });
        poolArenaReader({ name: 'arena_gpu', pool: Gpu.name, schema: Gpu });
        const { world } = setup();
        class Produced extends Entity implements Resource {
            state = ResourceState.Uninitialized;
            constructor() {
                super();
                this.data = {};
            }
            getDescriptors(): readonly GPUDescriptor[] {
                return [
                    { id: 'p', role: 'storage-rw', storage: 'pool', schema: Gpu, upload: 'never' },
                ];
            }
            getPipelineDescriptors() {
                return [];
            }
        }
        expect(() => world.insert(new Produced())).toThrow(/arena/);
    });
});
