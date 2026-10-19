// Estágio da matriz de sombra (spec 007, research R11): para cada luz direcional que projeta, a matriz
// luz-vista-projeção do seu mapa — ortográfica com o olho contra a direção da luz, mirando a origem (com o "para cima"
// trocado na luz vertical).
// A caixa da projeção (spec 034, L6) é a da cena (`shadow_bounds.wgsl`: as geometrias, no quadro) vista pela luz: o mapa
// inteiro cobre o que existe, e não ±10 m fixos (numa sala de 4 m, um texel ~5× menor; os degraus da borda do sol, com
// a luz baixa, somem com ele). Quadrada, com o meio-lado arredondado para cima em 1/64 da potência de 2 acima dele e o
// centro na grade dos texels da vista (ancorada na origem): a cena andando não faz a sombra tremer. A profundidade vai
// da geometria mais perto da luz até além da mais longe (receptores sem geometria, como a água, ficam dentro). Sem
// geometria ou com uma caixa desconhecida (vértices da GPU), a caixa de antes: ±10 m na origem.
// Requer: structs Light, ShadowMatrix, ShadowRecord, ShadowMatrixInstance, ShadowMatrixParams, ShadowMap; camera;
// shadow_scene_bounds, shadow_maps.

/** Inverso de `shadow_ordered` (`shadow_bounds.wgsl`). */
fn shadow_unordered(u: u32) -> f32 {
    return bitcast<f32>(select(~u, u & 0x7fffffffu, (u & 0x80000000u) != 0u));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn shadow_matrix_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= shadow_params.count) { return; }
    let r = shadow_records[shadow_list[shadow_params.first + i].record];
    let dir = normalize(lights[r.lightSlot].direction.xyz);
    // "Para cima" da vista da luz: o eixo y, ou o z quando a luz é (quase) vertical — senão a base degenera.
    let up = select(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(dir.y) > 0.99);
    let boxes = atomicLoad(&shadow_scene_bounds[7]);
    if (boxes == 0u || atomicLoad(&shadow_scene_bounds[6]) != 0u) {
        let view = camera_look_at(-dir * 10.0, vec3f(0.0), up);
        let projection = camera_orthographic_box(-10.0, 10.0, -10.0, 10.0, 0.1, 50.0);
        shadow_matrices[r.shadowSlot].lightViewProj = projection * view;
        return;
    }
    var lo = vec3f(0.0);
    var hi = vec3f(0.0);
    for (var a = 0u; a < 3u; a++) {
        lo[a] = shadow_unordered(~atomicLoad(&shadow_scene_bounds[a]));
        hi[a] = shadow_unordered(atomicLoad(&shadow_scene_bounds[3u + a]));
    }
    // O olho na direção da luz a partir da origem, além de toda a cena.
    let radius = 0.5 * length(hi - lo);
    let reach = length(0.5 * (lo + hi)) + radius + 1.0;
    let view = camera_look_at(-dir * reach, vec3f(0.0), up);
    var mn = vec3f(3.4e38);
    var mx = vec3f(-3.4e38);
    for (var k = 0u; k < 8u; k++) {
        let c = select(lo, hi, vec3<bool>((k & 1u) != 0u, (k & 2u) != 0u, (k & 4u) != 0u));
        let p = (view * vec4f(c, 1.0)).xyz;
        mn = min(mn, p);
        mx = max(mx, p);
    }
    let size = max(shadow_maps[r.shadowSlot].size.x, 1.0);
    var half = 0.5 * max(mx.x - mn.x, mx.y - mn.y) + 1e-3;
    let step = exp2(ceil(log2(half))) / 64.0;
    half = ceil(half / step) * step;
    // Um texel de folga em volta (o PCF lê os vizinhos da borda).
    half += 2.0 * half / size;
    let texel = 2.0 * half / size;
    let cx = round(0.5 * (mn.x + mx.x) / texel) * texel;
    let cy = round(0.5 * (mn.y + mx.y) / texel) * texel;
    let near = max(0.01, -mx.z - 0.05 * radius - 0.05);
    let far = -mn.z + 0.5 * radius + 1.0;
    let projection = camera_orthographic_box(cx - half, cx + half, cy - half, cy + half, near, far);
    shadow_matrices[r.shadowSlot].lightViewProj = projection * view;
}
