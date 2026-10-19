// Raios das sondas de tela (spec 033, R2 adendo), uma invocação por raio. Direções por importância (spec 034, R1): o
// hemisfério da normal em 8 × 8 células de mesma probabilidade sob o cosseno (o quadrado unitário pelo mapeamento polar
// — r² e ângulo), cada célula com o guia da radiância das sondas do mundo no centro dela; cada raio escolhe uma célula
// pela mistura defensiva q = α/64 + (1 − α)·guia/total (estratificada entre os raios da sonda) e um ponto dentro dela
// (a sequência R2 deslocada por sonda e por quadro), com o peso 1/(64·q) — o estimador continua exato (o guia só muda a
// variância): os raios vão mais para onde há luz forte e pequena (a janela, a mancha de sol). Por geração de rebatimento
// g, a radiância que volta — no
// acerto, a luz direta com raio de sombra e a emissão (g = 0: o primeiro rebatimento, exato perto da superfície) mais,
// de g ≥ 1, a luz rebatida pela irradiância da geração g − 1 no ponto atingido: a das sondas de tela do quadro anterior
// quando o ponto é uma superfície visível (`gi_screen_history_taps`: exata de perto também), a das sondas do mundo
// quando não. Raio que escapa: o ambiente da cena em todas as gerações. Face de trás: sem luz. Grava E_g = π · média.
// Requer: WORKGROUP_SIZE, NONE, gi, gi_common, gi_screen_common, gi_screen_reproject, ray_scene, gi_hit,
// gi_shade, gi_direct, gi_generation, gi_radiance_atlas, gi_sampler, closure_eval, scene_environment, ray_volume_transmittance, gi_screen_work.

/** Gerações no máximo (os rebatimentos da `GlobalIllumination`). */
const GI_SCREEN_MAX_BOUNCES: u32 = 8u;

/** Base ortonormal em volta de `n` (Duff et al. 2017). */
fn gi_screen_basis(n: vec3f) -> mat3x3f {
    let s = select(-1.0, 1.0, n.z >= 0.0);
    let a = -1.0 / (s + n.z);
    let b = n.x * n.y * a;
    return mat3x3f(vec3f(1.0 + s * n.x * n.x * a, s * b, -s * n.x), vec3f(b, s + n.y * n.y * a, -n.y), n);
}

/** Células do guia por lado e no total, e a fração uniforme da mistura defensiva (spec 034, R1). */
const GI_SCREEN_GUIDE_SIDE: u32 = 8u;
const GI_SCREEN_GUIDE_CELLS: u32 = 64u;
const GI_SCREEN_GUIDE_UNIFORM: f32 = 0.3;

/**
 * Direção no ponto `u` da célula `cell` em volta de `n`: o quadrado unitário vai ao hemisfério por cosseno (r² = x,
 * ângulo = 2π·y), então toda célula tem a mesma probabilidade (1/64) sob a amostragem por cosseno.
 */
fn gi_screen_cell_dir(cell: u32, u: vec2f, n: vec3f) -> vec3f {
    let q = (vec2f(f32(cell % GI_SCREEN_GUIDE_SIDE), f32(cell / GI_SCREEN_GUIDE_SIDE)) + u) / f32(GI_SCREEN_GUIDE_SIDE);
    let r = sqrt(q.x);
    let phi = 2.0 * GI_PI * q.y;
    return normalize(gi_screen_basis(n) * vec3f(r * cos(phi), r * sin(phi), sqrt(max(0.0, 1.0 - q.x))));
}

/**
 * O guia numa direção: a radiância das sondas do mundo vinda de `dir` (o atlas filtrado, o último rebatimento), pelos
 * pesos das sondas em volta do ponto calculados uma vez (`gi_generation_weights`: não dependem da direção).
 */
