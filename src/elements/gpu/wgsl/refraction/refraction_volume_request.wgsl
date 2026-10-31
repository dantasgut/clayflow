// Pedido da refração pelos volumes atravessados por raios (spec 034, T065f): um triângulo de tela cheia depois do
// pedido dos transmissivos, no mesmo alvo e na mesma profundidade (teste `less`: fica a interface mais próxima por
// pixel, a da malha ou a do volume). Por pixel, o raio da câmera pelo ponto `ray_volume_hit` (a água das partículas,
// pelo campo dos fluidos): a superfície de um volume à frente dos opacos é uma interface — a distância da câmera até
// ela e a marca do pedido; com a câmera dentro de um volume, todo pixel é pedido, com a face de trás (a pilha inicial da
// câmera tem o meio), até a saída dele ou até o opaco, o que vier antes — o que se vê de dentro da água atravessa a
// água. O estágio da refração refaz o raio da câmera desses pixels; este passe só os escolhe. Com a câmera fora dos
// volumes (a pilha de meios dela no estado do quadro anterior), nada: a superfície vista de fora vem da malha
// (`refraction_volume_mesh.wgsl`, spec 039 refeita).
// Requer: NONE, REFRACTION_MAX_MEDIA, refraction, cameras, camera_space, view_space, ray_volume_hit,
// REFRACTION_REQUEST_VALID, REFRACTION_REQUEST_BACK_FACE, scene_depth, refraction_frame.

/** Distância máxima do raio da câmera (sem opaco no pixel, o céu). */
const REFRACTION_VOLUME_FAR: f32 = 1.0e6;

/** A identidade de instância dos volumes na pilha de meios (`REFRACTION_VOLUME` de `refraction_scene.wgsl`). */
const REFRACTION_VOLUME_MEDIUM: u32 = 0x40000000u;

/** A câmera está dentro de um volume (a pilha de meios dela, gravada pelo traçado do quadro anterior)? */
fn refraction_camera_in_volume() -> bool {
    for (var k = 0u; k < REFRACTION_MAX_MEDIA; k++) {
        let id = textureLoad(refraction_frame, vec2u(2u * k, 0u), 0).x;
        if (id != NONE && (id & REFRACTION_VOLUME_MEDIUM) != 0u) { return true; }
    }
    return false;
}

struct RefractionVolumeRequestOut {
    @location(0) request: vec2u,
    @builtin(frag_depth) depth: f32,
}

@fragment
fn refraction_volume_request_fs(@builtin(position) frag: vec4f) -> RefractionVolumeRequestOut {
    if (!refraction_camera_in_volume()) { discard; }
    let slot = refraction.camera_slot;
    let cam = cameras[slot];
    let ray = camera_ray(slot, frag.xy, vec2f(textureDimensions(scene_depth)));
    // A distância até o opaco do pixel, ao longo do raio (a profundidade dele na vista sobre o cosseno com o eixo).
    let ndc = textureLoad(scene_depth, vec2i(frag.xy), 0);
    var t_scene = REFRACTION_VOLUME_FAR;
    if (ndc < 1.0) {
        let forward = -normalize(cam.inverseView[2].xyz);
        t_scene = view_depth(ndc, cam.projection) / max(dot(ray.dir, forward), 1e-6);
    }
    // Do plano próximo (como a geometria); sem teto no opaco: com a câmera dentro, o lado vem do acerto de saída.
    let v = ray_volume_hit(ray.origin + ray.dir * ray.near, ray.dir, REFRACTION_VOLUME_FAR, -1);
    if (!v.hit) { discard; }
    var t = ray.near + v.t;
    if (v.inside) {
        t = min(t, t_scene);
    } else if (t >= t_scene) {
        discard;
    }
    let p = ray.origin + ray.dir * t;
    let clip = cam.viewProjection * vec4f(p, 1.0);
    var out: RefractionVolumeRequestOut;
    let marks = select(REFRACTION_REQUEST_VALID, REFRACTION_REQUEST_VALID | REFRACTION_REQUEST_BACK_FACE, v.inside);
    out.request = vec2u(bitcast<u32>(distance(cam.position.xyz, p)), marks);
    out.depth = clamp(clip.z / clip.w, 0.0, 1.0);
    return out;
}
