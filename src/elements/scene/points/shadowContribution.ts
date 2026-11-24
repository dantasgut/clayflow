import { NONE } from '../../../scene/shaders/engineConstants';
import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import { shadowVirtualRead, shadowVirtualThickness } from './shaders';
import { Light } from '../Light';
import { ShadowMap } from '../ShadowMap';
import { lightsResource, shadowMapsResource, shadowMatricesResource } from '../resources';
import {
    lightShadowViewPoint,
    lightShadowViewReady,
    lightThicknessPoint,
    lightVisibilityPoint,
} from './lighting';

const views = new Map<string, WgslModule>();

/**
 * O mapa de sombra da luz no slot `lightSlot`: o do slot `shadowSlot`; as outras luzes, nenhum. Um módulo pequeno por
 * luz que projeta — é só o que cresce no shader com o número de luzes com sombra.
 */
function viewModule(lightSlot: number, shadowSlot: number): WgslModule {
    const key = `${lightSlot}:${shadowSlot}`;
    let m = views.get(key);
    if (m === undefined) {
        m = wgslModule({
            name: `light_shadow_view_${lightSlot}_${shadowSlot}`,
            requires: [NONE.module],
            source: `fn light_shadow_view(light: u32) -> u32 {
    if (light == ${lightSlot}u) { return ${shadowSlot}u; }
    return NONE;
}`,
        });
        views.set(key, m);
    }
    return m;
}

/**
 * Visibilidade da luz `light` pelo mapa de sombra virtual dela (`light_shadow_view`; sem mapa, 1): a leitura no atlas
 * único (`shadow_light_visibility`), com os vieses e as amostras do mapa, a direção do ponto à luz pelo tipo dela (a
 * direcional, pela direção; a de foco e a pontual, pela posição) e a largura da penumbra pelo tamanho da fonte
 * (`cones.z`, o raio angular do disco da direcional; `cones.w`, o raio em metros da luz local). Um módulo só para todas
 * as luzes: a leitura entra uma vez no shader, qualquer que seja o número de luzes com sombra — com uma chamada por luz
 * o shader dos materiais grandes passava do que o compilador da GPU aguenta e saía errado (medido com três luzes com
 * sombra e a iluminação global: o globo ocular, o mármore e o couro).
 */
const visibility = wgslModule({
    name: 'light_visibility_shadow',
    requires: [
        NONE.module,
        shadowVirtualRead,
        lightsResource,
        shadowMapsResource,
        shadowMatricesResource,
        lightShadowViewReady,
    ],
    source: `fn light_visibility(light: u32, p: vec3f, n: vec3f) -> f32 {
    let view = light_shadow_view(light);
    if (view == NONE) { return 1.0; }
    let sm = shadow_maps[view];
    let emitter = lights[light];
    let directional = emitter.kind == 0u;
    let l = select(normalize(emitter.position.xyz - p), -normalize(emitter.direction.xyz), directional);
    return shadow_light_visibility(shadow_matrices[view], p, n, l, sm.bias, sm.normalBias, sm.penumbraSamples,
        select(emitter.cones.w, emitter.cones.z, directional));
}`,
});

/**
 * Espessura atravessada pela luz `light` pelo mapa de sombra virtual dela (spec 011, T113; `light_shadow_view`): sem
 * mapa, ninguém sabe. Um módulo só para todas as luzes, como a visibilidade.
 */
const thickness = wgslModule({
    name: 'light_thickness_shadow',
    requires: [
        NONE.module,
        shadowVirtualThickness,
        lightsResource,
        shadowMatricesResource,
        lightShadowViewReady,
    ],
    source: `fn light_thickness(light: u32, p: vec3f, n: vec3f) -> vec2f {
    let view = light_shadow_view(light);
    if (view == NONE) { return vec2f(-1.0, 0.0); }
    let emitter = lights[light];
    let l = select(normalize(emitter.position.xyz - p), -normalize(emitter.direction.xyz), emitter.kind == 0u);
    return shadow_light_thickness(shadow_matrices[view], p, n, l);
}`,
});

/**
 * Contribuição da luz que projeta sombra (spec 031, R4; spec 011, R7; spec 013: direcional, de foco e pontual): o mapa
 * dela em `light_shadow_view` (pelo slot no pool `Light`: vale só para ela) e a leitura — a mesma para todas — em
 * `light_visibility` e `light_thickness`. Sem projetar (`castShadow` 0), sem vista no atlas ou sem slot ainda, não
 * contribui: a luz ilumina sem sombra e ninguém sabe a espessura que ela atravessa.
 */
export function shadowCasterContributions(casting: () => boolean): readonly SceneContribution[] {
    return [
        {
            point: lightShadowViewPoint,
            order: 0,
            pools: [Light.schema, ShadowMap.schema],
            build: (slotOf) => {
                const light = slotOf(Light.schema);
                const shadow = slotOf(ShadowMap.schema);
                return !casting() || light === undefined || shadow === undefined
                    ? undefined
                    : viewModule(light, shadow);
            },
        },
        {
            point: lightVisibilityPoint,
            order: 0,
            pools: [Light.schema, ShadowMap.schema],
            build: (slotOf) =>
                !casting()
                || slotOf(Light.schema) === undefined
                || slotOf(ShadowMap.schema) === undefined
                    ? undefined
                    : visibility,
        },
        // A espessura do corpo entre a luz e o ponto, do mesmo mapa (spec 011, T113: a subsuperfície pelas partes finas).
        {
            point: lightThicknessPoint,
            order: 0,
            pools: [Light.schema, ShadowMap.schema],
            build: (slotOf) =>
                !casting()
                || slotOf(Light.schema) === undefined
                || slotOf(ShadowMap.schema) === undefined
                    ? undefined
                    : thickness,
        },
    ];
}
