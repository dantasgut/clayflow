import { describe, expect, it } from 'vitest';
import { wgslModule } from '../../shaders/WgslModule';
import { POINT_PARAMS, wgslPoint } from '../../shaders/WgslPoint';
import { WgslCompositionError } from '../../shaders/WgslCompositionError';
import { defineNode } from '../NodeDefinition';
import { graphArgument, NodeGraph } from '../NodeGraph';
import { Subgraph } from '../Subgraph';
import { nodeCode } from './probeGraph';

// Marcas dos nós e retorno alternativo do ponto (spec 011, T026): o núcleo do grafo une as marcas sem interpretá-las, e
// um ponto aceita outro retorno declarado — o grafo devolve o tipo da saída quando ele é um dos aceitos.

const tagged = (name: string, tags: readonly string[]) =>
    defineNode({
        name,
        inputs: { a: 'f32', b: 'f32' },
        outputs: { value: 'f32' },
        defaults: { b: '0.0' },
        code: nodeCode,
        fn: 'n_add',
        tags,
    });

const widen = wgslModule({
    name: 'tags_widen',
    source: 'fn n_widen(x: f32) -> vec4f { return vec4f(x); }',
});

const widenNode = defineNode({
    name: 'tags.widen',
    inputs: { x: 'f32' },
    outputs: { value: 'vec4f' },
    code: widen,
    fn: 'n_widen',
    tags: ['lobe:emission'],
});

/** Ponto que devolve `vec3f` ou, alternativamente, `vec4f`. */
const altReady = wgslModule({
    name: 'tags_alt_ready',
    source: [
        'struct AltParams { _unused: u32 }',
        'fn alt_fn_params(slot: u32) -> AltParams { return AltParams(0u); }',
        'fn alt_fn(t: f32, data: AltParams) -> vec3f { return vec3f(t); }',
    ].join('\n'),
});
const altPoint = wgslPoint({
    name: 'tags_alt',
    required: {
        name: 'alt_fn',
        params: ['f32', POINT_PARAMS],
        returns: 'vec3f',
        alternatives: ['vec4f'],
        names: ['t', 'data'],
    },
    paramsAlias: 'AltParams',
    context: 'compute',
    ready: altReady,
});

describe('marcas dos nós e retorno alternativo (spec 011, T026)', () => {
    it('defineNode guarda as marcas sem repetição e congeladas; sem marcas, vazio', () => {
        const node = tagged('tags.a', ['lobe:diffuse', 'lobe:diffuse', 'x']);
        expect(node.tags).toEqual(['lobe:diffuse', 'x']);
        expect(Object.isFrozen(node.tags)).toBe(true);
        expect(tagged('tags.none', []).tags).toEqual([]);
    });

    it('o grafo une as marcas dos nós presentes; o sub-grafo carrega as dos nós de dentro', () => {
        const graph = new NodeGraph({
            nodes: {
                t: graphArgument('t'),
                a: tagged('tags.d', ['lobe:diffuse']),
                b: tagged('tags.s', ['lobe:specular', 'lobe:diffuse']),
            },
            links: [
                ['t.value', 'a.a'],
                ['a.value', 'b.a'],
            ],
            output: 'b.value',
        });
        expect([...graph.tags()].sort()).toEqual(['lobe:diffuse', 'lobe:specular']);
        const sub = Subgraph.point(graph, { name: 'tags.sub', inputs: { t: 'f32' } });
        expect([...sub.tags].sort()).toEqual(['lobe:diffuse', 'lobe:specular']);
        const outer = new NodeGraph({
            nodes: { t: graphArgument('t'), s: sub, w: widenNode },
            links: [
                ['t.value', 's.t'],
                ['s.value', 'w.x'],
            ],
            output: 'w.value',
        });
        expect([...outer.tags()].sort()).toEqual([
            'lobe:diffuse',
            'lobe:emission',
            'lobe:specular',
        ]);
    });

    it('a saída de um tipo alternativo vira o retorno; a do tipo principal continua o principal', () => {
        const alt = new NodeGraph({
            nodes: { t: graphArgument('t'), w: widenNode },
            links: [['t.value', 'w.x']],
            output: 'w.value',
        });
        expect(alt.compile(altPoint)).toContain('fn alt_fn(t: f32, data: AltParams) -> vec4f {');
        const main = new NodeGraph({
            nodes: { t: graphArgument('t') },
            links: [],
            output: 't.value',
        });
        expect(main.compile(altPoint)).toContain('-> vec3f {');
    });

    it('o ponto aceita a função com o retorno alternativo e recusa um terceiro', () => {
        const fn = (ret: string) =>
            wgslModule({
                name: `tags_fn_${ret}`,
                source: `fn alt_fn(t: f32, data: AltParams) -> ${ret} { return ${ret}(t); }`,
                requires: [altReady],
            });
        expect(() => {
            altPoint.check(fn('vec4f'), 'AltParams');
        }).not.toThrow();
        expect(() => {
            altPoint.check(fn('vec2f'), 'AltParams');
        }).toThrow(WgslCompositionError);
    });
});
