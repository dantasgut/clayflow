/**
 * Registros de entidade mantidos pela C2 (`slot.entities({ all, record })`, Emenda 1 da 006): um registro por entidade
 * do conjunto com os slots de pool dos descritores nomeados, escrito em lote no `frameRecording`, liberado ao sair,
 * compartilhado entre conjuntos com a mesma declaração e entregue ao estágio como `recordSlot`.
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
import { slot, type EntityRecordDeclaration, type EntitiesSlot } from '../flows/slots';
import { createScene } from '../SceneContext';
import { countingCore } from './helpers/countingCore';

const ASchema = new StructSchema('RecA', { v: FieldType.vec4f });
const BSchema = new StructSchema('RecB', { t: FieldType.vec4f });
const OwnSchema = new StructSchema('RecOwn', { o: FieldType.vec4f });
const RecordSchema = new StructSchema('TestRecord', { aSlot: FieldType.u32, bSlot: FieldType.u32 });

abstract class Base extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};
    abstract getDescriptors(): readonly GPUDescriptor[];
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
class RecA extends Base {
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'body', role: 'storage-ro', storage: 'pool', schema: ASchema }];
    }
}
class RecB extends Base {
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'tag', role: 'storage-ro', storage: 'pool', schema: BSchema }];
    }
}
/** Mesmo tipo do campo `bSlot`, mas o descritor não é de pool: a entidade não ganha registro. */
class RecBOwn extends RecB {
    override getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'tag', role: 'storage-ro', schema: OwnSchema }];
    }
}

const declaration: EntityRecordDeclaration = {
    schema: RecordSchema,
    fields: { aSlot: [RecA, 'body'], bSlot: [RecB, 'tag'] },
};
const all = [RecA, RecB] as const;

function setup() {
    const counting = countingCore();
    const scene = createScene({ core: counting.core });
    const write = vi.mocked(counting.core.write);
    const rs = scene.resourceSystem;
    /** Escritas no pool de registros: `[offset, valores u32]`. */
    const recordWrites = (): [number, number[]][] =>
        write.mock.calls
            .filter(([spec]) => spec === rs.poolBufferSpec(RecordSchema.name))
            .map(([, data, offset]) => {
                const view = data;
                return [
                    offset ?? 0,
                    [...new Uint32Array(view.buffer, view.byteOffset, view.byteLength / 4)],
                ];
            });
    const frame = (): void => {
        scene.events.emit('frameRecording', { elapsed: 0 });
    };
    const insert = (b: RecB = new RecB()) => scene.world.insert(new RecA().add(b));
    return { scene, rs, write, recordWrites, frame, insert };
}

