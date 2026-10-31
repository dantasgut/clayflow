import type { ExtensionParamValue } from '../../../scene/contracts/ExtensionParams';
import { SET_GROUP } from '../../../scene/graph/GraphFlow';
import { SetCountSchema } from '../../../scene/graph/SetCountSchema';
import { defineSetNode, setPointInput } from '../../../scene/graph/SetNode';
import { Compaction } from '../../gpu/compute/Compaction';
import { CountToArgs } from '../../gpu/compute/CountToArgs';
import { AtomicAllocCounterSchema } from '../../gpu/compute/schemas';
import { fusedKernel } from './mesh';
import {
    DistributeParamsSchema,
    MESH,
    POINTS,
    RealizeParamsSchema,
    SetAcceptedParamsSchema,
} from './schemas';
import {
    distributeDensity,
    distributeDensityTarget,
    setAccepted,
    setDistributeCount,
    setDistributePoints,
    setDistributePredicate,
    setRealize,
    setRealizeCount,
    setResources as R,
} from './shaders';
import { SetNodeKernels } from './SetNodeKernels';

// Nós de conjunto de pontos (spec 031, US3): distribuição sobre uma malha por densidade (contagem decidida na GPU) e
// uma esfera por ponto.

/** Candidatos por triângulo de `set.distributeOnMesh` (inteiro ≥ 1). */
export function distributePerTriangle(
    values: Readonly<Record<string, ExtensionParamValue>>,
): number {
    return Math.max(1, Math.floor((values.per_triangle as number | undefined) ?? 1));
}

/** Resolução (segmentos ≥ 3, anéis ≥ 2) da esfera de `set.realizeInstances`. */
export function realizeResolution(
    values: Readonly<Record<string, ExtensionParamValue>>,
): [number, number] {
    return [
        Math.max(3, Math.floor((values.segments as number | undefined) ?? 8)),
        Math.max(2, Math.floor((values.rings as number | undefined) ?? 6)),
    ];
}

/**
 * `set.distributeOnMesh`: até `per_triangle` pontos (K, padrão 1) por triângulo da malha. O candidato (t, k) tem
 * posição baricêntrica uniforme na área pelo hash de (`seed`, t, 3k) e (`seed`, t, 3k + 1), normal e uv
 * interpolados, e é aceito quando o hash de (`seed`, t, 3k + 2) em [0, 1) fica abaixo da densidade — a entrada de
 * ponto `density` (grafo com `position`, `normal`, `uv` → `f32`, presa em [0, 1]; sem grafo: 1). Determinística: a
 * decisão só depende de (semente, t, k) e os aceitos são compactados de forma estável (flags + soma de prefixos), na
 * ordem (t, k) — nunca na ordem dos atômicos.
 *
 * Contagem da GPU: candidatos (triângulos · K) num registro próprio, compactação com a contagem da GPU, o total aceito
 * no registro `SetCount` dos pontos e `CountToArgs` — sem leitura de volta. Capacidade: triângulos · K.
 */
export const distributeOnMesh = defineSetNode({
    name: 'set.distributeOnMesh',
    inputs: {
        mesh: MESH,
        density: setPointInput(distributeDensityTarget, distributeDensity, 'distribute_density'),
    },
    outputs: { points: POINTS },
    params: {
        per_triangle: { type: 'u32', default: 1 },
        seed: { type: 'u32', default: 0 },
    },
    capacity: (c) => ({
        'points.points': c.input('mesh', 'triangles') * distributePerTriangle(c.values),
    }),
    counts: { 'points.points': 'gpu' },
    create: (c) => {
        const k = new SetNodeKernels(c, DistributeParamsSchema);
        const vin = c.input('mesh', 'vertices');
        const tin = c.input('mesh', 'triangles');
        const out = c.output('points', 'points');
        const candidates = out.capacity;
        const records = k.records('candidates', SetCountSchema.stride);
        const list = k.storage('list', candidates * 4);
        const counter = k.storage('accepted', AtomicAllocCounterSchema.stride);
        const acceptedParams = k.uniform('accepted_params', SetAcceptedParamsSchema);
        const { shader: predicate, bindings: fused } = fusedKernel(
            setDistributePredicate,
            distributeDensity,
            c.point('density'),
        );
        const compaction = new Compaction(c.work, {
            discriminator: `${c.id}:compact`,
            predicate,
            capacity: candidates,
            stable: true,
            inputCapacity: candidates,
            bindings: new Map([
                ...fused,
                [R.distribute, k.params],
                [R.verticesIn, vin.buffer],
                [R.trianglesIn, tin.buffer],
            ]),
        });
        compaction.prepare(list, counter, 1, records);
        const args = new CountToArgs(c.work, { discriminator: `${c.id}:args` });
        args.prepare(records, 2);
        args.prepare(c.counts, 2);
        k.kernel('candidates', setDistributeCount, 'distribute_candidates_main', [
            [R.distribute, k.params],
            [R.countsWrite, c.counts],
            [R.distributeRecords, records],
        ]);
        k.kernel('accepted', setAccepted, 'set_accepted_main', [
            [R.acceptedParams, acceptedParams],
            [R.accepted, counter],
            [R.countsWrite, c.counts],
        ]);
        k.kernel('points', setDistributePoints, 'distribute_points_main', [
            [R.distribute, k.params],
            [R.countsRead, c.counts],
            [R.verticesIn, vin.buffer],
            [R.trianglesIn, tin.buffer],
            [R.distributeList, list],
            [R.pointsOut, out.buffer],
        ]);
        return {
            update: () => {
                const values = c.values();
                k.write({
                    triangles_slot: tin.slot,
                    points_slot: out.slot,
                    per_triangle: distributePerTriangle(values),
                    seed: Math.floor((values.seed as number | undefined) ?? 0) >>> 0,
                    triangle_capacity: tin.capacity,
                });
                k.writeTo(acceptedParams, SetAcceptedParamsSchema, {
                    slot: out.slot,
                    capacity: out.capacity,
                });
            },
            record: (frame) => {
                k.single(frame, 'set.distributeOnMesh.candidates', 'candidates');
                args.record(frame, { counts: records, index: 0, workgroupSize: SET_GROUP });
                compaction.record(frame, {
                    count: { counts: records, index: 0 },
                    out: list,
                    counter,
                });
                k.single(frame, 'set.distributeOnMesh.accepted', 'accepted');
                args.record(frame, { counts: c.counts, index: out.slot, workgroupSize: SET_GROUP });
                k.indirect(frame, 'set.distributeOnMesh.points', 'points', out.slot);
            },
            dispose: () => {
                compaction.destroy();
                args.destroy();
                k.dispose();
            },
        };
    },
});

