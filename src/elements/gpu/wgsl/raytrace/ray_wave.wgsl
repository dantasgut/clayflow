// A onda dos acertos (spec 039, R1–R5): quem traça grava, no índice do próprio raio, o que o material precisa no ponto
// atingido (`RayWaveHit`: a amostra de superfície, as constantes do `StandardMaterial`, o slot dos parâmetros e a classe
// da função `material`) e conta por classe; o material é avaliado depois, fora do traçado, por um kernel por classe
// (`hit_shade_*`), que grava o fechamento no mesmo índice (`ray_wave_surfaces`). A classe `RAY_WAVE_SHADED` é o acerto
// cujo fechamento quem traça já gravou (as constantes do `StandardMaterial`: sem função `material`); `NONE`, o
// índice sem acerto nesta rodada. Os contadores: [0] = registros da rodada (o maior índice gravado + 1), [1 + k] = os
// acertos da classe k, [1 + C + k] = o cursor do espalhamento da classe k (C = classes).
// Requer: NONE, material_point_types, closure, StandardMaterial, RayWaveHit, ray_wave_hits, ray_wave_surfaces,
// ray_wave_counts.

/** Classe do acerto com o fechamento já gravado por quem traça. */
const RAY_WAVE_SHADED: u32 = 0xFFFFFFFEu;

/** Os registros da rodada passam a cobrir o índice `i`. */
fn ray_wave_cover(i: u32) {
    atomicMax(&ray_wave_counts[0], i + 1u);
}

/** O índice `i` sem acerto nesta rodada. */
fn ray_wave_put_empty(i: u32) {
    var h: RayWaveHit;
    h.cls = NONE;
    h.ray = i;
    ray_wave_hits[i] = h;
    ray_wave_cover(i);
}

/** O acerto `h` no índice `i`, para a classe `h.cls` avaliar (fora do traçado). */
fn ray_wave_put(i: u32, h: RayWaveHit) {
    ray_wave_hits[i] = h;
    atomicAdd(&ray_wave_counts[1u + h.cls], 1u);
    ray_wave_cover(i);
}

/** O acerto `h` no índice `i` com o fechamento `c` já avaliado por quem traça. */
fn ray_wave_put_shaded(i: u32, h: RayWaveHit, c: Closure) {
    var o = h;
    o.cls = RAY_WAVE_SHADED;
    ray_wave_hits[i] = o;
    ray_wave_surfaces[i] = c;
    ray_wave_cover(i);
}

/**
 * O registro de um acerto: ponto, normal, uv, tempo simulado, largura do cone (m; 0 = sem filtragem) com a derivada
 * isotrópica do uv (`duv`), as constantes do `StandardMaterial`, o slot dos parâmetros e a classe (o índice da função
 * `material` − 1).
 */
fn ray_wave_hit(position: vec3f, normal: vec3f, uv: vec2f, time: f32, width: f32, duv: f32, m: StandardMaterial,
    slot: u32, cls: u32, ray: u32) -> RayWaveHit {
    var h: RayWaveHit;
    h.position = position;
    h.width = width;
    h.normal = normal;
    h.time = time;
    h.albedo = m.albedo;
    h.uv = uv;
    h.duv = duv;
    h.roughness = m.roughness;
    h.metallic = m.metallic;
    h.slot = slot;
    h.cls = cls;
    h.ray = ray;
    return h;
}

/** O fechamento das constantes do `StandardMaterial` de `m`. */
fn ray_wave_constants(m: StandardMaterial) -> Closure {
    return closure_sanitize(closure_from_params(SurfaceParams(m.albedo, m.roughness, m.metallic, vec3f(0.0))));
}

/**
 * O acerto no índice `i` pela função `material` de índice `index` (0 = só as constantes, avaliadas aqui) com os
 * parâmetros do slot `slot`.
 */
fn ray_wave_put_surface(i: u32, index: u32, slot: u32, position: vec3f, normal: vec3f, uv: vec2f, time: f32,
    width: f32, duv: f32, m: StandardMaterial) {
    if (index == 0u) {
        ray_wave_put_shaded(i, ray_wave_hit(position, normal, uv, time, width, duv, m, slot, RAY_WAVE_SHADED, i),
            ray_wave_constants(m));
        return;
    }
    ray_wave_put(i, ray_wave_hit(position, normal, uv, time, width, duv, m, slot, index - 1u, i));
}
