import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import { Light, type LightValues } from './Light';
import { poolLightContribution } from './points/lightContributions';

/** Valores de uma `SpotLight`: os de uma luz e os cones. */
export interface SpotLightValues extends LightValues {
    /** Meio-ângulo do cone interno em radianos (intensidade plena dentro dele). Default π/8. */
    readonly innerCone?: number;
    /** Meio-ângulo do cone externo em radianos (zero fora dele; transição suave entre os dois). Default π/6. */
    readonly outerCone?: number;
}

/** Cones avisados de interno > externo (aviso único). */
let warnedCones = false;

/**
 * Luz spot (spec 011): posição, direção, cor, intensidade em candela, alcance e os cones interno e externo — plena dentro
 * do interno, zero fora do externo, transição suave entre eles; queda pelo inverso do quadrado até o alcance. Cones
 * fora de 0 < interno ≤ externo ≤ π/2 são presos (interno > externo vira o externo, com aviso único).
 */
export class SpotLight extends Light {
    constructor(values: SpotLightValues = {}) {
        super();
        const outer = Math.min(Math.max(values.outerCone ?? Math.PI / 6, 1e-3), Math.PI / 2);
        let inner = Math.min(Math.max(values.innerCone ?? Math.PI / 8, 0), Math.PI / 2);
        if (inner > outer) {
            if (!warnedCones) {
                warnedCones = true;
                console.warn(
                    `[SpotLight] cone interno (${inner}) maior que o externo (${outer}): usado o externo.`,
                );
            }
            inner = outer;
        }
        this.data = {
            kind: 2,
            castShadow: values.castShadow === true ? 1 : 0,
            intensity: values.intensity ?? 1.0,
            range: values.range ?? 10.0,
            position: values.position ?? [0, 0, 0, 1],
            direction: values.direction ?? [0, -1, 0, 0],
            color: values.color ?? [1, 1, 1, 1],
            cones: [inner, outer, 0, 0],
        };
    }

    /** O laço das luzes do pool no ponto `scene_lighting`. */
    getSceneContributions(): readonly SceneContribution[] {
        return [poolLightContribution];
    }
}
