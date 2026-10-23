// Meios em que a câmera está (spec 034, R1, T043): uma invocação por quadro lança um raio da câmera numa direção fixa
// (fora dos eixos) e percorre os acertos até escapar; o primeiro acerto de cada instância dielétrica pela face de trás
// diz que a câmera está dentro dela (o raio sai antes de entrar); paredes finas não têm interior e não contam. Os meios achados, por prioridade crescente, vão para o
// estado do quadro (`refraction_frame_out`, dois texels por meio: instância, prioridade e índice; o resto do índice e a
// absorção; instância `NONE` nos vazios) — a pilha inicial de todo caminho do quadro, como a da referência da CPU.
// Requer: NONE, REFRACTION_MAX_MEDIA, refraction, refraction_media, ray_scene, ray_hit, refraction_frame_out.

/** Acertos percorridos no máximo (a câmera dentro de muitas camadas para no teto). */
const REFRACTION_CAMERA_STEPS: u32 = 64u;
/** Instâncias distintas lembradas no máximo. */
const REFRACTION_CAMERA_SEEN: u32 = 32u;

fn refraction_store_medium(k: u32, m: RefractionMedium) {
    textureStore(refraction_frame_out, vec2u(2u * k, 0u),
        vec4u(m.instance, bitcast<u32>(m.priority), bitcast<u32>(m.ior.x), bitcast<u32>(m.ior.y)));
    textureStore(refraction_frame_out, vec2u(2u * k + 1u, 0u),
        vec4u(bitcast<u32>(m.ior.z), bitcast<vec3u>(m.sigma)));
}

@compute @workgroup_size(1)
fn refraction_camera_main() {
    let origin = cameras[refraction.camera_slot].position.xyz;
    let dir = normalize(vec3f(0.3141, 0.9165, 0.2479));
    var seen: array<u32, REFRACTION_CAMERA_SEEN>;
    var seen_count = 0u;
    var inside = refraction_empty_stack();
    var o = origin;
    for (var step = 0u; step < REFRACTION_CAMERA_STEPS; step++) {
        let hit = ray_scene_hit(o, dir, RAY_MISS);
        if (hit.instance == NONE) { break; }
        var known = false;
        for (var i = 0u; i < seen_count; i++) { known = known || seen[i] == hit.instance; }
        if (!known && seen_count < REFRACTION_CAMERA_SEEN) {
            seen[seen_count] = hit.instance;
            seen_count += 1u;
            let c = ray_hit_closure(hit, refraction.time, 0.0);
            if (c.transmission_weight > 0.0 && c.transmission_thin == 0.0 && hit.face < 0.0) {
                inside = refraction_enter(inside, refraction_medium(c, hit.instance));
            }
        }
        o = hit.position + dir * (1e-4 * (1.0 + length(hit.position)));
    }
    // Prioridade crescente: no empate, o corrente é o último (como a referência ordena).
    for (var i = 1u; i < inside.count; i++) {
        var j = i;
        while (j > 0u && inside.media[j - 1u].priority > inside.media[j].priority) {
            let t = inside.media[j - 1u];
            inside.media[j - 1u] = inside.media[j];
            inside.media[j] = t;
            j -= 1u;
        }
    }
    for (var k = 0u; k < REFRACTION_MAX_MEDIA; k++) {
        var m = refraction_air();
        if (k < inside.count) { m = inside.media[k]; }
        refraction_store_medium(k, m);
    }
}
