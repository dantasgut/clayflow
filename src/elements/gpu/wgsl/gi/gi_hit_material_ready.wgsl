// Composição pronta das funções `material` nos acertos (spec 033, R3): sem funções na cena, o fechamento das constantes
// do material (a mesma base do OpenPBR do desenho). Com funções, o estágio das sondas monta a composição (um `switch`
// pelo índice da função da instância) no lugar deste módulo.
// Requer: material_point_types, closure.

fn gi_hit_material(index: u32, s: SurfaceSample, m: StandardMaterial, fn_slot: u32) -> Closure {
    return closure_sanitize(closure_from_params(SurfaceParams(m.albedo, m.roughness, m.metallic, vec3f(0.0))));
}
