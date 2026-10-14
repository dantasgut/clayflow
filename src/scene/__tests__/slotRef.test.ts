/**
 * Referências de slot (spec 008, R3): campos `u32` declarados em `slotRefs` são resolvidos pela C2 no empacotamento —
 * `self:` soma o início da faixa do próprio Resource; `ref:` resolve `{ body, index }` na faixa do Resource referido,
 * alocado antes de quem o referencia na mesma inserção. Erros nomeiam o descritor, o campo e o alvo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const Node = new StructSchema('RefNode', { pos: FieldType.vec4f });
const Link = new StructSchema('RefLink', {
    i: FieldType.u32,
    j: FieldType.u32,
    rest: FieldType.f32,
});

/** Corpo de `n` nós com `links` internos (índices locais). */
class Body extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    constructor(
        readonly n: number,
        readonly links: readonly [number, number][] = [],
    ) {
        super();
        this.data = {
            nodes: { pos: new Float32Array(n * 4) },
            links: {
                i: links.map(([a]) => a),
                j: links.map(([, b]) => b),
                rest: links.map(() => 1),
            },
        };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        const nodes: GPUDescriptor = {
            id: 'nodes',
            role: 'storage-rw',
            storage: 'pool',
            schema: Node,
            upload: 'initial',
            count: this.n,
        };
        if (this.links.length === 0) return [nodes];
        return [
            nodes,
            {
                id: 'links',
                role: 'storage-ro',
                storage: 'pool',
                schema: Link,
                upload: 'initial',
                count: this.links.length,
                slotRefs: { i: 'self:nodes', j: 'self:nodes' },
            },
        ];
    }
    getPipelineDescriptors() {
        return [];
    }
}

/** Ligação entre dois corpos: `{ body, index }`. */
class Tie extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    constructor(a: { body: Body; index: number }, b: { body: Body; index: number }) {
        super();
        this.data = { i: a, j: b, rest: 2 };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'tie',
                role: 'storage-ro',
                storage: 'pool',
                schema: Link,
                slotRefs: { i: 'ref:nodes', j: 'ref:nodes' },
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
    const links = (): [number, number][] => {
        const bytes = bytesOf(resources.poolBufferSpec('RefLink')!);
        const view = new DataView(bytes.buffer, bytes.byteOffset);
        return Array.from({ length: resources.poolCount('RefLink') }, (_, k) => [
            view.getUint32(k * Link.stride, true),
            view.getUint32(k * Link.stride + 4, true),
        ]);
    };
    return { world, frame, links };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('referências de slot (spec 008)', () => {
    it('self: índices locais viram slots absolutos da faixa do próprio corpo', () => {
        const s = setup();
        s.world.insert(new Body(3));
        s.world.insert(
            new Body(4, [
                [0, 1],
                [2, 3],
            ]),
        );
        s.frame();
        expect(s.links()).toEqual([
            [3, 4],
            [5, 6],
        ]);
    });

    it('ref: { body, index } resolve na faixa do corpo referido', () => {
        const s = setup();
        const a = new Body(2);
        const b = new Body(5);
        s.world.insert(a);
        s.world.insert(b);
        s.world.insert(new Tie({ body: a, index: 1 }, { body: b, index: 4 }));
        s.frame();
        expect(s.links()).toEqual([[1, 6]]);
    });

    it('na mesma inserção, quem referencia é alocado depois dos referidos', () => {
        const s = setup();
        const a = new Body(2);
        const b = new Body(2);
        const root = new Tie({ body: a, index: 0 }, { body: b, index: 1 });
        root.add(a).add(b);
        s.world.insert(root);
        s.frame();
        expect(s.links()).toEqual([[0, 3]]);
    });

    it('corpo fora da cena, ou índice fora da faixa: erro com o descritor, o campo e o alvo', () => {
        const s = setup();
        const outside = new Body(2);
        expect(() =>
            s.world.insert(new Tie({ body: outside, index: 0 }, { body: outside, index: 0 })),
        ).toThrow(/descritor 'tie', campo 'i'.*não está na cena/);
        const a = new Body(2);
        s.world.insert(a);
        expect(() => s.world.insert(new Tie({ body: a, index: 0 }, { body: a, index: 2 }))).toThrow(
            /campo 'j': índice 2 fora da faixa.*2 slots/,
        );
        expect(() => s.world.insert(new Body(2, [[0, 5]]))).toThrow(
            /campo 'j': índice 5 fora da faixa/,
        );
    });

    it('alvo que sai antes de quem o referencia: aviso', () => {
        const s = setup();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const a = new Body(2);
        s.world.insert(a);
        s.world.insert(new Tie({ body: a, index: 0 }, { body: a, index: 1 }));
        s.frame();
        s.world.remove(a);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/guardam slots dele/));
    });
});
