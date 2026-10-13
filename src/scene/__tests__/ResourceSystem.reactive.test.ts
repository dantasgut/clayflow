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

const UniformSchema = new StructSchema('ReactiveUniform', { value: FieldType.vec4f });
const PoolSchema = new StructSchema('ReactivePool', { value: FieldType.vec4f });

class UniformThing extends Entity implements Resource {
    static readonly schema = UniformSchema;
    state = ResourceState.Uninitialized;
    constructor() {
        super();
        this.data = { value: [0, 0, 0, 0] };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'u', role: 'uniform', schema: UniformSchema }];
    }
    getPipelineDescriptors() {
        return [];
    }
}

class PoolThing extends Entity implements Resource {
    static readonly schema = PoolSchema;
    state = ResourceState.Uninitialized;
    constructor(v = 0) {
        super();
        this.data = { value: [v, 0, 0, 0] };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'p', role: 'storage-rw', storage: 'pool', schema: PoolSchema }];
    }
    getPipelineDescriptors() {
        return [];
    }
}

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core, writes } = fakeResourceCore();
    const resources = new ResourceSystem(core, events, world);
    const frame = (): void => {
        events.emit('frameRecording', { elapsed: 0 });
    };
    return { events, world, core, writes, resources, frame };
}

describe('ResourceSystem — dado reativo e fila por quadro', () => {
    it('mutação não escreve na hora; frameRecording escreve uma vez com o último valor', () => {
        const { world, writes, frame } = setup();
        const thing = new UniformThing();
        world.insert(thing);
        const afterAlloc = writes.length;
        for (let i = 1; i <= 10; i++) (thing.data.value as number[])[0] = i;
        expect(writes.length).toBe(afterAlloc);
        frame();
        expect(writes.length).toBe(afterAlloc + 1);
        expect(f32At(writes.at(-1)!, 0)).toBe(10);
        frame();
        expect(writes.length).toBe(afterAlloc + 1);
    });

    it('atribuição do campo inteiro e substituição de data também marcam sujo', () => {
        const { world, writes, frame } = setup();
        const thing = new UniformThing();
        world.insert(thing);
        const base = writes.length;
        thing.data.value = [7, 0, 0, 0];
        frame();
        expect(f32At(writes.at(-1)!, 0)).toBe(7);
        thing.data = { value: [9, 0, 0, 0] };
        frame();
        expect(writes.length).toBe(base + 2);
        expect(f32At(writes.at(-1)!, 0)).toBe(9);
    });

    it('emite resourceReady uma vez por recurso enviado no quadro', () => {
        const { world, events, frame } = setup();
        const thing = new UniformThing();
        world.insert(thing);
        let readies = 0;
        events.on('resourceReady', (e) => {
            if (e.payload.resource === thing) readies++;
        });
        (thing.data.value as number[])[0] = 1;
        (thing.data.value as number[])[1] = 2;
        frame();
        expect(readies).toBe(1);
        expect(thing.state).toBe(ResourceState.Ready);
    });

    it('recurso não inserido não enfileira nada', () => {
        const { writes, events, frame } = setup();
        const thing = new UniformThing();
        (thing.data.value as number[])[0] = 1;
        events.emit('resourceDirty', { payload: { resource: thing } });
        frame();
        expect(writes.length).toBe(0);
    });

    it('recurso removido antes do frameRecording não é escrito', () => {
        const { world, writes, frame } = setup();
        const thing = new UniformThing();
        world.insert(thing);
        (thing.data.value as number[])[0] = 1;
        world.remove(thing);
        const base = writes.length;
        frame();
        expect(writes.length).toBe(base);
    });

    it('resourceDirty manual entra na mesma fila', () => {
        const { world, writes, events, frame } = setup();
        const thing = new UniformThing();
        world.insert(thing);
        const base = writes.length;
        events.emit('resourceDirty', { payload: { resource: thing } });
        events.emit('resourceDirty', { payload: { resource: thing } });
        expect(writes.length).toBe(base);
        frame();
        expect(writes.length).toBe(base + 1);
    });

    it('membro de pool é escrito no offset slot × stride', () => {
        const { world, writes, frame, resources } = setup();
        const a = new PoolThing(1);
        const b = new PoolThing(2);
        world.insert(a);
        const idB = world.insert(b);
        frame(); // dado inicial dos dois slots numa faixa
        (b.data.value as number[])[0] = 5;
        frame();
        const last = writes.at(-1)!;
        const slot = resources.poolSlotOf('ReactivePool', idB)!;
        expect(slot).toBe(1);
        expect(last.offset).toBe(slot * 16);
        expect(f32At(last, 0)).toBe(5);
    });

    it('flushDirty drena a fila: reação a resourceReady que suja outro recurso entra no mesmo quadro', () => {
        const { events, world, writes, resources, frame } = setup();
        const source = new UniformThing();
        const derived = new PoolThing();
        world.insert(source);
        world.insert(derived);
        events.on('resourceReady', (e) => {
            if (e.payload.resource === source) derived.data.value = [7, 0, 0, 0];
        });
        source.data.value = [1, 0, 0, 0];
        writes.length = 0;
        frame();
        const pool = resources.poolBufferSpec('ReactivePool');
        const toPool = writes.filter((w) => w.spec === pool);
        expect(toPool).toHaveLength(1);
        expect(f32At(toPool[0]!, 0)).toBe(7);
    });

    it('ciclo de reações sem fim é detectado', () => {
        const { events, world, frame } = setup();
        const a = new UniformThing();
        world.insert(a);
        let n = 0;
        events.on('resourceReady', (e) => {
            if (e.payload.resource === a) a.data.value = [++n, 0, 0, 0];
        });
        a.data.value = [1, 0, 0, 0];
        expect(frame).toThrow(/não esvaziou/);
    });
});
