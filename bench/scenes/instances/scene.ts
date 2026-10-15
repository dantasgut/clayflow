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

/** Funções `transform` distintas da variante (spec 009); 0 = sem funções. */
export function functionsOf(params: Readonly<Record<string, unknown>>): number {
    return Number(params.functions ?? 0);
}

/**
 * Deslocamento vertical da função `k` (spec 009) — a mesma conta na função WGSL (clayflow) e na CPU (Three):
 * `0,5 · sen(t · (1 + 0,1·k) + 0,01·i)`.
 */
export function bobOf(k: number, i: number, t: number): number {
    return 0.5 * Math.sin(t * (1 + 0.1 * k) + 0.01 * i);
}

/** Instâncias: a mesma malha repetida — estáticas e uma variante em movimento (FR-002.1). */
export const instancesScene: SceneDefinition = {
    id: 'instances',
    title: 'Instâncias',
    description:
        'A mesma caixa repetida N vezes numa grade com jitter; `10k-moving` move todas a cada quadro; `10k-functions` move todas por 10 funções `transform` distintas (spec 009: na GPU no clayflow, na CPU no Three).',
    phase: 'F0',
    seed: 1337,
    camera: { position: [0, 120, 160], target: [0, 0, 0], fovDeg: 60 },
    variants: [
        { id: '10k', params: { count: 10_000 } },
        { id: '100k', params: { count: 100_000 } },
        { id: '1m', params: { count: 1_000_000 } },
        { id: '10k-moving', params: { count: 10_000, moving: true } },
        { id: '10k-functions', params: { count: 10_000, functions: 10 } },
    ],
    implementations: {
        clayflow: async () => (await import('./clayflow')).default,
        three: async () => (await import('./three')).default,
    },
};
