import { describe, expect, it } from 'vitest';
import { composeWgsl } from '../../shaders/composeWgsl';
import { compileSetGraph } from '../compileSetGraph';
import { graphArgument, NodeGraph } from '../NodeGraph';
import { NodeGraphError } from '../NodeGraphError';
import { defineSetNode } from '../SetNode';
import { add } from './probeGraph';
import { filter, map, NUMS, other, sink, source, weightAt } from './probeSetGraph';

const chain = () =>
    new NodeGraph({
        nodes: {
            snk: sink,
            f: filter,
            m: map,
            src: source.with({ n: 1000 }),
            x: graphArgument('x'),
            w: add.with({}),
        },
        links: [
            ['src.out', 'm.in'],
            ['m.out', 'f.in'],
            ['f.out', 'snk.in'],
            ['x.value', 'w.a'],
            ['w.value', 'm.weight'],
        ],
    });

const values = (g: NodeGraph) => (id: string) => {
    const all = g.allValues();
    return Object.fromEntries(
        Object.entries(all)
            .filter(([k]) => k.startsWith(`${id}_`))
            .map(([k, v]) => [k.slice(id.length + 1), v]),
    );
};

describe('compileSetGraph (spec 031, T067)', () => {
    it('nós de conjunto em ordem topológica (fora da ordem de declaração); nós de ponto fora da ordem', () => {
        const g = chain();
        expect(g.setOrder()).toEqual(['src', 'm', 'f', 'snk']);
        expect(compileSetGraph(g, values(g)).nodes.map((n) => n.id)).toEqual([
            'src',
            'm',
            'f',
            'snk',
        ]);
    });

    it('capacidade pela regra; registro próprio, o da entrada (same) ou da GPU; contagens da CPU', () => {
        const g = chain();
        const plan = compileSetGraph(g, values(g));
        const [src, m, f] = plan.nodes;
        const so = src!.outputs.get('out.values')!;
        const mo = m!.outputs.get('out.values')!;
        const fo = f!.outputs.get('out.values')!;
        expect(so).toMatchObject({ capacity: 1000, slot: 0, count: 'cpu' });
        expect(mo).toMatchObject({ capacity: 1000, slot: 0, count: 'same' });
        expect(fo).toMatchObject({ capacity: 1000, slot: 1, count: 'gpu' });
        expect(m!.inputs.get('in.values')).toBe(so);
        expect(plan.slots).toBe(2);
        expect([...plan.cpuCounts]).toEqual([[0, 1000]]);
        expect(plan.sets.map((s) => s.key)).toEqual([
            'src.out.values',
            'm.out.values',
            'f.out.values',
        ]);
        expect(plan.animated).toBe(false);
    });

    it('grafo de ponto da entrada de ponto fundido: implementa a função do kernel, parâmetros num uniform', () => {
        const g = chain();
        const fused = compileSetGraph(g, values(g)).nodes[1]!.points.get('weight')!;
        expect(fused.graph.order()).toEqual(['x', 'w']);
        expect(fused.params).toEqual([]);
        expect(fused.module.source).toContain(
            'fn probe_weight_fn(x: f32, data: ProbeWeightParams) -> f32 {',
        );
        expect(fused.module.source).toContain('fn probe_weight(x: f32) -> f32 {');
        expect(fused.module.source).toContain('return probe_weight_fn(x, probe_weight_params);');
        expect(fused.resource.name).toBe('probe_weight_params');
        expect(() => composeWgsl(fused.module)).not.toThrow();
        // Mesma forma em outro grafo: o mesmo módulo.
        const g2 = chain();
        expect(compileSetGraph(g2, values(g2)).nodes[1]!.points.get('weight')!.module).toBe(
            fused.module,
        );
        // Sem ligação: nada fundido (o kernel usa o pronto).
        const bare = new NodeGraph({ nodes: { s: source, m: map }, links: [['s.out', 'm.in']] });
        expect(compileSetGraph(bare, values(bare)).nodes[1]!.points.size).toBe(0);
        expect(weightAt.ready.source).toContain('return 1.0');
    });

    it('validação: conjunto de outro tipo, conjunto em entrada de ponto, entrada de conjunto solta, capacidade inválida', () => {
        const fail = (fn: () => unknown): NodeGraphError => {
            try {
                fn();
            } catch (e) {
                expect(e).toBeInstanceOf(NodeGraphError);
                return e as NodeGraphError;
            }
            throw new Error('não lançou');
        };
        expect(
            fail(() => new NodeGraph({ nodes: { o: other, s: sink }, links: [['o.out', 's.in']] }))
                .kind,
        ).toBe('type-mismatch');
        expect(
            fail(
                () =>
                    new NodeGraph({ nodes: { a: source, m: map }, links: [['a.out', 'm.weight']] }),
            ).kind,
        ).toBe('type-mismatch');
        const loose = fail(() => new NodeGraph({ nodes: { s: sink }, links: [] }));
        expect(loose.kind).toBe('unconnected-input');
        expect(loose.detail).toEqual(['s', 'in']);
        const zero = new NodeGraph({ nodes: { s: source.with({ n: 0 }) }, links: [] });
        expect(fail(() => compileSetGraph(zero, values(zero))).message).toMatch(
            /capacidade de 's.out.values'/,
        );
        expect(() =>
            defineSetNode({
                name: 'bad',
                outputs: { out: NUMS },
                counts: { 'out.nope': 'gpu' },
                create: () => null!,
            }),
        ).toThrow(/não é conjunto de saída/);
    });
});
