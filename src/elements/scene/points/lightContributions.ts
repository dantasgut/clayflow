import { poolArenaLiveReader } from '../../../scene/shaders/poolArena';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import { sharedConstant } from '../../../scene/shaders/SharedConstant';
import { NONE } from '../../../scene/shaders/engineConstants';
import { poolLive } from '../../gpu/compute/shaders';
import { constants } from '../../gpu/shaders/math';
import { closure, closureEval, subsurface } from '../../material/pbr/shaders';
import { HemisphereLightSchema } from '../HemisphereLightSchema';
import { Light } from '../Light';
import { lightsResource } from '../resources';
import {
    lightThicknessReady,
    lightTransmissionReady,
    lightVisibilityReady,
    sceneAmbientLightingPoint,
    sceneTransmittedLightingPoint,
    sceneBackgroundPoint,
    sceneDirectLightingPoint,
    sceneEnvironmentPoint,
} from './lighting';
import { sceneAmbientPoint } from './media';

/**
 * Teto de luzes do laço por pixel (spec 011, R7): slots do pool `Light` acima dele não iluminam (aviso único). A 013 troca
 * o laço pela lista por cluster.
 */
export const LIGHT_LIMIT = sharedConstant('LIGHT_LIMIT', 1024, 'u32');

/** Bitset de slots vivos do pool `Light` (resolver `Light.live`). */
export const lightLiveResource = poolArenaLiveReader({
    name: 'light_live',
    pool: Light.schema.name,
});

/** Parâmetros do hemisfério da cena (resolver `HemisphereLight.params`). */
const hemisphereResource = wgslResource({
    name: 'hemisphere',
    binding: { uniform: true },
    type: { schema: HemisphereLightSchema },
    frequency: 'frame',
    provider: { consumer: 'HemisphereLight.params' },
});

/**
 * A luz que chega de uma fonte do pool a um ponto (spec 011; extraída na 033 para os acertos da iluminação global): a
 * direção para a luz, a radiância e a distância (`1e30` na direcional). A direcional sem queda (lux); a pontual e a spot
 * (candela) pelo inverso do quadrado com a janela suave até o alcance `(1 − (d/r)⁴)²`; a spot com a transição em
 * cosseno entre os cones. Radiância 0 fora do alcance.
 */
export const lightIncoming = wgslModule({
    name: 'light_incoming',
    requires: [lightsResource],
    source: `struct LightIncoming {
    l: vec3f,
    radiance: vec3f,
    dist: f32,
}

fn light_incoming(light: Light, p: vec3f) -> LightIncoming {
    var l = -light.direction.xyz;
    var radiance = light.color.rgb * light.intensity;
    var dist = 1e30;
    if (light.kind != 0u) {
        let d = light.position.xyz - p;
        let dist2 = max(dot(d, d), 1e-8);
        dist = sqrt(dist2);
        if (light.range > 0.0 && dist >= light.range) { return LightIncoming(vec3f(0.0, 1.0, 0.0), vec3f(0.0), dist); }
        l = d / dist;
        let ratio = dist / max(light.range, 1e-6);
        let fade = clamp(1.0 - ratio * ratio * ratio * ratio, 0.0, 1.0);
        radiance = radiance * select(1.0, fade * fade, light.range > 0.0) / dist2;
        if (light.kind == 2u) {
            let cos_in = cos(light.cones.x);
            let cos_out = cos(light.cones.y);
            let t = clamp((dot(-l, normalize(light.direction.xyz)) - cos_out) / max(cos_in - cos_out, 1e-4), 0.0, 1.0);
            radiance = radiance * t * t;
        }
    }
    return LightIncoming(normalize(l), radiance, dist);
}`,
});

/**
 * As luzes do pool (`DirectionalLight` em lux, `PointLight` e `SpotLight` em candela) num laço sobre os slots vivos:
 * a luz que chega de cada uma (`light_incoming`), a sombra e o meio pelos pontos por luz, e a resposta do fechamento.
 */
