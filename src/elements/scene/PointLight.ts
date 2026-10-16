import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import { Light, type LightValues } from './Light';
import { anyLightContribution } from './points/anyLightContribution';

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
        };
    }

    /** A primeira luz viva da cena, no ponto dos sprites (spec 031). */
    getSceneContributions(): readonly SceneContribution[] {
        return [anyLightContribution];
    }
}
