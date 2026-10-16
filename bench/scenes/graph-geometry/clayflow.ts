import {
    compileSetGraph,
    DirectionalLight,
    graphArgument,
    GraphGeometry,
    NodeGraph,
    nodes,
    SetGraph,
    StandardMaterial,
    Transform,
} from 'clayflow';
import type { SceneImplementation } from '../../core/types';
import type { ClayflowHandle } from '../../engines/clayflow';
import { GRAPH_GRID, GRAPH_SIZE } from './scene';

/** O grafo do terreno com rochas: deslocamento e densidade por ruído (grafos de ponto fundidos). */
function terrain(): NodeGraph {
    return new NodeGraph({
        nodes: {
            g: nodes.set.grid.with({
                resolution: [GRAPH_GRID, GRAPH_GRID],
                size: [GRAPH_SIZE, GRAPH_SIZE],
            }),
            p: graphArgument('position'),
            h: nodes.noise.gradient3.with({ scale: 1.3, offset: [0.4, 1.1, 0.7] }),
            d: nodes.set.displace.with({ scale: 0.35 }),
            n: nodes.set.recomputeNormals,
            q: nodes.input.vertexField('position'),
            k: nodes.noise.gradient3.with({ scale: 2.1, offset: [3.3, 0.2, 1.9] }),
            s: nodes.set.distributeOnMesh.with({ per_triangle: 1, seed: 7 }),
            r: nodes.set.realizeInstances.with({ radius: 0.025, segments: 6, rings: 4 }),
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

let graph: SetGraph | undefined;
let time = 0;
let live = false;

/**
 * Terreno e rochas gerados por um `SetGraph` no `GraphFlow` (spec 031): a `GraphGeometry` com a capacidade do plano é
 * escrita pela GPU e desenhada pelo forward e pela sombra. `live` muda a escala do ruído a cada quadro (o grafo inteiro
 * é refeito, sem recompilar); `static` não refaz nada depois de montado.
 */
const impl: SceneImplementation<ClayflowHandle> = {
    limitations: ['render LDR 8 bits (HDR na F4)'],
    setup({ engine, variant }) {
        const world = engine.app.world;
        world.insert(new DirectionalLight({ direction: [-0.3, -1, -0.4, 0], intensity: 1.1 }));
        const shape = terrain();
        graph = new SetGraph({ graph: shape });
        const set = graph;
        const plan = compileSetGraph(shape, (id) => set.valuesOf(id));
        const cap = (key: string): number => plan.sets.find((s) => s.key === key)?.capacity ?? 0;
        const triangles = cap('r.mesh.triangles');
        world.insert(
            graph
                .add(
                    new GraphGeometry({
                        vertexCapacity: cap('r.mesh.vertices'),
                        indexCapacity: triangles * 3,
                    }),
                )
                .add(new StandardMaterial({ albedo: [0.55, 0.5, 0.42, 1] }))
                .add(new Transform()),
        );
        live = variant.params.live === true;
        time = 0;
    },
    update(dt) {
        if (!live || graph === undefined) return;
        time += dt;
        graph.values.h_scale = 1.3 + 0.3 * Math.sin(time);
    },
};

export default impl;
