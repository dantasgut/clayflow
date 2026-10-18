// Composição pronta das funções `material` nos acertos (spec 033, R3): sem funções na cena, o fechamento das constantes
// do material (a mesma base do OpenPBR do desenho). Com funções, cada estágio que traça monta a composição (um `switch`
// pelo índice da função da instância, `composeHitMaterial`) no lugar deste módulo.
// Requer: material_point_types, closure.

fn ray_hit_material(index: u32, s: SurfaceSample, m: StandardMaterial, fn_slot: u32) -> Closure {
    return closure_sanitize(closure_from_params(SurfaceParams(m.albedo, m.roughness, m.metallic, vec3f(0.0))));
}