const poolLights = wgslModule({
    name: 'scene_lighting_pool',
    requires: [
        closure,
        closureEval,
        poolLive,
        LIGHT_LIMIT.module,
        lightsResource,
        lightLiveResource,
        lightIncoming,
        lightVisibilityReady,
        lightTransmissionReady,
    ],
    source: `fn scene_direct_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    var sum = vec3f(0.0);
    let count = min(arrayLength(&lights), LIGHT_LIMIT);
    for (var i = 0u; i < count; i++) {
        if (!pool_live(light_live[i >> 5u], i)) { continue; }
        let inc = light_incoming(lights[i], p);
        if (all(inc.radiance <= vec3f(0.0))) { continue; }
        let radiance = inc.radiance * light_visibility(i, p, n) * light_transmission(i, p);
        sum = sum + closure_eval(c, n, v, inc.l, radiance);
    }
    return sum;
}`,
});

/**
 * A luz das fontes do pool que atravessa o corpo até um ponto com subsuperfície (spec 011, T113): de cada luz do lado
 * oposto à normal cuja espessura atravessada é conhecida (`light_thickness`: a do mapa de sombra dela), a irradiância
 * na superfície de entrada (a radiância pelo cosseno lá) atenuada pelo perfil de difusão do fechamento nessa espessura
 * (`subsurface_transmission`, por canal), sobre π.
 */
const poolTransmitted = wgslModule({
    name: 'scene_transmitted_lighting_pool',
    requires: [
        constants,
        closure,
        subsurface,
        poolLive,
        LIGHT_LIMIT.module,
        lightsResource,
        lightLiveResource,
        lightIncoming,
        lightThicknessReady,
        lightTransmissionReady,
    ],
    source: `fn scene_transmitted_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    if (c.subsurface_weight <= 0.0) { return vec3f(0.0); }
    let d = subsurface_length(c);
    var sum = vec3f(0.0);
    let count = min(arrayLength(&lights), LIGHT_LIMIT);
    for (var i = 0u; i < count; i++) {
        if (!pool_live(light_live[i >> 5u], i)) { continue; }
        let inc = light_incoming(lights[i], p);
        if (all(inc.radiance <= vec3f(0.0)) || dot(n, inc.l) >= 0.0) { continue; }
        let through = light_thickness(i, p, n);
        if (through.x < 0.0) { continue; }
        sum = sum + inc.radiance * light_transmission(i, p) * (through.y / PI)
            * subsurface_transmission(through.x, d);
    }
    return sum;
}`,
});

/**
 * Contribuição das luzes do pool ao ponto `scene_transmitted_lighting` (spec 011, T113): a luz que atravessa as partes
 * finas dos materiais com subsuperfície. Declarada pelas luzes que projetam sombra (as que conhecem a espessura).
 */
export const poolTransmittedContribution: SceneContribution = {
    point: sceneTransmittedLightingPoint,
    order: 0,
    pools: [Light.schema],
    build: () => poolTransmitted,
};

/** O hemisfério céu/chão (radiâncias × intensidade), pelo ponto de transmissão com a luz ambiente (`NONE`). */
const hemisphereLighting = wgslModule({
    name: 'hemisphere_lighting',
    requires: [closure, closureEval, NONE.module, hemisphereResource, lightTransmissionReady],
    source: `fn hemisphere_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    let k = hemisphere.intensity;
    let up = normalize(hemisphere.up.xyz);
    return closure_ambient(c, n, v, hemisphere.skyColor.rgb * k, hemisphere.groundColor.rgb * k, up)
        * light_transmission(NONE, p);
}`,
});

/** O hemisfério no desenho (`scene_direct_lighting`). */
const hemisphereLight = wgslModule({
    name: 'scene_lighting_hemisphere',
    requires: [closure, hemisphereLighting],
    source: `fn scene_direct_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    return hemisphere_lighting(c, p, n, v);
}`,
});

/** O hemisfério nos acertos dos raios (`scene_ambient_lighting`): a mesma luz do desenho. */
const hemisphereRayLight = wgslModule({
    name: 'scene_ambient_lighting_hemisphere',
    requires: [closure, hemisphereLighting],
    source: `fn scene_ambient_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    return hemisphere_lighting(c, p, n, v);
}`,
});

/** Slots acima do teto já avisados. */
let warnedLimit = false;

/**
 * Contribuição de toda luz do pool (spec 011, R7) ao ponto `scene_direct_lighting`: o mesmo laço para todas (a C2 o compõe uma
 * vez); a luz acima do teto não ilumina e avisa uma vez.
 */
