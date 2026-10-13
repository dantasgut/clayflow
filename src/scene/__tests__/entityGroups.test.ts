/**
 * Grupos de instâncias mantidos pela C2 (`slot.entities({ groups })`, spec 007, R2): invariantes da lista, inserção,
 * remoção com troca pelo último, mudança de chave por envio, realocação do segmento cheio, crescimento da lista com
 * `poolReallocated`, grupos vazios fora da lista e nenhuma iteração por entidade com a cena parada.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Frame } from '../../core/contracts/index';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { Flow } from '../flows/Flow';
import type { BoundFlow, TransitionContext } from '../flows/FlowBinding';
import type { FlowTransitions } from '../flows/FlowTransitions';
import { slot, type EntityEntry } from '../flows/slots';
import { createScene } from '../SceneContext';
import { countingCore } from './helpers/countingCore';

const ShapeSchema = new StructSchema('GroupShape', { kind: FieldType.vec4f });
const InstanceSchema = new StructSchema('GroupInstance', { slot: FieldType.u32 });

/** `data.kind[0]` é a chave do grupo; o slot de pool do descritor é o valor de instância. */
class Shape extends Entity implements Resource {
    static readonly schema = ShapeSchema;
    state = ResourceState.Uninitialized;
    constructor(kind: number) {
        super();
        this.data = { kind: [kind, 0, 0, 0] };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'shape', role: 'storage-ro', storage: 'pool', schema: ShapeSchema }];
    }
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}

const keyOf = vi.fn((entry: EntityEntry) => String((entry.get(Shape).data.kind as number[])[0]));
const slots = {
    shapes: slot.entities({
        all: [Shape],
        groups: { schema: InstanceSchema, key: keyOf, instance: [Shape, 'shape'] },
    }),
};
type Slots = typeof slots;

class Drawer extends Flow<Slots, 'idle'> {
    readonly type = 'Drawer';
    readonly slots = slots;
    bound: BoundFlow<Slots> | undefined;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<Slots>> = {
        '*': {
            slotsResolved: 'ignore',
            pipelinesCompiled: 'ignore',
            bindGroupReplaced: 'ignore',
            entitiesChanged: 'ignore',
        },
    };
    dispatch(_frame: Frame, bound: BoundFlow<Slots>): void {
        this.bound = bound;
    }
}

function setup() {
    const counting = countingCore();
    // `write` recebe vistas de uma área reutilizada: a cópia é feita na hora, como o `writeBuffer` real.
    const listWrites: { offset: number; values: number[] }[] = [];
    vi.mocked(counting.core.write).mockImplementation((spec, data, offset) => {
        if ((spec as { discriminator?: string }).discriminator?.startsWith('pool:GroupInstance')) {
            listWrites.push({
                offset: offset ?? 0,
                values: [...new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4)],
            });
        }
    });
    const scene = createScene({ core: counting.core });
    const flow = scene.flows.register(() => new Drawer(), {
        type: 'drawer',
        phase: 'forward',
    }).flow!;
    let n = 0;
    const frame = (): void => {
        scene.events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: 0, frame: ++n });
    };
    const bound = () => flow.bound!.slots.shapes;
    const rs = scene.resourceSystem;
    /** Valor de cada posição ocupada da lista (pela visão da C2). */
    const listValues = (): Map<number, number> => {
        const out = new Map<number, number>();
        for (const g of bound().groups) {
            for (let i = 0; i < g.count; i++) out.set(g.first + i, -1);
        }
        return out;
    };
    const shapeSlot = (s: Shape) =>
        rs.poolSlotOf('GroupShape', scene.world.entityIdOfResource(s)!)!;
    return { scene, flow, frame, bound, rs, listValues, shapeSlot, counting, listWrites };
}

/** Invariantes: cada entidade em um grupo, Σ count = |conjunto|, segmentos sem sobreposição. */
function expectInvariants(
    groups: readonly { first: number; count: number }[],
    total: number,
): void {
    expect(groups.reduce((a, g) => a + g.count, 0)).toBe(total);
    const used = new Set<number>();
    for (const g of groups) {
        expect(g.count).toBeGreaterThan(0);
        for (let i = g.first; i < g.first + g.count; i++) {
            expect(used.has(i)).toBe(false);
            used.add(i);
        }
    }
}

