import { describe, expect, it, vi } from 'vitest';
import { composeWgsl } from '../../shaders/composeWgsl';
import { graphArgument, NodeGraph } from '../NodeGraph';
import {
    add,
    combine,
    nodeCode,
    probePoint,
    ProbeGraphFunction,
    scale,
    split,
    wave,
} from './probeGraph';

const sample = () => graphArgument('s', { position: 'vec3f', time: 'f32' });

/** `scale(s.position · (amp·sin(freq·t) + k))`, com a onda usada três vezes. */
const branching = (amp = 1) =>
    new NodeGraph({
        nodes: {
            s: sample(),
            k: graphArgument('k'),
            w: wave.with({ amp }),
            a: add,
            b: add,
            sp: split,
            c: combine,
            sc: scale.with({ factor: 2 }),
        },
        links: [
            ['s.time', 'w.t'],
            ['w.value', 'a.a'],
            ['k.value', 'a.b'],
            ['w.value', 'b.a'],
            ['w.value', 'b.b'],
            ['s.position', 'sp.v'],
            ['a.value', 'c.x'],
            ['sp.rest', 'c.rest'],
            ['c.value', 'sc.x'],
        ],
        output: 'sc.value',
    });

describe('compilePointGraph (spec 031, T057)', () => {
    it('um let por nó, na ordem topológica estável; nó com saída usada três vezes emitido uma vez', () => {
        const code = branching().compile(probePoint);
        const lets = [...code.matchAll(/let v_(\w+) =/g)].map((m) => m[1]);
        // `b` não alimenta a saída: fora do código.
        expect(lets).toEqual(['w', 'a', 'sp', 'c', 'sc']);
        expect(code.match(/n_wave\(/g)).toHaveLength(1);
        expect(code).toContain('let v_w = n_wave(s.time, data.w_amp, data.w_freq);');
        expect(code).toContain('let v_a = n_add(v_w, k);');
        expect(code).toContain('let v_c = n_combine(v_a, v_sp.rest);');
        expect(code).toContain(
            'fn probe_fn(s: ProbeSample, k: f32, data: GraphProbeParams) -> vec3f {',
        );
        expect(code).toContain('return v_sc;');
        expect(branching().compile(probePoint)).toBe(code);
    });

    it('parâmetros tipados por nó (`nó_parâmetro`) com os valores do uso ou o padrão', () => {
        const g = branching(3);
        expect(g.params()).toEqual({ w_amp: 'f32', w_freq: 'f32', sc_factor: 'f32' });
        expect(g.values()).toEqual({ w_amp: 3, w_freq: 1, sc_factor: 2 });
        expect(g.modules()).toEqual([nodeCode]);
    });

    it('a função gerada implementa o ponto e passa em point.check; mesma forma, valores diferentes → mesmo módulo', () => {
        const f1 = new ProbeGraphFunction({ graph: branching(1) });
        const f2 = new ProbeGraphFunction({ graph: branching(5) });
        expect(f1.module).toBe(f2.module);
        expect(f1.values.w_amp).toBe(1);
        expect(f2.values.w_amp).toBe(5);
        expect(f1.module.source).toContain('struct GraphProbeParams_');
        expect(f1.module.source).toContain('w_amp: f32,');
        expect(() => composeWgsl(f1.module)).not.toThrow();
        expect(f1.graph).toBeDefined();
    });

    it('forma diferente → módulo diferente', () => {
        const other = new NodeGraph({
            nodes: { s: sample(), sc: scale },
            links: [['s.position', 'sc.x']],
            output: 'sc.value',
        });
        expect(new ProbeGraphFunction({ graph: other }).module).not.toBe(
            new ProbeGraphFunction({ graph: branching() }).module,
        );
    });

    it('grafo que só repassa um argumento do ponto: sem nós de função', () => {
        const g = new NodeGraph({ nodes: { s: sample() }, links: [], output: 's.position' });
        expect(g.compile(probePoint)).toContain('return s.position;');
        expect(new ProbeGraphFunction({ graph: g }).params).toEqual({});
    });

    it('grafo sem saída: a implementação pronta do ponto, com aviso único; ligar a saída passa a valer', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const empty = new NodeGraph({
            nodes: { s: sample(), sc: scale },
            links: [['s.position', 'sc.x']],
        });
        expect(empty.order()).toEqual([]);
        const fn = new ProbeGraphFunction({ graph: empty });
        const again = new ProbeGraphFunction({ graph: new NodeGraph({ nodes: {}, links: [] }) });
        expect(fn.module).toBe(probePoint.ready);
        expect(again.module).toBe(probePoint.ready);
        expect(fn.implemented).toBe(false);
        expect(fn.params).toEqual({});
        expect(warn.mock.calls.filter((c) => String(c[0]).includes("'graph_probe'"))).toHaveLength(
            1,
        );
        fn.setGraph(
            new NodeGraph({
                nodes: { s: sample(), sc: scale },
                links: [['s.position', 'sc.x']],
                output: 'sc.value',
            }),
        );
        expect(fn.implemented).toBe(true);
        expect(fn.revision).toBe(1);
        expect(fn.module).not.toBe(probePoint.ready);
        warn.mockRestore();
    });
});
