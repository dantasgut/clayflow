// O nível de cada retalho na vista da luz (spec 041, R20): o erro da malha medido em texels do mapa de sombra virtual
// onde o retalho cai — o nível do mapa é o do ponto do retalho mais perto da câmera no plano da luz (a distância de
// Chebyshev da caixa dos pontos do retalho, a mesma regra de `sv_level`), lido do `ShadowMatrix` do quadro
// (`adapt.view_slot`). Os segmentos por lado: o erro de corda κ·h²/8 abaixo de `view_error` texels (a profundidade e a
// silhueta no mapa erram menos que o viés), sem segmento menor que `view_segment` texels (nenhum triângulo abaixo do
// texel). A curvatura e a caixa por 3 × 3 pontos do retalho. Sem o referencial do quadro (antes do primeiro), o nível
// máximo.
// Requer: surface_adapt, surface_adapt_view, shadow_virtual; shadow_matrices.

/** Segmentos por lado que o retalho `idx` pede na vista da luz. */
fn adapt_light_segments(idx: u32) -> f32 {
    let top = exp2(f32(adapt.max_level));
    let m = shadow_matrices[adapt.view_slot];
    if (!(m.firstLevelRadius > 0.0) || m.pagesPerLevel <= 4u) { return top; }
    let pi = idx % adapt.patches_u;
    let qi = idx / adapt.patches_u;
    let data = surface_fn_params(surface_params.record_slot);
    let up = vec3f(0.0, 1.0, 0.0);
    let t = surface_params.time;
    let w = adapt_world();
    let scale = max(max(length(w[0].xyz), length(w[1].xyz)), length(w[2].xyz));
    var kappa = 0.0;
    var lo = vec2f(3.0e38);
    var hi = vec2f(-3.0e38);
    var corners: array<vec3f, 4>;
    for (var j = 0u; j < 3u; j++) {
        for (var i = 0u; i < 3u; i++) {
            let uv = adapt_uv(pi, qi, f32(i) * 0.5, f32(j) * 0.5);
            let p = surface_at(uv.u, uv.v, uv.sv, t, data, up).position;
            let f = adapt_forms(uv, data).curvature;
            kappa = max(kappa, max(abs(f.z), abs(f.w)));
            let q = sv_light(m, (w * vec4f(p, 1.0)).xyz).xy;
            lo = min(lo, q);
            hi = max(hi, q);
            if (i != 1u && j != 1u) { corners[(j / 2u) * 2u + i / 2u] = p; }
        }
    }
    let size = max(
        max(distance(corners[0], corners[1]), distance(corners[2], corners[3])),
        max(distance(corners[0], corners[2]), distance(corners[1], corners[3])),
    );
    let world_size = size * scale;
    // O ponto do retalho mais perto da câmera no plano da luz e o nível do mapa que o contém (`sv_level`).
    let c = m.camera.xy;
    let gap = max(max(lo - c, c - hi), vec2f(0.0));
    let d = max(gap.x, gap.y);
    let usable = m.firstLevelRadius * (1.0 - 4.0 / f32(m.pagesPerLevel));
    let k = u32(clamp(ceil(log2(max(d / usable, 1.0))), 0.0, f32(max(sv_levels(m), 1u) - 1u)));
    let texel = sv_texel(m, k);
    // Erro de corda em texels do nível (κ em mundo: κ local / escala) e o menor segmento.
    var n = world_size * sqrt(kappa / max(scale, 1e-12) / (8.0 * adapt.view_error * texel));
    n = min(n, world_size / (adapt.view_segment * texel));
    return clamp(n, 1.0, top);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn surface_adapt_light_level_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let idx = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let count = adapt.patches_u * adapt.patches_v;
    if (idx >= count) { return; }
    var level = adapt.max_level;
    if (adapt.force_max == 0u) {
        level = adapt_view_level(adapt_light_segments(idx), idx);
    }
    adapt_patches[idx] = vec4u(level, 0u, 0u, 0u);
    atomicAdd(&adapt_hist[level], 1u);
}
