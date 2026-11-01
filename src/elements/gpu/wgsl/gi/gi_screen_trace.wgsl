// Raios das sondas de tela (spec 033, R2 adendo), uma invocação por raio: a direção e o peso da amostragem mista
// (cosseno + guia pela sonda do mundo, MIS — `gi_screen_guide_main`, spec 034 T051) e, por geração de rebatimento g, a radiância que volta — no
// acerto, a luz direta com raio de sombra e a emissão (g = 0: o primeiro rebatimento, exato perto da superfície) mais,
// de g ≥ 1, a luz rebatida pela irradiância da geração g − 1 no ponto atingido: a das sondas de tela do quadro anterior
// quando o ponto é uma superfície visível (`gi_screen_history_taps`: exata de perto também), a das sondas do mundo
// quando não. Raio que escapa: o ambiente da cena em todas as gerações. Face de trás (a sonda colada a uma superfície que
// a corta): fora da soma e da contagem (spec 034, T048) — a média é a dos raios que veem a cena. Grava E_g = média de
// L · peso (o peso é cos / pdf: π com cosseno puro).
// O material no ponto atingido é avaliado fora do traçado (spec 039): `gi_screen_hit_main` grava o acerto na onda e
// `gi_screen_trace_main` lê o fechamento dela e a luz direta no acerto (`gi_wave_direct_main`, spec 034 T078).
// Requer: WORKGROUP_SIZE, NONE, gi, gi_common, gi_screen_common, gi_screen_reproject, ray_scene, ray_hit, ray_wave,
// gi_shade, closure_eval, scene_environment, ray_volume_transmittance, gi_screen_work, gi_wave_light_read.

/** Direção (xyz) e peso (w: cos / pdf) do raio `k` da sonda `i` (o par gravado por `gi_screen_guide_main`). */
fn gi_screen_ray_record(i: u32, k: u32) -> vec4f {
    let pair = gi_screen_work[gi_screen_ray_at(i, k)];
    let c = select(pair.xy, pair.zw, (k & 1u) == 1u);
    return vec4f(gi_oct_decode(unpack2x16snorm(bitcast<u32>(c.x))), c.y);
}

/** Gerações no máximo (os rebatimentos da `GlobalIllumination`). */
const GI_SCREEN_MAX_BOUNCES: u32 = 8u;

/**
 * A luz rebatida que sai do ponto atingido pela irradiância da geração `k`: das sondas de tela (`screen`) ou das do
 * mundo pelos pesos `w` do ponto (calculados uma vez para todas as gerações), pelos fatores `f` do fechamento.
 */
fn gi_screen_bounce(f: GiShadeFactors, p: vec3f, n: vec3f, v: vec3f, k: u32, taps: GiScreenTaps, screen: bool, w: GiGenerationWeights) -> vec3f {
    if (!screen) { return gi_shade_indirect_weighted(f, p, n, v, w, k); }
    let e = gi_screen_history_gather(taps, GI_SCREEN_HISTORY_GENERATIONS + k).rgb / PI;
    return (f.front + f.back) * e;
}

/** A radiância de cada geração que volta por um raio, por invocação (a soma por sonda é do grupo). */
var<workgroup> gi_screen_partial: array<vec4f, WORKGROUP_SIZE * GI_SCREEN_MAX_BOUNCES>;

/** A sonda de tela de um raio: o índice, o raio dela, a posição e a normal, e se ela lança no quadro. */
struct GiScreenRay {
    i: u32,
    k: u32,
    valid: bool,
    update: bool,
    probe: vec4f,
    n0: vec3f,
}

fn gi_screen_ray(j: u32) -> GiScreenRay {
    let rays = gi.screen.z;
    let i = j / rays;
    let valid = i < gi_screen_count();
    let at = gi_screen_probe_at(min(i, gi_screen_count() - 1u));
    let probe = gi_screen_work[at];
    let n0 = gi_screen_work[at + 1u].xyz;
    // Fora da vez no rodízio, só a sonda sem histórico (recém-descoberta) lança.
    var update = valid && probe.w > 0.0;
    if (update && !gi_screen_scheduled(i)) { update = !gi_screen_history_found(gi_screen_history_taps(probe.xyz, n0)); }
    return GiScreenRay(i, j % rays, valid, update, probe, n0);
}

