// As direções dos raios das sondas de tela (spec 034, T051; R4 (1)): amostragem por importância mista — metade dos
// raios em cosseno em volta da normal, metade guiada pela radiância direcional da sonda do mundo de maior peso no ponto
// (o mapa octaédrico da radiância do último rebatimento, `gi_radiance_map`, vezes o cosseno), com o peso da heurística
// de equilíbrio para as duas técnicas em números iguais: cada raio leva cos / (½ p_cos + ½ p_guia), e a irradiância é
// a média de L · peso (π com cosseno puro). Sem sonda do mundo visível ou com o mapa escuro, todos em cosseno. O guia não
// precisa ser exato: o cosseno cobre o hemisfério inteiro, então a estimativa segue sem viés com qualquer sonda.
// Uma invocação por sonda de tela; grava por raio vec4f(direção, peso) no trabalho das sondas de tela
// (`gi_screen_ray_at`), que o acerto e a soma dos rebatimentos leem.
// Requer: WORKGROUP_SIZE, random, basis, sampling, color, gi, gi_common, gi_weights, gi_screen_common,
// gi_radiance_map_read, gi_screen_work.

const GI_GUIDE_TEXELS: u32 = GI_IRRADIANCE_TEXELS * GI_IRRADIANCE_TEXELS;

/**
 * A sonda do mundo mais próxima de `p` (o maior peso trilinear entre as 8 da célula, sem as desligadas) na cascata mais
 * fina que o contém; `weight` 0 sem nenhuma. Sem a visibilidade de Chebyshev: o guia só desloca a variância.
 */
fn gi_guide_probe(p: vec3f, n: vec3f) -> GiTap {
    for (var c = 0u; c < gi.grid.w; c++) {
        if (c + 1u < gi.grid.w && gi_cascade_weight(p, c) <= 0.0) { continue; }
        let cell = gi_cell_of(p, n, n, c);
        var best = GiTap(0u, 0.0);
        for (var k = 0u; k < 8u; k++) {
            let o = vec3i(i32(k & 1u), i32((k >> 1u) & 1u), i32((k >> 2u) & 1u));
            let at = clamp(cell.base + o, cell.lo, cell.hi);
            let index = gi_probe_index(gi_cell_local(at), c);
            let state = gi_probe_texel(index);
            if (state.offset.w == GI_PROBE_INSIDE || any(state.cell != gi_cell_wrap(at))) { continue; }
            let t = mix(vec3f(1.0) - cell.f, cell.f, vec3f(o));
            let w = t.x * t.y * t.z + 1e-6;
            if (w > best.weight) { best = GiTap(index, w); }
        }
        if (best.weight > 0.0) { return best; }
    }
    return GiTap(0u, 0.0);
}

/** O registro de um raio (direção octaédrica de 16 bits por eixo nos bits de um f32, peso) em dois componentes. */
fn gi_screen_ray_pack(d: vec3f, weight: f32) -> vec2f {
    return vec2f(bitcast<f32>(pack2x16snorm(gi_oct_encode(d))), weight);
}

/** O texel do mapa octaédrico na direção `d` e o fator |p|³ da área do octaedro (dω = 4 du dv / |p|³). */
struct GiGuideTexel {
    t: u32,
    cube: f32,
}

