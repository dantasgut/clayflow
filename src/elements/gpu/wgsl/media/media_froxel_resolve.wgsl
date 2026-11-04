// Acúmulo dos froxels (spec 034, T058): o quadro da injeção (`froxel_current`) entra no histórico reprojetado (o centro
// do froxel no quadro anterior, pela vista e a vista-projeção guardadas — com a câmera parada, o próprio texel) com peso
// 1 − FROXEL_HISTORY, o histórico (trilinear) antes recortado à média ± desvio do quadro no froxel e nas 4 vizinhas da
// fatia (o recorte por variância do antisserrilhado temporal; as vizinhas em z ficam a uma fatia inteira na memória, e
// sem elas o passe cabe no orçamento da névoa): com a câmera andando, o feixe de sol ficava com a borda mole e atrasada,
// e o que a vizinhança do quadro não sustenta sai. A Catmull-Rom no lugar da trilinear foi medida e piorou o padrão da
// grade no resíduo entre quadros (`fogWalk`: 0,13 % do pico contra 0,05 %).
// Requer: WORKGROUP_SIZE, FROXEL_HISTORY, froxels, cameras, media_common, temporal, froxel_current, froxel_sampler,
// froxel_history, froxel_history_out.

/** Desvios da vizinhança do quadro em volta da média que o histórico pode guardar. */
const FROXEL_CLIP: f32 = 1.0;

@compute @workgroup_size(WORKGROUP_SIZE)
fn froxel_resolve_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let dims = froxels.grid.xyz;
    if (i >= dims.x * dims.y * dims.z) { return; }
    let cell = vec3u(i % dims.x, (i / dims.x) % dims.y, i / (dims.x * dims.y));
    let current = textureLoad(froxel_current, cell, 0);
    var out = current;
    // Sem histórico no corte de câmera (`history.x`, spec 037) ou com o acúmulo desligado.
    let cam = cameras[froxels.grid.w];
    if (froxels.counts.w == 1u && !temporal_cut(cam.history)) {
        let uv_c = (vec2f(cell.xy) + 0.5) / vec2f(dims.xy);
        let center = froxel_world(cam, froxel_view_point(uv_to_ndc(uv_c), froxel_slice_depth(f32(cell.z) + 0.5),
            froxel_projection(cam)));
        let f = froxel_locate(cam.previousView, cam.previousViewProjection, center);
        let w = f.z / f32(dims.z);
        if (all(f.xy >= vec2f(0.0)) && all(f.xy <= vec2f(1.0)) && w >= 0.0 && w <= 1.0) {
            // Os momentos do quadro no froxel e nas 4 vizinhas da fatia (na borda da grade, as que existem).
            var m1 = current;
            var m2 = current * current;
            var n = 1.0;
            for (var k = 0u; k < 4u; k++) {
                var d = vec3i(0);
                d[k / 2u] = select(-1, 1, (k & 1u) == 1u);
                let c = vec3i(cell) + d;
                if (any(c < vec3i(0)) || any(c >= vec3i(dims))) { continue; }
                let v = textureLoad(froxel_current, vec3u(c), 0);
                m1 += v;
                m2 += v * v;
                n += 1.0;
            }
            let mean = m1 / n;
            let sd = sqrt(max(m2 / n - mean * mean, vec4f(0.0)));
            let history = textureSampleLevel(froxel_history, froxel_sampler, vec3f(f.xy, w), 0.0);
            let clipped = clamp(history, max(mean - FROXEL_CLIP * sd, vec4f(0.0)), mean + FROXEL_CLIP * sd);
            out = temporal_hysteresis(current, clipped, FROXEL_HISTORY);
        }
    }
    textureStore(froxel_history_out, cell, out);
}