/**
 * O acerto de cada raio das sondas de tela que lançam (spec 039: o material fora do traçado): a transmitância dos
 * volumes e a distância na carga da onda (a distância máxima no escape; negativa na face de trás ou sem lançar) e, na
 * face da frente, o acerto na onda.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_screen_hit_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let j = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (j >= gi_screen_count() * gi.screen.z) { return; }
    let r = gi_screen_ray(j);
    // O índice na onda: depois dos raios das sondas do mundo.
    let w = gi_wave_screen_first() + j;
    if (!r.update) {
        ray_wave_put_empty(w, vec4f(0.0, 0.0, 0.0, -1.0));
        return;
    }
    // Afasta a origem da superfície em proporção à distância (a precisão do acerto da câmera cai com ela).
    let origin = r.probe.xyz + r.n0 * (1e-3 + r.probe.w * 1e-4);
    let max_dist = gi.tuning.w;
    let ray = gi_screen_ray_record(r.i, r.k);
    // Peso 0 (a direção do guia abaixo do horizonte): conta na média sem luz, sem traçar.
    if (ray.w <= 0.0) {
        ray_wave_put_empty(w, vec4f(0.0, 0.0, 0.0, max_dist));
        return;
    }
    let dir = ray.xyz;
    let hit = ray_scene_hit(origin, dir, max_dist);
    // Os volumes atravessados (a água) atenuam o que o raio traz.
    let through = ray_volume_transmittance(origin, dir, min(hit.t, max_dist), gi.extra.w);
    if (hit.t >= max_dist || hit.face < 0.0) {
        ray_wave_put_empty(w, vec4f(through, select(-1.0, max_dist, hit.t >= max_dist)));
        return;
    }
    let s = ray_hit_surface(hit, gi.extra.w, 0.0);
    ray_wave_put_surface(w, s.index, s.slot, s.sample.world_position, s.sample.normal, s.sample.uv, gi.extra.w, 0.0,
        0.0, s.material, vec4f(through, hit.t));
    // A direção do raio para a luz direta no acerto (`gi_wave_direct_main`).
    ray_wave_tag(w, pack2x16snorm(gi_oct_encode(dir)));
}

/**
 * Uma invocação por raio (o grupo cobre WORKGROUP_SIZE / raios sondas inteiras — os raios por sonda dividem o grupo),
 * pelo acerto e pelo fechamento avaliado na onda; a primeira invocação de cada sonda soma os raios dela na memória do
 * grupo e grava E_g = média de L · peso.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_screen_trace_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let j = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let rays = gi.screen.z;
    let r = gi_screen_ray(j);
    let i = r.i;
    let k = r.k;
    let bounces = min(gi.bounces.x, GI_SCREEN_MAX_BOUNCES);
    var sums: array<vec3f, GI_SCREEN_MAX_BOUNCES>;
    // 1 quando o raio entra na média (escape ou face da frente); a face de trás fica fora do numerador e do denominador.
    var counted = 0.0;
    let valid_probe = r.valid;
    let probe = r.probe;
    let update = r.update;
    if (update) {
        let max_dist = gi.tuning.w;
        let ray = gi_screen_ray_record(i, k);
        let dir = ray.xyz;
        // O índice na onda: depois dos raios das sondas do mundo.
        let wi = gi_wave_screen_first() + j;
        let traced = ray_wave_entries[wi].hit.payload;
        // A transmitância dos volumes com o peso da amostragem (cos / pdf).
        let through = traced.rgb * max(ray.w, 0.0);
        if (traced.w >= 0.0) { counted = 1.0; }
        if (traced.w >= max_dist) {
            let env = scene_environment(dir) * through;
            for (var g = 0u; g < bounces; g++) { sums[g] = env; }
        } else if (traced.w >= 0.0) {
            let v = -dir;
            let h = ray_wave_entries[wi].hit;
            // A luz direta e a emissão no acerto e os fatores do fechamento, da passada da onda (`gi_wave_direct_main`).
            let lit = gi_wave_light_read[3u * wi];
            let direct = lit.rgb;
            let f = GiShadeFactors(gi_wave_light_read[3u * wi + 1u].rgb, gi_wave_light_read[3u * wi + 2u].rgb, lit.w > 0.0);
            sums[0] = direct * through;
            if (bounces > 1u) {
                let taps = gi_screen_history_taps(h.position, h.normal);
                let screen = gi_screen_history_found(taps) && !f.translucent;
                var w: GiGenerationWeights;
                if (!screen) { w = gi_generation_weights(h.position, h.normal, v); }
                for (var g = 1u; g < bounces; g++) {
                    sums[g] = (direct + gi_screen_bounce(f, h.position, h.normal, v, g - 1u, taps, screen, w)) * through;
                }
            }
        }
    }
    for (var g = 0u; g < bounces; g++) {
        gi_screen_partial[lid * GI_SCREEN_MAX_BOUNCES + g] = vec4f(sums[g], counted);
    }
    workgroupBarrier();
    if (!valid_probe || k != 0u) { return; }
    if (!update && probe.w > 0.0) {
        // Sem raios no quadro: o acúmulo herda o histórico (marca na primeira geração).
        gi_screen_work[gi_screen_fresh_at(i, 0u)] = vec4f(0.0, 0.0, 0.0, -1.0);
        return;
    }
    for (var g = 0u; g < bounces; g++) {
        var total = vec4f(0.0);
        for (var q = 0u; q < rays; q++) { total += gi_screen_partial[(lid + q) * GI_SCREEN_MAX_BOUNCES + g]; }
        // Todos pela face de trás (a sonda dentro da geometria): sem luz.
        gi_screen_work[gi_screen_fresh_at(i, g)] = vec4f(total.rgb / max(total.w, 1.0), 0.0);
    }
}