export const poolLightContribution: SceneContribution = {
    point: sceneDirectLightingPoint,
    order: 0,
    pools: [Light.schema],
    build: (slotOf) => {
        const slot = slotOf(Light.schema);
        if (slot !== undefined && slot >= LIGHT_LIMIT.value && !warnedLimit) {
            warnedLimit = true;
            console.warn(
                `[Light] lightLimit: o slot ${slot} passa do teto de ${LIGHT_LIMIT.value} luzes por pixel; as excedentes não iluminam (a 013 traz a iluminação por cluster).`,
            );
        }
        return poolLights;
    },
};

/** Contribuição do hemisfério (spec 011, R7) ao ponto `scene_direct_lighting`, depois das luzes do pool. */
export const hemisphereContribution: SceneContribution = {
    point: sceneDirectLightingPoint,
    order: 10,
    pools: [],
    build: () => hemisphereLight,
};

/**
 * Contribuição do hemisfério ao ponto `scene_ambient_lighting`: a luz ambiente dele nos pontos opacos que os raios
 * atingem (a refração), a mesma do desenho.
 */
export const hemisphereRayLightingContribution: SceneContribution = {
    point: sceneAmbientLightingPoint,
    order: 10,
    pools: [],
    build: () => hemisphereRayLight,
};

/** O hemisfério como radiância média de todas as direções (céu e chão, metade cada), pelo meio da luz ambiente. */
const hemisphereAmbient = wgslModule({
    name: 'scene_ambient_hemisphere',
    requires: [NONE.module, hemisphereResource, lightTransmissionReady],
    source: `fn scene_ambient(p: vec3f) -> vec3f {
    return 0.5 * (hemisphere.skyColor.rgb + hemisphere.groundColor.rgb) * hemisphere.intensity
        * light_transmission(NONE, p);
}`,
});

/** Contribuição do hemisfério (spec 033, R12) ao ponto `scene_ambient`: a luz ambiente que os meios espalham. */
export const hemisphereAmbientContribution: SceneContribution = {
    point: sceneAmbientPoint,
    order: 10,
    pools: [],
    build: () => hemisphereAmbient,
};

/**
 * A radiância do hemisfério vinda da direção `dir`: o céu acima do horizonte e o chão abaixo, as mesmas radiâncias
 * uniformes que iluminam o difuso e o especular.
 */
const hemisphereRadiance = wgslModule({
    name: 'hemisphere_radiance',
    requires: [hemisphereResource],
    source: `fn hemisphere_radiance(dir: vec3f) -> vec3f {
    let up = normalize(hemisphere.up.xyz);
    return select(hemisphere.groundColor.rgb, hemisphere.skyColor.rgb, dot(dir, up) >= 0.0) * hemisphere.intensity;
}`,
});

/**
 * O hemisfério como o ambiente que os raios veem ao escapar (spec 034, T065f): a luz que ilumina é a que se vê pelo
 * vidro e pela água (sem céu físico na cena, o raio que escapava via preto).
 */
const hemisphereEnvironment = wgslModule({
    name: 'scene_environment_hemisphere',
    requires: [hemisphereRadiance],
    source: `fn scene_environment(dir: vec3f) -> vec3f {
    return hemisphere_radiance(dir);
}`,
});

/** Contribuição do hemisfério (spec 034, T065f) ao ponto `scene_environment`: o ambiente que os raios veem. */
export const hemisphereEnvironmentContribution: SceneContribution = {
    point: sceneEnvironmentPoint,
    order: 10,
    pools: [],
    build: () => hemisphereEnvironment,
};

/**
 * O hemisfério como o fundo visível (spec 034, T066), quando a cena pede (`HemisphereLight.background`): o mesmo céu e
 * chão do ambiente dos raios — o que a câmera vê atrás da cena é o mundo que a água e o vidro refratam e refletem (com o
 * fundo da limpeza, a gota mostrava o chão do hemisfério diante de um fundo que não era ele).
 */
export const hemisphereBackground = wgslModule({
    name: 'scene_background_hemisphere',
    requires: [hemisphereRadiance],
    source: `fn scene_background(dir: vec3f) -> vec3f {
    return hemisphere_radiance(dir);
}`,
});

/** Contribuição do hemisfério (spec 034, T066) ao ponto `scene_background`: o fundo visível, só com `on()`. */
export function hemisphereBackgroundContribution(on: () => boolean): SceneContribution {
    return {
        point: sceneBackgroundPoint,
        order: 10,
        pools: [],
        build: () => (on() ? hemisphereBackground : undefined),
    };
}
