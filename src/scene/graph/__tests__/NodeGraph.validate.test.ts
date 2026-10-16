import { describe, expect, it } from 'vitest';
import { graphArgument, NodeGraph, type NodeGraphOptions } from '../NodeGraph';
import { NodeGraphError } from '../NodeGraphError';
import { add, combine, ddx, probePoint, scale, split, wave } from './probeGraph';

const sample = () => graphArgument('s', { position: 'vec3f', time: 'f32' });

const error = (fn: () => unknown): NodeGraphError => {
    try {
        fn();
    } catch (e) {
        expect(e).toBeInstanceOf(NodeGraphError);
        return e as NodeGraphError;
    }
    throw new Error('não lançou');
};
const build = (o: NodeGraphOptions) => new NodeGraph(o);

describe('NodeGraph — validação síncrona (spec 031, T056)', () => {
    it('grafo válido: nós, ligações e saída', () => {
        const g = build({
            nodes: { s: sample(), w: wave, sc: scale },
            links: [
                ['s.position', 'sc.x'],
                ['s.time', 'w.t'],
            ],
            output: 'sc.value',
        });
        expect(g.sourceOf('sc.x')).toBe('s.position');
        expect(g.order()).toEqual(['s', 'sc']);
    });

    it('tipos incompatíveis no ponto alvo nomeiam origem e destino', () => {
        const g = build({
            nodes: { s: sample(), sp: split, c: combine },
            links: [
                ['s.position', 'sp.v'],
                ['sp.rest', 'c.x'],
                ['sp.rest', 'c.rest'],
            ],
            output: 'c.value',
        });
        const e = error(() => g.compile(probePoint));
        expect(e.kind).toBe('type-mismatch');
        expect(e.detail).toEqual(['sp.rest', 'c.x']);
        expect(e.message).toContain('(vec2f)');
        expect(e.message).toContain('(f32)');
    });

    it('conversão declarada escalar → vetor (repetição) na ligação e no retorno', () => {
        const g = build({
            nodes: { s: sample(), w: wave },
            links: [['s.time', 'w.t']],
            output: 'w.value',
        });
        expect(g.compile(probePoint)).toContain('return vec3f(v_w);');
    });

    it('entrada sem ligação nem padrão', () => {
        const e = error(() => build({ nodes: { sc: scale }, links: [], output: 'sc.value' }));
        expect(e.kind).toBe('unconnected-input');
        expect(e.detail).toEqual(['sc', 'x']);
        // Com padrão: aceita.
        expect(() =>
            build({
                nodes: { s: sample(), a: add },
                links: [['s.time', 'a.a']],
                output: 'a.value',
            }),
        ).not.toThrow();
    });

    it('ciclo com o caminho completo', () => {
        const e = error(() =>
            build({
                nodes: { a: add, b: add, c: add },
                links: [
                    ['a.value', 'b.a'],
                    ['b.value', 'c.a'],
                    ['c.value', 'a.a'],
                ],
                output: 'c.value',
            }),
        );
        expect(e.kind).toBe('cycle');
        expect(e.detail).toEqual(['a', 'b', 'c', 'a']);
        expect(e.message).toContain('a → b → c → a');
    });

    it('nó só de fragment num ponto de compute', () => {
        const g = build({
            nodes: { s: sample(), d: ddx },
            links: [['s.time', 'd.x']],
            output: 'd.value',
        });
        const e = error(() => g.compile(probePoint));
        expect(e.kind).toBe('context');
        expect(e.detail).toEqual(['d', 'probe.ddx', 'compute']);
    });

    it('nó, porta e ligação duplicada inexistentes; argumento que o ponto não tem', () => {
        expect(
            error(() =>
                build({ nodes: { a: add }, links: [['x.value', 'a.a']], output: 'a.value' }),
            ).kind,
        ).toBe('unknown-node');
        expect(
            error(() => build({ nodes: { a: add }, links: [['a.nope', 'a.b']], output: 'a.value' }))
                .kind,
        ).toBe('unknown-port');
        expect(
            error(() =>
                build({
                    nodes: { s: sample(), a: add },
                    links: [['s.uv', 'a.a']],
                    output: 'a.value',
                }),
            ).kind,
        ).toBe('unknown-port');
        const dup = error(() =>
            build({
                nodes: { s: sample(), a: add },
                links: [
                    ['s.time', 'a.a'],
                    ['s.time', 'a.a'],
                ],
                output: 'a.value',
            }),
        );
        expect(dup.kind).toBe('duplicate-link');
        expect(dup.detail[0]).toBe('a.a');
        const g = build({
            nodes: { q: graphArgument('q', { x: 'f32' }), a: add },
            links: [['q.x', 'a.a']],
            output: 'a.value',
        });
        expect(error(() => g.compile(probePoint)).kind).toBe('target');
        expect(
            error(() => build({ nodes: { 'não-id': add }, links: [], output: 'x.y' })).kind,
        ).toBe('unknown-node');
    });
});
