import { afterEach, describe, expect, it, vi } from 'vitest';
import { graphArgument, NodeGraph } from '../../../scene/graph/NodeGraph';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { CloudCoverageFunction } from '../CloudCoverageFunction';
import { CloudShapeFunction } from '../CloudShapeFunction';
import { defaultCloudShapeGraph } from '../../media/clouds/defaultShape';
import { noise } from '../../nodes/noise';
import { math } from '../../nodes/math';

// Funções das nuvens (spec 041, T015): a forma (`cloud_shape`) e a cobertura (`cloud_coverage`) por WGSL e por grafo,
// o grafo padrão de Perlin-Worley e o aviso de ruído sem período.

describe('funções das nuvens', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('forma por WGSL: compõe e valida no ponto', () => {
        const fn = new CloudShapeFunction({
            code: 'fn shape_fn(p: vec3f, data: ShapeFnParams) -> vec4f { return vec4f(p, data.k); }',
            params: { k: 'f32' },
            values: { k: 0.5 },
        });
        expect(composeWgsl(fn.composite!.module).spec.source).toContain(fn.composite!.functionName);
    });

    it('cobertura por WGSL e por grafo', () => {
        const code = new CloudCoverageFunction({
            code: 'fn coverage_fn(xz: vec2f, time: f32, data: CoverageFnParams) -> vec3f { return vec3f(0.5, 0.5, 1.0); }',
        });
        expect(code.composite).toBeDefined();
        const graph = new CloudCoverageFunction({
            graph: new NodeGraph({
                nodes: {
                    xz: graphArgument('xz'),
                    n: noise.gradient2.with({ scale: 0.0001 }),
                    half: math.value.with({ value: 0.5 }),
                    out: math.combine3,
                },
                links: [
                    ['xz.value', 'n.p'],
                    ['n.value', 'out.x'],
                    ['half.value', 'out.y'],
                    ['half.value', 'out.z'],
                ],
                output: 'out.value',
            }),
        });
        expect(composeWgsl(graph.composite!.module).spec.source).toContain('node_noise_gradient2');
    });

    it('o grafo padrão de forma é todo periódico (sem aviso) e devolve vec4f', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fn = new CloudShapeFunction({ graph: defaultCloudShapeGraph() });
        expect(warn).not.toHaveBeenCalled();
        const source = composeWgsl(fn.composite!.module).spec.source;
        expect(source).toContain('node_noise_fbm3');
        expect(source).toContain('node_noise_cellular3');
    });

    it('ruído sem período no grafo de forma: aviso de costura', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        new CloudShapeFunction({
            graph: new NodeGraph({
                nodes: {
                    p: graphArgument('p'),
                    n: noise.gradient3.with({ scale: 4 }),
                    out: math.combine4,
                },
                links: [
                    ['p.value', 'n.p'],
                    ['n.value', 'out.x'],
                    ['n.value', 'out.y'],
                    ['n.value', 'out.z'],
                    ['n.value', 'out.w'],
                ],
                output: 'out.value',
            }),
        });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("sem 'period'"));
    });
});
