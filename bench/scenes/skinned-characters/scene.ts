import type { SceneDefinition } from '../../core/types';

export const CHARACTERS_EXTENT = 40;

/** 500 personagens com esqueleto e animação (FR-002.4) — clayflow não suportado até a F8. */
export const skinnedCharactersScene: SceneDefinition = {
    id: 'skinned-characters',
    title: 'Personagens animados',
    description:
        '500 humanoides procedurais (20 ossos, ~3k vértices) andando com fases aleatórias.',
    phase: 'F0',
    seed: 1337,
    camera: { position: [0, 22, 38], target: [0, 1, 0], fovDeg: 60 },
    variants: [{ id: '500', params: { count: 500 } }],
    implementations: {
        clayflow: { unsupported: 'sem skinning/animação', until: 'F8' },
        three: async () => (await import('./three')).default,
    },
};
