// Meios em que a câmera está (spec 034, R1, T043): uma invocação por quadro lança um raio da câmera numa direção fixa
// (fora dos eixos) e percorre os acertos até escapar; o primeiro acerto de cada instância dielétrica pela face de trás
// diz que a câmera está dentro dela (o raio sai antes de entrar); paredes finas não têm interior e não contam. Os meios achados, por prioridade crescente, vão para o
// estado do quadro (`refraction_frame_out`, dois texels por meio: instância, prioridade e índice; o resto do índice e a
// absorção; instância `NONE` nos vazios) — a pilha inicial de todo caminho do quadro, como a da referência da CPU. A
// câmera dentro de um volume (a água das partículas, T065e) também: pelo lado do acerto do volume na mesma direção.
// O material dos acertos é avaliado fora do traçado (spec 039): `refraction_camera_hits_main` grava os acertos na onda e
// `refraction_camera_main` lê os fechamentos dela.
// Requer: NONE, REFRACTION_MAX_MEDIA, refraction, refraction_media, refraction_scene, ray_scene, ray_hit, ray_wave,
// refraction_frame_out.

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

/** Índice da onda do acerto do volume em que a câmera está (depois dos das instâncias). */
const REFRACTION_CAMERA_VOLUME: u32 = REFRACTION_CAMERA_SEEN;

/** O raio fixo da câmera (fora dos eixos). */
fn refraction_camera_dir() -> vec3f {
    return normalize(vec3f(0.3141, 0.9165, 0.2479));
}

/**
 * Os acertos da reta da câmera na onda dos acertos (spec 039): o primeiro de cada instância distinta, até
 * `REFRACTION_CAMERA_SEEN`, nos índices 0.., com a etiqueta da instância e a carga (o lado da face, 1); o volume em que a câmera
 * está, no índice `REFRACTION_CAMERA_VOLUME`. O material é avaliado fora, por classe.
 */
@compute @workgroup_size(1)
fn refraction_camera_hits_main() {
    let origin = cameras[refraction.camera_slot].position.xyz;
    let dir = refraction_camera_dir();
    var seen: array<u32, REFRACTION_CAMERA_SEEN>;
    var seen_count = 0u;
    var o = origin;
    for (var step = 0u; step < REFRACTION_CAMERA_STEPS; step++) {
        let hit = ray_scene_hit(o, dir, RAY_MISS);
        if (hit.instance == NONE) { break; }
        var known = false;
        for (var i = 0u; i < seen_count; i++) { known = known || seen[i] == hit.instance; }
        if (!known && seen_count < REFRACTION_CAMERA_SEEN) {
            seen[seen_count] = hit.instance;
            refraction_wave_put(seen_count, hit, refraction.time, vec4f(0.0, hit.face, 1.0, 0.0));
            ray_wave_tag(seen_count, hit.instance);
            seen_count += 1u;
        }
        o = hit.position + dir * (1e-4 * (1.0 + length(hit.position)));
    }
    for (var i = seen_count; i < REFRACTION_CAMERA_SEEN; i++) { ray_wave_put_empty(i, vec4f(0.0)); }
    // Os volumes (a água das partículas): a câmera está dentro quando a superfície mais próxima é vista por dentro.
    let v = ray_volume_hit(origin, dir, RAY_MISS, -1);
    if (v.hit && v.inside) {
        refraction_wave_put(REFRACTION_CAMERA_VOLUME, refraction_volume_as_hit(v), refraction.time,
            vec4f(0.0, -1.0, 1.0, 0.0));
        ray_wave_tag(REFRACTION_CAMERA_VOLUME, refraction_volume_id(v));
    } else {
        ray_wave_put_empty(REFRACTION_CAMERA_VOLUME, vec4f(0.0));
    }
}

/**
 * Os meios em que a câmera está, pelos fechamentos avaliados na onda: o de cada instância dielétrica vista pela face de
 * trás (o raio sai antes de entrar) e o do volume em que ela está; paredes finas não contam.
 */
@compute @workgroup_size(1)
fn refraction_camera_main() {
    var inside = refraction_empty_stack();
    for (var i = 0u; i <= REFRACTION_CAMERA_VOLUME; i++) {
        let e = ray_wave_entries[i];
        if (e.hit.payload.z <= 0.0) { continue; }
        let c = e.closure;
        if (c.transmission_weight > 0.0 && c.transmission_thin == 0.0 && e.hit.payload.y < 0.0) {
            inside = refraction_enter(inside, refraction_medium(c, e.hit.ray));
        }
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
