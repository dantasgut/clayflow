/**
 * Spec 031 (US2, T059): as funções de ponto da 009 montadas por grafo de nós — mesma API (`params`, `values`,
 * `revision`, `module`), a função gerada implementa o ponto e passa na validação dele (`point.check`).
 */
import { describe, expect, it, vi } from 'vitest';
import { defineNode, type NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { graphArgument, NodeGraph } from '../../../scene/graph/NodeGraph';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import type { ExtensionFunction } from '../../../scene/contracts/ExtensionFunction';
import { nodes } from '../../nodes';
import { emitPointTypes } from '../../particles/shaders';
import { cameraPointTypes } from '../../scene/flows/shaders';
import { CameraFunction } from '../CameraFunction';
import { EmitFunction } from '../EmitFunction';
import { FieldFunction } from '../FieldFunction';
import { MaterialFunction } from '../MaterialFunction';
import { SpaceFunction } from '../SpaceFunction';
import { SurfaceFunction } from '../SurfaceFunction';
import { TransformFunction } from '../TransformFunction';

/** Nó de um parâmetro `k` com a função `fn` de `source` (entradas `inputs`, saída `value: out`). */
const node = (
    name: string,
    source: string,
    inputs: Record<string, string>,
    out: string,
    requires: readonly WgslModule[] = [],
): NodeDefinition =>
    defineNode({
        name,
        inputs,
        outputs: { value: out },
        params: { k: { type: 'f32', default: 1 } },
        code: wgslModule({ name: name.replace('.', '_'), source, requires }),
        fn: name.replace('.', '_'),
    });

const one = (def: NodeDefinition, args: Record<string, string>) =>
    new NodeGraph({
        nodes: {
            ...Object.fromEntries(
                [...new Set(Object.values(args).map((a) => a.split('.')[0]!))].map((a) => [
                    a,
                    graphArgument(a),
                ]),
            ),
            n: def.with({ k: 2 }),
        },
        links: Object.entries(args).map(([input, from]) => [from, `n.${input}`] as const),
        output: 'n.value',
    });

const cases: [string, (g: NodeGraph) => ExtensionFunction][] = [];
const graphs = new Map<string, NodeGraph>();

graphs.set(
    'TransformFunction',
    one(
        node(
            'tr.spin',
            'fn tr_spin(time: f32, k: f32) -> mat4x4f { let c = cos(k * time); let s = sin(k * time); return mat4x4f(c, s, 0.0, 0.0, -s, c, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0); }',
            { time: 'f32' },
            'mat4x4f',
        ),
        { time: 'time.value' },
    ),
);
cases.push(['TransformFunction', (graph) => new TransformFunction({ graph })]);

graphs.set(
    'CameraFunction',
    one(
        node(
            'cam.look',
            'fn cam_look(world: mat4x4f, aspect: f32, k: f32) -> CameraOut { return CameraOut(world, mat4x4f(k / aspect, 0.0, 0.0, 0.0, 0.0, k, 0.0, 0.0, 0.0, 0.0, -1.0, -1.0, 0.0, 0.0, -0.1, 0.0)); }',
            { world: 'mat4x4f', aspect: 'f32' },
            'CameraOut',
            [cameraPointTypes],
        ),
        { world: 'world.value', aspect: 'aspect.value' },
    ),
);
cases.push(['CameraFunction', (graph) => new CameraFunction({ graph })]);

graphs.set(
    'SurfaceFunction',
    one(
        node(
            'sf.wave',
            'fn sf_wave(u: f32, v: f32, k: f32) -> vec3f { return vec3f(u, k * sin(u) * cos(v), v); }',
            { u: 'f32', v: 'f32' },
            'vec3f',
        ),
        { u: 'u.value', v: 'v.value' },
    ),
);
cases.push(['SurfaceFunction', (graph) => new SurfaceFunction({ graph })]);

graphs.set(
    'SpaceFunction',
    one(
        node(
            'sp.twist',
            'fn sp_twist(x: vec3f, k: f32) -> vec3f { let a = k * x.y; return vec3f(cos(a) * x.x - sin(a) * x.z, x.y, sin(a) * x.x + cos(a) * x.z); }',
            { x: 'vec3f' },
            'vec3f',
        ),
        { x: 'x.value' },
    ),
);
cases.push(['SpaceFunction', (graph) => new SpaceFunction({ graph })]);

graphs.set(
    'FieldFunction',
    one(
        node(
            'fd.swirl',
            'fn fd_swirl(x: vec3f, v: vec3f, k: f32) -> vec3f { return k * vec3f(-x.z, 0.0, x.x) - 0.1 * v; }',
            { x: 'vec3f', v: 'vec3f' },
            'vec3f',
        ),
        { x: 'x.value', v: 'v.value' },
    ),
);
cases.push(['FieldFunction', (graph) => new FieldFunction({ graph })]);

graphs.set(
    'EmitFunction',
    one(
        node(
            'em.fountain',
            'fn em_fountain(i: u32, seed: u32, k: f32) -> EmittedParticle { let r = emit_rand(i, seed, 0u); return EmittedParticle(vec3f(0.0), vec3f(r - 0.5, k, 0.0), 2.0, vec4f(1.0)); }',
            { i: 'u32', seed: 'u32' },
            'EmittedParticle',
            [emitPointTypes],
        ),
        { i: 'i.value', seed: 'seed.value' },
    ),
);
cases.push(['EmitFunction', (graph) => new EmitFunction({ graph })]);

// O ponto `material` com os nós da C3: ruído da posição → rampa de cor → saída (o resto das constantes do material).
graphs.set(
    'MaterialFunction',
    new NodeGraph({
        nodes: {
            s: nodes.input.surfaceSample(),
            n: nodes.noise.gradient3.with({ scale: 4 }),
            c: nodes.color.ramp.with({
                color_a: [0.1, 0.1, 0.1],
                color_b: [0.9, 0.6, 0.2],
                low: -1,
            }),
            out: nodes.output.surfaceParams,
        },
        links: [
            ['s.world_position', 'n.p'],
            ['n.value', 'c.t'],
            ['c.color', 'out.base_color'],
            ['n.value', 'out.roughness'],
        ],
        output: 'out.value',
    }),
);
cases.push(['MaterialFunction', (graph) => new MaterialFunction({ graph })]);

describe('funções da 009 montadas por grafo (spec 031, T059)', () => {
    it.each(cases)('%s: implementa o ponto, valida e mantém a API', (name, make) => {
        const graph = graphs.get(name)!;
        const fn = make(graph);
        expect(fn.graph).toBe(graph);
        expect(fn.code).toContain(`fn ${fn.point.required.name}(`);
        expect(fn.revision).toBe(0);
        expect(Object.keys(fn.params).length).toBeGreaterThan(0);
        expect(() => composeWgsl(fn.module)).not.toThrow();
        // Mesma forma, valores diferentes: o mesmo módulo; trocar valor não recompila.
        const twin = make(graph);
        expect(twin.module).toBe(fn.module);
        const [first] = Object.keys(fn.params);
        const before = fn.module;
        fn.values[first!] = typeof fn.values[first!] === 'number' ? 3 : [3, 3, 3];
        expect(fn.module).toBe(before);
        expect(fn.revision).toBe(0);
    });

    it('material: um let por nó; a rampa e a rugosidade leem o mesmo ruído, avaliado uma vez', () => {
        const fn = new MaterialFunction({ graph: graphs.get('MaterialFunction')! });
        expect(fn.code.match(/node_noise_gradient3\(/g)).toHaveLength(1);
        expect(fn.code).toContain(
            'let v_out = node_output_surface_params(v_c, m.albedo.a, v_n, m.metallic, vec3f(0.0));',
        );
        expect(fn.values.n_scale).toBe(4);
        expect(fn.values.c_low).toBe(-1);
        expect(fn.params).toEqual({
            n_width: 'f32',
            n_scale: 'f32',
            n_offset: 'vec3f',
            n_seed: 'u32',
            c_color_a: 'vec3f',
            c_color_b: 'vec3f',
            c_low: 'f32',
            c_high: 'f32',
        });
    });

    it('ponto de cena com grafo sem saída: não entra na composição (implementation pronta)', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fn = new FieldFunction({ graph: new NodeGraph({ nodes: {}, links: [] }) });
        expect(fn.implemented).toBe(false);
        expect(fn.module).toBe(fn.point.ready);
        warn.mockRestore();
    });
});
