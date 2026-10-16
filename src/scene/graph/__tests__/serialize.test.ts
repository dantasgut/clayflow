import { describe, expect, it } from 'vitest';
import { wgslModule } from '../../shaders/WgslModule';
import { compileSetGraph } from '../compileSetGraph';
import { defineNode } from '../NodeDefinition';
import { graphArgument, NodeGraph } from '../NodeGraph';
import { NodeGraphError } from '../NodeGraphError';
import { NodeRegistry } from '../NodeRegistry';
import { fromJSON, GRAPH_JSON_VERSION, toJSON } from '../serialize';
import { Subgraph } from '../Subgraph';
import { add, combine, probePoint, scale, split, wave } from './probeGraph';
import { filter, map, sink, source } from './probeSetGraph';

const registry = new NodeRegistry([add, combine, scale, split, wave, source, map, filter, sink]);

/** Nó WGSL do usuário, fora do registro e sem dependências. */
const twice = defineNode({
    name: 'user.twice',
    inputs: { x: 'f32' },
    outputs: { value: 'f32' },
    code: wgslModule({
        name: 'user_twice',
        source: 'fn user_twice(x: f32) -> f32 { return 2.0 * x; }',
    }),
    fn: 'user_twice',
});

const point = () => {
    const sub = Subgraph.point(
        new NodeGraph({
            nodes: { t: graphArgument('t'), w: wave.with({ freq: 4 }) },
            links: [['t.value', 'w.t']],
            output: 'w.value',
        }),
        { name: 'sub.wave', inputs: { t: 'f32' }, expose: ['w.amp'] },
    );
    return new NodeGraph({
        nodes: {
            s: graphArgument('s', { position: 'vec3f', time: 'f32' }),
            u: sub.with({ w_amp: 3 }),
            d: twice,
            sc: scale.with({ factor: 0.5 }),
        },
        links: [
            ['s.time', 'u.t'],
            ['u.value', 'd.x'],
            ['s.position', 'sc.x'],
        ],
        output: 'sc.value',
    });
};

describe('serialização (spec 031, T080)', () => {
    it('ida e volta: mesmo JSON, mesma forma, mesmo código; sub-grafo e nó do usuário pela estrutura e pelo código', () => {
        const g = point();
        const json = toJSON(g, registry);
        expect(json.version).toBe(GRAPH_JSON_VERSION);
        expect(json.nodes.find((n) => n.id === 'd')).toMatchObject({ type: 'wgsl' });
        expect(json.nodes.find((n) => n.id === 'u')).toMatchObject({
            type: 'subgraph',
            subgraph: 'sub.wave',
        });
        expect(json.subgraphs?.['sub.wave']).toMatchObject({ kind: 'point' });
        const text = JSON.stringify(json);
        const again = fromJSON(JSON.parse(text), registry);
        expect(JSON.stringify(toJSON(again, registry))).toBe(text);
        expect(again.compile(probePoint)).toBe(g.compile(probePoint));
        expect(again.values()).toEqual(g.values());
        // Duas leituras: o mesmo nó do usuário (mesmo módulo).
        const third = fromJSON(JSON.parse(text), registry);
        expect(third.node('d').definition).toBe(again.node('d').definition);
    });

    it('nós do usuário do mesmo módulo voltam com um módulo só (dois módulos com o mesmo nome não se montam)', () => {
        const shared = wgslModule({
            name: 'user_pair',
            source: [
                'fn user_inc(x: f32) -> f32 { return x + 1.0; }',
                'fn user_dec(x: f32) -> f32 { return x - 1.0; }',
            ].join('\n'),
        });
        const inc = defineNode({
            name: 'user.inc',
            inputs: { x: 'f32' },
            outputs: { value: 'f32' },
            code: shared,
            fn: 'user_inc',
        });
        const dec = defineNode({
            name: 'user.dec',
            inputs: { x: 'f32' },
            outputs: { value: 'f32' },
            code: shared,
            fn: 'user_dec',
        });
        const g = new NodeGraph({
            nodes: { s: graphArgument('s', { time: 'f32' }), i: inc, d: dec },
            links: [
                ['s.time', 'i.x'],
                ['i.value', 'd.x'],
            ],
            output: 'd.value',
        });
        const again = fromJSON(JSON.parse(JSON.stringify(toJSON(g, registry))), registry);
        expect(again.node('i').definition!.code).toBe(again.node('d').definition!.code);
        expect(again.modules()).toHaveLength(1);
    });

    it('grafo de conjunto com sub-grafo de conjunto e entradas abertas', () => {
        const sub = Subgraph.set(
            new NodeGraph({
                nodes: { m: map, f: filter },
                links: [['m.out', 'f.in']],
                open: ['m.in'],
            }),
            {
                name: 'sub.filter',
                inputs: { in: 'm.in' },
                outputs: { out: 'f.out' },
                expose: ['f.keep'],
            },
        );
        const g = new NodeGraph({
            nodes: { src: source.with({ n: 20 }), p: sub.with({ f_keep: 0.2 }), k: sink },
            links: [
                ['src.out', 'p.in'],
                ['p.out', 'k.in'],
            ],
        });
        const json = toJSON(g, registry);
        const again = fromJSON(JSON.parse(JSON.stringify(json)), registry);
        expect(again.setOrder()).toEqual(g.setOrder());
        expect(again.allValues()).toEqual(g.allValues());
        const values = (gr: NodeGraph) => (id: string) => ({ ...gr.node(id).values });
        expect(
            compileSetGraph(again, values(again)).sets.map((s) => [s.key, s.capacity, s.slot]),
        ).toEqual(compileSetGraph(g, values(g)).sets.map((s) => [s.key, s.capacity, s.slot]));
    });

    it('erros: tipo desconhecido (nomeando tipo e nó), versão, sub-grafo não declarado, nó fora do registro', () => {
        const fail = (fn: () => unknown): NodeGraphError => {
            try {
                fn();
            } catch (e) {
                expect(e).toBeInstanceOf(NodeGraphError);
                return e as NodeGraphError;
            }
            throw new Error('não lançou');
        };
        const json = toJSON(point(), registry);
        const unknown = fail(() => fromJSON(json, new NodeRegistry([scale])));
        expect(unknown.kind).toBe('serialization');
        expect(unknown.message).toMatch(/tipo de nó 'probe\.wave'/);
        expect(fail(() => fromJSON({ ...json, version: 99 }, registry)).message).toMatch(
            /versão 99/,
        );
        expect(fail(() => fromJSON({ ...json, subgraphs: {} }, registry)).message).toMatch(
            /sub-grafo 'sub\.wave'/,
        );
        const g = new NodeGraph({ nodes: { s: source, k: sink }, links: [['s.out', 'k.in']] });
        expect(fail(() => toJSON(g, new NodeRegistry([source]))).detail).toEqual([
            'k',
            'probe.sink',
        ]);
    });
});
