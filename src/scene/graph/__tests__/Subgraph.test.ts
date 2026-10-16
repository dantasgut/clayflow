import { describe, expect, it } from 'vitest';
import { composeWgsl } from '../../shaders/composeWgsl';
import { compileSetGraph } from '../compileSetGraph';
import { graphArgument, NodeGraph } from '../NodeGraph';
import { NodeGraphError } from '../NodeGraphError';
import { Subgraph } from '../Subgraph';
import { add, probePoint, ProbeGraphFunction, scale, wave } from './probeGraph';
import { filter, map, sink, source } from './probeSetGraph';

/** `amp·sin(freq·t) + 1`, com a amplitude exposta. */
const inner = () =>
    new NodeGraph({
        nodes: { t: graphArgument('t'), w: wave.with({ amp: 2, freq: 3 }), a: add },
        links: [
            ['t.value', 'w.t'],
            ['w.value', 'a.a'],
        ],
        output: 'a.value',
    });

describe('Subgraph (spec 031, T079)', () => {
    it('de ponto: um nó com os parâmetros expostos; os outros no código; função emitida uma vez por shader', () => {
        const sub = Subgraph.point(inner(), {
            name: 'sub.wave',
            inputs: { t: 'f32' },
            expose: ['w.amp'],
        });
        expect(sub.inputs).toEqual({ t: 'f32' });
        expect(sub.outputs).toEqual({ value: 'f32' });
        expect(Object.keys(sub.params)).toEqual(['w_amp']);
        expect(sub.params.w_amp!.default).toBe(2);
        expect(sub.code.source).toContain('f32(3)');
        expect(sub.code.source).not.toContain('f32(2)');
        const outer = new NodeGraph({
            nodes: {
                s: graphArgument('s', { position: 'vec3f', time: 'f32' }),
                a: sub.with({ w_amp: 5 }),
                b: sub,
                sum: add,
                sc: scale,
            },
            links: [
                ['s.time', 'a.t'],
                ['s.time', 'b.t'],
                ['a.value', 'sum.a'],
                ['b.value', 'sum.b'],
                ['sum.value', 'sc.x'],
                ['s.position', 'sc.x'],
            ].slice(0, 5) as [string, string][],
            output: 'sum.value',
        });
        // Valores por uso; o mesmo módulo nos dois usos.
        expect(outer.values()).toMatchObject({ a_w_amp: 5, b_w_amp: 2 });
        expect(outer.modules().filter((m) => m === sub.code)).toHaveLength(1);
        const fn = new ProbeGraphFunction({ graph: outer });
        expect(fn.code.match(/sub_[0-9a-f]{8}\(/g)).toHaveLength(2);
        expect(fn.module.requires).toContain(sub.code);
        expect(() => composeWgsl(fn.module)).not.toThrow();
        // Mesmo sub-grafo de novo: a mesma definição de código.
        expect(
            Subgraph.point(inner(), { name: 'sub.wave', inputs: { t: 'f32' }, expose: ['w.amp'] })
                .code.source,
        ).toBe(sub.code.source);
        expect(fn.point).toBe(probePoint);
    });

    it('ciclo através de sub-grafo detectado; parâmetro exposto inexistente', () => {
        const sub = Subgraph.point(inner(), { name: 'sub.wave', inputs: { t: 'f32' } });
        expect(
            () =>
                new NodeGraph({
                    nodes: { a: sub, b: add },
                    links: [
                        ['a.value', 'b.a'],
                        ['b.value', 'a.t'],
                    ],
                    output: 'b.value',
                }),
        ).toThrow(/ciclo a → b → a/);
        expect(() =>
            Subgraph.point(inner(), { name: 'x', inputs: { t: 'f32' }, expose: ['w.nope'] }),
        ).toThrow(NodeGraphError);
    });

    it('de conjunto: expandido no grafo de fora, com valores do uso nos expostos e contagens atravessando', () => {
        // A entrada de `m` fica aberta: a fronteira do sub-grafo; sem `open`, o grafo de dentro é inválido.
        expect(() => new NodeGraph({ nodes: { m: map }, links: [] })).toThrow(/não tem ligação/);
        const pipeline = new NodeGraph({
            nodes: { m: map, f: filter.with({ keep: 0.75 }), k: sink },
            links: [
                ['m.out', 'f.in'],
                ['f.out', 'k.in'],
            ],
            open: ['m.in'],
        });
        const sub = Subgraph.set(
            new NodeGraph({
                nodes: { m: map, f: filter.with({ keep: 0.75 }) },
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
        const outer = new NodeGraph({
            nodes: { src: source.with({ n: 50 }), p: sub.with({ f_keep: 0.1 }), q: sub, k: sink },
            links: [
                ['src.out', 'p.in'],
                ['p.out', 'q.in'],
                ['q.out', 'k.in'],
            ],
        });
        expect(outer.setOrder()).toEqual(['src', 'p_m', 'p_f', 'q_m', 'q_f', 'k']);
        expect(outer.allValues()).toMatchObject({ p_f_keep: 0.1, q_f_keep: 0.75, src_n: 50 });
        const plan = compileSetGraph(outer, (id) => ({ ...outer.node(id).values }));
        expect(plan.nodes.find((n) => n.id === 'p_m')!.inputs.get('in.values')!.key).toBe(
            'src.out.values',
        );
        expect(plan.nodes.find((n) => n.id === 'k')!.inputs.get('in.values')!.key).toBe(
            'q_f.out.values',
        );
        expect(() => Subgraph.set(pipeline, { name: 'bad', inputs: { in: 'k.nope' } })).toThrow(
            /não é entrada de nó de conjunto/,
        );
        expect(() => Subgraph.set(pipeline, { name: 'bad', inputs: { in: 'k.in' } })).toThrow(
            /não está aberta/,
        );
    });
});
