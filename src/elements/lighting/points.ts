import { wgslModule } from '../../scene/shaders/WgslModule';
import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import { NONE } from '../../scene/shaders/engineConstants';
import { closure, closureEval } from '../material/pbr/shaders';
import { lightTransmissionReady, sceneLightingPoint } from '../scene/points/lighting';
import { giParamsResource, giPhoton, giSample, giScreenSample } from './shaders';

/**
 * A luz indireta das sondas no ponto (spec 033, R7): a irradiância na normal dos lobos — a das sondas de tela onde
 * alguma vale (R2 adendo: a luz de perto exata, uma leitura barata por fragmento), a das sondas do mundo só onde
 * nenhuma vale (fora da tela, bordas finas, o que não está na estrutura de raios) — (e no verso, com translúcido); a
 * radiância especular na direção dominante da base e do verniz pelas sondas do mundo só nos lobos brilhantes (rugosidade
 * abaixo de `GI_GLOSSY`): nos ásperos o lóbulo é largo e a irradiância o aproxima (\`closure_indirect\` já mistura as
 * duas pela rugosidade) — o custo por fragmento fica o da leitura das sondas de tela. Pelo meio da luz ambiente
 * (\`light_transmission(NONE, p)\`, a água). As cáusticas por fótons (US5) somam na irradiância. Desligada, nada.
 */
const giLighting = wgslModule({
    name: 'gi_scene_lighting',
    requires: [
        NONE.module,
        closure,
        closureEval,
        giParamsResource,
        giSample,
        giScreenSample,
        giPhoton,
        lightTransmissionReady,
    ],
    source: `/** Rugosidade abaixo da qual a especular indireta vem da radiância das sondas do mundo. */
const GI_GLOSSY: f32 = 0.5;

/** Irradiância (E/π) no ponto com a normal \`nl\`: das sondas de tela se alguma vale, senão das do mundo. */
fn gi_lighting_irradiance(p: vec3f, nl: vec3f, v: vec3f) -> vec3f {
    let screen = gi_screen_irradiance(p, nl);
    if (screen.a > 0.0) { return screen.rgb / GI_PI; }
    return gi_irradiance(p, nl, v) / GI_PI;
}

fn scene_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    if (gi.bounces.y == 0u) { return vec3f(0.0); }
    let nb = closure_lobe_normal(c.normal, n, v);
    // A irradiância das sondas mais a das cáusticas por fótons (a luz focada por vidro e metal).
    let e = gi_lighting_irradiance(p, nb, v) + gi_caustic_irradiance(p) / GI_PI;
    var back = e;
    if (c.translucent_weight > 0.0) { back = gi_lighting_irradiance(p, -nb, v); }
    var spec = e;
    if (c.dielectric_weight + c.conductor_weight > 0.0 && c.specular_roughness < GI_GLOSSY) {
        spec = gi_radiance(p, nb, v, closure_specular_dir(c, n, v));
    }
    var coat = spec;
    var coat_e = e;
    if (c.coat_weight > 0.0) {
        let nc = closure_lobe_normal(c.coat_normal, n, v);
        coat_e = gi_lighting_irradiance(p, nc, v);
        coat = coat_e;
        if (c.coat_roughness < GI_GLOSSY) { coat = gi_radiance(p, nc, v, closure_coat_dir(c, n, v)); }
    }
    return closure_indirect(c, n, v, IndirectLight(e, back, spec, coat, coat_e)) * light_transmission(NONE, p);
}`,
});
/** Contribuições da `GlobalIllumination` (spec 033, R7): a luz indireta em `scene_lighting`, depois das luzes. */
export const giContributions: readonly SceneContribution[] = [
    { point: sceneLightingPoint, order: 5, pools: [], build: () => giLighting },
];
