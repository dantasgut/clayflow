// Raio da câmera por um ponto da tela (spec 033 R2, comum na spec 034): origem e direção unitária da câmera de slot
// `slot` pelo ponto `px` (pixels, origem em cima) de um alvo de `size` pixels — a perspectiva pela posição e a
// ortográfica pelo plano da vista. O deslocamento da amostra do quadro (spec 034) está em `projection[2].xy`, que a
// reconstrução não lê: tirado do NDC — o raio pelo centro do pixel é o mesmo que o raster amostra neste quadro.
// `near` é a distância ao longo do raio até o plano próximo: o raster não vê o que fica antes dele, e o raio que
// substitui o raster no pixel (a refração) parte dali — uma superfície encostada na câmera não tapa a vista.
// Requer: cameras.

struct RayCamera {
    origin: vec3f,
    dir: vec3f,
    near: f32,
}

fn ray_camera(slot: u32, px: vec2f, size: vec2f) -> RayCamera {
    let cam = cameras[slot];
    let ndc = vec2f(px.x / size.x * 2.0 - 1.0, 1.0 - px.y / size.y * 2.0);
    let p = cam.projection;
    // A inversa da rotação da vista é a transposta.
    let rot = transpose(mat3x3f(cam.view[0].xyz, cam.view[1].xyz, cam.view[2].xyz));
    // Clip z em [0, 1] (`camera_perspective`, `camera_orthographic`): nas duas, near = p[3][2] / p[2][2].
    let near = p[3][2] / p[2][2];
    if (p[3][3] != 1.0) {
        let q = ndc - cam.jitter.xy;
        let view_dir = vec3f(q.x / p[0][0], q.y / p[1][1], -1.0);
        return RayCamera(cam.position.xyz, normalize(rot * view_dir), near * length(view_dir));
    }
    let offset = vec3f((ndc.x - p[3][0]) / p[0][0], (ndc.y - p[3][1]) / p[1][1], 0.0);
    return RayCamera(cam.position.xyz + rot * offset, normalize(rot * vec3f(0.0, 0.0, -1.0)), near);
}
