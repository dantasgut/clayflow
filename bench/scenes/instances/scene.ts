import type { SceneDefinition } from '../../core/types';

/** Lado da área (unidades de mundo) onde as instâncias são espalhadas, igual em todas as variantes. */
export const INSTANCES_EXTENT = 200;

/** Contagem da variante. */
export function countOf(params: Readonly<Record<string, unknown>>): number {
    return Number(params.count);
}

/** Variante em movimento (posição e rotação mudam a cada quadro). */
export function isMoving(params: Readonly<Record<string, unknown>>): boolean {
    return params.moving === true;
}

/** Instâncias: a mesma malha repetida — estáticas e uma variante em movimento (FR-002.1). */
export const instancesScene: SceneDefinition = {
    id: 'instances',
    title: 'Instâncias',
    description:
        'A mesma caixa repetida N vezes numa grade com jitter; `10k-moving` move todas a cada quadro.',
    phase: 'F0',
    seed: 1337,
    camera: { position: [0, 120, 160], target: [0, 0, 0], fovDeg: 60 },
    variants: [
        { id: '10k', params: { count: 10_000 } },
        { id: '100k', params: { count: 100_000 } },
        { id: '1m', params: { count: 1_000_000 } },
        { id: '10k-moving', params: { count: 10_000, moving: true } },
    ],
    implementations: {
        clayflow: async () => (await import('./clayflow')).default,
        three: async () => (await import('./three')).default,
    },
};
