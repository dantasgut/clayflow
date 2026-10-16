import type { ExtensionParamValue } from '../../../scene/contracts/ExtensionParams';
import type { BindingSource } from '../../../scene/flows/FlowBinding';
import { defineSetNode, setPointInput, type FusedPoint } from '../../../scene/graph/SetNode';
import { bindPoints, type BindablePoint } from '../../../scene/shaders/bindPoints';
import type { WgslModule } from '../../../scene/shaders/WgslModule';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import {
    MESH,
    MeshTriangleSchema,
    DisplaceParamsSchema,
    GridParamsSchema,
    NormalsParamsSchema,
} from './schemas';
import {
    displaceHeight,
    displaceHeightTarget,
    setDisplace,
    setGrid,
    setNormals,
    setResources as R,
} from './shaders';
import { SetNodeKernels } from './SetNodeKernels';

// Nós de conjunto de malha (spec 031, US3): grade, deslocamento por um grafo de ponto e normais recalculadas.

/** Resolução (nu, nv) da grade: inteiros ≥ 2. */
export function gridResolution(
    values: Readonly<Record<string, ExtensionParamValue>>,
): [number, number] {
    const r = (values.resolution as readonly number[] | undefined) ?? [16, 16];
    return [Math.max(2, Math.floor(r[0] ?? 2)), Math.max(2, Math.floor(r[1] ?? 2))];
}

/**
 * O kernel com a entrada de ponto fundida (o grafo ligado no lugar do pronto de `at`) e a fonte do uniform dos
 * parâmetros do grafo; sem grafo, o kernel com o pronto.
 */
export function fusedKernel(
    shader: WgslModule,
    at: BindablePoint,
    fused: FusedPoint | undefined,
): { shader: WgslModule; bindings: (readonly [WgslResource, BindingSource])[] } {
    if (fused === undefined) return { shader, bindings: [] };
    return {
        shader: bindPoints(shader, new Map([[at, fused.module]])),
        bindings: [[fused.resource, fused.params]],
    };
}

/**
 * `set.grid`: grade nu × nv (`resolution`, padrão 16 × 16; mínimo 2) de extensão `size` (padrão 2 × 2) no plano y = 0,
 * centrada na origem, com a orientação do plano pronto da `ParametricSurface` (o vértice (iu, iv) em (v, 0, u)),
 * normal +y, uv em [0, 1]² e triângulos anti-horários vistos de +y. Contagem da CPU (= capacidade).
 *
 * Saída `mesh`: nu·nv vértices e 2(nu−1)(nv−1) triângulos.
 */
export const grid = defineSetNode({
    name: 'set.grid',
    outputs: { mesh: MESH },
    params: {
        resolution: { type: 'vec2u', default: [16, 16] },
        size: { type: 'vec2f', default: [2, 2] },
    },
    capacity: ({ values }) => {
        const [nu, nv] = gridResolution(values);
        return { 'mesh.vertices': nu * nv, 'mesh.triangles': 2 * (nu - 1) * (nv - 1) };
    },
    create: (c) => {
        const k = new SetNodeKernels(c, GridParamsSchema);
        k.kernel('grid', setGrid, 'grid_main', [
            [R.grid, k.params],
            [R.verticesOut, c.output('mesh', 'vertices').buffer],
            [R.trianglesOut, c.output('mesh', 'triangles').buffer],
        ]);
        let vertices = 0;
        return {
            update: () => {
                const values = c.values();
                const [nu, nv] = gridResolution(values);
                const size = (values.size as readonly number[] | undefined) ?? [2, 2];
                vertices = nu * nv;
                k.write({ nu, nv, size_u: size[0] ?? 2, size_v: size[1] ?? 2 });
            },
            record: (frame) => {
                k.direct(frame, 'set.grid', 'grid', vertices);
            },
            dispose: () => {
                k.dispose();
            },
        };
    },
});

