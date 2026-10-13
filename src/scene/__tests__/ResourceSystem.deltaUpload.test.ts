/**
 * Envio por delta (spec 007, R5): slot achado em O(1) no envio e na liberação, uma escrita por faixa contígua de slots
 * marcados, o último valor do quadro, `poolWritten` por pool com as faixas e crescimento sem reempacotar na CPU.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { DefaultEventBus } from '../events/DefaultEventBus';
import type { PoolWrittenEvent } from '../events/PoolWrittenEvent';
import { ResourceSystem } from '../systems/ResourceSystem';
import { World } from '../world/World';
import { f32At, fakeResourceCore } from './helpers/fakeResourceCore';

const DeltaSchema = new StructSchema('DeltaPool', { value: FieldType.vec4f });
const UniformSchema = new StructSchema('DeltaUniform', { value: FieldType.vec4f });

class Item extends Entity implements Resource {
    static readonly schema = DeltaSchema;
    state = ResourceState.Uninitialized;
    data: Record<string, unknown>;
    constructor(v = 0) {
        super();
        this.data = { value: [v, 0, 0, 0] };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'v', role: 'storage-ro', storage: 'pool', schema: DeltaSchema }];
    }
    getPipelineDescriptors() {
        return [];
    }
}

class Own extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    data: Record<string, unknown> = { value: [0, 0, 0, 0] };
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'u', role: 'uniform', schema: UniformSchema }];
    }
    getPipelineDescriptors() {
        return [];
    }
}

function setup(count = 0) {
    const events = new DefaultEventBus();
    const world = new World(events);
    const fake = fakeResourceCore();
    const resources = new ResourceSystem(fake.core, events, world);
    const items = Array.from({ length: count }, (_, i) => {
        const item = new Item(i);
        world.insert(item);
        return item;
    });
    const written: PoolWrittenEvent[] = [];
    events.on('poolWritten', (e) => written.push(e));
    const frame = (): void => {
        events.emit('frameRecording', { elapsed: 0 });
    };
    const poolWrites = () =>
        fake.writes.filter((w) => w.spec === resources.poolBufferSpec('DeltaPool'));
    return { events, world, resources, items, written, frame, poolWrites, ...fake };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ResourceSystem — envio por delta (spec 007)', () => {
    it('o dado inicial de 1000 membros contíguos sai numa escrita só, com um poolWritten', () => {
        const s = setup(1000);
        expect(s.poolWrites()).toHaveLength(0);
        s.frame();
        expect(s.poolWrites()).toHaveLength(1);
        expect(s.poolWrites()[0]!.bytes.byteLength).toBe(1000 * DeltaSchema.stride);
        expect(s.written).toEqual([
            { poolKey: 'DeltaPool', schema: DeltaSchema, ranges: [[0, 1000]] },
        ]);
    });

    it('uma escrita por faixa contígua suja, no offset slot × stride, com o último valor do quadro', () => {
        const s = setup(10);
        s.frame();
        s.writes.length = 0;
        s.written.length = 0;
        for (const i of [2, 3, 4, 7]) (s.items[i]!.data.value as number[])[0] = 100 + i;
        (s.items[3]!.data.value as number[])[0] = 333; // segunda mutação no quadro: vale a última
        s.frame();
        const writes = s.poolWrites();
        expect(writes.map((w) => [w.offset, w.bytes.byteLength])).toEqual([
            [2 * DeltaSchema.stride, 3 * DeltaSchema.stride],
            [7 * DeltaSchema.stride, DeltaSchema.stride],
        ]);
        expect(f32At(writes[0]!, 0)).toBe(102);
        expect(f32At(writes[0]!, DeltaSchema.stride / 4)).toBe(333);
        expect(f32At(writes[1]!, 0)).toBe(107);
        expect(s.written).toEqual([
            {
                poolKey: 'DeltaPool',
                schema: DeltaSchema,
                ranges: [
                    [2, 3],
                    [7, 1],
                ],
                fields: ['value'], // só o campo mudado (posição de vetor também conta como o campo)
            },
        ]);
    });

    it('sem mudança, nenhuma escrita nem poolWritten', () => {
        const s = setup(5);
        s.frame();
        s.writes.length = 0;
        s.written.length = 0;
        s.frame();
        expect(s.writes).toHaveLength(0);
        expect(s.written).toHaveLength(0);
    });

    it('envio e liberação acham o slot sem percorrer os ocupantes do pool (10 mil membros)', () => {
        const s = setup(10_000);
        s.frame();
        // Tamanho de todo Map percorrido durante o envio e a liberação (a varredura antiga percorria os ocupantes).
        const iterated: number[] = [];
        const iterator = Map.prototype[Symbol.iterator];
        const entries = Map.prototype.entries;
        vi.spyOn(Map.prototype, Symbol.iterator).mockImplementation(function (
            this: Map<unknown, unknown>,
        ) {
            iterated.push(this.size);
            return iterator.call(this);
        });
        vi.spyOn(Map.prototype, 'entries').mockImplementation(function (
            this: Map<unknown, unknown>,
        ) {
            iterated.push(this.size);
            return entries.call(this);
        });
        (s.items[9_999]!.data.value as number[])[0] = 1;
        s.frame();
        s.world.remove(s.items[5_000]!);
        vi.restoreAllMocks();
        expect(iterated.filter((size) => size >= 1000)).toEqual([]);
        expect(s.poolWrites().at(-1)!.offset).toBe(9_999 * DeltaSchema.stride);
    });

    it('slot liberado antes do envio não é escrito', () => {
        const s = setup(3);
        s.world.remove(s.items[1]!);
        s.frame();
        expect(s.poolWrites().map((w) => [w.offset, w.bytes.byteLength])).toEqual([
            [0, DeltaSchema.stride],
            [2 * DeltaSchema.stride, DeltaSchema.stride],
        ]);
    });

    it('crescimento copia o buffer na GPU e não reempacota os membros já enviados', () => {
        const s = setup(16);
        s.frame();
        const pack = vi.spyOn(DeltaSchema, 'packInto');
        const old = s.resources.poolBufferSpec('DeltaPool')!;
        s.world.insert(new Item(99));
        const grown = s.resources.poolBufferSpec('DeltaPool')!;
        expect(s.copies).toEqual([{ src: old, dst: grown, size: old.byteSize }]);
        expect(pack).not.toHaveBeenCalled();
        s.writes.length = 0;
        s.frame();
        expect(pack).toHaveBeenCalledTimes(1);
        expect(s.poolWrites().map((w) => w.offset)).toEqual([16 * DeltaSchema.stride]);
    });

    it('resourceReady só para Resources com objetos próprios; dado em pool sai em poolWritten', () => {
        const s = setup();
        const ready: Resource[] = [];
        s.events.on('resourceReady', (e) => ready.push(e.payload.resource));
        const item = new Item(1);
        const own = new Own();
        s.world.insert(item);
        s.world.insert(own);
        expect(ready).toEqual([own]);
        (item.data.value as number[])[0] = 2;
        own.data.value = [3, 0, 0, 0];
        s.frame();
        expect(ready).toEqual([own, own]);
        expect(s.written.map((w) => w.poolKey)).toEqual(['DeltaPool']);
    });
});
