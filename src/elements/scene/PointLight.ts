import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import { Light, type LightValues } from './Light';
import { poolLightContribution } from './points/lightContributions';

/**
 * Luz pontual: posição, cor, intensidade em candela e alcance. Ilumina pelo inverso do quadrado da distância, indo a
 * zero suavemente até o alcance (`range` 0 = sem alcance). Sem sombra nesta spec (013).
 */
export class PointLight extends Light {
    constructor(values: LightValues = {}) {
        super();
        this.data = {
            kind: 1,
            castShadow: values.castShadow === true ? 1 : 0,
            intensity: values.intensity ?? 1.0,
            range: values.range ?? 10.0,
            position: values.position ?? [0, 0, 0, 1],
            direction: values.direction ?? [0, 0, 0, 0],
            color: values.color ?? [1, 1, 1, 1],
            cones: [0, 0, 0, 0],
        };
    }

    /** O laço das luzes do pool no ponto `scene_lighting` (spec 011). */
    getSceneContributions(): readonly SceneContribution[] {
        return [poolLightContribution];
    }
}