fn gi_guide_texel(d: vec3f) -> GiGuideTexel {
    let uv = gi_oct_encode(d) * 0.5 + 0.5;
    let q = min(vec2u(uv * f32(GI_IRRADIANCE_TEXELS)), vec2u(GI_IRRADIANCE_TEXELS - 1u));
    let r = 1.0 / (abs(d.x) + abs(d.y) + abs(d.z));
    return GiGuideTexel(q.x + q.y * GI_IRRADIANCE_TEXELS, r * r * r);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_screen_guide_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= gi_screen_count()) { return; }
    let at = gi_screen_probe_at(i);
    let probe = gi_screen_work[at];
    if (probe.w <= 0.0) { return; }
    let n = gi_screen_work[at + 1u].xyz;
    let rays = gi.screen.z;
    // A distribuição do guia: radiância (o maior canal) × cosseno por texel, acumulada.
    var cdf: array<f32, GI_GUIDE_TEXELS>;
    var total = 0.0;
    // Fora da vez no rodízio só lança a sonda recém-descoberta (sem histórico): em cosseno, sem montar o guia.
    var tap = GiTap(0u, 0.0);
    if (gi_screen_scheduled(i)) { tap = gi_guide_probe(probe.xyz, n); }
    if (tap.weight > 0.0) {
        for (var t = 0u; t < GI_GUIDE_TEXELS; t++) {
            let d = gi_texel_dir(vec2u(t % GI_IRRADIANCE_TEXELS, t / GI_IRRADIANCE_TEXELS), GI_IRRADIANCE_TEXELS);
            let c = dot(d, n);
            // O hemisfério de trás não pesa: sem a leitura do mapa.
            if (c > 0.0) { total += max_channel(unpack_half_rgb(gi_radiance_map[tap.index * GI_GUIDE_TEXELS + t])) * c; }
            cdf[t] = total;
        }
    }
    // Guia só com radiância finita e positiva; senão todos os raios em cosseno.
    let guided = total > 0.0 && total < 3.0e38;
    let basis = basis_duff(n);
    let h = random_seed(RANDOM_STREAM_GI_SCREEN_RAYS, i, gi.rays.y);
    let shift = vec2f(f32(h & 0xFFFFu), f32(h >> 16u)) / 65536.0;
    let g = random_seed(RANDOM_STREAM_GI_SCREEN_GUIDE, i, gi.rays.y);
    let gshift = vec3f(f32(g & 0x3FFu), f32((g >> 10u) & 0x3FFu), f32(g >> 20u)) / vec3f(1024.0, 1024.0, 4096.0);
    var pending = vec2f(0.0);
    for (var k = 0u; k < rays; k++) {
        var d: vec3f;
        // Pares (cosseno, guia): os pares cobrem o hemisfério e o guia por igual (o último ímpar fica em cosseno).
        let j = select(k, k / 2u, guided);
        if (guided && (k & 1u) == 1u) {
            // R3 deslocada: o texel pela distribuição acumulada, a posição dentro dele uniforme.
            let u = fract(vec3f(0.8191725134, 0.6710436067, 0.5497004779) * f32(j + 1u) + gshift);
            let goal = u.x * total;
            // Busca binária: o primeiro texel com a acumulada acima do alvo (6 passos para 64 texels).
            var lo = 0u;
            var hi = GI_GUIDE_TEXELS - 1u;
            for (var s = 0u; s < 6u; s++) {
                let mid = (lo + hi) / 2u;
                if (cdf[mid] > goal) { hi = mid; } else { lo = mid + 1u; }
            }
            let t = min(lo, GI_GUIDE_TEXELS - 1u);
            let cell = vec2f(f32(t % GI_IRRADIANCE_TEXELS), f32(t / GI_IRRADIANCE_TEXELS));
            d = gi_oct_decode((cell + u.yz) / f32(GI_IRRADIANCE_TEXELS) * 2.0 - 1.0);
        } else {
            let u = fract(vec2f(0.7548776662, 0.5698402910) * f32(j + 1u) + shift);
            d = normalize(basis * sample_cosine(u));
        }
        let c = dot(d, n);
        var weight = 0.0;
        if (c > 0.0) {
            var pdf = c / PI;
            if (guided) {
                let gt = gi_guide_texel(d);
                var below = 0.0;
                if (gt.t > 0u) { below = cdf[gt.t - 1u]; }
                let pdf_guide = (cdf[gt.t] - below) / total * f32(GI_GUIDE_TEXELS) * gt.cube * 0.25;
                pdf = 0.5 * pdf + 0.5 * pdf_guide;
            }
            weight = c / pdf;
        }
        // Dois raios por vec4f: o par vai inteiro no ímpar.
        let packed = gi_screen_ray_pack(d, weight);
        if ((k & 1u) == 1u) { gi_screen_work[gi_screen_ray_at(i, k)] = vec4f(pending, packed); }
        pending = packed;
    }
}
