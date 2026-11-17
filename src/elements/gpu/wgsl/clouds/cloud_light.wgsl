// Luz das nuvens e a marcha (spec 041, R1, R7–R9): em cada passo com densidade, a profundidade ótica até o sol — o cone
// curto de 6 passos crescentes × 1,5 (Schneider 2015; o crescimento × 2 dele dava trechos de 16 passos base em que o
// ponto médio erra a borda da nuvem: −3 % de luz na mediana, medido) e, além dele, o mapa visto do sol —, o
// espalhamento múltiplo por oitavas (Wrenninge 2013: `Σ bⁱ σs e^(−aⁱ τ) p(cⁱ g)`), a luz do sol atenuada pela atmosfera
// até o ponto, o ambiente do céu (em cima) e do chão (embaixo) pela fração de altura, e a integral analítica do passo
// (Hillaire 2016). A marcha tem teto constante de passos (`CLOUD_MAX_STEPS`, o perfil escolhe menos) e de passos de luz
// (`CLOUD_MAX_LIGHT_STEPS`): o orçamento total por invocação é `CLOUD_MAX_STEPS × (1 + CLOUD_MAX_LIGHT_STEPS)`.
// Espelho de `marchCloud` em `cloudModel.ts`.
// Requer: cloud_common, cloud_density, cloud_phase, cloud_shadow_lookup, sky_query, clouds, cloud_ambient_tex.

const CLOUD_MAX_STEPS: u32 = 128u;
const CLOUD_MAX_LIGHT_STEPS: u32 = 6u;
const CLOUD_MAX_OCTAVES: u32 = 3u;
/** Amostras vazias seguidas que devolvem a marcha à velocidade grossa. */
const CLOUD_EMPTY_TO_COARSE: u32 = 6u;
/** Transmitância abaixo da qual a marcha para. */
const CLOUD_EARLY_EXIT: f32 = 0.01;

struct CloudSample {
    scattered: vec3f,
    transmittance: f32,
    /** Profundidade média ponderada pela opacidade (m); 0 sem nuvem. */
    depth: f32,
}

/** Transmitância da atmosfera do topo até o ponto `p` na direção do sol (pela altitude na casca do planeta). */
fn cloud_sun_atmosphere(p: vec3f) -> vec3f {
    let up = normalize(vec3f(p.x, p.y + clouds.shell.x, p.z));
    let r = sky_bottom() + max(sky.radii.w + cloud_altitude(p) * 0.001, 0.001);
    return sky_transmittance(r, clamp(dot(up, sky.sunDirection.xyz), -1.0, 1.0));
}

/** Profundidade ótica da nuvem de `p` até o sol: o cone curto e o mapa além dele. */
fn cloud_sun_depth(p: vec3f, light_steps: u32) -> f32 {
    let sun = sky.sunDirection.xyz;
    let base = clouds.shell.w / 48.0;
    var tau = 0.0;
    var t = 0.0;
    let n = min(light_steps, CLOUD_MAX_LIGHT_STEPS);
    for (var i = 0u; i < CLOUD_MAX_LIGHT_STEPS; i++) {
        if (i >= n) { break; }
        let len = base * 0.5 * pow(1.5, f32(i));
        tau += cloud_density(p + sun * (t + 0.5 * len), true) * len;
        t += len;
    }
    let beyond = cloud_shadow_transmittance(p + sun * t);
    return tau * clouds.layer.z - log(max(beyond, 1e-6));
}

/** Luz espalhada para a câmera por unidade de comprimento num ponto de extinção `sigma_t` (o sol e o ambiente). */
fn cloud_inscatter(p: vec3f, sigma_t: f32, cos_theta: f32, light_steps: u32) -> vec3f {
    let tau = cloud_sun_depth(p, light_steps);
    let o = clouds.octaves;
    let count = min(u32(o.x), CLOUD_MAX_OCTAVES);
    var s = 0.0;
    var energy = 1.0;
    var attenuation = 1.0;
    var anisotropy = 1.0;
    for (var i = 0u; i < CLOUD_MAX_OCTAVES; i++) {
        if (i >= count) { break; }
        s += energy * exp(-attenuation * tau) * cloud_phase(cos_theta, anisotropy);
        energy *= o.z;
        attenuation *= o.y;
        anisotropy *= o.w;
    }
    let sun = sky.sunIlluminance.rgb * cloud_sun_atmosphere(p);
    let h = clamp(cloud_height_fraction(p), 0.0, 1.0);
    let ambient = textureLoad(cloud_ambient_tex, vec2u(0u, 0u), 0).rgb * h
        + textureLoad(cloud_ambient_tex, vec2u(1u, 0u), 0).rgb * (1.0 - h);
    return sigma_t * clouds.layer.w * (s * sun + ambient);
}

/**
 * Marcha da camada pelo raio `o + t·d` até `t_max` (a superfície opaca): `steps` passos no máximo (teto
 * `CLOUD_MAX_STEPS`), passo que cresce com a distância e cobre o trecho, grosso no vazio (só a forma) e fino com
 * densidade, deslocamento inicial `jitter` ∈ [0, 1) de um passo; saída antecipada com transmitância < 0,01.
 */
fn cloud_integrate(o: vec3f, d: vec3f, t_max: f32, steps: u32, light_steps: u32, jitter: f32) -> CloudSample {
    var result = CloudSample(vec3f(0.0), 1.0, 0.0);
    let segs = cloud_shell_segments(o, d, t_max);
    if (segs.y <= segs.x) { return result; }
    let n = max(min(steps, CLOUD_MAX_STEPS), 1u);
    let total = (segs.y - segs.x) + max(segs.w - segs.z, 0.0);
    let base = clouds.shell.w / 64.0;
    let floor_step = total / f32(n);
    let cos_theta = dot(d, sky.sunDirection.xyz);
    var t = segs.x + jitter * max(base, floor_step);
    var end = segs.y;
    var second = segs.w > segs.z;
    var fine = false;
    var empty = 0u;
    var weight = 0.0;
    var depth_sum = 0.0;
    for (var i = 0u; i < CLOUD_MAX_STEPS; i++) {
        if (i >= n) { break; }
        if (t >= end) {
            if (!second) { break; }
            second = false;
            t = segs.z;
            end = segs.w;
        }
        let fine_step = max(base * (1.0 + t / 8000.0), floor_step);
        let ds = min(select(2.0 * fine_step, fine_step, fine), end - t);
        let x = o + d * (t + 0.5 * ds);
        if (!fine) {
            if (cloud_density(x, false) > 0.0) {
                // Achou nuvem: o mesmo trecho é refeito com o passo fino (t não anda; t só cresce).
                fine = true;
                empty = 0u;
                continue;
            }
            t += ds;
            continue;
        }
        let rho = cloud_density(x, true);
        if (rho > 0.0) {
            empty = 0u;
            let sigma_t = rho * clouds.layer.z;
            let step_t = exp(-sigma_t * ds);
            let light = cloud_inscatter(x, sigma_t, cos_theta, light_steps);
            result.scattered += result.transmittance * light * (1.0 - step_t) / sigma_t;
            let alpha = result.transmittance * (1.0 - step_t);
            depth_sum += alpha * (t + 0.5 * ds);
            weight += alpha;
            result.transmittance *= step_t;
            if (result.transmittance < CLOUD_EARLY_EXIT) { break; }
        } else {
            empty++;
            if (empty >= CLOUD_EMPTY_TO_COARSE) { fine = false; }
        }
        t += ds;
    }
    result.depth = select(0.0, depth_sum / max(weight, 1e-12), weight > 0.0);
    return result;
}
