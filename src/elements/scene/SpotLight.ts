import { NONE } from '../../scene/shaders/engineConstants';
import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import { Light, type LightValues } from './Light';
import { poolLightContribution, poolTransmittedContribution } from './points/lightContributions';
import { shadowCasterContributions } from './points/shadowContribution';
import { ShadowMap, SPOT_SHADOW_VIEWS, type ShadowMapOptions } from './ShadowMap';

/** Valores de uma `SpotLight`: os de uma luz e os cones. */
export interface SpotLightValues extends LightValues {
    /** Meio-ângulo do cone interno em radianos (intensidade plena dentro dele). Default π/8. */
    readonly innerCone?: number;
    /** Meio-ângulo do cone externo em radianos (zero fora dele; transição suave entre os dois). Default π/6. */
    readonly outerCone?: number;
    /** As opções do mapa de sombra (com `castShadow: true`). */
    readonly shadow?: ShadowMapOptions;
    /**
     * Raio da fonte em metros, para a penumbra da sombra (a borda alarga com a distância entre quem tapa e quem
     * recebe). Default 0: a borda do texel do mapa.
     */
    readonly radius?: number;
}

/** Cones avisados de interno > externo (aviso único). */
let warnedCones = false;

/**
 * Luz spot (spec 011): posição, direção, cor, intensidade em candela, alcance e os cones interno e externo — plena dentro
 * do interno, zero fora do externo, transição suave entre eles; queda pelo inverso do quadrado até o alcance. Cones
 * fora de 0 < interno ≤ externo ≤ π/2 são presos (interno > externo vira o externo, com aviso único).
 *
 * Com `castShadow: true` (spec 013), anexa o seu `ShadowMap` com uma vista em perspectiva — o cone externo, até 1,4 rad
 * de meio ângulo, do alcance/1000 ao alcance — no atlas único da cena; a sombra vale dentro do cone.
 */
export class SpotLight extends Light {
    /** O mapa de sombra anexado (só com `castShadow: true`). */
    readonly shadowMap: ShadowMap | undefined;
    private readonly contributions: readonly SceneContribution[];

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
            cones: [inner, outer, 0, Math.max(0, values.radius ?? 0)],
            axis: [0, 0, 0, 0],
        };
        this.shadowMap =
            values.castShadow === true
                ? new ShadowMap(values.shadow, SPOT_SHADOW_VIEWS)
                : undefined;
        if (this.shadowMap !== undefined) this.add(this.shadowMap);
        this.contributions =
            this.shadowMap === undefined
                ? [poolLightContribution]
                : [
                      poolLightContribution,
                      ...shadowCasterContributions(
                          () =>
                              this.data.castShadow === 1
                              && this.shadowMap?.data.view !== NONE.value,
                          'spot',
                      ),
                      poolTransmittedContribution,
                  ];
    }

    /**
     * O laço das luzes do pool no ponto `scene_direct_lighting` e, com o mapa de sombra, a sombra desta luz em
     * `light_visibility`, a espessura que ela atravessa em `light_thickness` e a luz que atravessa os materiais com
     * subsuperfície em `scene_transmitted_lighting`.
     */
    getSceneContributions(): readonly SceneContribution[] {
        return this.contributions;
    }
}
