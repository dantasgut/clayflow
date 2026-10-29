// O que o raio da refração acha (spec 034, T065e): a superfície mais próxima entre a malha (`ray_scene_hit`) e a dos
// volumes atravessados por raios (`ray_volume_hit`: a água das partículas pelo campo dos fluidos), no mesmo acerto —
// o do volume com uma identidade de instância reservada acima das da estrutura de raios (o bit `REFRACTION_VOLUME`, o
// contribuinte e o material nele: um meio por corpo na pilha), sem registro de desenho, a face pelo lado da origem
// (`inside`) e, em `primitive`, 1 quando a superfície mudou desde o quadro anterior. O fechamento no acerto: a
// referência do material de cada um (`ray_hit_surface` ou `ray_volume_surface`) avaliada por uma chamada só de
// `ray_hit_material` — cada chamada é expandida com todas as funções da cena, e duas no passo do caminho travavam a
// compilação do traçado.
// Requer: NONE, ray_scene, ray_hit, ray_volume_types, ray_volume_hit, ray_volume_surface, ray_volume_material,
// ray_bvh_read, ray_wave.

/** Bit das identidades de meio dos volumes (as instâncias da estrutura de raios ficam abaixo). */
const REFRACTION_VOLUME: u32 = 0x40000000u;

/** A identidade de meio do volume do acerto `v`: o bit, o contribuinte (bits 16–23) e o material nele (bits 0–15). */
fn refraction_volume_id(v: RayVolumeHit) -> u32 {
    return REFRACTION_VOLUME | ((v.source & 0xFFu) << 16u) | (v.material & 0xFFFFu);
}

/** A instância do acerto é a de um volume? */
fn refraction_is_volume(instance: u32) -> bool {
    return instance != NONE && (instance & REFRACTION_VOLUME) != 0u;
}

/** O acerto de volume `v` como acerto da refração. */
fn refraction_volume_as_hit(v: RayVolumeHit) -> RayHit {
    return RayHit(v.t, refraction_volume_id(v), select(0u, 1u, v.moved), NONE, vec2f(0.0), select(1.0, -1.0, v.inside),
        v.position, v.normal, vec2f(0.0));
}

/**
 * O acerto mais próximo do raio (o, d) até `t_max`: a malha ou a superfície de um volume (`side`: o lado da origem
 * quanto aos volumes quando ela está na superfície de um, ou −1). O fluido encostado num sólido (spec 034, T067c): a
 * saída de um volume a menos do alcance de contato dele antes de uma malha não é interface com o ar — o volume não
 * resolve o contato abaixo da resolução dele (a água sobre o chão: a superfície do campo fica um pouco acima dele) —, o
 * acerto é o da malha.
 */
fn refraction_scene_hit(o: vec3f, d: vec3f, t_max: f32, side: i32) -> RayHit {
    let mesh = ray_scene_hit(o, d, t_max);
    let v = ray_volume_hit(o, d, min(mesh.t, t_max), side);
    if (!v.hit || v.t >= mesh.t) { return mesh; }
    if (v.inside && mesh.instance != NONE && mesh.t - v.t < v.contact) { return mesh; }
    return refraction_volume_as_hit(v);
}

/** O acerto de volume `hit` no ponto dos volumes. */
fn refraction_volume_hit_of(hit: RayHit) -> RayVolumeHit {
    return RayVolumeHit(hit.t, hit.position, hit.normal, hit.instance & 0xFFFFu, true, hit.face < 0.0,
        (hit.instance >> 16u) & 0xFFu, hit.primitive != 0u, 0.0);
}

/** O fechamento no acerto `hit` (malha ou volume) no tempo simulado `time`. */
fn refraction_hit_closure(hit: RayHit, time: f32) -> Closure {
    var s: RayHitSurface;
    if (refraction_is_volume(hit.instance)) {
        let v = refraction_volume_hit_of(hit);
        let surface = ray_volume_surface(v);
        if (surface.index == 0u) { return surface.closure; }
        s = RayHitSurface(surface.index, surface.slot, ray_volume_sample(v, time), ray_volume_standard());
    } else {
        s = ray_hit_surface(hit, time, 0.0);
    }
    return ray_hit_material(s.index, s.sample, s.material, s.slot);
}

/**
 * O acerto `hit` (malha ou volume) no índice `i` da onda (spec 039), no tempo simulado `time`, com a carga `payload` de
 * quem traça: o material do volume sem função (o fechamento pronto dele) e as constantes da malha sem função gravados
 * já avaliados; com função, o registro para a classe dela.
 */
fn refraction_wave_put(i: u32, hit: RayHit, time: f32, payload: vec4f) {
    if (refraction_is_volume(hit.instance)) {
        let v = refraction_volume_hit_of(hit);
        let surface = ray_volume_surface(v);
        let m = ray_volume_standard();
        if (surface.index == 0u) {
            ray_wave_put_shaded(i, ray_wave_hit(hit.position, hit.normal, vec2f(0.0), time, 0.0, 0.0, m, surface.slot,
                RAY_WAVE_SHADED, i, payload), surface.closure);
            return;
        }
        ray_wave_put_surface(i, surface.index, surface.slot, hit.position, hit.normal, vec2f(0.0), time, 0.0, 0.0, m,
            payload);
        return;
    }
    let s = ray_hit_surface(hit, time, 0.0);
    ray_wave_put_surface(i, s.index, s.slot, s.sample.world_position, s.sample.normal, s.sample.uv, time, 0.0, 0.0,
        s.material, payload);
}

/** O que o acerto `hit` mostra se moveu desde o quadro anterior (a instância, ou a superfície do volume)? */
fn refraction_hit_moved(hit: RayHit) -> bool {
    if (refraction_is_volume(hit.instance)) { return hit.primitive != 0u; }
    return ray_instance_moved_at(ray_scene_info.instanceFirst + hit.instance * RAY_INSTANCE_WORDS);
}
