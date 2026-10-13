/**
 * Slots vivos na GPU (spec 008, R2): bitset de ocupação por pool, criado no primeiro pedido, atualizado no mesmo
 * envio da alocação ou liberação (uma escrita por faixa de palavras) e recriado no crescimento do pool.
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

const LiveDot = new StructSchema('LiveDot', { pos: FieldType.vec4f });

class Dots extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    constructor(readonly n: number) {
        super();
        this.data = { dots: { pos: new Float32Array(n * 4) } };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'dots',
                role: 'storage-rw',
                storage: 'pool',
                schema: LiveDot,
                upload: 'initial',
                count: this.n,
            },
        ];
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
    const frame = (): void => {
        events.emit('frameRecording', { elapsed: 0 });
    };
    const live = (): number[] => {
        const spec = resources.poolLiveBuffer('LiveDot')!;
        const words = new Uint32Array(bytesOf(spec).slice().buffer);
        const out: number[] = [];
        for (let slot = 0; slot < words.length * 32; slot++)
            if (((words[slot >>> 5]! >>> (slot & 31)) & 1) === 1) out.push(slot);
        return out;
    };
    return { world, resources, frame, live, core, events };
}

describe('slots vivos na GPU (spec 008)', () => {
    it('criado no primeiro pedido com o estado atual', () => {
        const s = setup();
        s.world.insert(new Dots(3));
        s.frame();
        expect(s.live()).toEqual([0, 1, 2]);
    });

    it('liberação e alocação atualizam os bits no mesmo envio', () => {
        const s = setup();
        const a = new Dots(2);
        const b = new Dots(3);
        s.world.insert(a);
        s.world.insert(b);
        s.frame();
        s.resources.poolLiveBuffer('LiveDot');
        s.world.remove(a);
        s.frame();
        expect(s.live()).toEqual([2, 3, 4]);
        s.world.insert(new Dots(1));
        s.frame();
        expect(s.live()).toEqual([0, 2, 3, 4]);
    });

    it('crescimento recria o bitset com o estado e anuncia poolReallocated', () => {
        const s = setup();
        s.world.insert(new Dots(2));
        s.frame();
        const before = s.resources.poolLiveBuffer('LiveDot');
        let reallocated = 0;
        s.events.on('poolReallocated', () => {
            reallocated++;
        });
        s.world.insert(new Dots(200));
        s.frame();
        expect(reallocated).toBeGreaterThan(0);
        expect(s.resources.poolLiveBuffer('LiveDot')).not.toBe(before);
        expect(s.live().length).toBe(202);
    });

    it('resolver `<pool>.live` registrado com o pool', () => {
        const s = setup();
        s.world.insert(new Dots(1));
        expect(s.resources.poolLiveBuffer('nada')).toBeUndefined();
        expect(s.resources.poolLiveBuffer('LiveDot')).toBeDefined();
    });
});
