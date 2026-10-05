import { gridScatter, type Placement } from '../../core/rng';
import type { SceneDefinition } from '../../core/types';

export const UNIQUE_EXTENT = 60;

/** Forma de um objeto único — mesma sequência nas duas engines. */
export type UniqueShape =
    | { kind: 'box'; size: readonly [number, number, number] }
    | { kind: 'sphere'; radius: number; latSegments: number; lonSegments: number };

/** Objeto único: pose + forma + material próprios, derivados só do `rng`. */
export interface UniqueObject {
    readonly placement: Placement;
    readonly shape: UniqueShape;
    readonly roughness: number;
}

/** Gera os objetos (pares box/esfera alternados com parâmetros distintos). */
export function uniqueObjects(rng: () => number, count: number): UniqueObject[] {
    const placements = gridScatter(rng, count, UNIQUE_EXTENT);
    return placements.map((placement, i) => {
        const shape: UniqueShape =
            i % 2 === 0
                ? { kind: 'box', size: [0.5 + rng() * 1.5, 0.5 + rng() * 1.5, 0.5 + rng() * 1.5] }
                : {
                      kind: 'sphere',
                      radius: 0.4 + rng() * 0.8,
                      latSegments: 8 + Math.floor(rng() * 17),
                      lonSegments: 16 + Math.floor(rng() * 33),
                  };
        return { placement, shape, roughness: 0.2 + rng() * 0.7 };
    });
}

/** 1k objetos com malhas e materiais distintos (FR-002.2). */
export const uniqueObjectsScene: SceneDefinition = {
    id: 'unique-objects',
    title: 'Objetos únicos',
    description: '1k objetos, cada um com geometria (caixa/esfera) e material próprios.',
    phase: 'F0',
    seed: 1337,
    camera: { position: [0, 40, 60], target: [0, 0, 0], fovDeg: 60 },
    variants: [{ id: '1k', params: { count: 1000 } }],
    implementations: {
        clayflow: async () => (await import('./clayflow')).default,
        three: async () => (await import('./three')).default,
    },
};
