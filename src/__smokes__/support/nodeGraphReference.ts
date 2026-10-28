// Spec 031 (US3) — Grafo de conjunto do smoke `nodeGraphs` (parte b) e a referência da CPU dele: "grade → deslocar por
// ruído → normais → distribuir por densidade → esferas → saída", com os valores do grafo, e a mesma cadeia pelas
// referências dos nós (`elements/nodes/reference`).
import { graphArgument, NodeGraph, nodes } from 'clayflow/web';
import { noiseGradient3 } from '../../elements/nodes/reference/index';
import {
    displace,
    distributeOnMesh,
    grid,
    realizeInstances,
    recomputeNormals,
    type ReferenceMesh,
    type ReferencePoints,
} from '../../elements/nodes/reference/set';

/** Valores do grafo do smoke. */
export const SET_GRAPH_VALUES = {
    resolution: [24, 24] as [number, number],
    size: [2, 2] as [number, number],
    displaceScale: 0.25,
    height: { scale: 2.5, offset: [0.3, 1.7, 0.2] as [number, number, number] },
    density: { scale: 3, offset: [0.5, 0.25, 0.75] as [number, number, number] },
    perTriangle: 2,
    seed: 7,
    radius: 0.03,
    segments: 6,
    rings: 4,
} as const;

const V = SET_GRAPH_VALUES;

/** O grafo do smoke (ids: g, d, n, s, r, o; grafos de ponto: p → h na altura, q → k na densidade). */
export function smokeSetGraph(): NodeGraph {
    return new NodeGraph({
        nodes: {
            g: nodes.set.grid.with({ resolution: [...V.resolution], size: [...V.size] }),
            p: graphArgument('position'),
            h: nodes.noise.gradient3.with({ scale: V.height.scale, offset: [...V.height.offset] }),
            d: nodes.set.displace.with({ scale: V.displaceScale }),
            n: nodes.set.recomputeNormals,
            q: nodes.input.vertexField('position'),
            k: nodes.noise.gradient3.with({
                scale: V.density.scale,
                offset: [...V.density.offset],
            }),
            s: nodes.set.distributeOnMesh.with({ per_triangle: V.perTriangle, seed: V.seed }),
            r: nodes.set.realizeInstances.with({
                radius: V.radius,
                segments: V.segments,
                rings: V.rings,
            }),
            o: nodes.set.meshOutput,
        },
        links: [
            ['g.mesh', 'd.mesh'],
            ['p.value', 'h.p'],
            ['h.value', 'd.height'],
            ['d.mesh', 'n.mesh'],
            ['n.mesh', 's.mesh'],
            ['q.value', 'k.p'],
            ['k.value', 's.density'],
            ['s.points', 'r.points'],
            ['r.mesh', 'o.mesh'],
        ],
    });
}

/** Resultado da referência: a malha com normais, os pontos e as esferas. */
export interface SetGraphReference {
    readonly normals: ReferenceMesh;
    readonly points: ReferencePoints;
    readonly spheres: ReferenceMesh;
}

/** A cadeia do grafo do smoke pelas referências dos nós, em f64. */
export function setGraphReference(): SetGraphReference {
    const base = grid(V.resolution[0], V.resolution[1], V.size[0], V.size[1]);
    const lifted = displace(
        base,
        (p) => noiseGradient3(p, V.height.scale, V.height.offset),
        V.displaceScale,
    );
    const normals = recomputeNormals(lifted);
    const points = distributeOnMesh(
        normals,
        (p) => noiseGradient3(p, V.density.scale, V.density.offset),
        V.perTriangle,
        V.seed,
    );
    const spheres = realizeInstances(points.points, V.radius, V.segments, V.rings);
    return { normals, points, spheres };
}
