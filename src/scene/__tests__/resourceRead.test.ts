/**
 * Leitura sob demanda (`ResourceSystem.read`, spec 007, R8): devolve o dado da GPU desempacotado pelo schema; pedidos da
 * mesma tarefa saem num lote com uma cópia por faixa contígua; Resource fora da cena (ou removido antes da resposta)
 * resolve `undefined`; sem pedido, nenhuma leitura.
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

const ReadPool = new StructSchema('ReadPool', { a: FieldType.vec4f, n: FieldType.u32 });
const ReadOwn = new StructSchema('ReadOwn', { m: FieldType.vec4f }, { addressSpace: 'uniform' });

class Item extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    constructor(v: number) {
        super();
        this.data = { a: [v, v + 1, v + 2, v + 3], n: v };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'p', role: 'storage-rw', storage: 'pool', schema: ReadPool }];
    }
    getPipelineDescriptors() {
        return [];
    }
}
class Own extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    constructor() {
        super();
        this.data = { m: [7, 8, 9, 10] };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'u', role: 'uniform', schema: ReadOwn }];
    }
    getPipelineDescriptors() {
        return [];
    }
}

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core, copies } = memoryCore();
    const resources = new ResourceSystem(core, events, world);
    const frame = (): void => {
        events.emit('frameRecording', { elapsed: 0 });
    };
    return { world, resources, frame, core, copies };
}

describe('leitura sob demanda (spec 007)', () => {
    it('lê o slot do pool e o desempacota pelo schema', async () => {
        const s = setup();
        const items = [new Item(1), new Item(10), new Item(20)];
        for (const i of items) s.world.insert(i);
        s.frame();
        expect(await s.resources.read(items[1]!)).toEqual({ a: [10, 11, 12, 13], n: 10 });
    });

    it('pedidos da mesma tarefa: um lote, uma cópia por faixa contígua', async () => {
        const s = setup();
        const items = Array.from({ length: 6 }, (_, i) => new Item(i));
        for (const i of items) s.world.insert(i);
        s.frame();
        s.copies.length = 0;
        const result = await s.resources.readAll([items[0]!, items[1]!, items[2]!, items[5]!]);
        expect(result.map((r) => r?.n)).toEqual([0, 1, 2, 5]);
        expect(s.copies.map((c) => c.srcOffset / ReadPool.stride)).toEqual([0, 5]);
        expect(s.copies.map((c) => c.size / ReadPool.stride)).toEqual([3, 1]);
        expect(s.core.readback).toHaveBeenCalledTimes(1);
    });

    it('buffer individual: lê o registro inteiro', async () => {
        const s = setup();
        const own = new Own();
        s.world.insert(own);
        expect(await s.resources.read(own)).toEqual({ m: [7, 8, 9, 10] });
    });

    it('fora da cena, ou removido antes da resposta: undefined; sem pedido, nenhuma leitura', async () => {
        const s = setup();
        s.frame();
        expect(s.core.readback).not.toHaveBeenCalled();
        expect(await s.resources.read(new Item(3))).toBeUndefined();
        const item = new Item(4);
        s.world.insert(item);
        s.frame();
        const pending = s.resources.read(item);
        await Promise.resolve(); // o lote sai na microtarefa
        s.world.remove(item);
        expect(await pending).toBeUndefined();
    });
});
