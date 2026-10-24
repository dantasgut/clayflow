// Espaços pela câmera (spec 037, R4): o raio de um pixel, o vetor de movimento de um ponto de mundo e a largura de um
// pixel num ponto, lidos das matrizes guardadas da câmera (`CameraMatrices`: as inversas e as do quadro anterior vêm
// calculadas do `CameraFlow`, uma vez por quadro).
// Requer: cameras, view_space.

// Raio da câmera por um ponto da tela (spec 033 R2, comum na spec 034): origem e direção unitária da câmera de slot
// `slot` pelo ponto `px` (pixels, origem em cima) de um alvo de `size` pixels — a perspectiva pela posição e a
// ortográfica pelo plano da vista. O deslocamento da amostra do quadro (spec 034) está em `projection[2].xy`, que a
// reconstrução não lê: tirado do NDC — o raio pelo centro do pixel é o mesmo que o raster amostra neste quadro.
// `near` é a distância ao longo do raio até o plano próximo: o raster não vê o que fica antes dele, e o raio que
// substitui o raster no pixel (a refração) parte dali — uma superfície encostada na câmera não tapa a vista.
struct RayCamera {
    origin: vec3f,
    dir: vec3f,
    near: f32,
}

fn camera_ray(slot: u32, px: vec2f, size: vec2f) -> RayCamera {
    return camera_ray_ndc(slot, pixel_to_ndc(px, size));
}

// O raio da câmera `slot` pelo ponto `ndc` da tela (o mesmo de `camera_ray`, a partir do NDC).
fn camera_ray_ndc(slot: u32, ndc: vec2f) -> RayCamera {
    let cam = cameras[slot];
    let p = cam.projection;
    let rot = mat3x3f(cam.inverseView[0].xyz, cam.inverseView[1].xyz, cam.inverseView[2].xyz);
    // Clip z em [0, 1] (`camera_perspective`, `camera_orthographic`): nas duas, near = p[3][2] / p[2][2].
    let near = p[3][2] / p[2][2];
    if (!is_orthographic(p)) {
        let q = ndc - cam.jitter.xy;
        let view_dir = vec3f(q.x / p[0][0], q.y / p[1][1], -1.0);
        return RayCamera(cam.position.xyz, normalize(rot * view_dir), near * length(view_dir));
    }
    let offset = vec3f((ndc.x - p[3][0]) / p[0][0], (ndc.y - p[3][1]) / p[1][1], 0.0);
    return RayCamera(cam.position.xyz + rot * offset, normalize(rot * vec3f(0.0, 0.0, -1.0)), near);
}

// Vetor de movimento do ponto de mundo `world` (que estava em `previous_world` no quadro anterior) pela câmera `slot`.
fn motion_vector(previous_world: vec3f, world: vec3f, slot: u32) -> vec4f {
    let cam = cameras[slot];
    return motion_from_clips(
        cam.previousViewProjection * vec4f(previous_world, 1.0),
        cam.unjitteredViewProjection * vec4f(world, 1.0),
    );
}

// Largura de um pixel (em unidades de mundo) no ponto `world`, num alvo de `size` pixels: a altura do pixel no plano
// a essa distância (perspectiva) ou no plano da vista (ortográfica).
fn pixel_footprint(slot: u32, size: vec2f, world: vec3f) -> f32 {
    let cam = cameras[slot];
    let footprint = 2.0 / (cam.projection[1][1] * size.y);
    if (is_orthographic(cam.projection)) { return footprint; }
    return footprint * length(world - cam.position.xyz);
}