fn gi_screen_guide_value(w: GiGenerationWeights, dir: vec3f) -> f32 {
    let size = vec2f(textureDimensions(gi_radiance_atlas));
    var l = vec3f(0.0);
    for (var j = 0u; j < 16u; j++) {
        let tap = w.taps[j];
        if (tap.weight <= 0.0) { continue; }
        let uv = gi_atlas_uv(tap.index, dir, GI_IRRADIANCE_TEXELS, size);
        l += textureSampleLevel(gi_radiance_atlas, gi_sampler, uv, 0.0).rgb * tap.weight;
    }
    return max(max(l.r, l.g), l.b);
}

/** Ponto `k` da sonda `i` no quadro: a sequência R2 deslocada por sonda e por quadro. */
fn gi_screen_ray_point(i: u32, k: u32) -> vec2f {
    let h = gi_hash(i * 1973u + gi.rays.y * 9277u);
    let shift = vec2f(f32(h & 0xFFFFu), f32(h >> 16u)) / 65536.0;
    return fract(vec2f(0.7548776662, 0.5698402910) * f32(k + 1u) + shift);
}

/**
 * A luz rebatida que sai do ponto atingido pela irradiância da geração `k`: das sondas de tela (`screen`) ou das do
 * mundo pelos pesos `w` do ponto (calculados uma vez para todas as gerações).
 */
fn gi_screen_bounce(c: Closure, p: vec3f, n: vec3f, v: vec3f, k: u32, taps: GiScreenTaps, screen: bool, w: GiGenerationWeights) -> vec3f {
    if (!screen) { return gi_shade_indirect_weighted(c, p, n, v, w, k); }
    let e = gi_screen_history_gather(taps, GI_SCREEN_HISTORY_GENERATIONS + k).rgb / GI_PI;
    return closure_indirect(c, n, v, IndirectLight(e, e, e, e, e));
}

/** A radiância de cada geração que volta por um raio, por invocação (a soma por sonda é do grupo). */
var<workgroup> gi_screen_partial: array<vec4f, WORKGROUP_SIZE * GI_SCREEN_MAX_BOUNCES>;
/** O guia das sondas do grupo: 64 células por sonda (no máximo WORKGROUP_SIZE / 4 sondas: 4 raios por sonda). */
var<workgroup> gi_screen_guide: array<f32, WORKGROUP_SIZE * 16u>;

