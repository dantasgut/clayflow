import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import { sharedConstant } from '../../../scene/shaders/SharedConstant';
import { NONE } from '../../../scene/shaders/engineConstants';
import { poolLive } from '../../gpu/compute/shaders';
import { closure, closureEval } from '../../material/pbr/shaders';
import { HemisphereLightSchema } from '../HemisphereLightSchema';
import { Light } from '../Light';
import { lightsResource } from '../resources';
import { lightTransmissionReady, lightVisibilityReady, sceneLightingPoint } from './lighting';
import { sceneAmbientPoint } from './media';

/**
 * Teto de luzes do laço por pixel (spec 011, R7): slots do pool `Light` acima dele não iluminam (aviso único). A 013 troca
 * o laço pela lista por cluster.
 */
export const LIGHT_LIMIT = sharedConstant('LIGHT_LIMIT', 1024, 'u32');

/** Bitset de slots vivos do pool `Light` (resolver `Light.live`). */
export const lightLiveResource = wgslResource({
    name: 'light_live',
    binding: { storage: 'read' },
    type: { wgsl: 'u32', array: true },
    frequency: 'frame',
    provider: { consumer: `${Light.schema.name}.live` },
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
    source: `fn scene_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    var sum = vec3f(0.0);
    let count = min(arrayLength(&lights), LIGHT_LIMIT);
    for (var i = 0u; i < count; i++) {
        if (!pool_live(light_live[i >> 5u], i)) { continue; }
        let inc = light_incoming(lights[i], p);
        if (all(inc.radiance <= vec3f(0.0))) { continue; }
        let radiance = inc.radiance * light_visibility(i, p, dot(n, inc.l)) * light_transmission(i, p);
        sum = sum + closure_eval(c, n, v, inc.l, radiance);
    }
    return sum;
}`,
});

/** O hemisfério céu/chão (radiâncias × intensidade), pelo ponto de transmissão com a luz ambiente (`NONE`). */
const hemisphereLight = wgslModule({
    name: 'scene_lighting_hemisphere',
    requires: [closure, closureEval, NONE.module, hemisphereResource, lightTransmissionReady],
    source: `fn scene_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    let k = hemisphere.intensity;
    let up = normalize(hemisphere.up.xyz);
    return closure_ambient(c, n, v, hemisphere.skyColor.rgb * k, hemisphere.groundColor.rgb * k, up)
        * light_transmission(NONE, p);
}`,
});

/** Slots acima do teto já avisados. */
let warnedLimit = false;

/**
 * Contribuição de toda luz do pool (spec 011, R7) ao ponto `scene_lighting`: o mesmo laço para todas (a C2 o compõe uma
 * vez); a luz acima do teto não ilumina e avisa uma vez.
 */
export const poolLightContribution: SceneContribution = {
    point: sceneLightingPoint,
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

/** Contribuição do hemisfério (spec 011, R7) ao ponto `scene_lighting`, depois das luzes do pool. */
export const hemisphereContribution: SceneContribution = {
    point: sceneLightingPoint,
    order: 10,
    pools: [],
    build: () => hemisphereLight,
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
