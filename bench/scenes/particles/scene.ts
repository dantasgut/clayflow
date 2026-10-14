import type { SceneDefinition } from '../../core/types';

/** Meia largura interna do tanque (m). */
export const TANK_HALF = 0.6;

/** Lado do bloco e espaçamento de cada variante: 16³ a 5 cm (4 096) e 40³ a 2,5 cm (64 000, perto do teto de 65 536). */
export function blockOf(count: number): { side: number; spacing: number } {
    const side = Math.round(Math.cbrt(count));
    return { side, spacing: side <= 16 ? 0.05 : 0.025 };
}

/** Posições do bloco no tanque (x, y, z por partícula), com jitter do `rng`. */
export function blockPositions(rng: () => number, count: number): number[] {
    const { side, spacing } = blockOf(count);
    const out: number[] = [];
    const start = -((side - 1) * spacing) / 2;
    for (let i = 0; i < side * side * side; i++) {
        const x = i % side;
        const z = Math.floor(i / side) % side;
        const y = Math.floor(i / (side * side));
        out.push(
            start + x * spacing + (rng() - 0.5) * spacing * 0.1,
            0.05 + y * spacing + (rng() - 0.5) * spacing * 0.1,
            start + z * spacing + (rng() - 0.5) * spacing * 0.1,
        );
    }
    return out;
}

/** Fluido de partículas num tanque (spec 008): simulação e desenho das partículas por quadro. */
export const particlesScene: SceneDefinition = {
    id: 'particles',
    title: 'Partículas (fluido)',
    description:
        'Bloco de fluido num tanque — clayflow: SPH na GPU desenhado em sprites lidos do pool (variantes `*-water`: água contínua com cáusticas, spec 017; `*-cohesion`: coesão e adesão de referência da água, spec 030); Three: o mesmo número de partículas instanciadas movidas pela CPU (referência de custo de desenho).',
    phase: 'F2',
    seed: 4242,
    camera: { position: [0, 1.4, 2.2], target: [0, 0.3, 0], fovDeg: 50 },
    variants: [
        { id: '4k', params: { count: 4096 } },
        { id: '64k', params: { count: 64_000 } },
        // Spec 017: o mesmo fluido como água contínua (superfície, óptica e cáusticas sob luz com sombra).
        { id: '4k-water', params: { count: 4096, water: true } },
        { id: '64k-water', params: { count: 64_000, water: true } },
        // Spec 030: o mesmo fluido em sprites com a coesão e a adesão de referência da água (custo da simulação).
        { id: '4k-cohesion', params: { count: 4096, cohesion: true } },
        { id: '64k-cohesion', params: { count: 64_000, cohesion: true } },
    ],
    implementations: {
        clayflow: async () => (await import('./clayflow')).default,
        three: async () => (await import('./three')).default,
    },
};
