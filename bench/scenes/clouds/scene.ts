import type { SceneDefinition } from '../../core/types';

/**
 * Nuvens volumétricas (spec 041): o céu físico com uma camada de cúmulos (cobertura 0,5, vento de 10 m/s) sobre um chão
 * de 2 km, vista do chão (`noon`, o sol a 60°; `sunset`, o sol a 4°) e de dentro da camada (`flight`, a câmera a 2,6 km).
 * O tempo por passe das nuvens vai no resultado (`CloudNoiseFlow`, `CloudLightFlow.*`, `CloudFlow.*`,
 * `SkyCompositeFlow`).
 */
export const cloudsScene: SceneDefinition = {
    id: 'clouds',
    title: 'Nuvens volumétricas',
    description:
        'O céu físico com uma camada de cúmulos entre 1,5 e 4 km (cobertura 0,5, vento de 10 m/s) sobre um chão de 2 km: a marcha em ¼ da resolução com a reconstrução temporal, a sombra das nuvens no chão, o panorama no ambiente e a perspectiva aérea na geometria (spec 041). `noon`: o sol a 60°, a câmera no chão; `sunset`: o sol a 4°; `flight`: a câmera dentro da camada, a 2,6 km.',
    phase: 'F4',
    seed: 2041,
    camera: { position: [0, 2, 0], target: [1000, 450, 300], fovDeg: 60 },
    variants: [
        { id: 'noon', params: { sun: 60, altitude: 2 } },
        { id: 'sunset', params: { sun: 4, altitude: 2 } },
        { id: 'flight', params: { sun: 35, altitude: 2600 } },
    ],
    implementations: {
        clayflow: async () => (await import('./clayflow')).default,
        three: { unsupported: 'sem nuvens volumétricas no núcleo do Three.js' },
    },
};
