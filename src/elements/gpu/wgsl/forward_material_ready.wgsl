// Parâmetros de superfície do desenho forward prontos (spec 009): as constantes do material (albedo, rugosidade,
// metalicidade), sem emissão. Uma entidade com `MaterialFunction` troca este módulo pelo adaptador da função.
// Requer: structs StandardMaterial; material_point_types.

fn material_eval(s: SurfaceSample, m: StandardMaterial, fn_slot: u32) -> SurfaceParams {
    return SurfaceParams(m.albedo, m.roughness, m.metallic, vec3f(0.0));
}
