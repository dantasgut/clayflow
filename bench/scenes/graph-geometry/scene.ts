import type { SceneDefinition } from '../../core/types';

/** Vértices por lado da grade do terreno. */
export const GRAPH_GRID = 96;
/** Lado do terreno (m). */
export const GRAPH_SIZE = 4;

/** Geometria procedural por grafo de nós de conjunto (spec 031): terreno deslocado por ruído com rochas distribuídas. */
export const graphGeometryScene: SceneDefinition = {
    id: 'graph-geometry',
    title: 'Geometria por grafo de nós',
    description:
        'Grafo de nós de conjunto (spec 031) na GPU: grade 96² → deslocar por ruído (grafo de ponto fundido) → normais → distribuir pontos por densidade (contagem decidida na GPU) → esferas por ponto → malha desenhada por desenho indireto. `static`: montado uma vez, nada refeito com a cena parada; `live`: a escala do ruído muda a cada quadro e o grafo inteiro é refeito.',
    phase: 'F3b',
    seed: 2026,
    camera: { position: [0, 3.2, 4.2], target: [0, 0, 0], fovDeg: 50 },
    variants: [
        { id: 'static', params: { live: false } },
        { id: 'live', params: { live: true } },
    ],
    implementations: {
        clayflow: async () => (await import('./clayflow')).default,
        three: {
            unsupported:
                'sem grafo de nós de geometria refeito na GPU; a referência de CPU dos nós está no smoke nodeGraphs',
        },
    },
};