describe('registros de entidade (C2)', () => {
    it('cria o registro com os slots referidos e o escreve no frameRecording, uma escrita por sequência contígua', () => {
        const s = setup();
        s.rs.acquireEntityRecords(all, declaration);
        // Ocupa o slot 0 de RecB com uma entidade fora do conjunto: os slots de A e B divergem.
        s.scene.world.insert(new RecB());
        const ids = [s.insert(), s.insert(), s.insert()];
        expect(s.recordWrites()).toEqual([]); // nada antes do quadro
        s.frame();
        const writes = s.recordWrites();
        expect(writes).toHaveLength(1);
        const [offset, values] = writes[0]!;
        expect(offset).toBe(0);
        const expected = ids.flatMap((id) => [
            s.rs.poolSlotOf(ASchema.name, id)!,
            s.rs.poolSlotOf(BSchema.name, id)!,
        ]);
        expect(values).toEqual(expected);
        expect(ids.map((id) => s.rs.poolSlotOf(RecordSchema.name, id))).toEqual([0, 1, 2]);
        s.frame();
        expect(s.recordWrites()).toHaveLength(1); // sem mudança, sem escrita
    });

    it('stride do pool de registros é o do struct (8 bytes), não arredondado a 16', () => {
        const s = setup();
        s.rs.acquireEntityRecords(all, declaration);
        expect(s.rs.poolInfo(RecordSchema.name)!.stride).toBe(RecordSchema.stride);
        expect(RecordSchema.stride).toBe(8);
    });

    it('entidade sem um dos tipos, ou com o descritor referido fora de pool, não ganha registro', () => {
        const s = setup();
        s.rs.acquireEntityRecords(all, declaration);
        const onlyA = s.scene.world.insert(new RecA());
        const own = s.insert(new RecBOwn());
        s.frame();
        expect(s.rs.poolSlotOf(RecordSchema.name, onlyA)).toBeUndefined();
        expect(s.rs.poolSlotOf(RecordSchema.name, own)).toBeUndefined();
        expect(s.recordWrites()).toEqual([]);
    });

    it('entidades já na cena entram ao adquirir; remoção libera o slot, que é reutilizado', () => {
        const s = setup();
        const first = new RecA().add(new RecB());
        s.scene.world.insert(first);
        s.insert();
        s.rs.acquireEntityRecords(all, declaration);
        expect(s.rs.poolCount(RecordSchema.name)).toBe(2);
        s.scene.world.remove(first);
        s.frame();
        // O slot 0 saiu antes do quadro: só o slot 1 é escrito.
        expect(s.recordWrites().map(([o]) => o)).toEqual([RecordSchema.stride]);
        const again = s.insert();
        expect(s.rs.poolSlotOf(RecordSchema.name, again)).toBe(0);
    });

    it('crescimento do pool emite poolReallocated e preserva os registros', () => {
        const s = setup();
        s.rs.acquireEntityRecords(all, declaration);
        const reallocated = vi.fn();
        s.scene.events.on('poolReallocated', (e) => {
            if (e.poolKey === RecordSchema.name) reallocated();
        });
        const ids = Array.from({ length: 40 }, () => s.insert());
        expect(reallocated).toHaveBeenCalled();
        expect(s.rs.poolInfo(RecordSchema.name)!.capacity).toBeGreaterThanOrEqual(40);
        s.frame();
        const bytes = new Map<number, number[]>();
        for (const [offset, values] of s.recordWrites()) {
            values.forEach((v, i) => bytes.set(offset / 4 + i, [v]));
        }
        for (const id of ids) {
            const slotIndex = s.rs.poolSlotOf(RecordSchema.name, id)!;
            expect(bytes.get(slotIndex * 2)![0]).toBe(s.rs.poolSlotOf(ASchema.name, id));
            expect(bytes.get(slotIndex * 2 + 1)![0]).toBe(s.rs.poolSlotOf(BSchema.name, id));
        }
    });

    it('mesma declaração compartilha; a última liberação solta os registros; declarações inválidas falham', () => {
        const s = setup();
        s.rs.acquireEntityRecords(all, declaration);
        s.rs.acquireEntityRecords([RecB, RecA], {
            schema: RecordSchema,
            fields: { aSlot: [RecA, 'body'], bSlot: [RecB, 'tag'] },
        });
        const id = s.insert();
        s.rs.releaseEntityRecords(declaration);
        expect(s.rs.poolSlotOf(RecordSchema.name, id)).toBe(0);
        s.rs.releaseEntityRecords(declaration);
        expect(s.rs.poolSlotOf(RecordSchema.name, id)).toBeUndefined();

        s.rs.acquireEntityRecords(all, declaration);
        expect(() => {
            s.rs.acquireEntityRecords(all, {
                schema: RecordSchema,
                fields: { aSlot: [RecA, 'body'] },
            });
        }).toThrow(/já declarado/);
        const Other = new StructSchema('OtherRecord', { x: FieldType.u32 });
        expect(() => {
            s.rs.acquireEntityRecords(all, { schema: Other, fields: { y: [RecA, 'body'] } });
        }).toThrow(/fora do schema/);
        const Third = new StructSchema('ThirdRecord', { x: FieldType.u32 });
        expect(() => {
            s.rs.acquireEntityRecords([RecA], { schema: Third, fields: { x: [RecB, 'tag'] } });
        }).toThrow(/não está no conjunto/);
    });

    it('slot entities com record: a entrada entrega recordSlot e o conjunto entrega o pool de registros', () => {
        const s = setup();
        const decl: EntitiesSlot = slot.entities({ all, record: declaration });
        const slots = { items: decl };
        type Slots = typeof slots;
        let seen: BoundFlow<Slots> | undefined;
        class RecordFlow extends Flow<Slots, 'idle'> {
            readonly type = 'RecordFlow';
            readonly slots = slots;
            protected readonly initialState = 'idle' as const;
            protected readonly transitions: FlowTransitions<'idle', TransitionContext<Slots>> = {
                '*': {
                    slotsResolved: 'ignore',
                    entitiesChanged: 'ignore',
                    pipelinesCompiled: 'ignore',
                    poolReallocated: 'ignore',
                },
            };
            dispatch(_frame: Frame, bound: BoundFlow<Slots>): void {
                seen = bound;
            }
        }
        const registration = s.scene.flows.register(() => new RecordFlow(), {
            type: 'record',
            phase: 'forward',
        });
        const id = s.insert();
        s.scene.events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: 0, frame: 1 });
        const items = seen!.slots.items;
        expect(items.entry(id)!.recordSlot).toBe(s.rs.poolSlotOf(RecordSchema.name, id));
        expect(items.records!.buffer).toBe(s.rs.poolBufferSpec(RecordSchema.name));
        s.scene.flows.unregister(registration);
        expect(s.rs.poolSlotOf(RecordSchema.name, id)).toBeUndefined();
    });
});
