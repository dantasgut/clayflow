// Spec 037 — energia dos corpos moles: a faixa do corpo (`SoftBodyRange`) e a série `SoftBodyEnergy` no SoftBody, com os
// inícios resolvidos pela C2 e as duas no mesmo slot.
import { describe, expect, it } from 'vitest';
import { DefaultEventBus } from '../../../../scene/events/DefaultEventBus';
import { ResourceSystem } from '../../../../scene/systems/ResourceSystem';
import { World } from '../../../../scene/world/World';
import { fakeResourceCore } from '../../../../scene/__tests__/helpers/fakeResourceCore';
import { SoftBody } from '../../bodies/SoftBody';
import { XPBDSoftSchema } from '../../bodies/schemas/XPBDSoftSchema';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';
import { FieldType } from '../../../../scene/descriptors/FieldType';
import {
    SOFT_ENERGY_ALGORITHM,
    SoftBodyChunkSchema,
    SoftBodyEnergySchema,
    SoftBodyPartialSchema,
    SoftBodyRangeSchema,
} from '../schemas';

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const fake = fakeResourceCore();
    const system = new ResourceSystem(fake.core, events, world);
    /** Os registros `SoftBodyRange` enviados até agora, por slot. */
    const ranges = (): Map<number, number[]> => {
        events.emit('frameRecording', { elapsed: 0 });
        const spec = system.poolBufferSpec(SoftBodyRangeSchema.name)!;
        const out = new Map<number, number[]>();
        for (const w of fake.writes.filter((c) => c.spec === spec)) {
            const u32 = new Uint32Array(w.bytes.buffer, w.bytes.byteOffset, w.bytes.byteLength / 4);
            const first = w.offset / SoftBodyRangeSchema.stride;
            for (let k = 0; k * 8 < u32.length; k++)
                out.set(first + k, Array.from(u32.subarray(k * 8, k * 8 + 7)));
        }
        return out;
    };
    return { world, system, ranges };
}

const cloth = (n: number) =>
    new SoftBody({
        algorithm: 'XPBD',
        position: Array.from({ length: n * 3 }, (_, i) => (i % 3 === 0 ? i / 3 : 0)),
        mass: 1,
        edges: {
            a: Array.from({ length: n - 1 }, (_, i) => i),
            b: Array.from({ length: n - 1 }, (_, i) => i + 1),
            compliance: 1e-4,
        },
    });

describe('SoftBody — faixa e série da energia (spec 037)', () => {
    it('declara a faixa (enviada na inserção) e a série sob demanda de 8 fatias, as duas com count 1', () => {
        const descs = cloth(3).getDescriptors();
        expect(descs.find((d) => d.id === 'range')).toMatchObject({
            schema: SoftBodyRangeSchema,
            storage: 'pool',
            upload: 'initial',
            count: 1,
            slotRefs: { first: 'self:body', first_edge: 'self:edges', first_chunk: 'self:chunks' },
        });
        expect(descs.find((d) => d.id === 'chunks')).toMatchObject({
            storage: 'pool',
            upload: 'initial',
            count: 1,
            slotRefs: { range: 'self:range' },
        });
        expect(descs.find((d) => d.id === 'partials')).toMatchObject({
            storage: 'pool',
            upload: 'never',
            allocation: 'onDemand',
            count: 1,
        });
        const energy = descs.find((d) => d.id === 'energy');
        expect(energy).toMatchObject({
            storage: 'pool',
            upload: 'never',
            allocation: 'onDemand',
            history: { depth: 8 },
        });
        // Um registro sem `count` (lido campo a campo, como o do RigidBody); a C2 o põe no slot da faixa.
        expect(energy?.count).toBeUndefined();
        const free = new SoftBody({ algorithm: 'FEM', position: [0, 0, 0], mass: 1 });
        expect(free.getDescriptors().find((d) => d.id === 'range')?.slotRefs).toEqual({
            first: 'self:body',
            first_chunk: 'self:chunks',
        });
        // Blocos de 1024 elementos pelo maior entre partículas e arestas.
        expect(cloth(1025).energyChunks).toBe(2);
        expect(cloth(700).energyChunks).toBe(1);
    });

    it('a C2 resolve os inícios das partículas e das arestas; o algoritmo vai no registro', () => {
        const { world, system, ranges } = setup();
        const a = cloth(3);
        const b = cloth(5);
        const mpm = new SoftBody({ algorithm: 'MPM', position: [0, 0, 0, 1, 1, 1] });
        world.insert(a);
        world.insert(b);
        world.insert(mpm);
        const got = ranges();
        const slotOf = (body: SoftBody, key = SoftBodyRangeSchema.name): number =>
            system.poolSlotOf(key, world.entityIdOfResource(body)!)!;
        // Partículas: a (0..2), b (3..7) no pool XPBD; arestas: a (0..1), b (2..5); um bloco cada, nos slots dos blocos.
        const chunkOf = (body: SoftBody): number => slotOf(body, SoftBodyChunkSchema.name);
        expect(got.get(slotOf(a))).toEqual([0, 3, 0, 2, SOFT_ENERGY_ALGORITHM.XPBD, chunkOf(a), 1]);
        expect(got.get(slotOf(b))).toEqual([3, 5, 2, 4, SOFT_ENERGY_ALGORITHM.XPBD, chunkOf(b), 1]);
        expect(got.get(slotOf(mpm))).toEqual([
            0,
            2,
            0,
            0,
            SOFT_ENERGY_ALGORITHM.MPM,
            chunkOf(mpm),
            1,
        ]);
        // A soma de cada bloco no slot do bloco.
        for (const body of [a, b, mpm])
            expect(slotOf(body, SoftBodyPartialSchema.name)).toBe(chunkOf(body));
        // A série no mesmo slot da faixa.
        for (const body of [a, b, mpm])
            expect(slotOf(body, SoftBodyEnergySchema.name)).toBe(slotOf(body));
    });

    it('corpo cru: série com schema de um dos três algoritmos; sem ela com outro schema', () => {
        const raw = new SoftBody({ schema: XPBDSoftSchema, count: 2 });
        expect(raw.algorithm).toBe('XPBD');
        expect(raw.getDescriptors().map((d) => d.id)).toEqual([
            'body',
            'range',
            'chunks',
            'partials',
            'energy',
        ]);
        const other = new StructSchema('OtherSoft', { pos: FieldType.vec4f });
        const foreign = new SoftBody({ schema: other, count: 2 });
        expect(foreign.algorithm).toBeUndefined();
        expect(foreign.getDescriptors().map((d) => d.id)).toEqual(['body']);
    });
});