describe('grupos de instâncias (C2, spec 007)', () => {
    it('agrupa pela chave; cada grupo é um segmento contíguo; os valores são os slots do descritor', () => {
        const s = setup();
        const shapes = Array.from({ length: 30 }, (_, i) => new Shape(i % 3));
        for (const sh of shapes) s.scene.world.insert(sh);
        s.frame();
        const groups = s.bound().groups;
        expect(groups.map((g) => g.key)).toEqual(['0', '1', '2']);
        expect(groups.map((g) => g.count)).toEqual([10, 10, 10]);
        expectInvariants(groups, 30);
        expect(s.bound().instances!.poolKey).toBe('GroupInstance');
        // A lista enviada tem, em cada posição do grupo '1', o slot de pool de uma entidade de chave 1.
        const list = new Map<number, number>();
        for (const { offset, values } of s.listWrites) {
            values.forEach((v, i) => list.set(offset / 4 + i, v));
        }
        const g1 = groups[1]!;
        const expected = shapes.filter((_, i) => i % 3 === 1).map(s.shapeSlot);
        const got = Array.from({ length: g1.count }, (_, i) => list.get(g1.first + i));
        expect(got.sort((a, b) => a! - b!)).toEqual(expected.sort((a, b) => a - b));
    });

    it('remoção troca o último para a posição (uma escrita) e grupo vazio sai da lista', () => {
        const s = setup();
        const a = [new Shape(0), new Shape(0), new Shape(0)];
        const b = new Shape(1);
        for (const sh of [...a, b]) s.scene.world.insert(sh);
        s.frame();
        vi.mocked(s.counting.core.write).mockClear();
        s.scene.world.remove(a[0]!);
        s.scene.world.remove(b);
        s.frame();
        expect(s.bound().groups.map((g) => [g.key, g.count])).toEqual([['0', 2]]);
        const listWrites = vi
            .mocked(s.counting.core.write)
            .mock.calls.filter(([spec]) => spec === s.rs.poolBufferSpec('GroupInstance'));
        expect(listWrites).toHaveLength(1); // o último do grupo '0' foi para a posição 0
        expect(listWrites[0]![2]).toBe(s.bound().groups[0]!.first * 4);
    });

    it('mudança de chave no envio move a entidade de grupo', () => {
        const s = setup();
        const x = new Shape(0);
        const y = new Shape(0);
        s.scene.world.insert(x);
        s.scene.world.insert(y);
        s.frame();
        (x.data.kind as number[])[0] = 5;
        s.frame();
        expect(s.bound().groups.map((g) => [g.key, g.count])).toEqual([
            ['0', 1],
            ['5', 1],
        ]);
    });

    it('grupo cheio muda de segmento; a lista cresce com poolReallocated', () => {
        const s = setup();
        const reallocated = vi.fn();
        s.scene.events.on('poolReallocated', (e) => {
            if (e.poolKey === 'GroupInstance') reallocated();
        });
        const shapes = Array.from({ length: 100 }, () => new Shape(7));
        for (const sh of shapes) s.scene.world.insert(sh);
        s.scene.world.insert(new Shape(8));
        s.frame();
        const groups = s.bound().groups;
        expectInvariants(groups, 101);
        expect(groups.find((g) => g.key === '7')!.count).toBe(100);
        expect(reallocated).toHaveBeenCalled();
    });

    it('com a cena parada a chave não é reavaliada e nada da lista é escrito', () => {
        const s = setup();
        for (let i = 0; i < 50; i++) s.scene.world.insert(new Shape(i % 2));
        s.frame();
        s.frame();
        keyOf.mockClear();
        vi.mocked(s.counting.core.write).mockClear();
        s.frame();
        s.frame();
        expect(keyOf).not.toHaveBeenCalled();
        expect(s.bound().groups.map((g) => g.count)).toEqual([25, 25]);
        expect(
            vi
                .mocked(s.counting.core.write)
                .mock.calls.filter(([spec]) => spec === s.rs.poolBufferSpec('GroupInstance')),
        ).toHaveLength(0);
        expect(s.listValues().size).toBe(50);
    });

    it('schema da lista sem exatamente um campo u32 é rejeitado', () => {
        const s = setup();
        expect(() => {
            s.rs.acquireInstanceList(new StructSchema('BadInstance', { a: FieldType.f32 }));
        }).toThrow(/único campo u32/);
    });
});
