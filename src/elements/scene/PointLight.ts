import { NONE } from '../../scene/shaders/engineConstants';
import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import { Light, type LightValues } from './Light';
import { poolLightContribution, poolTransmittedContribution } from './points/lightContributions';
import { shadowCasterContributions } from './points/shadowContribution';
import { POINT_SHADOW_VIEWS, ShadowMap, type ShadowMapOptions } from './ShadowMap';

/** Valores de uma `PointLight`: os de uma luz e a sombra. */
export interface PointLightValues extends LightValues {
    /** As opções do mapa de sombra (com `castShadow: true`). */
    readonly shadow?: ShadowMapOptions;
    /**
     * Raio da fonte em metros, para a penumbra da sombra (a borda alarga com a distância entre quem tapa e quem
     * recebe). Default 0: a borda do texel do mapa.
     */
    readonly radius?: number;
}

/**
 * Luz pontual: posição, cor, intensidade em candela e alcance. Ilumina pelo inverso do quadrado da distância, indo a
 * zero suavemente até o alcance (`range` 0 = sem alcance).
 *
 * Com `castShadow: true` (spec 013), anexa o seu `ShadowMap` com seis vistas em perspectiva de 90° — as faces do cubo
 * em volta da posição, do alcance/1000 ao alcance — no atlas único da cena: a sombra em todas as direções, com a face
 * escolhida pela direção da luz ao ponto. As seis vistas contam no teto de vistas do renderizador.
 */
export class PointLight extends Light {
    /** O mapa de sombra anexado (só com `castShadow: true`). */
    readonly shadowMap: ShadowMap | undefined;
    private readonly contributions: readonly SceneContribution[];

    constructor(values: PointLightValues = {}) {
        super();
        this.data = {
            kind: 1,
            castShadow: values.castShadow === true ? 1 : 0,
            intensity: values.intensity ?? 1.0,
            range: values.range ?? 10.0,
            position: values.position ?? [0, 0, 0, 1],
            direction: values.direction ?? [0, 0, 0, 0],
            color: values.color ?? [1, 1, 1, 1],
            cones: [0, 0, 0, Math.max(0, values.radius ?? 0)],
            axis: [0, 0, 0, 0],
        };
        this.shadowMap =
            values.castShadow === true
                ? new ShadowMap(values.shadow, POINT_SHADOW_VIEWS)
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
                          'point',
                      ),
                      poolTransmittedContribution,
                  ];
    }

    /**
     * O laço das luzes do pool no ponto `scene_direct_lighting` (spec 011) e, com o mapa de sombra, a sombra desta luz
     * em `light_visibility`, a espessura que ela atravessa em `light_thickness` e a luz que atravessa os materiais com
     * subsuperfície em `scene_transmitted_lighting`.
     */
    getSceneContributions(): readonly SceneContribution[] {
        return this.contributions;
    }
}
