import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import { Light, type LightValues } from './Light';
import { poolLightContribution } from './points/lightContributions';
import { shadowCasterContributions } from './points/shadowContribution';
import { ShadowMap, type ShadowMapOptions } from './ShadowMap';

/**
 * Luz direcional (sol): direção, cor e intensidade em lux (irradiância numa superfície voltada para ela). Com `castShadow: true`, anexa o seu `ShadowMap` (matriz da luz,
 * vieses e a textura de profundidade), que o estágio de sombra preenche e o render principal amostra.
 */
export class DirectionalLight extends Light {
    /** O mapa de sombra anexado (só com `castShadow: true`). */
    readonly shadowMap: ShadowMap | undefined;

    constructor(values: LightValues & { readonly shadow?: ShadowMapOptions } = {}) {
        super();
        const castShadow = values.castShadow === true;
        this.data = {
            kind: 0,
            castShadow: castShadow ? 1 : 0,
            intensity: values.intensity ?? 1.0,
            range: values.range ?? 0,
            position: values.position ?? [0, 10, 0, 1],
            direction: values.direction ?? [0, -1, 0, 0],
            color: values.color ?? [1, 1, 1, 1],
            cones: [0, 0, 0, 0],
        };
        this.shadowMap = castShadow ? new ShadowMap(values.shadow) : undefined;
        if (this.shadowMap !== undefined) this.add(this.shadowMap);
        this.contributions =
            this.shadowMap === undefined
                ? [poolLightContribution]
                : [
                      poolLightContribution,
                      ...shadowCasterContributions(() => this.data.castShadow === 1),
                  ];
    }

    private readonly contributions: readonly SceneContribution[];

    /**
     * O laço das luzes do pool no ponto `scene_direct_lighting` e, com o mapa de sombra, a sombra desta luz em
     * `light_visibility` (spec 011).
     */
    getSceneContributions(): readonly SceneContribution[] {
        return this.contributions;
    }
}
