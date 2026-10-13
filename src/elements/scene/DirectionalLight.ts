import { Light, type LightValues } from './Light';
import { ShadowMap, type ShadowMapOptions } from './ShadowMap';

/**
 * Luz direcional (sol): direção, cor e intensidade. Com `castShadow: true`, anexa o seu `ShadowMap` (matriz da luz,
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
        };
        this.shadowMap = castShadow ? new ShadowMap(values.shadow) : undefined;
        if (this.shadowMap !== undefined) this.add(this.shadowMap);
    }
}
