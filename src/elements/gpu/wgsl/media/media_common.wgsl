// Froxels (spec 033, R12): grade alinhada à câmera ativa — x, y na tela, z em fatias exponenciais da profundidade da
// vista entre `froxels.depth.x` e `froxels.depth.y` (a fatia s começa em near·(far/near)^(s/Z)). A ida e volta entre o
// mundo, a vista e a posição contínua na grade.
// Requer: froxels, cameras.

/** Profundidade da vista no começo da fatia contínua `s`. */
fn froxel_slice_depth(s: f32) -> f32 {
    return froxels.depth.x * exp(s / f32(froxels.grid.z) * froxels.depth.z);
}

/** Fatia contínua da profundidade da vista `z` (0 na primeira fatia, Z na última). */
fn froxel_slice_of(z: f32) -> f32 {
    return log(max(z, 1e-6) / froxels.depth.x) / froxels.depth.z * f32(froxels.grid.z);
}

/** Ponto da vista na posição `ndc` da tela à profundidade `z` (perspectiva, com o centro deslocado, ou ortográfica). */
fn froxel_view_point(ndc: vec2f, z: f32, proj: mat4x4f) -> vec3f {
    if (proj[3][3] == 1.0) {
        return vec3f((ndc.x - proj[3][0]) / proj[0][0], (ndc.y - proj[3][1]) / proj[1][1], -z);
    }
    return vec3f(z * (ndc.x + proj[2][0]) / proj[0][0], z * (ndc.y + proj[2][1]) / proj[1][1], -z);
}

/**
 * A projeção da câmera sem o deslocamento da amostra dentro do pixel (spec 034): a grade dos froxels tem as próprias
 * amostras (Halton por quadro) e não acompanha o deslocamento do antisserrilhado — senão o histórico dela veria um
 * movimento que não existe. `(T·P)[c].xy = P[c].xy + jitter.xy · P[c].w`.
 */
fn froxel_projection(cam: CameraMatrices) -> mat4x4f {
    var p = cam.projection;
    for (var c = 0; c < 4; c++) {
        p[c] = vec4f(p[c].xy - cam.jitter.xy * p[c].w, p[c].zw);
    }
    return p;
}

/** Vista → mundo (vista rígida). */
fn froxel_world(cam: CameraMatrices, pv: vec3f) -> vec3f {
    let r = mat3x3f(cam.view[0].xyz, cam.view[1].xyz, cam.view[2].xyz);
    return transpose(r) * (pv - cam.view[3].xyz);
}

/** Tela (uv em [0, 1], y para baixo) e fatia contínua do ponto de mundo `p` pela vista e projeção dadas. */
fn froxel_locate(view: mat4x4f, view_proj: mat4x4f, p: vec3f) -> vec3f {
    let z = -(view * vec4f(p, 1.0)).z;
    let clip = view_proj * vec4f(p, 1.0);
    let ndc = clip.xy / max(abs(clip.w), 1e-6) * sign(clip.w);
    return vec3f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5, froxel_slice_of(z));
}

/** Deslocamento fixo por célula em [0, 1)³ (hash PCG): decorrelaciona o jitter entre as vizinhas. */
fn froxel_rotation(cell: vec3u) -> vec3f {
    var h = (cell.x * 73856093u) ^ (cell.y * 19349663u) ^ (cell.z * 83492791u);
    var out = vec3f(0.0);
    for (var k = 0u; k < 3u; k++) {
        h = h * 747796405u + 2891336453u;
        let w = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
        out[k] = f32(((w >> 22u) ^ w) & 0xFFFFFFu) / 16777216.0;
    }
    return out;
}
