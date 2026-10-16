import { describe, expect, it } from 'vitest';
import type {
    EngineCore,
    IndirectBufferSpec,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../../scene/contracts/gpu';
import type { ExtensionParamValue } from '../../../scene/contracts/ExtensionParams';
import { compileSetGraph } from '../../../scene/graph/compileSetGraph';
import { NodeGraph, graphArgument } from '../../../scene/graph/NodeGraph';
import { setDispatchOffset } from '../../../scene/graph/GraphFlow';
import { SetCountSchema } from '../../../scene/graph/SetCountSchema';
import type {
    FusedPoint,
    SetNodeContext,
    SetNodeDefinition,
    SetNodeInstance,
} from '../../../scene/graph/SetNode';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { recordingFrame } from '../../physics/__tests__/helpers/recordingFrame';
import { MeshVertexSchema } from '../../geometry/MeshVertexSchema';
import { defaultNodeRegistry, nodes } from '../index';
import { MeshTriangleSchema, SetPointSchema } from '../set/schemas';

// Nós de conjunto da C3 (spec 031, T077): cada nó cria os kernels sobre os conjuntos do contexto (montagem dos módulos,
// fontes pela identidade do recurso), grava os passes na ordem certa — despachos indiretos pelos registros `SetCount`
// dos conjuntos — e funde o grafo de ponto ligado às entradas de ponto.

const counts: IndirectBufferSpec = {
    kind: 'buffer',
    subkind: 'indirect',
    discriminator: 'counts',
    byteSize: 8 * SetCountSchema.stride,
};

const storage = (discriminator: string, byteSize: number): StorageBufferSpec => ({
    kind: 'buffer',
    subkind: 'storage',
    discriminator,
    byteSize: Math.max(16, byteSize),
});

interface FakeSet {
    readonly capacity: number;
    readonly slot: number;
    readonly stride: number;
}

/** Contexto falso de um nó: conjuntos por `porta.conjunto`, valores, grafos de ponto e alvo. */
function context(
    core: EngineCore,
    sets: {
        inputs?: Record<string, FakeSet>;
        outputs?: Record<string, FakeSet>;
        values?: Record<string, ExtensionParamValue>;
        points?: Record<string, FusedPoint>;
        target?: Record<string, StorageBufferSpec>;
    },
): SetNodeContext {
    const buffer = (side: string, key: string, s: FakeSet) => ({
        buffer: storage(`${side}:${key}`, s.capacity * s.stride),
        capacity: s.capacity,
        slot: s.slot,
    });
    const get = (side: 'inputs' | 'outputs', port: string, set: string) => {
        const s = sets[side]?.[`${port}.${set}`];
        if (s === undefined) throw new Error(`sem ${side} ${port}.${set}`);
        return buffer(side, `${port}.${set}`, s);
    };
    const cache = new Map<string, ReturnType<typeof get>>();
    const memo = (side: 'inputs' | 'outputs', port: string, set: string) => {
        const key = `${side}:${port}.${set}`;
        if (!cache.has(key)) cache.set(key, get(side, port, set));
        return cache.get(key)!;
    };
    return {
        core,
        id: 'n',
        counts,
        input: (port, set) => memo('inputs', port, set),
        output: (port, set) => memo('outputs', port, set),
        point: (port) => sets.points?.[port],
        values: () => sets.values ?? {},
        target: (id) => sets.target?.[id],
    };
}

const mesh = (vertices: number, vslot: number, triangles: number, tslot: number) => ({
    'mesh.vertices': { capacity: vertices, slot: vslot, stride: MeshVertexSchema.stride },
    'mesh.triangles': { capacity: triangles, slot: tslot, stride: MeshTriangleSchema.stride },
});

interface Created {
    readonly kind: string;
    readonly discriminator?: string;
    readonly shader?: { readonly source: string };
}

const created = (core: EngineCore): Created[] =>
    (core.create as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(
        (c) => c[0] as Created,
    );

/** Fonte do shader do pipeline `discriminator`. */
const sourceOf = (core: EngineCore, discriminator: string): string => {
    const p = created(core).find((s) => s.kind === 'pipeline' && s.discriminator === discriminator);
    if (p === undefined) throw new Error(`sem pipeline ${discriminator}`);
    return p.shader!.source;
};

function run(def: SetNodeDefinition, ctx: SetNodeContext): ReturnType<typeof recordingFrame> {
    const instance: SetNodeInstance = def.create(ctx);
    instance.update();
    const rec = recordingFrame();
    instance.record(rec.frame);
    instance.dispose();
    return rec;
}

const passes = (rec: ReturnType<typeof recordingFrame>) =>
    rec.passes.map((p) => [p.label, p.dispatches[0]]);

describe('nós de conjunto — kernels e passes', () => {
    it('set.grid: um despacho direto por vértice; parâmetros no uniform', () => {
        const { core, writes } = fakeResourceCore();
        const ctx = context(core, {
            outputs: mesh(12, 0, 12, 1),
            values: { resolution: [4, 3], size: [2, 1] },
        });
        const rec = run(nodes.set.grid, ctx);
        expect(passes(rec)).toEqual([['set.grid', [12, 256]]]);
        const params = writes.find(
            (w) => (w.spec as { discriminator?: string }).discriminator === 'n:params',
        )!;
        expect([...new Uint32Array(params.bytes.buffer, params.bytes.byteOffset, 2)]).toEqual([
            4, 3,
        ]);
        expect(sourceOf(core, 'n:grid_pipeline')).toContain('fn grid_main(');
    });

    it('set.grid: capacidades pela resolução (mínimo 2)', () => {
        const cap = nodes.set.grid.capacity({
            values: { resolution: [1, 5] },
            input: () => 0,
        });
        expect(cap).toEqual({ 'mesh.vertices': 10, 'mesh.triangles': 8 });
    });

    it('set.displace: despacho indireto pelo registro dos vértices e cópia dos triângulos; pronto = 0', () => {
        const { core } = fakeResourceCore();
        const rec = run(
            nodes.set.displace,
            context(core, { inputs: mesh(100, 2, 50, 3), outputs: mesh(100, 2, 50, 3) }),
        );
        expect(passes(rec)).toEqual([['set.displace', [-1, setDispatchOffset(2)]]]);
        expect(rec.copies).toBe(1);
        const source = sourceOf(core, 'n:displace_pipeline');
        expect(source).toContain(
            'fn displace_height(position: vec3f, normal: vec3f, uv: vec2f) -> f32 {\n    return 0.0;',
        );
        expect(source).toContain('set_counts[index].count');
    });

    it('set.recomputeNormals: zera o acumulador, soma por triângulo, normaliza por vértice', () => {
        const { core } = fakeResourceCore();
        const rec = run(
            nodes.set.recomputeNormals,
            context(core, { inputs: mesh(100, 0, 50, 1), outputs: mesh(100, 0, 50, 1) }),
        );
        expect(rec.sequence).toEqual([
            'clear:n:accum',
            'pass:set.recomputeNormals.accumulate',
            'pass:set.recomputeNormals.write',
        ]);
        expect(passes(rec).map((p) => p[1])).toEqual([
            [-1, setDispatchOffset(1)],
            [-1, setDispatchOffset(0)],
        ]);
        expect(sourceOf(core, 'n:accumulate_pipeline')).toContain('fn fixed_from_f32(');
        expect(sourceOf(core, 'n:accumulate_pipeline')).not.toMatch(/atomic<f32>/);
    });

    it('set.distributeOnMesh: candidatos, compactação estável com contagem da GPU, aceitos, pontos (sem atômicos de ordem)', () => {
        const { core } = fakeResourceCore();
        const rec = run(
            nodes.set.distributeOnMesh,
            context(core, {
                inputs: mesh(100, 0, 50, 1),
                outputs: {
                    'points.points': { capacity: 150, slot: 2, stride: SetPointSchema.stride },
                },
                values: { per_triangle: 3, seed: 7 },
            }),
        );
        const labels = rec.passes.map((p) => p.label);
        expect(labels[0]).toBe('set.distributeOnMesh.candidates');
        expect(labels[1]).toBe('CountToArgs');
        expect(labels).toContain('Compaction.flags');
        expect(labels).toContain('Compaction.scatter');
        expect(labels).not.toContain('Compaction.atomic');
        expect(labels.slice(-3)).toEqual([
            'set.distributeOnMesh.accepted',
            'CountToArgs',
            'set.distributeOnMesh.points',
        ]);
        expect(rec.passes.at(-1)!.dispatches[0]).toEqual([-1, setDispatchOffset(2)]);
        const predicate = created(core).find(
            (s) => s.kind === 'pipeline' && s.discriminator?.includes('compact_flags:gpu'),
        )!.shader!.source;
        expect(predicate).toContain(
            'fn distribute_density(position: vec3f, normal: vec3f, uv: vec2f) -> f32 {\n    return 1.0;',
        );
        expect(predicate).toContain('fn compact_keep(i: u32) -> bool');
    });

    it('set.realizeInstances: contagens derivadas na GPU, CountToArgs dos dois registros, vértices e triângulos indiretos', () => {
        const { core, writes } = fakeResourceCore();
        const rec = run(
            nodes.set.realizeInstances,
            context(core, {
                inputs: { 'points.points': { capacity: 10, slot: 0, stride: 24 } },
                outputs: mesh(10 * 9 * 7, 1, 10 * 96, 2),
                values: { radius: 0.1, segments: 8, rings: 6 },
            }),
        );
        expect(passes(rec)).toEqual([
            ['set.realizeInstances.count', [1]],
            ['CountToArgs', [1]],
            ['CountToArgs', [1]],
            ['set.realizeInstances.vertices', [-1, setDispatchOffset(1)]],
            ['set.realizeInstances.triangles', [-1, setDispatchOffset(2)]],
        ]);
        const table = writes.find(
            (w) => (w.spec as { discriminator?: string }).discriminator === 'n:table',
        )!;
        const t = new Float32Array(
            table.bytes.buffer,
            table.bytes.byteOffset,
            table.bytes.byteLength / 4,
        );
        expect(t.length).toBe(2 * (7 + 9));
        expect(t[1]).toBeCloseTo(1); // cos 0
        expect(t[2 * 6 + 1]).toBeCloseTo(-1); // cos π
    });

    it('primitivas: soma de prefixos, ordenação, compactação e redução com a contagem do registro da entrada', () => {
        const u = (capacity: number, slot: number) => ({ capacity, slot, stride: 4 });
        const kinds = (rec: ReturnType<typeof recordingFrame>) => [
            ...new Set(rec.passes.map((p) => p.label.split('.')[0])),
        ];
        {
            const { core } = fakeResourceCore();
            const rec = run(
                nodes.set.prefixSum,
                context(core, {
                    inputs: { 'values.values': u(1000, 3) },
                    outputs: { 'values.values': u(1000, 3) },
                }),
            );
            expect(kinds(rec)).toEqual(['PrefixSum']);
            expect(rec.copies).toBe(1);
        }
        {
            const { core } = fakeResourceCore();
            const rec = run(
                nodes.set.sort,
                context(core, {
                    inputs: { 'values.values': u(1000, 3) },
                    outputs: { 'values.values': u(1000, 3) },
                    values: { bits: 7 },
                }),
            );
            // 7 bits → 8 bits: dois passes de 4.
            expect(rec.passes.filter((p) => p.label === 'RadixSort.scatter')).toHaveLength(2);
        }
        {
            const { core } = fakeResourceCore();
            const rec = run(
                nodes.set.compact,
                context(core, {
                    inputs: { 'values.values': u(1000, 3) },
                    outputs: { 'values.values': u(1000, 4) },
                }),
            );
            expect(rec.passes.map((p) => p.label).slice(-2)).toEqual([
                'set.compact.accepted',
                'CountToArgs',
            ]);
        }
        {
            const { core } = fakeResourceCore();
            const rec = run(
                nodes.set.reduce,
                context(core, {
                    inputs: { 'values.values': u(1000, 3) },
                    outputs: { 'value.values': u(1, 4) },
                    values: { op: 2 },
                }),
            );
            expect(rec.sequence[0]).toBe('clear:outputs:value.values');
            expect(rec.passes[0]!.label).toBe('Reduce');
            expect(rec.passes[0]!.dispatches[0]).toEqual([-1, setDispatchOffset(3)]);
        }
    });

    it('set.meshOutput: copia os vértices e escreve índices, arestas e indireto pela capacidade do alvo', () => {
        const { core } = fakeResourceCore();
        const target = {
            vertices: storage('t:vertices', 50 * 32),
            indices: storage('t:indices', 30 * 12),
            wireEdges: storage('t:edges', 40 * 8),
            indirect: storage('t:indirect', 40),
        };
        const rec = run(
            nodes.set.meshOutput,
            context(core, { inputs: mesh(100, 0, 60, 1), target }),
        );
        expect(rec.copies).toBe(1);
        expect(passes(rec)).toEqual([['set.meshOutput', [30, 256]]]);
        const source = sourceOf(core, 'n:output_pipeline');
        expect(source).toContain('target_indirect[5] = 6u * edges;');
    });

    it('set.meshOutput sem alvo não grava nada', () => {
        const { core } = fakeResourceCore();
        const rec = run(nodes.set.meshOutput, context(core, { inputs: mesh(100, 0, 60, 1) }));
        expect(rec.passes).toHaveLength(0);
        expect(rec.copies).toBe(0);
    });

    it('set.pointsOutput: vértices e índices da capacidade do alvo', () => {
        const { core } = fakeResourceCore();
        const target = {
            vertices: storage('t:vertices', 50 * 32),
            indices: storage('t:indices', 30 * 4),
            indirect: storage('t:indirect', 40),
        };
        const rec = run(
            nodes.set.pointsOutput,
            context(core, {
                inputs: { 'points.points': { capacity: 80, slot: 0, stride: 24 } },
                target,
            }),
        );
        expect(passes(rec)).toEqual([['set.pointsOutput', [50, 256]]]);
    });
});

describe('nós de conjunto — grafo', () => {
    /** Grade → deslocar por ruído → normais → distribuir por densidade → esferas → saída. */
    const graph = () =>
        new NodeGraph({
            nodes: {
                g: nodes.set.grid.with({ resolution: [8, 6] }),
                d: nodes.set.displace.with({ scale: 0.2 }),
                p: graphArgument('position'),
                h: nodes.noise.gradient3.with({ scale: 2 }),
                n: nodes.set.recomputeNormals,
                s: nodes.set.distributeOnMesh.with({ per_triangle: 2, seed: 3 }),
                hd: nodes.noise.gradient3.with({ scale: 3 }),
                pd: nodes.input.vertexField('position'),
                r: nodes.set.realizeInstances.with({ segments: 4, rings: 3 }),
                o: nodes.set.meshOutput,
            },
            links: [
                ['g.mesh', 'd.mesh'],
                ['p.value', 'h.p'],
                ['h.value', 'd.height'],
                ['d.mesh', 'n.mesh'],
                ['n.mesh', 's.mesh'],
                ['pd.value', 'hd.p'],
                ['hd.value', 's.density'],
                ['s.points', 'r.points'],
                ['r.mesh', 'o.mesh'],
            ],
        });

    it('plano: capacidades, contagens e os grafos de ponto fundidos nas entradas', () => {
        const g = graph();
        const plan = compileSetGraph(g, (id) => g.node(id).values);
        const caps = Object.fromEntries(plan.sets.map((s) => [s.key, [s.capacity, s.count]]));
        expect(caps).toEqual({
            'g.mesh.vertices': [48, 'cpu'],
            'g.mesh.triangles': [70, 'cpu'],
            'd.mesh.vertices': [48, 'same'],
            'd.mesh.triangles': [70, 'same'],
            'n.mesh.vertices': [48, 'same'],
            'n.mesh.triangles': [70, 'same'],
            's.points.points': [140, 'gpu'],
            'r.mesh.vertices': [140 * 5 * 4, 'gpu'],
            'r.mesh.triangles': [140 * 24, 'gpu'],
        });
        const d = plan.nodes.find((n) => n.id === 'd')!;
        const fused = d.points.get('height')!;
        expect(fused.params).toEqual(['h_scale', 'h_offset', 'h_seed']);
        expect(fused.module.source).toContain(
            'fn displace_height(position: vec3f, normal: vec3f, uv: vec2f) -> f32',
        );
        expect(fused.module.source).toContain(
            'node_noise_gradient3(position, data.h_scale, data.h_offset, data.h_seed)',
        );
        expect(plan.nodes.find((n) => n.id === 's')!.points.get('density')).toBeDefined();
    });

    it('o kernel do nó usa o grafo fundido no lugar do pronto, com o uniform dos parâmetros ligado', () => {
        const g = graph();
        const plan = compileSetGraph(g, (id) => g.node(id).values);
        const fused = plan.nodes.find((n) => n.id === 'd')!.points.get('height')!;
        const params: UniformBufferSpec = {
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'fused',
            byteSize: 32,
        };
        const { core } = fakeResourceCore();
        run(
            nodes.set.displace,
            context(core, {
                inputs: mesh(48, 0, 70, 1),
                outputs: mesh(48, 0, 70, 1),
                points: { height: { module: fused.module, resource: fused.resource, params } },
            }),
        );
        const source = sourceOf(core, 'n:displace_pipeline');
        expect(source).toContain('fn displace_height_graph(');
        expect(source).not.toContain('return 0.0;');
        const bg = created(core).find(
            (s) => s.kind === 'bindgroup' && s.discriminator?.startsWith('n:displace'),
        );
        expect(JSON.stringify(bg)).toContain('"fused"');
    });

    it('registro: os nós de conjunto pelo nome', () => {
        for (const def of Object.values(nodes.set))
            expect(defaultNodeRegistry.get(def.name)).toBe(def);
        expect(defaultNodeRegistry.get('set.distributeOnMesh')).toBe(nodes.set.distributeOnMesh);
    });
});
