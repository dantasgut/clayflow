import type { SceneDefinition } from '../../core/types';

export const LIGHTS_EXTENT = 60;

/** 256 luzes pontuais sobre um plano com 200 objetos (FR-002.3). */
export const pointLightsScene: SceneDefinition = {
    id: 'point-lights',
    title: 'Luzes pontuais',
    description: '256 luzes pontuais coloridas iluminando um plano com 200 objetos.',
    phase: 'F0',
    seed: 1337,
    camera: { position: [0, 45, 55], target: [0, 0, 0], fovDeg: 60 },
    variants: [{ id: '256', params: { lights: 256, objects: 200 } }],
    implementations: {
        clayflow: { unsupported: 'o forward ignora PointLight', until: 'F4' },
        three: async () => (await import('./three')).default,
    },
};
