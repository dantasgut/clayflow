// Leitura da onda dos acertos (spec 039): a amostra de superfície e as constantes do `StandardMaterial` de um registro
// (o que o kernel de material de cada classe usa) e a faixa de uma classe na ordem do espalhamento.
// Requer: material_point_types, StandardMaterial, RayWaveHit.

/** A amostra de superfície do registro `h` (a geometria diferencial fica zerada nos acertos dos raios). */
fn ray_wave_sample(h: RayWaveHit) -> SurfaceSample {
    return SurfaceSample(h.position, h.normal, h.uv, h.time, vec3f(0.0), vec4f(0.0), vec3f(0.0), h.width,
        vec2f(h.duv, 0.0), vec2f(0.0, h.duv));
}

/** As constantes do `StandardMaterial` do registro `h`. */
fn ray_wave_standard(h: RayWaveHit) -> StandardMaterial {
    return StandardMaterial(h.albedo, h.roughness, h.metallic, 0.0, 0.0);
}
