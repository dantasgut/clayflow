import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import { Light, type LightValues } from './Light';
import { poolLightContribution } from './points/lightContributions';
import { shadowCasterContributions } from './points/shadowContribution';
import { ShadowMap, type ShadowMapOptions } from './ShadowMap';

/** Diâmetro angular do sol visto da Terra (rad): ~0,53°. */
export const SUN_ANGULAR_DIAMETER = 0.0093;

/**
 * Luz direcional (sol): direção, cor e intensidade em lux (irradiância numa superfície voltada para ela). Com `castShadow: true`, anexa o seu `ShadowMap` (matriz da luz,
 * vieses e a textura de profundidade), que o estágio de sombra preenche e o render principal amostra. O diâmetro
 * angular da fonte (`angularDiameter`, padrão o do sol; spec 034) dá a largura da penumbra: a distância de quem faz
 * sombra até quem a recebe vezes ele.
 */
export class DirectionalLight extends Light {
    /** O mapa de sombra anexado (só com `castShadow: true`). */
    readonly shadowMap: ShadowMap | undefined;

    constructor(
        values: LightValues & {
            readonly shadow?: ShadowMapOptions;
            /** Diâmetro angular da fonte (rad; 0 = ponto, sombra dura). Padrão `SUN_ANGULAR_DIAMETER`. */
            readonly angularDiameter?: number;
        } = {},
    ) {
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
            // Na direcional, `cones.z` leva o diâmetro angular da fonte (a penumbra da sombra).
            cones: [0, 0, Math.max(0, values.angularDiameter ?? SUN_ANGULAR_DIAMETER), 0],
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
     * O laço das luzes do pool no ponto `scene_lighting` e, com o mapa de sombra, a sombra desta luz em
     * `light_visibility` (spec 011).
     */
    getSceneContributions(): readonly SceneContribution[] {
        return this.contributions;
    }
}