/** Capacidades e contagens das saídas de malha iguais às da entrada `mesh` (nós que transformam vértice a vértice). */
const sameMesh = {
    capacity: (c: { input(port: string, set: string): number }) => ({
        'mesh.vertices': c.input('mesh', 'vertices'),
        'mesh.triangles': c.input('mesh', 'triangles'),
    }),
    counts: {
        'mesh.vertices': { same: 'mesh.vertices' },
        'mesh.triangles': { same: 'mesh.triangles' },
    },
} as const;

/**
 * `set.displace`: cada vértice anda `scale · height(position, normal, uv)` ao longo da normal. A entrada de ponto
 * `height` aceita um grafo de ponto com os argumentos `position`, `normal` e `uv` (nós `graphArgument`) que devolve
 * `f32`, fundido no kernel (sem grafo: 0). Normais, uv e triângulos seguem iguais; contagens as da entrada.
 */
export const displace = defineSetNode({
    name: 'set.displace',
    inputs: {
        mesh: MESH,
        height: setPointInput(displaceHeightTarget, displaceHeight, 'displace_height'),
    },
    outputs: { mesh: MESH },
    params: { scale: { type: 'f32', default: 1 } },
    ...sameMesh,
    create: (c) => {
        const k = new SetNodeKernels(c, DisplaceParamsSchema);
        const vin = c.input('mesh', 'vertices');
        const tin = c.input('mesh', 'triangles');
        const tout = c.output('mesh', 'triangles');
        const { shader, bindings } = fusedKernel(setDisplace, displaceHeight, c.point('height'));
        k.kernel('displace', shader, 'displace_main', [
            ...bindings,
            [R.displace, k.params],
            [R.countsRead, c.counts],
            [R.verticesIn, vin.buffer],
            [R.verticesOut, c.output('mesh', 'vertices').buffer],
        ]);
        return {
            update: () => {
                k.write({ vertices_slot: vin.slot, scale: c.values().scale ?? 1 });
            },
            record: (frame) => {
                k.indirect(frame, 'set.displace', 'displace', vin.slot);
                frame.copy(tin.buffer, tout.buffer, tout.capacity * MeshTriangleSchema.stride);
            },
            dispose: () => {
                k.dispose();
            },
        };
    },
});

/**
 * `set.recomputeNormals`: a normal de cada vértice vira a média normalizada das normais unitárias das faces
 * adjacentes ((b − a) × (c − a)); vértice sem face mantém a normal. Determinística: soma em ponto fixo (`fixed_point`,
 * resolução ~1e-6) por `atomicAdd` inteiro, independente da ordem. Posições, uv, triângulos e contagens da entrada.
 */
export const recomputeNormals = defineSetNode({
    name: 'set.recomputeNormals',
    inputs: { mesh: MESH },
    outputs: { mesh: MESH },
    ...sameMesh,
    create: (c) => {
        const k = new SetNodeKernels(c, NormalsParamsSchema);
        const vin = c.input('mesh', 'vertices');
        const tin = c.input('mesh', 'triangles');
        const tout = c.output('mesh', 'triangles');
        const accum = k.storage('accum', vin.capacity * 12);
        k.kernel('accumulate', setNormals, 'normals_accumulate_main', [
            [R.normals, k.params],
            [R.countsRead, c.counts],
            [R.verticesIn, vin.buffer],
            [R.trianglesIn, tin.buffer],
            [R.normalsAccum, accum],
        ]);
        k.kernel('write', setNormals, 'normals_write_main', [
            [R.normals, k.params],
            [R.countsRead, c.counts],
            [R.verticesIn, vin.buffer],
            [R.verticesOut, c.output('mesh', 'vertices').buffer],
            [R.normalsAccum, accum],
        ]);
        return {
            update: () => {
                k.write({ vertices_slot: vin.slot, triangles_slot: tin.slot });
            },
            record: (frame) => {
                frame.clear(accum);
                k.indirect(frame, 'set.recomputeNormals.accumulate', 'accumulate', tin.slot);
                k.indirect(frame, 'set.recomputeNormals.write', 'write', vin.slot);
                frame.copy(tin.buffer, tout.buffer, tout.capacity * MeshTriangleSchema.stride);
            },
            dispose: () => {
                k.dispose();
            },
        };
    },
});