/**
 * Tabela de senos e cossenos da esfera de `set.realizeInstances` (a da GPU, em f32): `rings + 1` pares
 * (sen θ, cos θ), θ = π·r/rings, seguidos de `segments + 1` pares (cos φ, sen φ), φ = 2π·s/segments.
 */
export function realizeTable(segments: number, rings: number): Float32Array {
    const out = new Float32Array(2 * (rings + 1 + segments + 1));
    for (let r = 0; r <= rings; r++) {
        const theta = (Math.PI * r) / rings;
        out[2 * r] = Math.sin(theta);
        out[2 * r + 1] = Math.cos(theta);
    }
    for (let s = 0; s <= segments; s++) {
        const phi = (2 * Math.PI * s) / segments;
        out[2 * (rings + 1 + s)] = Math.cos(phi);
        out[2 * (rings + 1 + s) + 1] = Math.sin(phi);
    }
    return out;
}

/**
 * `set.realizeInstances`: uma esfera UV de raio `radius` (padrão 0,05) por ponto — `segments` (≥ 3, padrão 8) por
 * `rings` (≥ 2, padrão 6): (segments + 1)(rings + 1) vértices com normal radial e uv, 2·segments·rings triângulos
 * anti-horários vistos de fora (os dos polos degenerados). Contagem da GPU, derivada da dos pontos no próprio fluxo.
 */
export const realizeInstances = defineSetNode({
    name: 'set.realizeInstances',
    inputs: { points: POINTS },
    outputs: { mesh: MESH },
    params: {
        radius: { type: 'f32', default: 0.05 },
        segments: { type: 'u32', default: 8 },
        rings: { type: 'u32', default: 6 },
    },
    capacity: (c) => {
        const [segments, rings] = realizeResolution(c.values);
        const points = c.input('points', 'points');
        return {
            'mesh.vertices': points * (segments + 1) * (rings + 1),
            'mesh.triangles': points * 2 * segments * rings,
        };
    },
    counts: { 'mesh.vertices': 'gpu', 'mesh.triangles': 'gpu' },
    create: (c) => {
        const k = new SetNodeKernels(c, RealizeParamsSchema);
        const pin = c.input('points', 'points');
        const vout = c.output('mesh', 'vertices');
        const tout = c.output('mesh', 'triangles');
        const [segments, rings] = realizeResolution(c.values());
        const table = k.constant('table', realizeTable(segments, rings));
        const args = new CountToArgs(c.work, { discriminator: `${c.id}:args` });
        args.prepare(c.counts, 2);
        k.kernel('count', setRealizeCount, 'realize_count_main', [
            [R.realize, k.params],
            [R.countsWrite, c.counts],
        ]);
        k.kernel('vertices', setRealize, 'realize_vertices_main', [
            [R.realize, k.params],
            [R.countsRead, c.counts],
            [R.realizeTable, table],
            [R.pointsIn, pin.buffer],
            [R.verticesOut, vout.buffer],
        ]);
        k.kernel('triangles', setRealize, 'realize_triangles_main', [
            [R.realize, k.params],
            [R.countsRead, c.counts],
            [R.trianglesOut, tout.buffer],
        ]);
        return {
            update: () => {
                const values = c.values();
                k.write({
                    points_slot: pin.slot,
                    vertices_slot: vout.slot,
                    triangles_slot: tout.slot,
                    segments,
                    rings,
                    radius: values.radius ?? 0.05,
                    vertex_capacity: vout.capacity,
                    triangle_capacity: tout.capacity,
                });
            },
            record: (frame) => {
                k.single(frame, 'set.realizeInstances.count', 'count');
                args.record(frame, {
                    counts: c.counts,
                    index: vout.slot,
                    workgroupSize: SET_GROUP,
                });
                args.record(frame, {
                    counts: c.counts,
                    index: tout.slot,
                    workgroupSize: SET_GROUP,
                });
                k.indirect(frame, 'set.realizeInstances.vertices', 'vertices', vout.slot);
                k.indirect(frame, 'set.realizeInstances.triangles', 'triangles', tout.slot);
            },
            dispose: () => {
                args.destroy();
                k.dispose();
            },
        };
    },
});
