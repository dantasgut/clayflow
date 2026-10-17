// Raios das sondas de tela (spec 033, R2 adendo), uma invocação por sonda: direções por cosseno no hemisfério da
// normal (a sequência R2 deslocada por sonda e por quadro) e, por geração de rebatimento g, a radiância que volta — no
// acerto, a luz direta com raio de sombra e a emissão (g = 0: o primeiro rebatimento, exato perto da superfície) mais,
// de g ≥ 1, a luz rebatida pela irradiância da geração g − 1 no ponto atingido: a das sondas de tela do quadro anterior
// quando o ponto é uma superfície visível (`gi_screen_history_find`: exata de perto também), a das sondas do mundo
// quando não. Raio que escapa: o ambiente da cena em todas as gerações. Face de trás: sem luz. Grava E_g = π · média.
// Requer: WORKGROUP_SIZE, NONE, gi, gi_common, gi_screen_common, gi_screen_reproject, ray_scene, gi_hit,
// gi_shade, gi_direct, closure_eval, scene_environment, gi_screen_work.

/** Gerações no máximo (os rebatimentos da `GlobalIllumination`). */
const GI_SCREEN_MAX_BOUNCES: u32 = 8u;

/** Base ortonormal em volta de `n` (Duff et al. 2017). */
fn gi_screen_basis(n: vec3f) -> mat3x3f {
    let s = select(-1.0, 1.0, n.z >= 0.0);
    let a = -1.0 / (s + n.z);
    let b = n.x * n.y * a;
    return mat3x3f(vec3f(1.0 + s * n.x * n.x * a, s * b, -s * n.x), vec3f(b, s + n.y * n.y * a, -n.y), n);
}

/** Direção `k` da sonda `i` no quadro: R2 deslocada, por cosseno em volta de `n`. */
fn gi_screen_ray_dir(i: u32, k: u32, n: vec3f) -> vec3f {
    let h = gi_hash(i * 1973u + gi.rays.y * 9277u);
    let shift = vec2f(f32(h & 0xFFFFu), f32(h >> 16u)) / 65536.0;
    let u = fract(vec2f(0.7548776662, 0.5698402910) * f32(k + 1u) + shift);
    let r = sqrt(u.x);
    let phi = 2.0 * GI_PI * u.y;
    return normalize(gi_screen_basis(n) * vec3f(r * cos(phi), r * sin(phi), sqrt(max(0.0, 1.0 - u.x))));
}

/** A luz rebatida que sai do ponto atingido pela irradiância da geração `k` (sondas de tela ou do mundo). */
fn gi_screen_bounce(c: Closure, p: vec3f, n: vec3f, v: vec3f, k: u32, found: u32) -> vec3f {
    if (found == NONE || c.translucent_weight > 0.0) { return gi_shade_indirect(c, p, n, v, k); }
    let e = gi_screen_history[found + 2u + k].rgb / GI_PI;
    return closure_indirect(c, n, v, IndirectLight(e, e, e, e, e));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_screen_trace_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= gi_screen_count()) { return; }
    let bounces = min(gi.bounces.x, GI_SCREEN_MAX_BOUNCES);
    let at = gi_screen_probe_at(i);
    let probe = gi_screen_work[at];
    var sums: array<vec3f, GI_SCREEN_MAX_BOUNCES>;
    if (probe.w > 0.0) {
        let n0 = gi_screen_work[at + 1u].xyz;
        // Afasta a origem da superfície em proporção à distância (a precisão do acerto da câmera cai com ela).
        let origin = probe.xyz + n0 * (1e-3 + probe.w * 1e-4);
        let max_dist = gi.tuning.w;
        let rays = gi.screen.z;
        for (var k = 0u; k < rays; k++) {
            let dir = gi_screen_ray_dir(i, k, n0);
            let hit = ray_scene_hit(origin, dir, max_dist);
            if (hit.t >= max_dist) {
                let env = scene_environment(dir);
                for (var g = 0u; g < bounces; g++) { sums[g] += env; }
                continue;
            }
            if (hit.face < 0.0) { continue; }
            let v = -dir;
            let c = gi_hit_closure(hit);
            let direct = gi_shade_direct(c, hit.position, hit.normal, v, (i * rays + k) * 7919u + gi.rays.y * 104729u);
            sums[0] += direct;
            if (bounces > 1u) {
                let found = gi_screen_history_find(hit.position, hit.normal);
                for (var g = 1u; g < bounces; g++) {
                    sums[g] += direct + gi_screen_bounce(c, hit.position, hit.normal, v, g - 1u, found);
                }
            }
        }
        for (var g = 0u; g < bounces; g++) { sums[g] *= GI_PI / f32(rays); }
    }
    for (var g = 0u; g < bounces; g++) { gi_screen_work[gi_screen_fresh_at(i, g)] = vec4f(sums[g], 0.0); }
}
