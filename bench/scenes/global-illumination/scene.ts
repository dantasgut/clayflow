import type { SceneDefinition } from '../../core/types';

/** Vértices por lado da onda (707² ≈ 1 milhão de triângulos). */
export const GI_SURFACE_SEGMENTS = 707;
/** Meia largura da onda (m). */
export const GI_SURFACE_HALF = 4;

/** Iluminação global (spec 033) numa cena de 1 milhão de triângulos animados, com o sol e o céu físico. */
export const globalIlluminationScene: SceneDefinition = {
    id: 'global-illumination',
    title: 'Iluminação global',
    description:
        'Uma onda animada de 8 m × 8 m com 707² vértices (≈ 1 milhão de triângulos, reavaliada na GPU a cada quadro), caixas coloridas em volta, o sol e o céu físico (spec 033). `off`: só a luz direta e o céu; `medium`: a iluminação global na qualidade média — a estrutura de raios refeita na GPU (refit da onda, TLAS), as sondas do mundo e a coleta final na tela. A diferença entre as duas é o custo da iluminação global.',
    phase: 'F4',
    seed: 2026,
    camera: { position: [0, 2.4, 6.5], target: [0, 0.3, 0], fovDeg: 55 },
    variants: [
        { id: 'off', params: { gi: false } },
        { id: 'medium', params: { gi: true } },
    ],
    implementations: {
        clayflow: async () => (await import('./clayflow')).default,
        three: { unsupported: 'sem iluminação global em tempo real no núcleo do Three.js' },
    },
};
