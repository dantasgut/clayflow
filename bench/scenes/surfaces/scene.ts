import type { SceneDefinition } from '../../core/types';

/** Meia largura do domínio da onda (m). */
export const SURFACE_HALF = 2;

/** Segmentos por lado da grade de precisão máxima (16 retalhos × 2⁴ na adaptativa). */
export const SURFACE_SEGMENTS = 256;

/** Altura da onda em (x, z) no tempo t — a mesma conta na função WGSL (clayflow) e na CPU (Three). */
export function waveHeight(x: number, z: number, t: number): number {
    return 0.25 * Math.sin(2 * x + t) * Math.cos(2 * z + 0.7 * t);
}

/** Superfície paramétrica animada (spec 010): avaliação por quadro na GPU, uniforme e adaptativa. */
export const surfacesScene: SceneDefinition = {
    id: 'surfaces',
    title: 'Superfícies paramétricas',
    description:
        'Uma onda animada de 4 m × 4 m com 257² vértices de precisão máxima, reavaliada a cada quadro — clayflow: na GPU (`ParametricSurface` com `SurfaceFunction`; `wave-adaptive`: malha adaptativa por curvatura e distância à câmera com desenho indireto, spec 010); Three: a mesma grade deslocada na CPU com as normais recalculadas (referência).',
    phase: 'F3',
    seed: 2026,
    camera: { position: [0, 1.6, 3.4], target: [0, 0, 0], fovDeg: 50 },
    variants: [
        { id: 'wave-uniform', params: { adaptive: false } },
        { id: 'wave-adaptive', params: { adaptive: true } },
    ],
    implementations: {
        clayflow: async () => (await import('./clayflow')).default,
        three: async () => (await import('./three')).default,
    },
};
