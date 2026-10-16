import { describe, expect, it } from 'vitest';
import { graphArgument, NodeGraph } from '../NodeGraph';
import { NodeGraphError } from '../NodeGraphError';
import { ddx, probePoint, ProbeGraphFunction, scale, wave } from './probeGraph';

const sample = () => graphArgument('s', { position: 'vec3f', time: 'f32' });
const scaled = () =>
    new NodeGraph({
        nodes: { s: sample(), sc: scale.with({ factor: 4 }) },
        links: [['s.position', 'sc.x']],
        output: 'sc.value',
    });

describe('grafo como função de ponto (spec 031, T058)', () => {
    it('descritor do registro tipado da forma (pool <ponto>:<hash>), como as funções da 009', () => {
        const fn = new ProbeGraphFunction({ graph: scaled() });
        expect(fn.getDescriptors()).toEqual([
            { id: 'params', role: 'storage-ro', schema: fn.record, storage: 'pool' },
        ]);
        expect(fn.record).toBe(probePoint.record(fn.params).schema);
        expect(fn.record.name).toMatch(/^graph_probe:[0-9a-f]{8}$/);
    });

    it('mudar valor: vai para o registro sem nova compilação (revisão e módulo iguais)', () => {
        const fn = new ProbeGraphFunction({ graph: scaled() });
        const module = fn.module;
        fn.values.sc_factor = 9;
        expect(fn.values.sc_factor).toBe(9);
        expect(fn.revision).toBe(0);
        expect(fn.module).toBe(module);
    });

    it('setGraph (topologia nova): revisão +1, módulo novo, valores de mesmo nome e tipo mantidos', () => {
        const fn = new ProbeGraphFunction({ graph: scaled() });
        fn.values.sc_factor = 7;
        const before = fn.module;
        fn.setGraph(
            new NodeGraph({
                nodes: { s: sample(), w: wave, sc: scale },
                links: [
                    ['s.time', 'w.t'],
                    ['w.value', 'sc.x'],
                ],
                output: 'sc.value',
            }),
        );
        expect(fn.revision).toBe(1);
        expect(fn.module).not.toBe(before);
        expect(fn.values.sc_factor).toBe(7);
        expect(fn.values.w_amp).toBe(1);
        expect(fn.code).toContain('let v_w = n_wave(s.time');
    });

    it('grafo que não vale no ponto: lança e o anterior continua', () => {
        const fn = new ProbeGraphFunction({ graph: scaled() });
        const before = { module: fn.module, params: fn.params, code: fn.code };
        const bad = new NodeGraph({
            nodes: { s: sample(), d: ddx, sc: scale },
            links: [
                ['s.time', 'd.x'],
                ['d.value', 'sc.x'],
            ],
            output: 'sc.value',
        });
        expect(() => {
            fn.setGraph(bad);
        }).toThrow(NodeGraphError);
        expect(fn.module).toBe(before.module);
        expect(fn.params).toBe(before.params);
        expect(fn.code).toBe(before.code);
        expect(fn.revision).toBe(0);
        expect(fn.values.sc_factor).toBe(4);
    });

    it('código e grafo não se misturam: setCode num grafo e setGraph num código lançam', () => {
        const g = new ProbeGraphFunction({ graph: scaled() });
        expect(() => {
            g.setCode('fn probe_fn() {}');
        }).toThrow(/setGraph/);
        const c = new ProbeGraphFunction({
            code: 'fn probe_fn(s: ProbeSample, k: f32, data: GraphProbeParams) -> vec3f { return s.position; }',
        });
        expect(() => {
            c.setGraph(scaled());
        }).toThrow(/setCode/);
    });
});