/**
 * Uma invocação por raio (o grupo cobre WORKGROUP_SIZE / raios sondas inteiras — os raios por sonda dividem o grupo); a
 * primeira invocação de cada sonda soma os raios dela na memória do grupo e grava E_g = π · média.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_screen_trace_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let j = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let rays = gi.screen.z;
    let i = j / rays;
    let k = j % rays;
    let bounces = min(gi.bounces.x, GI_SCREEN_MAX_BOUNCES);
    var sums: array<vec3f, GI_SCREEN_MAX_BOUNCES>;
    let valid_probe = i < gi_screen_count();
    let at = gi_screen_probe_at(min(i, gi_screen_count() - 1u));
    let probe = gi_screen_work[at];
    let n0 = gi_screen_work[at + 1u].xyz;
    // Fora da vez no rodízio, só a sonda sem histórico (recém-descoberta) lança.
    var update = valid_probe && probe.w > 0.0;
    if (update && !gi_screen_scheduled(i)) { update = !gi_screen_history_found(gi_screen_history_taps(probe.xyz, n0)); }
    // O guia: os raios da sonda dividem as 64 células e leem a radiância das sondas do mundo no centro de cada uma.
    let guide_at = (lid / rays) * GI_SCREEN_GUIDE_CELLS;
    var guide_weights: GiGenerationWeights;
    if (update) { guide_weights = gi_generation_weights(probe.xyz, n0, n0); }
    for (var c = k; c < GI_SCREEN_GUIDE_CELLS; c += rays) {
        var g = 0.0;
        if (update) { g = gi_screen_guide_value(guide_weights, gi_screen_cell_dir(c, vec2f(0.5), n0)); }
        gi_screen_guide[guide_at + c] = g;
    }
    workgroupBarrier();
    if (update) {
        // Afasta a origem da superfície em proporção à distância (a precisão do acerto da câmera cai com ela).
        let origin = probe.xyz + n0 * (1e-3 + probe.w * 1e-4);
        let max_dist = gi.tuning.w;
        // A célula pela mistura defensiva, estratificada entre os raios da sonda; o peso 1/(64·q) mantém o estimador.
        var total = 0.0;
        for (var c = 0u; c < GI_SCREEN_GUIDE_CELLS; c++) { total += gi_screen_guide[guide_at + c]; }
        let point = gi_screen_ray_point(i, k);
        let pick = (f32(k) + fract(point.x * 7.0 + point.y)) / f32(rays);
        var cell = GI_SCREEN_GUIDE_CELLS - 1u;
        var q = 1.0 / f32(GI_SCREEN_GUIDE_CELLS);
        var acc = 0.0;
        for (var c = 0u; c < GI_SCREEN_GUIDE_CELLS; c++) {
            var qc = 1.0 / f32(GI_SCREEN_GUIDE_CELLS);
            if (total > 0.0) {
                qc = GI_SCREEN_GUIDE_UNIFORM / f32(GI_SCREEN_GUIDE_CELLS)
                    + (1.0 - GI_SCREEN_GUIDE_UNIFORM) * gi_screen_guide[guide_at + c] / total;
            }
            if (acc + qc > pick) { cell = c; q = qc; break; }
            acc += qc;
            q = qc;
        }
        let weight = 1.0 / (f32(GI_SCREEN_GUIDE_CELLS) * q);
        let dir = gi_screen_cell_dir(cell, point, n0);
        let hit = ray_scene_hit(origin, dir, max_dist);
        // Os volumes atravessados (a água) atenuam o que o raio traz.
        let through = ray_volume_transmittance(origin, dir, min(hit.t, max_dist));
        if (hit.t >= max_dist) {
            let env = scene_environment(dir) * through * weight;
            for (var g = 0u; g < bounces; g++) { sums[g] = env; }
        } else if (hit.face >= 0.0) {
            let v = -dir;
            let c = gi_hit_closure(hit);
            let direct = gi_shade_direct(c, hit.position, hit.normal, v, j * 7919u + gi.rays.y * 104729u);
            sums[0] = direct * through * weight;
            if (bounces > 1u) {
                let taps = gi_screen_history_taps(hit.position, hit.normal);
                let screen = gi_screen_history_found(taps) && c.translucent_weight <= 0.0;
                var w: GiGenerationWeights;
                if (!screen) { w = gi_generation_weights(hit.position, hit.normal, v); }
                for (var g = 1u; g < bounces; g++) {
                    sums[g] = (direct + gi_screen_bounce(c, hit.position, hit.normal, v, g - 1u, taps, screen, w)) * through * weight;
                }
            }
        }
    }
    for (var g = 0u; g < bounces; g++) {
        gi_screen_partial[lid * GI_SCREEN_MAX_BOUNCES + g] = vec4f(sums[g], 0.0);
    }
    workgroupBarrier();
    if (!valid_probe || k != 0u) { return; }
    if (!update && probe.w > 0.0) {
        // Sem raios no quadro: o acúmulo herda o histórico (marca na primeira geração).
        gi_screen_work[gi_screen_fresh_at(i, 0u)] = vec4f(0.0, 0.0, 0.0, -1.0);
        return;
    }
    for (var g = 0u; g < bounces; g++) {
        var total = vec3f(0.0);
        for (var q = 0u; q < rays; q++) { total += gi_screen_partial[(lid + q) * GI_SCREEN_MAX_BOUNCES + g].rgb; }
        gi_screen_work[gi_screen_fresh_at(i, g)] = vec4f(total * (GI_PI / f32(rays)), 0.0);
    }
}
