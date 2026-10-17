import { wgslModule } from '../../scene/shaders/WgslModule';
import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import { NONE } from '../../scene/shaders/engineConstants';
import { closure, closureEval } from '../material/pbr/shaders';
import { lightTransmissionReady, sceneLightingPoint } from '../scene/points/lighting';
import { giParamsResource, giSample, giScreenSample } from './shaders';

/**
 * A luz indireta das sondas no ponto (spec 033, R7): a irradiância na normal dos lobos — a da coleta final na tela onde
 * as sondas de tela valem (R2 adendo: a luz de perto exata), a das sondas do mundo onde não — (e no verso, com translúcido),
 * a radiância especular na direção dominante da base e do verniz — `closure_indirect` —, pelo meio da luz ambiente
 * (`light_transmission(NONE, p)`, a água). Desligada, nada.
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
        lightTransmissionReady,
    ],
    source: `fn scene_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    if (gi.bounces.y == 0u) { return vec3f(0.0); }
    let nb = closure_lobe_normal(c.normal, n, v);
    let screen = gi_screen_irradiance(p, nb);
    var e = screen.rgb / GI_PI;
    if (screen.a < 1.0) { e = mix(gi_irradiance(p, nb, v) / GI_PI, e, screen.a); }
    var back = e;
    if (c.translucent_weight > 0.0) { back = gi_irradiance(p, -nb, v) / GI_PI; }
    // A radiância especular só onde o lobo a lê: com rugosidade 1 a mistura de \`closure_indirect\` é só a irradiância.
    var spec = e;
    if (c.dielectric_weight + c.conductor_weight > 0.0 && c.specular_roughness < 1.0) {
        spec = gi_radiance(p, nb, v, closure_specular_dir(c, n, v));
    }
    var coat = spec;
    var coat_e = e;
    if (c.coat_weight > 0.0) {
        let nc = closure_lobe_normal(c.coat_normal, n, v);
        coat_e = gi_irradiance(p, nc, v) / GI_PI;
        coat = coat_e;
        if (c.coat_roughness < 1.0) { coat = gi_radiance(p, nc, v, closure_coat_dir(c, n, v)); }
    }
    return closure_indirect(c, n, v, IndirectLight(e, back, spec, coat, coat_e)) * light_transmission(NONE, p);
}`,
});

/** Contribuições da `GlobalIllumination` (spec 033, R7): a luz indireta em `scene_lighting`, depois das luzes. */
export const giContributions: readonly SceneContribution[] = [
    { point: sceneLightingPoint, order: 5, pools: [], build: () => giLighting },
];
