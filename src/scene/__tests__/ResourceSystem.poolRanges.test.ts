/**
 * Faixas de pool (spec 008, R1): um descritor em pool com `count: N` ocupa N slots contíguos; o dado é por campo
 * (SoA) e é empacotado em AoS; a liberação devolve a faixa inteira (coalescida); first-fit reaproveita intervalos
 * livres; sem `count` o comportamento de um slot por Resource não muda.
 */
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
import { memoryCore } from './helpers/memoryCore';

const Dot = new StructSchema('RangeDot', { pos: FieldType.vec4f, tag: FieldType.u32 });
const Edge = new StructSchema('RangeEdge', { a: FieldType.u32, b: FieldType.u32 });

/** Corpo de `n` pontos (pool `RangeDot`) e, opcionalmente, `e` arestas (pool `RangeEdge`). */
class Cloud extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    constructor(
        readonly n: number,
        readonly tag: number,
        readonly upload: 'always' | 'initial' = 'initial',
        readonly e = 0,
    ) {
        super();
        const pos = new Float32Array(n * 4).map((_, k) => tag * 100 + k);
        this.data = {
            dots: { pos, tag: Array.from({ length: n }, () => tag) },
            edges: {
                a: Array.from({ length: e }, (_, k) => k),
                b: Array.from({ length: e }, (_, k) => k + 1),
            },
        };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        const dots: GPUDescriptor = {
            id: 'dots',
            role: 'storage-rw',
            storage: 'pool',
            schema: Dot,
            upload: this.upload,
            count: this.n,
        };
        if (this.e === 0) return [dots];
        return [
            dots,
            {
                id: 'edges',
                role: 'storage-ro',
                storage: 'pool',
                schema: Edge,
                upload: 'initial',
                count: this.e,
            },
        ];
    }
    getPipelineDescriptors() {
        return [];
    }
}

/** Um ponto por Resource, sem `count` (o comportamento de hoje). */
class Single extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    constructor(readonly tag: number) {
        super();
        this.data = { pos: [tag, tag, tag, tag], tag };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'dots', role: 'storage-rw', storage: 'pool', schema: Dot }];
    }
    getPipelineDescriptors() {
        return [];
    }
}

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core, bytesOf } = memoryCore();
    const resources = new ResourceSystem(core, events, world);
    const writes: { offset: number; bytes: number }[] = [];
    const frame = (): void => {
        events.emit('frameRecording', { elapsed: 0 });
    };
    events.on('poolWritten', (e) => {
        if (e.poolKey === 'RangeDot')
            for (const [first, count] of e.ranges) writes.push({ offset: first, bytes: count });
    });
    const tagAt = (slot: number): number => {
        const spec = resources.poolBufferSpec('RangeDot')!;
        return new DataView(bytesOf(spec).buffer).getUint32(slot * Dot.stride + 16, true);
    };
    return { world, resources, frame, writes, tagAt };
}

describe('faixas de pool (spec 008)', () => {
    it('count: N ocupa N slots contíguos e escreve a faixa numa escrita, com o dado por campo', () => {
        const s = setup();
        const a = new Cloud(3, 1);
        const b = new Cloud(4, 2);
        const idA = s.world.insert(a);
        const idB = s.world.insert(b);
        s.frame();
        expect(s.resources.poolRangeOf('RangeDot', idA)).toEqual({ first: 0, count: 3 });
        expect(s.resources.poolRangeOf('RangeDot', idB)).toEqual({ first: 3, count: 4 });
        expect(s.resources.poolCount('RangeDot')).toBe(7);
        expect(s.writes).toEqual([{ offset: 0, bytes: 7 }]);
        expect([0, 1, 2, 3, 6].map(s.tagAt)).toEqual([1, 1, 1, 2, 2]);
        expect(s.resources.poolEntityBySlot('RangeDot', 5)).toBe(idB);
    });

    it('sem count: um slot por Resource, como antes', () => {
        const s = setup();
        const ids = [new Single(5), new Single(6)].map((r) => s.world.insert(r));
        s.frame();
        expect(ids.map((id) => s.resources.poolSlotOf('RangeDot', id))).toEqual([0, 1]);
        expect(ids.map((id) => s.resources.poolRangeOf('RangeDot', id))).toEqual([
            { first: 0, count: 1 },
            { first: 1, count: 1 },
        ]);
    });

    it('liberação devolve a faixa; first-fit reaproveita e coalesce', () => {
        const s = setup();
        const a = new Cloud(2, 1);
        const b = new Cloud(3, 2);
        const c = new Cloud(2, 3);
        for (const r of [a, b, c]) s.world.insert(r);
        s.frame();
        s.world.remove(a);
        s.world.remove(b);
        // 0..4 livres e coalescidos: uma faixa de 5 cabe no início.
        const d = new Cloud(5, 4);
        const idD = s.world.insert(d);
        s.frame();
        expect(s.resources.poolRangeOf('RangeDot', idD)).toEqual({ first: 0, count: 5 });
        expect(s.resources.poolCount('RangeDot')).toBe(7);
        // Não cabe no intervalo livre: vai para o fim (crescendo o pool por dobra).
        s.world.remove(d);
        const big = new Cloud(40, 5);
        const idBig = s.world.insert(big);
        s.frame();
        expect(s.resources.poolRangeOf('RangeDot', idBig)).toEqual({ first: 7, count: 40 });
        expect(s.tagAt(46)).toBe(5);
    });

    it("'always': mutação marca só a faixa do Resource, empacotada pelo índice local", () => {
        const s = setup();
        const a = new Cloud(2, 1, 'always');
        const b = new Cloud(2, 2, 'always');
        s.world.insert(a);
        s.world.insert(b);
        s.frame();
        s.writes.length = 0;
        const dots = (b.data as { dots: { tag: number[] } }).dots;
        dots.tag = [9, 9];
        s.frame();
        expect(s.writes).toEqual([{ offset: 2, bytes: 2 }]);
        expect([0, 1, 2, 3].map(s.tagAt)).toEqual([1, 1, 9, 9]);
    });

    it('contagens diferentes no mesmo Resource: faixas independentes por pool', () => {
        const s = setup();
        const id = s.world.insert(new Cloud(3, 1, 'initial', 2));
        s.frame();
        expect(s.resources.poolRangeOf('RangeDot', id)).toEqual({ first: 0, count: 3 });
        expect(s.resources.poolRangeOf('RangeEdge', id)).toEqual({ first: 0, count: 2 });
        expect(s.resources.poolCount('RangeEdge')).toBe(2);
    });

    it('leitura de faixa: devolve o dado por campo', async () => {
        const s = setup();
        const a = new Cloud(1, 1);
        const b = new Cloud(3, 7);
        s.world.insert(a);
        s.world.insert(b);
        s.frame();
        const back = (await s.resources.read(b, 'dots')) as { tag: Uint32Array; pos: Float32Array };
        expect([...back.tag]).toEqual([7, 7, 7]);
        expect(back.pos.length).toBe(12);
        expect(back.pos[4]).toBe(704);
    });

    it('count inválido é erro com o descritor', () => {
        const s = setup();
        expect(() => s.world.insert(new Cloud(0, 1))).toThrow(/'dots'.*count 0/);
    });
});
