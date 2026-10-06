import type { SceneDefinition } from '../../core/types';

/** Meia-extensão do chão (XZ) e raio das esferas. */
export const GROUND_HALF = 20;
export const BALL_RADIUS = 0.25;

/** Posições iniciais das esferas: colunas sobre o chão, derivadas só do `rng`. */
export function ballPositions(rng: () => number, count: number): [number, number, number][] {
    const out: [number, number, number][] = [];
    const span = GROUND_HALF * 0.75;
    for (let i = 0; i < count; i++) {
        out.push([
            (rng() * 2 - 1) * span,
            1 + rng() * Math.max(4, count / 200),
            (rng() * 2 - 1) * span,
        ]);
    }
    return out;
}

/** Corpos rígidos caindo e colidindo sobre um chão estático (FR-002.5). */
export const rigidBodiesScene: SceneDefinition = {
    id: 'rigid-bodies',
    title: 'Corpos rígidos',
    description:
        'N esferas soltas sobre um chão estático, passo fixo de 1/60 s — clayflow na GPU, Three + Rapier na CPU.',
    phase: 'F0',
    seed: 1337,
    camera: { position: [0, 25, 45], target: [0, 2, 0], fovDeg: 60 },
    variants: [
        { id: '1k', params: { count: 1000 } },
        { id: '10k', params: { count: 10_000 } },
    ],
    implementations: {
        clayflow: async () => (await import('./clayflow')).default,
        three: async () => (await import('./three')).default,
    },
};
