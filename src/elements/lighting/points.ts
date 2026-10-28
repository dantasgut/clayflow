import { wgslModule } from '../../scene/shaders/WgslModule';
import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import { NONE } from '../../scene/shaders/engineConstants';
import { closure, closureEval } from '../material/pbr/shaders';
import { lightTransmissionReady, sceneIndirectLightingPoint } from '../scene/points/lighting';
import { sceneAmbientPoint } from '../scene/points/media';
import { camerasResource } from '../scene/resources';
import { rayScene } from '../raytrace/shaders';
import { giParamsResource, giSample, giScreenSample } from './shaders';

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
        lightTransmissionReady,
    ],
    source: `/** Rugosidade abaixo da qual a especular indireta vem da radiância das sondas do mundo. */
const GI_GLOSSY: f32 = 0.5;

/** Irradiância (E/π) no ponto com a normal \`nl\`: das sondas de tela se alguma vale, senão das do mundo. */
fn gi_lighting_irradiance(p: vec3f, nl: vec3f, v: vec3f) -> vec3f {
    let screen = gi_screen_irradiance(p, nl);
    if (screen.a > 0.0) { return screen.rgb / PI; }
    return gi_irradiance(p, nl, v) / PI;
}

fn scene_indirect_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    if (gi.bounces.y == 0u) { return vec3f(0.0); }
    let nb = closure_lobe_normal(c.normal, n, v);
    let e = gi_lighting_irradiance(p, nb, v);
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
/**
 * A luz rebatida como radiância média de todas as direções (spec 033, R12: o que os meios participantes espalham): a
 * irradiância das sondas do mundo para cima e para baixo — juntas, os dois hemisférios — sobre 2π, pelo meio da luz
 * ambiente. Média em 4 pontos num tetraedro de meio espaçamento das sondas em volta do ponto: no volume, sem as
 * superfícies que as sondas de tela corrigem, a diferença de uma sonda para a vizinha apareceria como faixas na névoa
 * (as colunas de sondas); a média é o passa-baixa na escala delas. O ponto atrás de uma superfície vista pela câmera
 * (uma célula da grade dos meios que atravessa a parede) vem para antes dela, e um vértice do tetraedro do outro lado
 * de uma superfície fica no ponto: do outro lado, a luz de fora vazava para a névoa de dentro. Desligada, nada.
 */
const giAmbient = wgslModule({
    name: 'gi_scene_ambient',
    requires: [
        NONE.module,
        giParamsResource,
        giSample,
        lightTransmissionReady,
        camerasResource,
        rayScene,
    ],
    source: `fn scene_ambient(p_in: vec3f) -> vec3f {
    if (gi.bounces.y == 0u) { return vec3f(0.0); }
    let up = vec3f(0.0, 1.0, 0.0);
    let r = 0.5 * gi.cascade0.w;
    // Do lado da câmera da primeira superfície no caminho (o lado visível).
    var p = p_in;
    let eye = cameras[gi.screen.w].position.xyz;
    let to = p_in - eye;
    let dist = length(to);
    if (dist > 1e-4) {
        let dir = to / dist;
        let hit = ray_scene_hit(eye, dir, dist);
        if (hit.instance != NONE) { p = eye + dir * max(hit.t - r, 0.0); }
    }
    var e = vec3f(0.0);
    for (var k = 0u; k < 4u; k++) {
        let s = vec3f(select(-1.0, 1.0, (k & 1u) != 0u), select(-1.0, 1.0, (k & 2u) != 0u), select(-1.0, 1.0, k == 1u || k == 2u));
        let offset = s * (r * 0.57735);
        // O vértice do outro lado de uma superfície (o teto, uma parede) fica no ponto.
        let q = select(p + offset, p, ray_scene_occluded(p, s * 0.57735, r * 0.57735 * 1.7320508));
        e += gi_irradiance(q, up, up) + gi_irradiance(q, -up, -up);
    }
    return e / (8.0 * PI) * light_transmission(NONE, p_in);
}`,
});

/**
 * Contribuições da `GlobalIllumination` (spec 033, R7, R12): a luz indireta em `scene_indirect_lighting`, e
 * em `scene_ambient` (os meios).
 */
export const giContributions: readonly SceneContribution[] = [
    { point: sceneIndirectLightingPoint, order: 5, pools: [], build: () => giLighting },
    { point: sceneAmbientPoint, order: 5, pools: [], build: () => giAmbient },
];
